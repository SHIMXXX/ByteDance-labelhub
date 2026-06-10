import json
from dataclasses import dataclass
from typing import Literal, Protocol, TypedDict

import requests

from app.core.config import settings
from aiagent.services.ai_defaults import (
    calculate_overall_score,
    normalize_percent_pass_threshold,
    normalize_score_dimensions,
)


class AIScore(TypedDict):
    dimension: str
    score: int
    reason: str


AIDecision = Literal['pass', 'reject', 'human_review']


@dataclass(frozen=True)
class AIExecutionResult:
    scores: list[AIScore]
    decision: AIDecision
    summary: str
    overall_score: int | None = None


class AIExecutor(Protocol):
    def execute(
        self,
        answers: dict,
        prompt_template: str | None = None,
        score_dimensions: list | None = None,
        pass_threshold: int | None = None,
        source: dict | None = None,
        reference_answer: dict | None = None,
        model: str | None = None,
    ) -> AIExecutionResult: ...


class LocalRuleAIExecutor:
    def execute(
        self,
        answers: dict,
        prompt_template: str | None = None,
        score_dimensions: list | None = None,
        pass_threshold: int | None = None,
        source: dict | None = None,
        reference_answer: dict | None = None,
        model: str | None = None,
    ) -> AIExecutionResult:
        values = [value for value in (answers or {}).values() if value not in (None, '', [])]
        if not values:
            scores = [{'dimension': 'completeness', 'score': 1, 'reason': '答案为空，需要人工复核。'}]
            return AIExecutionResult(
                scores=scores,
                decision='human_review',
                summary='当前提交没有有效答案，建议人工复核。',
                overall_score=calculate_overall_score(scores, score_dimensions),
            )

        preferred_answer = answers.get('preferred') or answers.get('preferred_answer')
        reference_preferred = None
        if reference_answer:
            reference_preferred = reference_answer.get('preferred') or reference_answer.get('preferred_answer')
        if preferred_answer and reference_preferred and preferred_answer != reference_preferred:
            scores = [{'dimension': 'gold_consistency', 'score': 2, 'reason': '当前偏好选择与 Gold 答案不一致。'}]
            return AIExecutionResult(
                scores=scores,
                decision='human_review',
                summary='Gold 不一致：当前提交与参考答案存在冲突，建议人工复核。',
                overall_score=calculate_overall_score(scores, score_dimensions),
            )

        short_text_only = all(isinstance(value, str) and len(value.strip()) < 2 for value in values)
        if short_text_only:
            scores = [{'dimension': 'quality', 'score': 1, 'reason': '答案过短，需修改后重提。'}]
            return AIExecutionResult(
                scores=scores,
                decision='reject',
                summary='答案过短，未达到最小质量要求。',
                overall_score=calculate_overall_score(scores, score_dimensions),
            )

        source_hint = ''
        if source:
            if source.get('prompt') and source.get('response_a') and source.get('response_b'):
                source_hint = ' 已读取 A/B 对比题面。'

        scores = [{'dimension': 'completeness', 'score': 4, 'reason': '答案已填写完整，可进入人工审核。'}]
        overall_score = calculate_overall_score(scores, score_dimensions)
        threshold = normalize_percent_pass_threshold(pass_threshold)
        return AIExecutionResult(
            scores=scores,
            decision='pass' if overall_score >= threshold else 'human_review',
            summary=f'已生成最小 AI 预审结果，等待 Reviewer 最终裁决。{source_hint}'.strip(),
            overall_score=overall_score,
        )


def normalize_scores(raw_scores: object) -> list[AIScore]:
    if isinstance(raw_scores, list):
        items = raw_scores
    elif isinstance(raw_scores, dict):
        items = [raw_scores]
    else:
        return []

    normalized: list[AIScore] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        dimension = str(item.get('dimension') or '未命名维度')
        score = item.get('score')
        reason = str(item.get('reason') or '模型未返回评分理由。')
        if not isinstance(score, int):
            continue
        normalized.append({'dimension': dimension, 'score': score, 'reason': reason})
    return normalized


def normalize_overall_score(raw_score: object, scores: list[AIScore], score_dimensions: list | None = None) -> int:
    try:
        score = float(raw_score)
    except (TypeError, ValueError):
        return calculate_overall_score(scores, score_dimensions)
    return max(0, min(100, int(round(score))))


def normalize_result(parsed: dict, score_dimensions: list | None = None) -> AIExecutionResult:
    decision = parsed.get('decision')
    if decision not in {'pass', 'reject', 'human_review'}:
        raise RuntimeError(f'unsupported ai decision: {decision}')

    scores = normalize_scores(parsed.get('scores'))
    summary = parsed.get('summary')
    if not isinstance(summary, str) or not summary.strip():
        summary = 'AI 结果缺少总结，建议人工复核。'

    raw_overall_score = parsed['overallScore'] if 'overallScore' in parsed else parsed.get('overall_score')
    overall_score = normalize_overall_score(raw_overall_score, scores, score_dimensions)
    return AIExecutionResult(scores=scores, decision=decision, summary=summary, overall_score=overall_score)


import string

