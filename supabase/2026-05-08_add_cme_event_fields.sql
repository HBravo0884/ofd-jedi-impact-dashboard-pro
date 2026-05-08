-- ──────────────────────────────────────────────────────────────────────
-- 2026-05-08 · Add HU CME form fields to Event
-- ──────────────────────────────────────────────────────────────────────
--
-- Run this BEFORE merging PR #17b. All columns are NULLABLE so it's
-- safe to run on a live database — no data backfill needed.
--
-- Paste the whole block into Supabase → SQL Editor → New query → Run.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "learningObjectives"        TEXT[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "disclosureReport"          TEXT,
  ADD COLUMN IF NOT EXISTS "planningCommittee"         TEXT,
  ADD COLUMN IF NOT EXISTS "acknowledgmentOfSupport"   TEXT,
  ADD COLUMN IF NOT EXISTS "eventTime"                 TEXT,
  ADD COLUMN IF NOT EXISTS "location"                  TEXT,
  ADD COLUMN IF NOT EXISTS "isGrandRounds"             BOOLEAN  DEFAULT FALSE;

-- Backfill the array column for any pre-existing rows (DEFAULT only
-- applies on INSERT; existing rows are still NULL). Cheap on a small
-- Event table.
UPDATE "Event"
   SET "learningObjectives" = '{}'
 WHERE "learningObjectives" IS NULL;
