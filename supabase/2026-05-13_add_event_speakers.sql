-- ──────────────────────────────────────────────────────────────────────
-- 2026-05-13 · Add speaker2 + speaker3 columns to Event
-- ──────────────────────────────────────────────────────────────────────
-- Idempotent ALTER TABLE — safe to run multiple times. Both columns
-- are nullable; no backfill needed. Existing Event.speaker remains
-- 'Speaker 1' in the new model.
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "speaker2" TEXT,
  ADD COLUMN IF NOT EXISTS "speaker3" TEXT;