def safe_format(template: str, **kwargs) -> str:
    """Safe format that doesn't raise KeyError for missing keys."""
    class SafeDict(dict):
        def __missing__(self, key):
            return '{' + key + '}'
    return string.Formatter().vformat(template, (), SafeDict(**kwargs))


def model_provider(model: str | None) -> str:
    normalized = (model or settings.qwen_model or '').strip().lower()
    if normalized.startswith('qwen'):
        return 'qwen'
    if normalized.startswith('deepseek'):
        return 'deepseek'
    return settings.ai_provider


def select_ai_executor(model: str | None = None) -> AIExecutor:
    provider = model_provider(model)
    if provider == 'deepseek':
        return DeepSeekAIExecutor()
    if provider == 'qwen':
        return QwenAIExecutor()
    return LocalRuleAIExecutor()


def is_image_url(value: str) -> bool:
    lower_value = value.lower().split('?')[0]
    return lower_value.startswith(('http://', 'https://')) and lower_value.endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'))


def is_video_url(value: str) -> bool:
    lower_value = value.lower().split('?')[0]
    return lower_value.startswith(('http://', 'https://')) and lower_value.endswith(('.mp4', '.mov', '.mpeg', '.mpg', '.webm', '.avi', '.mkv'))


def collect_media_urls(value: object) -> list[dict]:
    media: list[dict] = []
    if isinstance(value, str):
        if is_image_url(value):
            media.append({'type': 'image_url', 'url': value})
        elif is_video_url(value):
            media.append({'type': 'video_url', 'url': value})
        return media
    if isinstance(value, list):
        for item in value:
            media.extend(collect_media_urls(item))
        return media
    if isinstance(value, dict):
        for item in value.values():
            media.extend(collect_media_urls(item))
    return media


def build_chat_completions_url(base_url: str, provider: str) -> str:
    normalized = base_url.strip().rstrip('/')
    if provider == 'qwen' and normalized == 'https://dashscope.aliyuncs.com':
        normalized = f'{normalized}/compatible-mode/v1'
    return f'{normalized}/chat/completions'


