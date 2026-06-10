const API_BASE = '/api/v1'

const AUTH_TOKEN_STORAGE_KEY = 'labelhub_token'
const AUTH_ROLE_STORAGE_KEY = 'labelhub_role'
const AUTH_EXPIRED_NOTICE_STORAGE_KEY = 'labelhub_auth_expired_notice'
const AUTH_EXPIRED_EVENT = 'labelhub:auth-expired'
const AUTH_SYNC_EVENT = 'labelhub:auth-sync'

type ApiEnvelope<T> = {
  code: number
  message: string
  data: T
}

type QueryValue = string | number | boolean | null | undefined
type RequestOptions = {
  timeout?: number
}

let authToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? ''

export function setAuthToken(token: string) {
  authToken = token
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
  window.localStorage.setItem('labelhub_auth_sync_nonce', String(Date.now()))
  notifyAuthSync()
}

export function getAuthToken() {
  return authToken
}

export function clearAuthSession(options?: { clearExpiredNotice?: boolean }) {
  authToken = ''
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  window.localStorage.removeItem(AUTH_ROLE_STORAGE_KEY)
  if (options?.clearExpiredNotice) {
    window.localStorage.removeItem(AUTH_EXPIRED_NOTICE_STORAGE_KEY)
  }
  window.localStorage.setItem('labelhub_auth_sync_nonce', String(Date.now()))
  notifyAuthSync()
}

export function markAuthExpiredNotice() {
  window.localStorage.setItem(AUTH_EXPIRED_NOTICE_STORAGE_KEY, '1')
}

export function consumeAuthExpiredNotice() {
  const value = window.localStorage.getItem(AUTH_EXPIRED_NOTICE_STORAGE_KEY)
  window.localStorage.removeItem(AUTH_EXPIRED_NOTICE_STORAGE_KEY)
  return value === '1'
}

function notifyAuthExpired() {
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
}

function notifyAuthSync() {
  window.dispatchEvent(new CustomEvent(AUTH_SYNC_EVENT))
}

function buildHeaders(): Record<string, string> {
  return authToken
    ? {
        Authorization: `Bearer ${authToken}`,
      }
    : {}
}

function shouldForceDevFailure(method: 'GET' | 'POST' | 'PATCH', path: string) {
  if (!import.meta.env.DEV) {
    return false
  }

  if (method === 'GET' && path === '/users/reviewers') {
    return window.localStorage.getItem('labelhub_dev_fail_get_reviewers') === '1'
  }

  if (method === 'POST' && path.startsWith('/tasks/') && path.endsWith('/reviewers')) {
    return window.localStorage.getItem('labelhub_dev_fail_save_reviewers') === '1'
  }

  if (method === 'POST' && path === '/submissions/draft') {
    return window.localStorage.getItem('labelhub_dev_fail_save_draft') === '1'
  }

  return false
}

function assertNoForcedDevFailure(method: 'GET' | 'POST' | 'PATCH', path: string) {
  if (shouldForceDevFailure(method, path)) {
    throw new Error(`forced dev failure: ${method} ${path}`)
  }
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  if (!query) {
    return `${API_BASE}${path}`
  }

  const searchParams = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value))
    }
  })

  const queryString = searchParams.toString()
  return queryString ? `${API_BASE}${path}?${queryString}` : `${API_BASE}${path}`
}

export class ApiError extends Error {
  public readonly status: number
  public readonly detail?: string

  constructor(status: number, message: string, detail?: string) {
    super(message)
    this.status = status
    this.detail = detail
    Object.setPrototypeOf(this, ApiError.prototype)
  }
}

async function parseErrorResponse(response: Response, method: string, path: string): Promise<never> {
  if (response.status === 401) {
    clearAuthSession()
    markAuthExpiredNotice()
    notifyAuthExpired()
  }

  const cloned = response.clone()
  let detail = `${method} ${path} failed`
  try {
    const errorPayload = await cloned.json()
    detail = errorPayload?.detail || errorPayload?.message || errorPayload?.error || detail
  } catch {
    try {
      detail = await cloned.text()
    } catch {
      // fall through
    }
  }

  if (import.meta.env.DEV) {
    console.debug('parseResponse error:', { status: response.status, method, path, detail })
  }

  throw new ApiError(response.status, detail, detail)
}

async function parseResponse<T>(response: Response, method: string, path: string): Promise<T> {
  if (!response.ok) {
    return parseErrorResponse(response, method, path)
  }

  const payload = (await response.json()) as ApiEnvelope<T>
  return payload.data
}

export async function apiGet<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
  assertNoForcedDevFailure('GET', path)

  const response = await fetch(buildUrl(path, query), {
    headers: buildHeaders(),
  })

  return parseResponse<T>(response, 'GET', path)
}

export async function apiGetBlob(path: string): Promise<{ blob: Blob; filename?: string }> {
  assertNoForcedDevFailure('GET', path)

  const response = await fetch(`${API_BASE}${path}`, {
    headers: buildHeaders(),
  })

  if (!response.ok) {
    return parseErrorResponse(response, 'GET', path)
  }

  const blob = await response.blob()
  const contentDisposition = response.headers.get('Content-Disposition') ?? ''
  const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/)

  return {
    blob,
    filename: fileNameMatch?.[1],
  }
}

export async function apiPost<TResponse, TRequest>(path: string, body: TRequest, options?: RequestOptions): Promise<TResponse> {
  assertNoForcedDevFailure('POST', path)

  const controller = options?.timeout ? new AbortController() : undefined
  const timeoutId = options?.timeout ? window.setTimeout(() => controller?.abort(), options.timeout) : undefined

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildHeaders(),
      },
      body: JSON.stringify(body),
      signal: controller?.signal,
    })

    return parseResponse<TResponse>(response, 'POST', path)
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId)
    }
  }
}

export async function apiPatch<TResponse, TRequest>(path: string, body: TRequest): Promise<TResponse> {
  assertNoForcedDevFailure('PATCH', path)

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildHeaders(),
    },
    body: JSON.stringify(body),
  })

  return parseResponse<TResponse>(response, 'PATCH', path)
}

export async function apiDelete<TResponse>(path: string): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  })

  return parseResponse<TResponse>(response, 'DELETE', path)
}

export function onAuthExpired(listener: () => void) {
  const handler = () => listener()
  window.addEventListener(AUTH_EXPIRED_EVENT, handler)
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler)
}

export function onAuthSync(listener: () => void) {
  const handler = () => listener()
  const storageHandler = (event: StorageEvent) => {
    if (
      event.key === AUTH_TOKEN_STORAGE_KEY ||
      event.key === AUTH_ROLE_STORAGE_KEY ||
      event.key === 'labelhub_auth_sync_nonce'
    ) {
      listener()
    }
  }

  window.addEventListener(AUTH_SYNC_EVENT, handler)
  window.addEventListener('storage', storageHandler)
  return () => {
    window.removeEventListener(AUTH_SYNC_EVENT, handler)
    window.removeEventListener('storage', storageHandler)
  }
}
