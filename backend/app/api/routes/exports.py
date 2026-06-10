import base64
import html
import json
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_demo_user, require_role, success
from app.core.database import get_db
from app.models import AIAuditResult, ExportJob, ReviewRecord, Submission, Task, User, utc_now
from app.services.access_control import require_owner_export_job, require_owner_task
from app.services.audit_log import write_audit_log
from app.services.export_job_runner import enqueue_export_job
from app.services.export_service import process_export_job, serialize_export_job

router = APIRouter(prefix='/exports', tags=['exports'])

SUPPORTED_EXPORT_FORMATS = {'json', 'csv', 'jsonl', 'excel'}
COMPLETED_SUBMISSION_STATUSES = {'submitted', 'ai_passed', 'needs_revision', 'review_passed'}


def percent(value: int, total: int) -> int:
    return int(round((value / total) * 100)) if total else 0


def format_report_datetime(value: datetime | None) -> str:
    if value is None:
        return '—'
    return value.strftime('%Y-%m-%d %H:%M')


def estimate_export_size(job: ExportJob) -> str:
    size_bytes = 0
    if job.content_text:
        size_bytes = len(job.content_text.encode('utf-8'))
    elif job.content_json:
        if job.format == 'excel':
            encoded = job.content_json.get('data')
            if isinstance(encoded, str):
                try:
                    size_bytes = len(base64.b64decode(encoded))
                except Exception:
                    size_bytes = 0
        else:
            size_bytes = len(json.dumps(job.content_json, ensure_ascii=False).encode('utf-8'))

    if size_bytes <= 0:
        return '待生成'
    if size_bytes < 1024:
        return f'{size_bytes} B'
    if size_bytes < 1024 * 1024:
        return f'{size_bytes / 1024:.1f} KB'
    return f'{size_bytes / (1024 * 1024):.1f} MB'


def build_report_metrics(db: Session, task: Task) -> dict:
    total = task.dataset.item_count if task.dataset else 0
    completed = db.query(func.count(func.distinct(Submission.dataset_item_id))).filter(
        Submission.task_id == task.id,
        Submission.status.in_(COMPLETED_SUBMISSION_STATUSES),
    ).scalar() or 0
    passed = db.query(func.count(func.distinct(Submission.dataset_item_id))).filter(
        Submission.task_id == task.id,
        Submission.status == 'review_passed',
    ).scalar() or 0
    pending = db.query(func.count(func.distinct(Submission.dataset_item_id))).filter(
        Submission.task_id == task.id,
        Submission.status.in_(['submitted', 'ai_passed']),
    ).scalar() or 0
    rejected = db.query(func.count(func.distinct(Submission.dataset_item_id))).filter(
        Submission.task_id == task.id,
        Submission.status == 'needs_revision',
    ).scalar() or 0
    reviewed = passed + rejected
    return {
        'itemCount': total,
        'completedItemCount': completed,
        'passedItemCount': passed,
        'pendingReviewCount': pending,
        'rejectedItemCount': rejected,
        'completionRate': percent(completed, total),
        'passRate': percent(passed, total),
        'rejectRate': percent(rejected, reviewed),
    }


def build_ai_score_distribution(db: Session, task_id: int) -> dict:
    scores = [
        score
        for (score,) in db.query(AIAuditResult.overall_score)
        .join(Submission, Submission.id == AIAuditResult.submission_id)
        .filter(Submission.task_id == task_id)
        .all()
        if score is not None
    ]
    buckets = [
        {'label': '0-59', 'min': 0, 'max': 59, 'count': 0},
        {'label': '60-69', 'min': 60, 'max': 69, 'count': 0},
        {'label': '70-79', 'min': 70, 'max': 79, 'count': 0},
        {'label': '80-89', 'min': 80, 'max': 89, 'count': 0},
        {'label': '90-100', 'min': 90, 'max': 100, 'count': 0},
    ]
    for score in scores:
        for bucket in buckets:
            if bucket['min'] <= score <= bucket['max']:
                bucket['count'] += 1
                break
    total = len(scores)
    for bucket in buckets:
        bucket['percent'] = percent(bucket['count'], total)
    return {
        'total': total,
        'averageScore': round(sum(scores) / total, 1) if total else None,
        'buckets': buckets,
    }


