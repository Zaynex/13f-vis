-- Add missing columns to user_tracked_institutions to match Prisma schema.
-- Prisma UserTrackedInstitution model requires:
--   threshold_pct: Int @default(25)
--   updatedAt: DateTime @updatedAt
--
-- The original migration (001) created the table without these columns,
-- which caused the alert threshold upsert via Prisma to fail.
--
-- Also adds dismissed_at for alert dismissal tracking.

ALTER TABLE user_tracked_institutions
  ADD COLUMN IF NOT EXISTS threshold_pct integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- dismissed_at column for alert dismissal (per-institution)
-- Lets users dismiss fired alerts for a specific tracked fund
ALTER TABLE user_tracked_institutions
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

-- user_alerts table (cusip-keyed) is superseded by threshold_pct on
-- user_tracked_institutions. It is kept for historical reference but is
-- no longer written to. Do NOT drop it — data may exist.
