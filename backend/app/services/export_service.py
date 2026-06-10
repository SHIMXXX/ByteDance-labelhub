import base64
import csv
import io
import json
import zipfile
from xml.sax.saxutils import escape

from sqlalchemy.orm import Session

from app.models import ExportJob, ReviewRecord, Submission, utc_now
from app.services.audit_log import write_audit_log
from app.services.dataset_import import (
    get_dataset_item_metadata,
    get_dataset_item_reference_answer,
    get_dataset_item_source,
)


# 中文注释：导出内容构建继续复用当前同步实现，只把执行边界抽到 service，供 API 与 worker 共用。
def apply_field_mapping(item: dict, mappings: list[dict]) -> dict:
    enabled = [mapping for mapping in mappings if mapping.get('enabled')]
    if not enabled:
        return item
    return {mapping['targetLabel']: item.get(mapping['sourceKey']) for mapping in enabled}



def build_export_items(db: Session, job: ExportJob) -> list[dict]:
    submissions = db.query(Submission).filter(Submission.task_id == job.task_id).order_by(Submission.id.asc()).all()
    if job.export_scope == 'review_passed':
        submissions = [submission for submission in submissions if submission.status == 'review_passed']

    items: list[dict] = []
    for submission in submissions:
        review_record = (
            db.query(ReviewRecord)
            .filter(ReviewRecord.submission_id == submission.id)
            .order_by(ReviewRecord.created_at.desc())
            .first()
        )
        ai_result = submission.ai_audit_result
        dataset_item = submission.dataset_item
        item = {
            'submissionId': submission.id,
            'taskId': submission.task_id,
            'datasetItemId': submission.dataset_item_id,
            'labelerName': submission.user.display_name,
            'submissionStatus': submission.status,
            'source': get_dataset_item_source(dataset_item),
            'metadata': get_dataset_item_metadata(dataset_item),
            'referenceAnswer': get_dataset_item_reference_answer(dataset_item),
            'answers': submission.answers_json,
            'finalAnswer': submission.final_answer_json or submission.answers_json,
            'currentVersionNo': submission.current_version_no,
            'reviewStage': submission.current_review_stage,
            'reviewRound': submission.current_review_round,
        }
        if job.include_ai_audit:
            item['aiDecision'] = ai_result.decision if ai_result else None
            item['aiOverallScore'] = ai_result.overall_score if ai_result else None
            item['aiSummary'] = ai_result.summary if ai_result else ''
        if job.include_review_records:
            item['reviewDecision'] = review_record.decision if review_record else None
            item['reviewComment'] = review_record.comment if review_record else ''
            item['reviewReason'] = review_record.reason if review_record else ''
        items.append(apply_field_mapping(item, job.field_mapping_json or []))

    return items



def _serialize_export_value(value: object) -> str:
    if value is None:
        return ''
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)



def _build_tabular_rows(items: list[dict]) -> tuple[list[str], list[list[str]]]:
    if not items:
        return [], []

    headers = list(items[0].keys())
    rows = [[_serialize_export_value(item.get(header)) for header in headers] for item in items]
    return headers, rows



def _column_ref(column_index: int) -> str:
    value = ''
    current = column_index + 1
    while current > 0:
        current, remainder = divmod(current - 1, 26)
        value = chr(65 + remainder) + value
    return value



def _build_sheet_xml(headers: list[str], rows: list[list[str]]) -> str:
    xml_rows: list[str] = []
    all_rows = [headers, *rows]
    for row_index, row in enumerate(all_rows, start=1):
        cells: list[str] = []
        for column_index, value in enumerate(row, start=0):
            cell_ref = f'{_column_ref(column_index)}{row_index}'
            cells.append(
                f'<c r="{cell_ref}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
            )
        xml_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')

    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(xml_rows)}</sheetData>'
        '</worksheet>'
    )



def _build_excel_bytes(headers: list[str], rows: list[list[str]]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            '[Content_Types].xml',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '</Types>',
        )
        archive.writestr(
            '_rels/.rels',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
            'Target="xl/workbook.xml"/>'
            '</Relationships>',
        )
        archive.writestr(
            'xl/workbook.xml',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Export" sheetId="1" r:id="rId1"/></sheets>'
            '</workbook>',
        )
        archive.writestr(
            'xl/_rels/workbook.xml.rels',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            'Target="worksheets/sheet1.xml"/>'
            '</Relationships>',
        )
        archive.writestr('xl/worksheets/sheet1.xml', _build_sheet_xml(headers, rows))
    return buffer.getvalue()



def build_export_payload(db: Session, job: ExportJob) -> tuple[dict | None, str | None]:
    items = build_export_items(db, job)
    if job.format == 'json':
        return {
            'taskId': job.task_id,
            'format': 'json',
            'items': items,
        }, None

    headers, rows = _build_tabular_rows(items)

    if job.format == 'jsonl':
        lines = [json.dumps(item, ensure_ascii=False) for item in items]
        return None, '\n'.join(lines)

    if job.format == 'excel':
        workbook_bytes = _build_excel_bytes(headers, rows)
        return {
            'taskId': job.task_id,
            'format': 'excel',
            'encoding': 'base64',
            'mimeType': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'fileName': f'export-task-{job.task_id}.xlsx',
            'data': base64.b64encode(workbook_bytes).decode('ascii'),
        }, None

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()
    for row in rows:
        writer.writerow(dict(zip(headers, row)))
    return None, output.getvalue()



def serialize_export_job(job: ExportJob) -> dict:
    content: dict | str | None = job.content_json if job.content_json is not None else job.content_text
    download_url = f'/api/v1/exports/{job.id}/download' if job.status == 'done' else None
    return {
        'jobId': job.id,
        'taskId': job.task_id,
        'taskTitle': job.task.title,
        'format': job.format,
        'status': job.status,
        'createdAt': job.created_at,
        'finishedAt': job.finished_at,
        'downloadUrl': download_url,
        'content': content,
    }



def process_export_job(db: Session, job_id: int) -> ExportJob | None:
    job = db.get(ExportJob, job_id)
    if job is None or job.status not in {'queued', 'processing'}:
        return job

    try:
        job.status = 'processing'
        db.commit()

        content_json, content_text = build_export_payload(db, job)
        job.status = 'done'
        job.content_json = content_json
        job.content_text = content_text
        job.download_url = None
        job.finished_at = utc_now()
        write_audit_log(
            db,
            event_type='export_finished',
            entity_type='export_job',
            entity_id=job_id,
            actor_user_id=None,
            payload={'status': job.status, 'format': job.format},
        )
        db.commit()
        db.refresh(job)
        return job
    except Exception as exc:
        db.rollback()
        job = db.get(ExportJob, job_id)
        if job is None:
            return None
        job.status = 'failed'
        job.finished_at = utc_now()
        write_audit_log(
            db,
            event_type='export_failed',
            entity_type='export_job',
            entity_id=job_id,
            actor_user_id=None,
            payload={'status': job.status, 'format': job.format, 'errorMessage': str(exc)},
        )
        db.commit()
        db.refresh(job)
        raise
