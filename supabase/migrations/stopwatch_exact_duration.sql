-- Preserve existing durations and allow second-accurate stopwatch sessions.
ALTER TABLE public.study_sessions
  ALTER COLUMN duration_minutes TYPE numeric(12,6)
  USING duration_minutes::numeric(12,6);
