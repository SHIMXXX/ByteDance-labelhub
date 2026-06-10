type AIDimension = {
  key: string
  label: string
  description: string
  weight: number
  enabled: boolean
}

export type AIPromptPreset = {
  name: string
  prompt: string
  dimensions: AIDimension[]
}

export const DEFAULT_AI_SCORE_DIMENSIONS: AIDimension[] = [
  { key: 'accuracy', label: '准确性', description: '答案是否与题面、事实和参考答案保持一致', weight: 2, enabled: true },
  { key: 'completeness', label: '完整性', description: '是否覆盖题目要求的全部关键信息', weight: 1, enabled: true },
  { key: 'consistency', label: '一致性', description: '前后判断、标签选择和解释是否自洽', weight: 1, enabled: true },
  { key: 'evidence', label: '依据充分性', description: '理由是否能支撑结论，是否引用题面关键证据', weight: 1, enabled: true },
  { key: 'safety', label: '安全合规', description: '是否符合任务规范和安全边界', weight: 1, enabled: true },
]

export const DEFAULT_AI_PROMPT_TEMPLATE = '请作为专业标注审核员，根据题面、参考答案和标注员答案进行预审：\n\n题面：{source}\n参考答案：{reference_answer}\n标注员答案：{answers}\n\n请按评分维度逐项打分，并返回百分制总分。'

export const QA_QUALITY_AI_PROMPT_TEMPLATE = `你是 qa_quality 问答质量预审助手。请基于原始题面、媒体素材、待评估模型回答、参考答案和标注员提交结果，判断这次标注是否可信。

原始题面与素材：{source}
参考答案 / Gold：{reference_answer}
标注员答案：{answers}

请重点核查：
1. relevance_score、accuracy_score、format_score、safety_score 是否与题面、模型回答和参考答案一致。
2. issue_tags 是否覆盖主要问题；如果评分低但选择“无明显问题”，或评分高但选择严重问题标签，应判为不一致。
3. comment 是否具体说明扣分点或通过依据，不能只写空泛结论。
4. 图片、视频、Markdown 图文素材是否被纳入判断；涉及媒体内容时，不得只根据文本问题打分。
5. safety_score 与安全违规标签、评语是否一致。

请按配置的评分维度给出 1-5 分理由，并返回百分制 overallScore。只有评分、标签、评语和媒体理解都一致且 overallScore 达到 {pass_threshold} 时才返回 pass；存在明显矛盾时返回 reject；无法确认媒体或事实依据时返回 human_review。`

export const PROMPT_PRESETS: AIPromptPreset[] = [
  {
    name: '通用质量审计',
    prompt: DEFAULT_AI_PROMPT_TEMPLATE.replace('，并返回百分制总分。', '。'),
    dimensions: DEFAULT_AI_SCORE_DIMENSIONS,
  },
  {
    name: 'qa_quality 问答质量预审',
    prompt: QA_QUALITY_AI_PROMPT_TEMPLATE,
    dimensions: [
      { key: 'accuracy', label: '准确性', description: '四项评分是否与题面、模型回答、参考答案和事实依据一致', weight: 2, enabled: true },
      { key: 'completeness', label: '完整性', description: '是否完成评分、问题标签、详细评语等必填标注项', weight: 1, enabled: true },
      { key: 'media_review', label: '媒体理解', description: '图片、视频、Markdown 图文素材是否被纳入质量判断', weight: 1, enabled: true },
      { key: 'safety', label: '安全合规', description: '安全性评分、风险标签和评语是否一致且符合规范', weight: 1, enabled: true },
    ],
  },
  {
    name: 'RLHF 偏好对比审计',
    prompt: '对比 A 和 B 两个回答，判断标注员的选择是否合理。\n\n上下文：{source}\n标注员选择：{answers}\n\n评估逻辑：\n1. 如果 A 明显更好但标注员选 B，则拒绝。\n2. 如果两者差不多，标注员选 Tie，则通过。',
    dimensions: [
      { key: 'logic', label: '对比逻辑', description: '选择偏好的依据是否充分', weight: 1, enabled: true },
    ],
  },
  {
    name: '文本分类一致性',
    prompt: '核对标注员给出的分类标签是否与题面语义相符。\n\n文本：{source}\n标注标签：{answers}\n预期标签：{reference_answer}',
    dimensions: [
      { key: 'consistency', label: '分类一致性', description: '标签是否准确反映了分类', weight: 1, enabled: true },
    ],
  },
]