def build_labeler_contribution(db: Session, task_id: int) -> list[dict]:
    rows = (
        db.query(Submission, User.display_name)
        .join(User, User.id == Submission.user_id)
        .filter(Submission.task_id == task_id)
        .all()
    )
    summary: dict[int, dict] = {}
    for submission, display_name in rows:
        item = summary.setdefault(
            submission.user_id,
            {
                'labelerName': display_name,
                'submittedCount': 0,
                'passedCount': 0,
                'rejectedCount': 0,
            },
        )
        item['submittedCount'] += 1
        if submission.status == 'review_passed':
            item['passedCount'] += 1
        if submission.status == 'needs_revision':
            item['rejectedCount'] += 1
    items = list(summary.values())
    for item in items:
        item['passRate'] = percent(item['passedCount'], item['submittedCount'])
    return sorted(items, key=lambda item: (-item['passedCount'], -item['submittedCount'], item['labelerName']))


def build_common_issue_types(db: Session, task_id: int) -> list[dict]:
    rows = (
        db.query(ReviewRecord.reason, func.count(ReviewRecord.id))
        .join(Submission, Submission.id == ReviewRecord.submission_id)
        .filter(
            Submission.task_id == task_id,
            ReviewRecord.decision == 'reject',
            ReviewRecord.reason != '',
        )
        .group_by(ReviewRecord.reason)
        .order_by(func.count(ReviewRecord.id).desc(), ReviewRecord.reason.asc())
        .limit(8)
        .all()
    )
    return [{'reason': reason, 'count': count} for reason, count in rows]


def build_export_file_info(db: Session, task_id: int) -> list[dict]:
    jobs = (
        db.query(ExportJob)
        .filter(ExportJob.task_id == task_id)
        .order_by(ExportJob.created_at.desc())
        .limit(5)
        .all()
    )
    return [
        {
            'format': job.format,
            'status': job.status,
            'createdAt': format_report_datetime(job.created_at),
            'finishedAt': format_report_datetime(job.finished_at),
            'fileName': f'export-task-{job.task_id}.{"xlsx" if job.format == "excel" else job.format}',
            'size': estimate_export_size(job),
        }
        for job in jobs
    ]


def build_final_conclusion(task: Task, metrics: dict, ai_distribution: dict, issue_types: list[dict]) -> str:
    if metrics['pendingReviewCount'] > 0:
        return f'任务当前仍有 {metrics["pendingReviewCount"]} 条待审核结果，建议完成复核后再正式对外交付。'
    if metrics['passRate'] >= 90 and metrics['rejectRate'] <= 10:
        return '任务整体质量稳定，建议将当前结果作为正式交付版本，并保留该报告用于归档复盘。'
    if metrics['passRate'] >= 75:
        focus_issue = issue_types[0]['reason'] if issue_types else '高频问题'
        return f'任务已具备交付基础，但仍建议针对“{focus_issue}”进行复盘，优化后续标注规范。'
    if ai_distribution['averageScore'] is not None:
        return f'任务整体质量波动较大，当前 AI 预审平均分为 {ai_distribution["averageScore"]}，建议先做专项整改后再推进批量复用。'
    return '任务已生成基础报告，建议结合问题类型与标注员贡献数据继续做人工复盘。'


