// Zod schemas for validating external 13F data
//
// All external data (SEC filings, Yahoo Finance) must pass through these
// schemas before touching the database. This prevents bad data from entering
// the system and provides a clear validation boundary.
//
// Rules:
// - CUSIP: 9 characters, alphanumeric (validated)
// - Shares: non-negative integer
// - Company name: non-empty string, trimmed
// - Value: non-negative decimal

import { z } from 'zod'

// ─── 13F Holding (normalized) ───────────────────────────────────────────────

export const HoldingSchema = z.object({
  cusip: z.string()
    .length(9, 'CUSIP must be exactly 9 characters')
    .regex(/^[A-Z0-9]{9}$/, 'CUSIP must be alphanumeric uppercase'),
  companyName: z.string()
    .min(1, 'Company name cannot be empty')
    .max(200, 'Company name too long')
    .trim(),
  shares: z.number()
    .int('Share count must be an integer')
    .min(0, 'Share count cannot be negative'),
  value: z.number()
    .min(0, 'Market value cannot be negative'),
  putCall: z.enum(['PUT', 'CALL']).nullable().optional(),
})

export type ParsedHolding = z.infer<typeof HoldingSchema>
export type PutCall = NonNullable<ParsedHolding['putCall']>

export function normalizePutCall(raw: string | null | undefined): PutCall | null {
  const normalized = (raw ?? '').trim().toUpperCase()
  if (normalized === 'PUT') return 'PUT'
  if (normalized === 'CALL') return 'CALL'
  return null
}

// ─── 13F Filing (metadata) ──────────────────────────────────────────────────

export const FilingMetadataSchema = z.object({
  institutionCik: z.string()
    .regex(/^\d{10}$/, 'CIK must be 10 digits zero-padded'),
  quarter: z.string()
    .regex(/^\d{4}-Q[1-4]$/, 'Quarter must be in YYYY-QN format'),
  filedAt: z.string().datetime(),
  filingUrl: z.string().url(),
  isAmended: z.boolean().default(false),
})

export type ParsedFilingMetadata = z.infer<typeof FilingMetadataSchema>

// ─── Yahoo Finance Split Data ────────────────────────────────────────────────

export const StockSplitSchema = z.object({
  cusip: z.string().length(9),
  splitDate: z.string(), // ISO date "2025-08-22"
  splitRatio: z.string().regex(/^\d+:\d+$/, 'Split ratio must be N:N format'),
})

export const StockSplitResponseSchema = z.object({
  splits: z.array(StockSplitSchema),
})

export type StockSplit = z.infer<typeof StockSplitSchema>

// ─── API Input Validation ────────────────────────────────────────────────────

export const InstitutionSearchSchema = z.object({
  query: z.string().min(1).max(100),
})

export const ComparisonSchema = z.object({
  ciks: z.array(z.string().regex(/^\d{10}$/))
    .min(2, 'Need at least 2 institutions to compare')
    .max(5, 'Maximum 5 institutions for comparison'),
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/).optional(),
})

export const TrackerQuerySchema = z.object({
  cik: z.string().regex(/^\d{10}$/, 'CIK must be 10 digits zero-padded'),
  from: z.string().regex(/^\d{4}-Q[1-4]$/, 'Quarter must be YYYY-QN format'),
  to: z.string().regex(/^\d{4}-Q[1-4]$/, 'Quarter must be YYYY-QN format'),
})

// ─── CIK Request ──────────────────────────────────────────────────────────────

export const CikRequestSchema = z.object({
  cik: z.string()
    .regex(/^\d{1,10}$/, 'CIK must be 1-10 digits')
    .transform((v) => v.padStart(10, '0')),
  name: z.string()
    .min(1, 'Institution name is required')
    .max(200, 'Name too long')
    .trim(),
  notes: z.string().max(500).optional(),
})

export const CikRequestStatusSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
})

// ─── Alerts ──────────────────────────────────────────────────────────────────

export const CreateAlertSchema = z.object({
  institutionCik: z.string().regex(/^\d{10}$/, 'CIK must be 10 digits'),
  thresholdPct: z.number().int().min(5).max(100).default(25),
})

export const AlertEventSchema = z.object({
  id: z.string(),
  quarter: z.string(),
  cusip: z.string(),
  companyName: z.string(),
  changeType: z.enum(['NEW', 'EXITED', 'INCREASED', 'DECREASED', 'UNCHANGED']),
  changePercent: z.number(),
  firedAt: z.string(),
  read: z.boolean(),
})

// ─── Change Badge Calculation ─────────────────────────────────────────────────
//
// Given current and prior quarter adjusted share counts, classify the change.

export type ChangeBadge = 'NEW' | 'EXITED' | 'INCREASED' | 'DECREASED' | 'UNCHANGED'

export function calculateChangeBadge(
  currentShares: number | null,
  priorShares: number | null,
): ChangeBadge {
  if (currentShares === null && priorShares === null) return 'UNCHANGED' // shouldn't happen
  if (currentShares !== null && priorShares === null) return 'NEW'
  if (currentShares === null && priorShares !== null) return 'EXITED'
  if (currentShares === priorShares) return 'UNCHANGED'
  if (currentShares === null || priorShares === null) return 'UNCHANGED'

  const pct = ((currentShares - priorShares) / priorShares) * 100
  if (pct > 1) return 'INCREASED'
  if (pct < -1) return 'DECREASED'
  return 'UNCHANGED'
}
