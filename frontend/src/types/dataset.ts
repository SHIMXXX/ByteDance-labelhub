export type DatasetImportMode = 'normal' | 'gold_sample' | 'demo'

export type DatasetSourceFormat = 'json' | 'jsonl' | 'excel'

export type DatasetSummary = {
  id: number
  name: string
  description: string
  sourceType: DatasetSourceFormat
  importMode: DatasetImportMode
  itemCount: number
  createdAt: string
  updatedAt: string
}

export type DatasetItemPreview = {
  id: number
  sequence: number
  source: Record<string, unknown>
  metadata: Record<string, unknown>
  referenceAnswer: Record<string, unknown>
}

export type DatasetListResponse = {
  items: DatasetSummary[]
  total: number
  page: number
  pageSize: number
}

export type DatasetItemListResponse = {
  dataset: DatasetSummary
  items: DatasetItemPreview[]
  total: number
  page: number
  pageSize: number
}

export type DatasetImportResponse = {
  dataset: DatasetSummary
  summary: {
    total: number
  }
  errors: string[]
  previewItems: DatasetItemPreview[]
}
