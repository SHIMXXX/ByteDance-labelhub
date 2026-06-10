export type UserRole = 'owner' | 'labeler' | 'reviewer'

export type TaskStatus = 'draft' | 'published' | 'paused' | 'ended'

export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'ai_passed'
  | 'needs_revision'
  | 'review_passed'

export type AIDecision = 'pass' | 'reject' | 'human_review'

export type ExportStatus = 'queued' | 'processing' | 'done' | 'failed'

export type OwnerTask = {
  id: number
  title: string
  description: string
  taskBrief?: string
  taskTags?: string[]
  rewardRule?: string
  status: TaskStatus
  quota: number
  deadline: string
  templateId?: number | null
  datasetId?: number | null
  itemCount?: number
  completedItemCount?: number
  passedItemCount?: number
  pendingReviewCount?: number
  passRate?: number
  createdAt?: string | null
  updatedAt?: string | null
  reviewers?: Array<{
    reviewerId: number
    username: string
    displayName: string
  }>
  labelers?: Array<{
    labelerId: number
    username: string
    displayName: string
    assignmentId?: number
  }>
  aiConfig?: {
    promptTemplate: string
    scoreDimensions: Array<{
      key: string
      label: string
      description?: string
      weight?: number
      enabled?: boolean
    }>
    passThreshold: number
    reviewGuideline: string
    aiModel?: string
  }
}

export type TemplateComponentType =
  | 'text_input'
  | 'textarea'
  | 'single_select'
  | 'multi_select'
  | 'tag_select'
  | 'image_upload'
  | 'show_item'
  | 'compare_panel'
  | 'rich_text'
  | 'json_editor'
  | 'llm_assist'
  | 'group'
  | 'tab_container'
  | 'field_display'
  | 'field_textarea'
  | 'field_tags'
  | 'field_hyperlink'
  | 'field_image'
  | 'field_video'
  | 'field_markdown'

export type TemplateVisibilityRule = {
  field: string
  operator: 'eq' | 'neq' | 'not_empty' | 'includes'
  value?: string
}

export type TemplateValidationRule =
  | { type: 'required_if'; field: string; operator: 'eq' | 'neq' | 'not_empty' | 'includes'; value?: string }
  | { type: 'min_selected'; value: number }
  | { type: 'json_valid' }
  | { type: 'min_length'; value: number }
  | { type: 'equals_if'; field: string; operator: 'eq' | 'neq' | 'not_empty' | 'includes'; value?: string; expectedValue: string }
  | { type: 'not_equals_if'; field: string; operator: 'eq' | 'neq' | 'not_empty' | 'includes'; value?: string; expectedValue: string }

export type TemplateComponent = {
  id: number
  type: TemplateComponentType
  label: string
  field: string
  required: boolean
  pane?: 'source' | 'answer'
  options?: string[]
  optionsText?: string
  maxCount?: number
  content?: string
  llmInstruction?: string
  promptField?: string
  leftField?: string
  rightField?: string
  leftLabel?: string
  rightLabel?: string
  contextFields?: string[]
  metadataFields?: string[]
  sourceField?: string
  visibleWhen?: TemplateVisibilityRule[]
  validationRules?: TemplateValidationRule[]
  children?: TemplateComponent[]
  children_left?: TemplateComponent[]
  children_right?: TemplateComponent[]
  tabs?: Array<{ key: string; label: string; children: TemplateComponent[] }>
  description?: string
}

export type TemplateDatasetBinding = {
  datasetId: number | null
  datasetName?: string
  sampleStrategy: 'first_item'
  sampleItemId?: number | null
}

export type TemplateSchemaV3 = {
  version: 3
  datasetBinding: TemplateDatasetBinding
  layout: { type: 'stacked-source-answer' }
  sourceView: { components: TemplateComponent[] }
  answerView: { components: TemplateComponent[] }
}

export type TemplateSchema = TemplateComponent[] | TemplateSchemaV3

export type JsonRecord = Record<string, unknown>

export type LabelerTask = OwnerTask & {
  remaining: number
  claimed: boolean
  assignmentId?: number
}

export type WorkbenchItemStatus =
  | 'not_started'
  | 'draft'
  | 'submitted'
  | 'ai_reviewing'
  | 'manual_reviewing'
  | 'needs_revision'
  | 'review_passed'

export type LabelerWorkItem = {
  id: number
  taskTitle: string
  sourceText: string
  source?: JsonRecord
  schema: TemplateSchema
  draftSubmissionId?: number
  draftAnswers?: Record<string, ReviewAnswerValue>
  previousAnswers?: Record<string, ReviewAnswerValue> | null
  diffItems?: ReviewDiffItem[]
  currentVersionNo?: number
  draftStatus?: WorkbenchItemStatus
  draftSavedAt?: string
  latestRejectReason?: string | null
}

