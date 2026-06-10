import { apiGet, apiPost } from './client'
import type {
  DatasetImportResponse,
  DatasetItemListResponse,
  DatasetListResponse,
} from '../../types/dataset'

export async function listDatasets(keyword = '', page = 1, pageSize = 10) {
  return apiGet<DatasetListResponse>('/datasets', {
    keyword,
    page,
    pageSize,
  })
}

export async function listDatasetItems(datasetId: number, keyword = '', page = 1, pageSize = 100) {
  return apiGet<DatasetItemListResponse>(`/datasets/${datasetId}/items`, {
    keyword,
    page,
    pageSize,
  })
}

export async function importDataset(payload: {
  name: string
  description: string
  fileName: string
  contentBase64: string
  importMode: 'normal' | 'gold_sample' | 'demo'
}) {
  return apiPost<DatasetImportResponse, typeof payload>('/datasets/import', payload)
}
