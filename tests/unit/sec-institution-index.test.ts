import { describe, expect, it } from 'vitest'

import { getRecentEdgarIndexQuarters, parse13FInstitutionFormIndex } from '../../src/lib/pipeline/institution-index'

describe('SEC 13F institution index', () => {
  it('parses 13F-HR filers from an SEC form.idx payload', () => {
    const index = [
      'Form Type   Company Name                                                  CIK        Date Filed  File Name',
      '--------------------------------------------------------------------------------',
      '13F-HR      H&H International Investment, LLC                              1759760    2026-05-19  edgar/data/1759760/0001759760-26-000005.txt',
      '13F-HR/A    AMENDED MANAGER LLC                                           1234567    2026-05-19  edgar/data/1234567/0001234567-26-000001.txt',
      '13F-NT      NOTICE ONLY MANAGER LLC                                       7654321    2026-05-19  edgar/data/7654321/0007654321-26-000001.txt',
      '13F-HR      Situational Awareness LP                                      2045724    2026-05-18  edgar/data/2045724/0002045724-26-000008.txt',
    ].join('\n')

    expect(parse13FInstitutionFormIndex(index)).toEqual([
      { cik: '0001759760', name: 'H&H International Investment, LLC' },
      { cik: '0002045724', name: 'Situational Awareness LP' },
    ])
  })

  it('deduplicates CIKs while preserving the latest parsed name', () => {
    const index = [
      '13F-HR      OLD NAME LLC                                                 1759760    2026-02-14  edgar/data/1759760/a.txt',
      '13F-HR      H&H International Investment, LLC                              1759760    2026-05-19  edgar/data/1759760/b.txt',
    ].join('\n')

    expect(parse13FInstitutionFormIndex(index)).toEqual([
      { cik: '0001759760', name: 'H&H International Investment, LLC' },
    ])
  })

  it('returns recent SEC index quarters from newest to oldest', () => {
    expect(getRecentEdgarIndexQuarters(new Date('2026-05-20T00:00:00Z'), 4)).toEqual([
      { year: 2026, quarter: 2 },
      { year: 2026, quarter: 1 },
      { year: 2025, quarter: 4 },
      { year: 2025, quarter: 3 },
    ])
  })
})
