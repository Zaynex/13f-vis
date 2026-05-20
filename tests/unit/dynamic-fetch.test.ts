import { beforeEach, describe, expect, it, vi } from 'vitest'

const runPipelineMock = vi.fn()
const getAvailableQuartersMock = vi.fn()

vi.mock('../../src/lib/pipeline/index', () => ({
  runPipeline: runPipelineMock,
  getAvailableQuarters: getAvailableQuartersMock,
}))

describe('dynamic fetch helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    runPipelineMock.mockReset()
    getAvailableQuartersMock.mockReset()
  })

  it('fetches the most recent SEC quarter for an institution', async () => {
    getAvailableQuartersMock.mockResolvedValue(['2026-Q1', '2025-Q4'])
    runPipelineMock.mockResolvedValue({ quarter: '2026-Q1' })

    const { dynamicFetchLatest } = await import('../../src/lib/pipeline/dynamic-fetch')

    const result = await dynamicFetchLatest('0001759760')

    expect(result).toEqual({ quarter: '2026-Q1', fetched: true })
    expect(runPipelineMock).toHaveBeenCalledTimes(1)
    expect(runPipelineMock).toHaveBeenCalledWith('0001759760', '2026-Q1', {
      skipUpsert: false,
      skipSplitAdjustment: false,
    })
  })

  it('deduplicates concurrent latest-quarter fetches for the same CIK', async () => {
    getAvailableQuartersMock.mockResolvedValue(['2026-Q1'])
    let releasePipeline!: () => void
    runPipelineMock.mockReturnValue(
      new Promise((resolve) => {
        releasePipeline = () => resolve({ quarter: '2026-Q1' })
      }),
    )

    const { dynamicFetchLatest } = await import('../../src/lib/pipeline/dynamic-fetch')

    const first = dynamicFetchLatest('0001759760')
    const second = dynamicFetchLatest('0001759760')

    await Promise.resolve()
    releasePipeline()
    await expect(Promise.all([first, second])).resolves.toEqual([
      { quarter: '2026-Q1', fetched: true },
      { quarter: '2026-Q1', fetched: true },
    ])

    expect(getAvailableQuartersMock).toHaveBeenCalledTimes(1)
    expect(runPipelineMock).toHaveBeenCalledTimes(1)
  })

  it('limits multi-quarter fetch concurrency', async () => {
    const activeCounts: number[] = []
    let active = 0
    runPipelineMock.mockImplementation(async (_cik: string, quarter: string) => {
      active += 1
      activeCounts.push(active)
      await new Promise((resolve) => setTimeout(resolve, 10))
      active -= 1
      return { quarter }
    })

    const { dynamicFetchMany } = await import('../../src/lib/pipeline/dynamic-fetch')

    await dynamicFetchMany('0002045724', ['2026-Q1', '2025-Q4', '2025-Q3'], {
      concurrency: 2,
    })

    expect(runPipelineMock).toHaveBeenCalledTimes(3)
    expect(Math.max(...activeCounts)).toBeLessThanOrEqual(2)
  })
})