class DeepSeekAIExecutor:
    def execute(
        self,
        answers: dict,
        prompt_template: str | None = None,
        score_dimensions: list | None = None,
        pass_threshold: int | None = None,
        source: dict | None = None,
        reference_answer: dict | None = None,
        model: str | None = None,
    ) -> AIExecutionResult:
        if not settings.deepseek_api_key:
            raise RuntimeError('DEEPSEEK_API_KEY is required')

        rendered_answers = json.dumps(answers, ensure_ascii=False)
        rendered_source = json.dumps(source or {}, ensure_ascii=False)
        rendered_reference = json.dumps(reference_answer or {}, ensure_ascii=False)
        effective_prompt_template = prompt_template or '请审查以下提交：{answers}'
        effective_threshold = normalize_percent_pass_threshold(pass_threshold)
        effective_dimensions = normalize_score_dimensions(score_dimensions)
        dimension_text = '；'.join(
            (
                f"{item.get('label') or item.get('key') or '未命名维度'}"
                f"（权重 {item.get('weight', 1)}，标准：{item.get('description') or '按任务要求评分'}）"
            )
            for item in effective_dimensions
            if isinstance(item, dict)
        ) or '完整性'
        formatted_prompt = safe_format(
            effective_prompt_template,
            pass_threshold=effective_threshold,
            answers=rendered_answers,
            source=rendered_source,
            reference_answer=rendered_reference,
        )
        system_prompt = f'''你是标注预审助手。请只返回 JSON，不要返回 Markdown，不要返回解释文本。

当前审核要求：
- Prompt 模板：{formatted_prompt}
- 评分维度：{dimension_text}
- 每个维度 score 仍使用 1 到 5 分。
- overallScore 必须是 0 到 100 的百分制总分，请结合各维度 score、权重和评分理由计算。
- 通过阈值：{effective_threshold} 分（百分制）。overallScore >= {effective_threshold} 才可返回 pass；低于阈值但可人工判断时返回 human_review；明显不合格返回 reject。
- 原始题面：{rendered_source}
- 参考答案 / Gold：{rendered_reference}

JSON 格式必须严格如下：
{{
"scores": [
    {{
    "dimension": "完整性",
    "score": 1到5之间的数字,
    "reason": "评分理由"
    }}
],
"overallScore": 0到100之间的数字,
"decision": "pass/reject/human_review 三选一",
"summary": "一句话总结"
}}

注意：
1. scores 必须是数组，不能是数字，不能是对象，不能是字符串。
2. overallScore 必须是百分制数字，不能沿用 1 到 5 分。
3. 如果与参考答案冲突，请优先返回 human_review，并在 summary 中明确说明 Gold 不一致。
'''

        try:
            response = requests.post(
                build_chat_completions_url(settings.deepseek_base_url, 'deepseek'),
                headers={
                    'Authorization': f'Bearer {settings.deepseek_api_key}',
                    'Content-Type': 'application/json',
                },
                json={
                    'model': (model or settings.deepseek_model).strip(),
                    'messages': [
                        {'role': 'system', 'content': system_prompt},
                        {'role': 'user', 'content': json.dumps({'source': source or {}, 'answers': answers, 'referenceAnswer': reference_answer or {}}, ensure_ascii=False)},
                    ],
                    'temperature': 0,
                    'response_format': {'type': 'json_object'},
                },
                timeout=settings.ai_timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
            content = payload['choices'][0]['message']['content']
            parsed = json.loads(content)
        except requests.RequestException as exc:
            raise RuntimeError(f'deepseek request failed: {exc}') from exc
        except (KeyError, IndexError, json.JSONDecodeError, TypeError) as exc:
            raise RuntimeError(f'invalid deepseek response: {exc}') from exc

        result = normalize_result(parsed, effective_dimensions)
        if result.decision == 'pass' and (result.overall_score or 0) < effective_threshold:
            return AIExecutionResult(
                scores=result.scores,
                decision='human_review',
                summary=f'{result.summary} 百分制总分低于通过阈值，已转人工复核。',
                overall_score=result.overall_score,
            )
        return result


class QwenAIExecutor:
    def execute(
        self,
        answers: dict,
        prompt_template: str | None = None,
        score_dimensions: list | None = None,
        pass_threshold: int | None = None,
        source: dict | None = None,
        reference_answer: dict | None = None,
        model: str | None = None,
    ) -> AIExecutionResult:
        if not settings.qwen_api_key:
            raise RuntimeError('QWEN_API_KEY is required')
        if not settings.qwen_base_url:
            raise RuntimeError('QWEN_BASE_URL is required')

        rendered_answers = json.dumps(answers, ensure_ascii=False)
        rendered_source = json.dumps(source or {}, ensure_ascii=False)
        rendered_reference = json.dumps(reference_answer or {}, ensure_ascii=False)
        effective_prompt_template = prompt_template or 'Please audit the submitted annotation: {answers}'
        effective_threshold = normalize_percent_pass_threshold(pass_threshold)
        effective_dimensions = normalize_score_dimensions(score_dimensions)
        dimension_text = '; '.join(
            (
                f"{item.get('label') or item.get('key') or 'unnamed'}"
                f"(weight {item.get('weight', 1)}, criteria: {item.get('description') or 'score by task requirements'})"
            )
            for item in effective_dimensions
            if isinstance(item, dict)
        ) or 'completeness'
        formatted_prompt = safe_format(
            effective_prompt_template,
            pass_threshold=effective_threshold,
            answers=rendered_answers,
            source=rendered_source,
            reference_answer=rendered_reference,
        )
        system_prompt = f'''You are an annotation quality audit assistant. Return strict JSON only, without Markdown.
Audit requirements:
- Prompt: {formatted_prompt}
- Score dimensions: {dimension_text}
- Each dimension score must be an integer from 1 to 5.
- overallScore must be an integer from 0 to 100.
- Pass threshold: {effective_threshold}. Return pass only when overallScore >= {effective_threshold}; return human_review when uncertain; return reject for clearly invalid submissions.
- Source JSON: {rendered_source}
- Reference answer / Gold: {rendered_reference}

Required JSON format:
{{
  "scores": [{{"dimension": "dimension name", "score": 1, "reason": "scoring reason"}}],
  "overallScore": 0,
  "decision": "pass",
  "summary": "short audit summary"
}}

Allowed decision values: pass, reject, human_review.'''
        user_content: list[dict] = [
            {
                'type': 'text',
                'text': json.dumps(
                    {'source': source or {}, 'answers': answers, 'referenceAnswer': reference_answer or {}},
                    ensure_ascii=False,
                ),
            }
        ]
        for media in collect_media_urls(source or {}):
            if media['type'] == 'image_url':
                user_content.append({'type': 'image_url', 'image_url': {'url': media['url']}})
            elif media['type'] == 'video_url':
                user_content.append({'type': 'video_url', 'video_url': {'url': media['url']}})

        try:
            response = requests.post(
                build_chat_completions_url(settings.qwen_base_url, 'qwen'),
                headers={
                    'Authorization': f'Bearer {settings.qwen_api_key}',
                    'Content-Type': 'application/json',
                },
                json={
                    'model': (model or settings.qwen_model).strip(),
                    'messages': [
                        {'role': 'system', 'content': system_prompt},
                        {'role': 'user', 'content': user_content},
                    ],
                    'temperature': 0,
                    'response_format': {'type': 'json_object'},
                },
                timeout=settings.ai_timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
            content = payload['choices'][0]['message']['content']
            parsed = json.loads(content)
        except requests.RequestException as exc:
            raise RuntimeError(f'qwen request failed: {exc}') from exc
        except (KeyError, IndexError, json.JSONDecodeError, TypeError) as exc:
            raise RuntimeError(f'invalid qwen response: {exc}') from exc

        result = normalize_result(parsed, effective_dimensions)
        if result.decision == 'pass' and (result.overall_score or 0) < effective_threshold:
            return AIExecutionResult(
                scores=result.scores,
                decision='human_review',
                summary=f'{result.summary} Overall score is below the pass threshold, routed to human review.',
                overall_score=result.overall_score,
            )
        return result
