// SEC EDGAR Error Class Hierarchy
//
// All errors from the 13F pipeline inherit from SecEdgarError.
// This allows callers to catch specific failure modes.

export class SecEdgarError extends Error {
  readonly code: string
  readonly filingUrl?: string
  readonly filerName?: string
  readonly quarter?: string

  constructor(message: string, code: string, meta?: {
    filingUrl?: string
    filerName?: string
    quarter?: string
  }) {
    super(message)
    this.name = 'SecEdgarError'
    this.code = code
    this.filingUrl = meta?.filingUrl
    this.filerName = meta?.filerName
    this.quarter = meta?.quarter
  }

  toString() {
    return `[${this.code}] ${this.message}${this.filingUrl ? ` (${this.filingUrl})` : ''}`
  }
}

export class FetchError extends SecEdgarError {
  constructor(message: string, meta?: { filingUrl?: string; filerName?: string; quarter?: string }) {
    super(message, 'FETCH_ERROR', meta)
    this.name = 'FetchError'
  }
}

export class RateLimitError extends FetchError {
  readonly retryAfterMs: number

  constructor(retryAfterMs: number, meta?: { filingUrl?: string; filerName?: string; quarter?: string }) {
    super(`Rate limited by SEC EDGAR. Retry after ${retryAfterMs / 1000}s.`, meta)
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

export class TimeoutError extends FetchError {
  constructor(timeoutMs: number, meta?: { filingUrl?: string; filerName?: string; quarter?: string }) {
    super(`Request timed out after ${timeoutMs}ms.`, meta)
    this.name = 'TimeoutError'
  }
}

export class ParseError extends SecEdgarError {
  constructor(message: string, meta?: { filingUrl?: string; filerName?: string; quarter?: string }) {
    super(message, 'PARSE_ERROR', meta)
    this.name = 'ParseError'
  }
}

export class UnsupportedFormatError extends ParseError {
  readonly detectedFormat: string

  constructor(detectedFormat: string, meta?: { filingUrl?: string; filerName?: string; quarter?: string }) {
    super(`Unsupported 13F filing format: ${detectedFormat}`, meta)
    this.name = 'UnsupportedFormatError'
    this.detectedFormat = detectedFormat
  }
}

export class ValidationError extends SecEdgarError {
  readonly field: string
  readonly value: unknown

  constructor(field: string, value: unknown, meta?: { filingUrl?: string; filerName?: string; quarter?: string }) {
    super(`Validation failed for field '${field}': ${JSON.stringify(value)}`, 'VALIDATION_ERROR', meta)
    this.name = 'ValidationError'
    this.field = field
    this.value = value
  }
}

export class NotFoundError extends SecEdgarError {
  constructor(resource: string, meta?: { filingUrl?: string; filerName?: string; quarter?: string }) {
    super(`13F filing not found: ${resource}`, 'NOT_FOUND', meta)
    this.name = 'NotFoundError'
  }
}
