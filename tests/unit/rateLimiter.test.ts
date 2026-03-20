// Unit tests for RateLimiter and quarter utilities

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiter, withRetry } from '../../src/lib/pipeline/rate-limiter'

// ─── withRetry Tests ─────────────────────────────────────────────────────────

describe('withRetry', () => {
  it('should return result on success', async () => {
    const fn = vi.fn().mockResolvedValue(42)

    const result = await withRetry(fn, { maxAttempts: 3 })

    expect(result).toBe(42)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should retry on retryable errors', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValue(42)

    const result = await withRetry(fn, { maxAttempts: 3 })

    expect(result).toBe(42)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('should not retry on non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('not found'))

    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow('not found')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should respect maxAttempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('rate limit'))

    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow('rate limit')
    expect(fn).toHaveBeenCalledTimes(3) // 3 attempts, all failed
  })

  it('should use custom isRetryable', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('some error'))

    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        isRetryable: (e) => e.message.includes('some'),
      }),
    ).rejects.toThrow('some error')

    expect(fn).toHaveBeenCalledTimes(3)
  })
})

// ─── RateLimiter Basic Tests ─────────────────────────────────────────────────

describe('RateLimiter', () => {
  it('should create with default options', () => {
    const limiter = new RateLimiter()
    expect(limiter.runningCount).toBe(0)
    expect(limiter.queueLength).toBe(0)
  })

  it('should create with custom options', () => {
    const limiter = new RateLimiter({
      maxConcurrent: 5,
      minIntervalMs: 100,
      maxBackoffMs: 60000,
    })
    expect(limiter.runningCount).toBe(0)
  })

  it('should return result from wrapped function', async () => {
    const limiter = new RateLimiter()
    const result = await limiter.run(async () => 42)
    expect(result).toBe(42)
  })

  it('should propagate errors from wrapped function', async () => {
    const limiter = new RateLimiter()
    const err = new Error('test error')

    await expect(
      limiter.run(async () => {
        throw err
      }),
    ).rejects.toThrow('test error')
  })
})
