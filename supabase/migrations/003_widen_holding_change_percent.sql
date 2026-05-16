-- Widen percentage deltas for large position changes.
-- Existing databases already applied 002_sec_tables.sql, so keep this as a
-- forward migration instead of relying on edits to the bootstrap migration.

ALTER TABLE "Holding"
  ALTER COLUMN "changePercent" TYPE DECIMAL(18,2);