export type LabelerAssignmentSummary = {
  assignmentId: number
  taskId: number
  taskTitle: string
  taskStatus: TaskStatus
  total: number
  completed: number
  reviewPassed: number
  needsRevision: number
  latestSubmissionStatus: WorkbenchItemStatus
  latestUpdatedAt: string | null
  latestRejectReason?: string | null
  latestRejectItemId?: number | null
  latestRejectAt?: string | null
  revisionItemIds?: number[]
}

export type LabelerContributionItem = {
  submissionId: number
  assignmentId: number
  taskId: number
  taskTitle: string
  itemId: number
  status: WorkbenchItemStatus
  updatedAt: string
  latestRejectReason?: string | null
}

export type LabelerHistoryItem = {
  submissionId: number
  assignmentId: number
  taskId: number
  taskTitle: string
  itemId: number
  status: SubmissionStatus
  updatedAt: string
}

export type LabelerWorkbenchSummary = {
  metrics: {
    claimedTaskCount: number
    submittedItemCount: number
    reviewPassedItemCount: number
    needsRevisionItemCount: number
  }
  assignments: LabelerAssignmentSummary[]
  recentSubmissions: LabelerContributionItem[]
}

export type ReviewAnswerValue = string | string[] | boolean

export type ReviewPendingItem = {
  submissionId: number
  taskId: number
  itemId: number
  labelerName: string
  taskTitle: string
  aiDecision: AIDecision
  submissionStatus: SubmissionStatus
  submittedAt: string
  currentReviewStage?: 'initial' | 'second' | 'final'
  currentReviewRound?: number
  hasPreviousVersion?: boolean
  assignedReviewer?: string | null
  latestAiSummary?: string
  reviewPriorityScore?: number
  reviewPriorityLevel?: 'high' | 'medium' | 'normal'
  reviewPriorityFactors?: {
    aiRiskScore: number
    waitingScore: number
    waitingHours: number
    labelerRejectRate: number
    labelerRejectScore: number
    taskPriorityScore: number
  }
}

export type ReviewDiffItem = {
  field: string
  previousValue: unknown
  currentValue: unknown
  changeType: 'added' | 'changed' | 'unchanged' | 'removed'
}

export type ReviewHistoryItem = {
  id: number
  decision: 'approve' | 'reject'
  stage: 'initial' | 'second' | 'final'
  round: number
  comment: string
  reason: string
  createdAt: string
}

export type ReviewTimelineItem =
  | {
      type: 'audit'
      createdAt: string
      eventType: string
      title?: string
      payload: Record<string, unknown>
      reviewerName?: string
      labelerName?: string
    }
  | {
      type: 'review'
      createdAt: string
      eventType?: string
      title?: string
      stage: 'initial' | 'second' | 'final'
      decision: 'approve' | 'reject'
      comment?: string
      reason?: string
      payload?: Record<string, unknown>
      reviewerName?: string
      labelerName?: string
    }

export type ReviewDetail = {
  submissionId: number
  task: { id: number; title: string }
  template?: {
    templateVersionId: number | null
    schema: TemplateSchema
  }
  item: { itemId: number; source: JsonRecord }
  answers: Record<string, ReviewAnswerValue>
  finalAnswers?: Record<string, ReviewAnswerValue>
  aiResult: {
    scores: { dimension: string; score: number; reason: string }[]
    overallScore?: number
    decision: AIDecision
    summary: string
  }
  submissionStatus: SubmissionStatus
  currentReviewStage?: 'initial' | 'second' | 'final'
  currentReviewRound?: number
  currentVersionNo?: number
  diffItems: ReviewDiffItem[]
  reviewHistory: ReviewHistoryItem[]
  timeline: ReviewTimelineItem[]
}

export type ReviewerQualityHistoryItem = {
  submissionId: number
  taskTitle: string
  labelerName: string
  itemId: number
  reviewRound: number
  reviewStage: 'initial' | 'second' | 'final'
  decision: 'approve' | 'reject'
  reason: string
  comment: string
  createdAt: string
}

export type ReviewerQualityStats = {
  approvalRate: number
  decisionCounts: {
    approve: number
    reject: number
  }
  topRejectReasons: Array<{
    reason: string
    count: number
  }>
  historyReviews: ReviewerQualityHistoryItem[]
}

export type ExportFormat = 'json' | 'csv' | 'jsonl' | 'excel'

export type ExportJob = {
  jobId: number
  taskId: number
  taskTitle: string
  format: ExportFormat
  status: ExportStatus
  downloadUrl?: string
  createdAt: string
  finishedAt?: string
}
