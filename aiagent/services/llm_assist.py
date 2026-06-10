import json

import requests

from app.core.config import settings
from aiagent.services.ai_executor import build_chat_completions_url


def _format_prompt_payload(value: dict | None) -> str:
    if not value:
        return '{}'
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)


def generate_llm_assist(*, source: dict, prompt: str, current_answers: dict) -> dict:
    if not settings.qwen_api_key:
        raise RuntimeError('qwen api key is not configured')
    if not settings.qwen_base_url:
        raise RuntimeError('qwen base url is not configured')

    response = requests.post(
        build_chat_completions_url(settings.qwen_base_url, 'qwen'),
        headers={
            'Authorization': f'Bearer {settings.qwen_api_key}',
            'Content-Type': 'application/json',
        },
        json={
            'model': settings.qwen_model,
            'messages': [
                {
                    'role': 'system',
                    'content': (
                        '你是标注辅助助手。你的首要依据是题面、素材和任务要求，不是标注员当前答案。'
                        '请先独立判断题面与素材，再给出供标注员填写或修改的建议。'
                        '当前答案只能视为待核对草稿，可能错误、不完整或自相矛盾。'
                        '不要顺着已有答案直接给出“准确性满分”“格式合规满分”这类结论；'
                        '如果发现问题，请明确指出应修改哪些字段、为什么改、可以怎么改。'
                        '请直接输出简洁中文建议，不要输出 Markdown、标题、编号或 JSON。'
                    ),
                },
                {
                    'role': 'user',
                    'content': (
                        f'题面与素材:\n{_format_prompt_payload(source)}\n\n'
                        f'当前已填写答案（仅供参考，可能有误）:\n{_format_prompt_payload(current_answers)}\n\n'
                        f'任务要求:\n{prompt}'
                    ),
                },
            ],
            'temperature': 0.3,
        },
        timeout=settings.ai_timeout_seconds,
    )
    response.raise_for_status()
    payload = response.json()
    content = payload['choices'][0]['message']['content']

    return {
        'suggestion': content.strip(),
        'provider': 'qwen',
        'model': settings.qwen_model,
    }