def render_report_html(task: Task, metrics: dict, ai_distribution: dict, contributions: list[dict], issue_types: list[dict], export_files: list[dict], generated_at: datetime) -> str:
    def render_rows(items: list[dict], empty_text: str, columns: list[tuple[str, str]]) -> str:
        if not items:
            return f'<tr><td colspan="{len(columns)}" class="empty-cell">{html.escape(empty_text)}</td></tr>'
        return ''.join(
            '<tr>' + ''.join(f'<td>{html.escape(str(item.get(key, "—")))}</td>' for key, _label in columns) + '</tr>'
            for item in items
        )

    ai_rows = ''.join(
        (
            '<div class="score-row">'
            f'<div class="score-label">{html.escape(bucket["label"])}</div>'
            f'<div class="score-bar"><span style="width: {bucket["percent"]}%;"></span></div>'
            f'<div class="score-meta">{bucket["count"]} / {bucket["percent"]}%</div>'
            '</div>'
        )
        for bucket in ai_distribution['buckets']
    ) or '<p class="empty-note">暂无 AI 预审数据。</p>'

    conclusion = build_final_conclusion(task, metrics, ai_distribution, issue_types)

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(task.title)} - 任务报告</title>
  <style>
    :root {{
      color-scheme: light;
      --ink: #1f2937;
      --muted: #6b7280;
      --line: #e5e7eb;
      --panel: #ffffff;
      --soft: #f8fafc;
      --brand: #1d4ed8;
      --accent: #0f766e;
      --warn: #b45309;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; padding: 32px; background: #eef4ff; color: var(--ink); font: 14px/1.6 "Segoe UI", "PingFang SC", sans-serif; }}
    .report {{ max-width: 1120px; margin: 0 auto; background: var(--panel); border-radius: 24px; padding: 32px; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08); }}
    .hero {{ display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; padding-bottom: 24px; border-bottom: 1px solid var(--line); }}
    .eyebrow {{ display: inline-block; padding: 6px 10px; border-radius: 999px; background: #dbeafe; color: var(--brand); font-size: 12px; font-weight: 700; }}
    h1 {{ margin: 14px 0 8px; font-size: 30px; line-height: 1.2; }}
    .hero-meta {{ color: var(--muted); }}
    .grid {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin: 24px 0 32px; }}
    .stat {{ padding: 18px; border-radius: 18px; background: var(--soft); border: 1px solid var(--line); }}
    .stat strong {{ display: block; margin-top: 8px; font-size: 28px; }}
    .section {{ margin-top: 28px; }}
    .section h2 {{ margin: 0 0 12px; font-size: 20px; }}
    .section p.lead {{ margin: 0 0 16px; color: var(--muted); }}
    .summary-grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 20px; }}
    .summary-item {{ padding: 16px; border-radius: 16px; border: 1px solid var(--line); background: #fff; }}
    .summary-item span {{ color: var(--muted); display: block; margin-bottom: 4px; }}
    .score-card {{ padding: 20px; border-radius: 18px; background: #fbfdff; border: 1px solid var(--line); }}
    .score-row {{ display: grid; grid-template-columns: 80px 1fr 88px; gap: 12px; align-items: center; margin-top: 12px; }}
    .score-bar {{ height: 10px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }}
    .score-bar span {{ display: block; height: 100%; background: linear-gradient(90deg, var(--brand), var(--accent)); border-radius: inherit; }}
    table {{ width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }}
    th, td {{ padding: 12px 14px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }}
    th {{ background: #f8fafc; font-weight: 700; }}
    tr:last-child td {{ border-bottom: none; }}
    .empty-cell, .empty-note {{ color: var(--muted); text-align: center; }}
    .conclusion {{ padding: 20px; border-radius: 18px; background: linear-gradient(135deg, #eff6ff, #ecfeff); border: 1px solid #bfdbfe; }}
    .footnote {{ margin-top: 24px; color: var(--muted); font-size: 12px; }}
    @media (max-width: 900px) {{
      body {{ padding: 16px; }}
      .report {{ padding: 20px; border-radius: 18px; }}
      .hero, .grid, .summary-grid {{ display: block; }}
      .stat {{ margin-top: 12px; }}
      .summary-item {{ margin-top: 12px; }}
      .score-row {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
  <main class="report">
    <section class="hero">
      <div>
        <span class="eyebrow">Task Report</span>
        <h1>{html.escape(task.title)}</h1>
        <div class="hero-meta">生成时间：{html.escape(format_report_datetime(generated_at))}</div>
      </div>
      <div class="hero-meta">
        <div>数据集：{html.escape(task.dataset.name if task.dataset else '未绑定')}</div>
        <div>任务状态：{html.escape(task.status)}</div>
      </div>
    </section>

    <section class="grid">
      <article class="stat"><span>标注完成率</span><strong>{metrics['completionRate']}%</strong></article>
      <article class="stat"><span>审核通过率</span><strong>{metrics['passRate']}%</strong></article>
      <article class="stat"><span>打回率</span><strong>{metrics['rejectRate']}%</strong></article>
      <article class="stat"><span>AI 平均预审分</span><strong>{ai_distribution['averageScore'] if ai_distribution['averageScore'] is not None else '—'}</strong></article>
    </section>

    <section class="section">
      <h2>任务概览</h2>
      <p class="lead">覆盖任务名称、数据集与核心产出指标，帮助快速判断任务是否达到交付状态。</p>
      <div class="summary-grid">
        <div class="summary-item"><span>任务名称</span><strong>{html.escape(task.title)}</strong></div>
        <div class="summary-item"><span>数据集</span><strong>{html.escape(task.dataset.name if task.dataset else '未绑定')}</strong></div>
        <div class="summary-item"><span>已完成 / 总题量</span><strong>{metrics['completedItemCount']} / {metrics['itemCount']}</strong></div>
        <div class="summary-item"><span>已通过 / 待审核 / 打回</span><strong>{metrics['passedItemCount']} / {metrics['pendingReviewCount']} / {metrics['rejectedItemCount']}</strong></div>
      </div>
    </section>

    <section class="section">
      <h2>AI 预审评分分布</h2>
      <p class="lead">用于观察 AI 预审置信度是否集中，以及是否存在明显高风险题段。</p>
      <div class="score-card">
        {ai_rows}
      </div>
    </section>

    <section class="section">
      <h2>标注员贡献</h2>
      <p class="lead">统计每位标注员的提交量、通过量和打回量，便于做任务复盘和后续分工。</p>
      <table>
        <thead>
          <tr><th>标注员</th><th>提交量</th><th>通过量</th><th>打回量</th><th>通过率</th></tr>
        </thead>
        <tbody>
          {render_rows(contributions, '暂无标注员贡献数据。', [('labelerName', '标注员'), ('submittedCount', '提交量'), ('passedCount', '通过量'), ('rejectedCount', '打回量'), ('passRate', '通过率')])}
        </tbody>
      </table>
    </section>

    <section class="section">
      <h2>常见问题类型</h2>
      <p class="lead">基于人工打回原因进行汇总，可快速发现本轮任务最常见的质量问题。</p>
      <table>
        <thead>
          <tr><th>问题类型</th><th>出现次数</th></tr>
        </thead>
        <tbody>
          {render_rows(issue_types, '暂无高频问题记录。', [('reason', '问题类型'), ('count', '出现次数')])}
        </tbody>
      </table>
    </section>

    <section class="section">
      <h2>导出文件信息</h2>
      <p class="lead">展示该任务最近生成的导出记录，方便将报告与实际交付文件关联起来。</p>
      <table>
        <thead>
          <tr><th>文件名</th><th>格式</th><th>状态</th><th>创建时间</th><th>完成时间</th><th>文件大小</th></tr>
        </thead>
        <tbody>
          {render_rows(export_files, '当前任务尚未生成导出文件。', [('fileName', '文件名'), ('format', '格式'), ('status', '状态'), ('createdAt', '创建时间'), ('finishedAt', '完成时间'), ('size', '文件大小')])}
        </tbody>
      </table>
    </section>

    <section class="section">
      <h2>最终结论</h2>
      <div class="conclusion">{html.escape(conclusion)}</div>
    </section>

    <p class="footnote">该 HTML 报告由系统自动生成，适合用于任务归档、内部复盘和快速汇报。</p>
  </main>
</body>
</html>"""


class ExportFieldMappingPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source_key: str = Field(alias='sourceKey')
    target_label: str = Field(alias='targetLabel')
    enabled: bool = True


class CreateExportRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    task_id: int = Field(alias='taskId')
    format: str
    field_mapping: list[ExportFieldMappingPayload] = Field(default_factory=list, alias='fieldMapping')
    include_ai_audit: bool = Field(default=False, alias='includeAiAudit')
    include_review_records: bool = Field(default=False, alias='includeReviewRecords')
    export_scope: str = Field(default='all', alias='exportScope')


def export_queue_available() -> bool:
    from app.core.config import settings
    if settings.celery_task_always_eager:
        return True

    try:
        from redis import Redis
        client = Redis.from_url(settings.redis_url)
        client.ping()
        return True
    except Exception:
        return False


@router.get('')
def list_exports(
    taskId: int | None = None,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    query = db.query(ExportJob).filter(ExportJob.created_by == user.id).order_by(ExportJob.created_at.desc())
    if taskId is not None:
        query = query.filter(ExportJob.task_id == taskId)
    items = [serialize_export_job(job) for job in query.all()]
    return success({'items': items, 'total': len(items)})


@router.post('')
def create_export(
    payload: CreateExportRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    task = require_owner_task(db, payload.task_id, user)
    if payload.format not in SUPPORTED_EXPORT_FORMATS:
        raise HTTPException(status_code=400, detail=f'unsupported export format: {payload.format}')
    if not export_queue_available():
        raise HTTPException(status_code=503, detail='export queue is unavailable, please start Redis and Celery worker first')

    job = ExportJob(
        task_id=task.id,
        format=payload.format,
        status='queued',
        created_by=user.id,
        field_mapping_json=[item.model_dump(by_alias=True) for item in payload.field_mapping],
        include_ai_audit=payload.include_ai_audit,
        include_review_records=payload.include_review_records,
        export_scope=payload.export_scope,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    write_audit_log(
        db,
        event_type='export_created',
        entity_type='export_job',
        entity_id=job.id,
        actor_user_id=user.id,
        payload={'taskId': task.id, 'format': payload.format},
    )
    db.commit()

    try:
        enqueue_export_job(job.id)
    except Exception as exc:
        job.status = 'failed'
        job.finished_at = utc_now()
        write_audit_log(
            db,
            event_type='export_failed',
            entity_type='export_job',
            entity_id=job.id,
            actor_user_id=None,
            payload={'status': job.status, 'format': job.format, 'errorMessage': str(exc)},
        )
        db.commit()
        raise HTTPException(status_code=500, detail='failed to enqueue export job') from exc

    return success(serialize_export_job(job))


@router.get('/tasks/{task_id}/report')
def download_task_report(
    task_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Response:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    task = require_owner_task(db, task_id, user)
    metrics = build_report_metrics(db, task)
    ai_distribution = build_ai_score_distribution(db, task.id)
    contributions = build_labeler_contribution(db, task.id)
    issue_types = build_common_issue_types(db, task.id)
    export_files = build_export_file_info(db, task.id)
    report_html = render_report_html(task, metrics, ai_distribution, contributions, issue_types, export_files, utc_now())

    write_audit_log(
        db,
        event_type='task_report_downloaded',
        entity_type='task',
        entity_id=task.id,
        actor_user_id=user.id,
        payload={'taskId': task.id, 'format': 'html'},
    )
    db.commit()

    return Response(
        content=report_html,
        media_type='text/html; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="task-report-{task.id}.html"'},
    )


@router.post('/{job_id}/complete')
def complete_export(
    job_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    job = require_owner_export_job(db, job_id, user)
    if job.status == 'queued':
        job = process_export_job(db, job_id) or job
    return success(serialize_export_job(job))


@router.get('/{job_id}')
def get_export(
    job_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    job = require_owner_export_job(db, job_id, user)

    return success(serialize_export_job(job))


@router.get('/{job_id}/download')
def download_export(
    job_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Response:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    job = require_owner_export_job(db, job_id, user)
    if job.status != 'done':
        raise HTTPException(status_code=409, detail='export job is not ready for download')

    if job.format == 'json' and job.content_json is not None:
        import json

        content = json.dumps(job.content_json, ensure_ascii=False, indent=2)
        media_type = 'application/json; charset=utf-8'
        filename = f'export-task-{job.task_id}.json'
    elif job.format == 'csv' and job.content_text is not None:
        content = job.content_text
        media_type = 'text/csv; charset=utf-8'
        filename = f'export-task-{job.task_id}.csv'
    elif job.format == 'jsonl' and job.content_text is not None:
        content = job.content_text
        media_type = 'application/jsonl; charset=utf-8'
        filename = f'export-task-{job.task_id}.jsonl'
    elif job.format == 'excel' and job.content_json is not None:
        import base64

        encoded = job.content_json.get('data')
        if not isinstance(encoded, str):
            raise HTTPException(status_code=500, detail='export content is invalid')
        binary = base64.b64decode(encoded)
        return Response(
            content=binary,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': f'attachment; filename="export-task-{job.task_id}.xlsx"'},
        )
    else:
        raise HTTPException(status_code=500, detail='export content is unavailable')

    return Response(
        content=content,
        media_type=media_type,
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )

