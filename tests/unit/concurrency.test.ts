import { describe, expect, it } from 'vitest'

describe('mapWithConcurrency', () => {
  it('runs tasks with a bounded concurrency limit and preserves result order', async () => {
    const { mapWithConcurrency } = await import('../../src/lib/pipeline/concurrency')
    const activeCounts: number[] = []
    let active = 0

    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      active += 1
      activeCounts.push(active)
      await new Promise((resolve) => setTimeout(resolve, 10))
      active -= 1
      return value * 10
    })

    expect(results).toEqual([10, 20, 30, 40])
    expect(Math.max(...activeCounts)).toBeLessThanOrEqual(2)
  })
})
