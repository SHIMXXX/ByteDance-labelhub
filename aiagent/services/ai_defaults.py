DEFAULT_AI_PASS_THRESHOLD = 80

DEFAULT_AI_SCORE_DIMENSIONS = [
    {
        'key': 'accuracy',
        'label': '准确性',
        'description': '答案是否与题面、事实和参考答案保持一致。',
        'weight': 2,
        'enabled': True,
    },
    {
        'key': 'completeness',
        'label': '完整性',
        'description': '是否覆盖题目要求的全部关键信息，没有明显遗漏。',
        'weight': 1,
        'enabled': True,
    },
    {
        'key': 'consistency',
        'label': '一致性',
        'description': '前后判断、标签选择和解释是否自洽。',
        'weight': 1,
        'enabled': True,
    },
    {
        'key': 'evidence',
        'label': '依据充分性',
        'description': '理由是否能支撑结论，是否引用了题面中的关键证据。',
        'weight': 1,
        'enabled': True,
    },
    {
        'key': 'safety',
        'label': '安全合规',
        'description': '是否存在违规、敏感、越权或不符合任务规范的内容。',
        'weight': 1,
        'enabled': True,
    },
]


def normalize_percent_pass_threshold(value: object) -> int:
    if value is None or value == '':
        return DEFAULT_AI_PASS_THRESHOLD
    try:
        threshold = float(value)
    except (TypeError, ValueError):
        return DEFAULT_AI_PASS_THRESHOLD

    return max(0, min(100, int(round(threshold))))


def normalize_score_dimensions(value: object) -> list[dict]:
    if not isinstance(value, list) or len(value) == 0:
        return [item.copy() for item in DEFAULT_AI_SCORE_DIMENSIONS]

    normalized: list[dict] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        key = str(item.get('key') or item.get('label') or '').strip()
        label = str(item.get('label') or item.get('key') or '').strip()
        if not key and not label:
            continue
        try:
            weight = int(item.get('weight', 1))
        except (TypeError, ValueError):
            weight = 1
        normalized.append(
            {
                'key': key or label,
                'label': label or key,
                'description': str(item.get('description') or ''),
                'weight': max(1, weight),
                'enabled': item.get('enabled') is not False,
            }
        )

    enabled = [item for item in normalized if item.get('enabled') is not False]
    return enabled or [item.copy() for item in DEFAULT_AI_SCORE_DIMENSIONS]


def calculate_overall_score(scores: object, score_dimensions: object = None) -> int:
    if not isinstance(scores, list) or len(scores) == 0:
        return 0

    dimensions = normalize_score_dimensions(score_dimensions)
    weights: dict[str, int] = {}
    for item in dimensions:
        weight = int(item.get('weight') or 1)
        if item.get('key'):
            weights[str(item['key'])] = weight
        if item.get('label'):
            weights[str(item['label'])] = weight

    total_weight = 0
    weighted_score = 0.0
    for item in scores:
        if not isinstance(item, dict):
            continue
        raw_score = item.get('score')
        try:
            score = float(raw_score)
        except (TypeError, ValueError):
            continue
        dimension = str(item.get('dimension') or '')
        weight = weights.get(dimension, 1)
        score = max(0, min(5, score))
        weighted_score += (score / 5) * 100 * weight
        total_weight += weight

    if total_weight == 0:
        return 0
    return max(0, min(100, int(round(weighted_score / total_weight))))
