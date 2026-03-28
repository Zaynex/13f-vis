-- SEC 13F data tables (mirrors Prisma schema)
-- Run in Supabase SQL Editor after user_tables.sql
-- Prisma manages these tables via DATABASE_URL pointing to this Supabase instance

CREATE TYPE "ChangeType" AS ENUM ('NEW', 'EXITED', 'INCREASED', 'DECREASED', 'UNCHANGED');

CREATE TABLE "Institution" (
    "cik" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Institution_pkey" PRIMARY KEY ("cik")
);

CREATE TABLE "Filing" (
    "id" TEXT NOT NULL,
    "institutionCik" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "filedAt" TIMESTAMP(3) NOT NULL,
    "filingUrl" TEXT NOT NULL,
    "isAmended" BOOLEAN NOT NULL DEFAULT false,
    "holdingsFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Filing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "cusip" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "rawShares" INTEGER NOT NULL,
    "rawValue" DECIMAL(18,2) NOT NULL,
    "cumulativeSplitFactor" DECIMAL(65,30) NOT NULL DEFAULT 1.0,
    "adjustedShares" INTEGER NOT NULL,
    "priorAdjustedShares" INTEGER,
    "changeType" "ChangeType" NOT NULL DEFAULT 'UNCHANGED',
    "changePercent" DECIMAL(8,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Institution_name_idx" ON "Institution"("name");
CREATE INDEX "Filing_institutionCik_idx" ON "Filing"("institutionCik");
CREATE INDEX "Filing_quarter_idx" ON "Filing"("quarter");
CREATE UNIQUE INDEX "Filing_institutionCik_quarter_key" ON "Filing"("institutionCik", "quarter");
CREATE INDEX "Holding_cusip_idx" ON "Holding"("cusip");
CREATE INDEX "Holding_filingId_idx" ON "Holding"("filingId");
CREATE UNIQUE INDEX "Holding_filingId_cusip_key" ON "Holding"("filingId", "cusip");

ALTER TABLE "Filing" ADD CONSTRAINT "Filing_institutionCik_fkey" FOREIGN KEY ("institutionCik") REFERENCES "Institution"("cik") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
