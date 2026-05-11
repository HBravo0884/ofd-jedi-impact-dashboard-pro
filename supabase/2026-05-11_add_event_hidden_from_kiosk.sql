-- ──────────────────────────────────────────────────────────────────────
-- 2026-05-11 · Add hiddenFromKiosk to Event
-- ──────────────────────────────────────────────────────────────────────
--
-- Run this BEFORE merging the PR. Idempotent — safe to run multiple
-- times. Column is non-null with a default of FALSE, so existing rows
-- come back as "visible on kiosk" (the current behavior).
--
-- Paste into Supabase → SQL Editor → New query → Run.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "hiddenFromKiosk" BOOLEAN NOT NULL DEFAULT FALSE;
