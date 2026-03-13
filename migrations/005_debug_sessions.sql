-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: Zyra Debug Subsystem Tables
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID extension (already enabled in most Supabase projects)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── debug_sessions ────────────────────────────────────────────────────────────
-- Stores persistent debug session metadata for each Fix My App run.

CREATE TABLE IF NOT EXISTS public.debug_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_slug      TEXT NOT NULL,
  job_id            TEXT NOT NULL,              -- matches local job store ID
  debug_mode        TEXT NOT NULL DEFAULT 'standard',  -- standard | heal | incident | visual
  status            TEXT NOT NULL DEFAULT 'running',   -- running | completed | failed
  root_cause        TEXT,
  issue_type        TEXT,
  severity          TEXT,
  confidence        NUMERIC(4,3),
  affected_files    TEXT[],
  patch_applied     BOOLEAN NOT NULL DEFAULT FALSE,
  diagnosed_by      TEXT,                       -- ai | local | rule | local-fallback
  error_count       INTEGER DEFAULT 0,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS debug_sessions_user_id_idx     ON public.debug_sessions(user_id);
CREATE INDEX IF NOT EXISTS debug_sessions_project_slug_idx ON public.debug_sessions(project_slug);
CREATE INDEX IF NOT EXISTS debug_sessions_created_at_idx  ON public.debug_sessions(created_at DESC);

-- ── debug_patches ─────────────────────────────────────────────────────────────
-- Stores every patch applied via the debugger with full rollback info.

CREATE TABLE IF NOT EXISTS public.debug_patches (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id       UUID REFERENCES public.debug_sessions(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_slug     TEXT NOT NULL,
  patch_files      JSONB NOT NULL DEFAULT '[]',  -- [{path, content}]
  backup_files     JSONB NOT NULL DEFAULT '[]',  -- [{path, original}]
  files_written    TEXT[],
  files_failed     TEXT[],
  rolled_back      BOOLEAN NOT NULL DEFAULT FALSE,
  rolled_back_at   TIMESTAMPTZ,
  applied_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS debug_patches_session_id_idx  ON public.debug_patches(session_id);
CREATE INDEX IF NOT EXISTS debug_patches_user_id_idx     ON public.debug_patches(user_id);

-- ── incident_reports ──────────────────────────────────────────────────────────
-- Stores production incident analysis reports.

CREATE TABLE IF NOT EXISTS public.incident_reports (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_slug          TEXT NOT NULL,
  job_id                TEXT NOT NULL,
  summary               TEXT,
  severity              TEXT,
  incident_type         TEXT,
  root_cause            TEXT,
  probable_trigger      TEXT,
  confidence            NUMERIC(4,3),
  affected_areas        TEXT[],
  remediation_steps     TEXT[],
  rollback_recommended  BOOLEAN DEFAULT FALSE,
  requires_manual_action BOOLEAN DEFAULT TRUE,
  start_time_estimate   TIMESTAMPTZ,
  diagnosed_by          TEXT,
  metadata              JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS incident_reports_user_id_idx     ON public.incident_reports(user_id);
CREATE INDEX IF NOT EXISTS incident_reports_project_slug_idx ON public.incident_reports(project_slug);
CREATE INDEX IF NOT EXISTS incident_reports_created_at_idx  ON public.incident_reports(created_at DESC);

-- ── visual_debug_reports ──────────────────────────────────────────────────────
-- Stores visual bug analysis results.

CREATE TABLE IF NOT EXISTS public.visual_debug_reports (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_slug        TEXT NOT NULL,
  job_id              TEXT NOT NULL,
  summary             TEXT,
  issue_class         TEXT,
  affected_component  TEXT,
  probable_file       TEXT,
  root_cause          TEXT,
  suggested_fix       TEXT,
  confidence          NUMERIC(4,3),
  screenshot_analyzed BOOLEAN DEFAULT FALSE,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS visual_reports_user_id_idx     ON public.visual_debug_reports(user_id);
CREATE INDEX IF NOT EXISTS visual_reports_project_slug_idx ON public.visual_debug_reports(project_slug);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.debug_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debug_patches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_reports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visual_debug_reports ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users see own debug sessions"
  ON public.debug_sessions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users see own debug patches"
  ON public.debug_patches FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users see own incident reports"
  ON public.incident_reports FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users see own visual reports"
  ON public.visual_debug_reports FOR ALL
  USING (auth.uid() = user_id);

-- ── Updated-at trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER debug_sessions_updated_at
  BEFORE UPDATE ON public.debug_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
