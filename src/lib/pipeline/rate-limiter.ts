// Rate Limiter — Concurrency control + exponential backoff for SEC EDGAR API
//
// SEC EDGAR limits: 10 req/sec. We target 5 req/sec with 3 concurrent workers.
// This gives us headroom below the limit while maximizing throughput.
//
// Architecture:
//   ┌─────────────────────────────────────────────────────────────┐
//   │  Semaphore(maxConcurrent)                                   │
//   │                                                            │
//   │  ┌─────────┐  ┌─────────┐  ┌─────────┐                   │
//   │  │ Worker 1│  │ Worker 2│  │ Worker 3│  ← 3 concurrent  │
//   │  └────┬────┘  └────┬────┘  └────┬────┘                   │
//   │       │              │              │                        │
//   │       ▼              ▼              ▼                        │
//   │  ┌─────────────────────────────────────────────┐            │
//   │  │  RateLimiter (5 req/sec = 200ms between)  │            │
//   │  └─────────────────────────────────────────────┘            │
//   └─────────────────────────────────────────────────────────────┘
//
// Exponential backoff on 429: 1s → 2s → 4s → 8s → max 30s

export interface RateLimiterOptions {
  /** Max concurrent requests (default: 3) */
  maxConcurrent?: number
  /** Min ms between requests (default: 200ms = 5 req/sec) */
  minIntervalMs?: number
  /** Max backoff ms for rate limits (default: 30000ms) */
  maxBackoffMs?: number
}

export class RateLimiter {
  private queue: Array<() => void> = []
  private running = 0
  private lastRequestTime = 0
  private readonly maxConcurrent: number
  private readonly minIntervalMs: number
  private readonly maxBackoffMs: number

  constructor(options: RateLimiterOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 3
    this.minIntervalMs = options.minIntervalMs ?? 200
    this.maxBackoffMs = options.maxBackoffMs ?? 30_000
  }

  /**
   * Execute a rate-limited function with concurrency control.
   * Returns the result of the function.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    return this.acquire().then(fn).finally(() => this.release())
  }

  private async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++
      return
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve)
    })
  }

  private release(): void {
    const next = this.queue.shift()
    if (next) {
      next()
    } else {
      this.running--
    }
  }

  /**
   * Wait until enough time has passed since the last request.
   * Enforces the rate limit (minIntervalMs between requests).
   */
  async waitForRateLimit(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastRequestTime

    if (elapsed < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - elapsed
      await this.delay(waitTime)
    }

    this.lastRequestTime = Date.now()
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Sleep for a duration with exponential backoff multiplier.
   * Used after receiving a 429 rate limit response.
   */
  async backoff(attempt: number): Promise<void> {
    const baseDelay = Math.min(this.minIntervalMs * Math.pow(2, attempt), this.maxBackoffMs)
    // Add jitter (±10%) to avoid thundering herd
    const jitter = baseDelay * 0.1 * (Math.random() * 2 - 1)
    await this.delay(baseDelay + jitter)
  }

  /** Current number of running tasks */
  get runningCount(): number {
    return this.running
  }

  /** Number of queued tasks waiting for a slot */
  get queueLength(): number {
    return this.queue.length
  }
}

// Singleton rate limiter for the pipeline
export const rateLimiter = new RateLimiter({
  maxConcurrent: 3,
  minIntervalMs: 200, // 5 req/sec (SEC allows 10 req/sec)
  maxBackoffMs: 30_000,
})

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retry a function with exponential backoff on failure.
 *
 * @param fn - The function to retry
 * @param options - Retry options
 * @returns The result of the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number
    onRetry?: (attempt: number, error: Error) => void
    isRetryable?: (error: Error) => boolean
  } = {},
): Promise<T> {
  const {
    maxAttempts = 5,
    onRetry,
    isRetryable = (e: Error) => e.message.includes('429') || e.message.includes('rate'),
  } = options

  let lastError: Error

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      if (attempt === maxAttempts - 1) {
        throw lastError
      }

      if (!isRetryable(lastError)) {
        throw lastError
      }

      onRetry?.(attempt + 1, lastError)

      // Exponential backoff: 1s, 2s, 4s, 8s...
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30000)
      await sleep(backoffMs)
    }
  }

  throw lastError!
}
