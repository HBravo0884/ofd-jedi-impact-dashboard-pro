-- ──────────────────────────────────────────────────────────────────────
-- 2026-05-11 · Add adminTitle + positionType columns to Faculty
-- ──────────────────────────────────────────────────────────────────────
--
-- Run this BEFORE merging the PR. Idempotent — safe to run multiple
-- times. Both columns are nullable; no backfill needed for existing
-- rows.
--
-- adminTitle:   free-text display title (e.g. "Director of Finance",
--               "Clinical Associate Professor"). Shown in the directory
--               next to the name. Editable via the directory edit modal.
--               Distinct from rank (AcademicRank enum) — this is the
--               specific job/admin role.
--
-- positionType: free-text classification (e.g. "Basic Science Faculty",
--               "Clinical Faculty", "Investigators & Admin"). Carried
--               in from directory CSV imports for analytics.
--
-- Paste into Supabase → SQL Editor → New query → Run.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "Faculty"
  ADD COLUMN IF NOT EXISTS "adminTitle"   TEXT,
  ADD COLUMN IF NOT EXISTS "positionType" TEXT;
