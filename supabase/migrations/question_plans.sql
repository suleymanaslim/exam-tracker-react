-- Run this entire updated file in Supabase SQL Editor (also safe after the first version).
-- Adds question planning; existing videos, plans and study records are preserved.
-- Topic notes stay attached to their own goal. Once a solution exists the topic
-- cannot be renamed; create a separate goal for another topic instead.
BEGIN;

CREATE TABLE IF NOT EXISTS public.question_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_plan_item_id uuid REFERENCES public.video_plan_items(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  resource_id uuid REFERENCES public.resources(id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  kind text NOT NULL DEFAULT 'video' CHECK (kind IN ('video', 'extra')),
  target_questions integer CHECK (target_questions BETWEEN 1 AND 100000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_plan_item_id)
);
ALTER TABLE public.question_plans ADD COLUMN IF NOT EXISTS period text NOT NULL DEFAULT 'day' CHECK (period IN ('day', 'week'));
ALTER TABLE public.question_plans ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.question_plans ADD COLUMN IF NOT EXISTS note text CHECK (char_length(note) <= 1000);

CREATE INDEX IF NOT EXISTS question_plans_user_date ON public.question_plans(user_id, date);
-- Replaces only an index; no question rows are removed. A fixed-width note hash
-- supports the full 1000-character limit even for multibyte text. Upserts also
-- compare the actual note so a hash collision cannot merge unrelated topics.
DROP INDEX IF EXISTS public.question_plans_extra_subject_day;
DROP INDEX IF EXISTS public.question_plans_extra_subject_period;
CREATE UNIQUE INDEX IF NOT EXISTS question_plans_extra_subject_period_note
  ON public.question_plans(user_id, subject_id, date, period, (md5(COALESCE(note, '')))) WHERE kind = 'extra';

CREATE TABLE IF NOT EXISTS public.question_session_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid UNIQUE REFERENCES public.study_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_plan_id uuid NOT NULL REFERENCES public.question_plans(id) ON DELETE CASCADE,
  solved_questions integer NOT NULL CHECK (solved_questions BETWEEN 0 AND 100000),
  correct_questions integer CHECK (correct_questions BETWEEN 0 AND 100000),
  wrong_questions integer CHECK (wrong_questions BETWEEN 0 AND 100000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (COALESCE(correct_questions, 0) + COALESCE(wrong_questions, 0) <= solved_questions)
);
ALTER TABLE public.question_session_results ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.question_session_results ADD COLUMN IF NOT EXISTS note text CHECK (char_length(note) <= 1000);

CREATE INDEX IF NOT EXISTS question_results_user_plan ON public.question_session_results(user_id, question_plan_id);

ALTER TABLE public.question_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_session_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read own or admin question plans" ON public.question_plans;
CREATE POLICY "Read own or admin question plans" ON public.question_plans
FOR SELECT TO authenticated USING (
  user_id = (SELECT auth.uid()) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'
  )
);
DROP POLICY IF EXISTS "Write own or admin question plans" ON public.question_plans;
DROP POLICY IF EXISTS "Update own or admin question plans" ON public.question_plans;
DROP POLICY IF EXISTS "Read own or admin question results" ON public.question_session_results;
CREATE POLICY "Read own or admin question results" ON public.question_session_results
FOR SELECT TO authenticated USING (
  user_id = (SELECT auth.uid()) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'
  )
);
REVOKE ALL ON public.question_plans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.question_session_results FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (date, target_questions) ON public.question_plans FROM authenticated;
GRANT SELECT ON public.question_plans TO authenticated;
GRANT SELECT ON public.question_session_results TO authenticated;

-- Time and counts save together; retrying a session ID never increments twice.
-- A null plan ID creates/reuses a standalone daily subject question record.
-- Replace the old RPC signature only; existing rows are retained.
DROP FUNCTION IF EXISTS public.save_question_study_session(uuid, uuid, uuid, uuid, date, integer, timestamptz, timestamptz, numeric, integer, integer);
CREATE OR REPLACE FUNCTION public.save_question_study_session(
  p_session_id uuid, p_question_plan_id uuid, p_user_id uuid, p_subject_id uuid,
  p_date date, p_questions integer, p_started_at timestamptz, p_ended_at timestamptz,
  p_duration_minutes numeric, p_correct integer DEFAULT NULL, p_wrong integer DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  plan public.question_plans%ROWTYPE;
  previous public.question_session_results%ROWTYPE;
  saved_note text := nullif(btrim(p_note), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_user_id IS NULL OR (p_user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF char_length(saved_note) > 1000 OR p_questions IS NULL OR p_questions < 0 OR p_questions > 100000
    OR p_correct < 0 OR p_correct > 100000 OR p_wrong < 0 OR p_wrong > 100000
    OR COALESCE(p_correct, 0) + COALESCE(p_wrong, 0) > p_questions
    OR p_duration_minutes IS NULL OR p_duration_minutes <= 0 OR p_duration_minutes::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_started_at IS NULL OR p_ended_at IS NULL OR NOT isfinite(p_started_at) OR NOT isfinite(p_ended_at)
    OR p_ended_at < p_started_at OR p_session_id IS NULL OR p_date IS NULL THEN
    RAISE EXCEPTION 'Invalid question session';
  END IF;
  IF p_question_plan_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.subjects WHERE id = p_subject_id AND user_id = p_user_id) THEN
      RAISE EXCEPTION 'Subject not found' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.question_plans(user_id, subject_id, date, kind)
    VALUES (p_user_id, p_subject_id, p_date, 'extra')
    ON CONFLICT (user_id, subject_id, date, period, (md5(COALESCE(note, '')))) WHERE kind = 'extra'
    DO UPDATE SET date = EXCLUDED.date WHERE question_plans.note IS NULL RETURNING * INTO plan;
  ELSE
    SELECT * INTO plan FROM public.question_plans WHERE id = p_question_plan_id FOR UPDATE;
    IF NOT FOUND OR plan.user_id <> p_user_id OR plan.subject_id IS DISTINCT FROM p_subject_id THEN
      RAISE EXCEPTION 'Question plan not found' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF plan.subject_id IS NULL THEN RAISE EXCEPTION 'Subject removed'; END IF;
  IF plan.note IS NOT NULL AND saved_note IS NOT NULL AND saved_note IS DISTINCT FROM plan.note THEN
    RAISE EXCEPTION 'QUESTION_PLAN_NOTE_MISMATCH' USING ERRCODE = '22023';
  END IF;
  saved_note := COALESCE(plan.note, saved_note);
  SELECT * INTO previous FROM public.question_session_results WHERE session_id = p_session_id;
  IF FOUND THEN
    IF previous.question_plan_id <> plan.id OR previous.user_id <> plan.user_id OR previous.solved_questions <> p_questions
      OR previous.correct_questions IS DISTINCT FROM p_correct OR previous.wrong_questions IS DISTINCT FROM p_wrong OR previous.note IS DISTINCT FROM saved_note THEN
      RAISE EXCEPTION 'Session already recorded with different data';
    END IF;
    RETURN;
  END IF;
  INSERT INTO public.study_sessions(id, user_id, subject_id, resource_id, session_type, started_at, ended_at, duration_minutes)
  VALUES (p_session_id, plan.user_id, plan.subject_id, plan.resource_id, 'manual', p_started_at, p_ended_at, p_duration_minutes);
  INSERT INTO public.question_session_results(session_id, user_id, question_plan_id, solved_questions, correct_questions, wrong_questions, note)
  VALUES (p_session_id, plan.user_id, plan.id, p_questions, p_correct, p_wrong, saved_note);
END;
$$;
REVOKE ALL ON FUNCTION public.save_question_study_session(uuid, uuid, uuid, uuid, date, integer, timestamptz, timestamptz, numeric, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_question_study_session(uuid, uuid, uuid, uuid, date, integer, timestamptz, timestamptz, numeric, integer, integer, text) TO authenticated;

-- Manual extra questions have no study session and do not invent study time.
-- Replace the old RPC signature only; existing rows are retained.
DROP FUNCTION IF EXISTS public.add_solved_questions(uuid, uuid, integer, integer, integer);
CREATE OR REPLACE FUNCTION public.add_solved_questions(
  p_entry_id uuid, p_question_plan_id uuid, p_questions integer,
  p_correct integer DEFAULT NULL, p_wrong integer DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  plan public.question_plans%ROWTYPE;
  previous public.question_session_results%ROWTYPE;
  saved_note text := nullif(btrim(p_note), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO plan FROM public.question_plans WHERE id = p_question_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question plan not found'; END IF;
  IF plan.user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF char_length(saved_note) > 1000 OR p_questions IS NULL OR p_questions < 1 OR p_questions > 100000 OR p_entry_id IS NULL
    OR p_correct < 0 OR p_correct > 100000 OR p_wrong < 0 OR p_wrong > 100000
    OR COALESCE(p_correct, 0) + COALESCE(p_wrong, 0) > p_questions THEN
    RAISE EXCEPTION 'Invalid question count';
  END IF;
  IF plan.note IS NOT NULL AND saved_note IS NOT NULL AND saved_note IS DISTINCT FROM plan.note THEN
    RAISE EXCEPTION 'QUESTION_PLAN_NOTE_MISMATCH' USING ERRCODE = '22023';
  END IF;
  saved_note := COALESCE(plan.note, saved_note);
  SELECT * INTO previous FROM public.question_session_results WHERE id = p_entry_id;
  IF FOUND THEN
    IF previous.question_plan_id <> plan.id OR previous.user_id <> plan.user_id OR previous.solved_questions <> p_questions OR previous.session_id IS NOT NULL
      OR previous.correct_questions IS DISTINCT FROM p_correct OR previous.wrong_questions IS DISTINCT FROM p_wrong OR previous.note IS DISTINCT FROM saved_note THEN
      RAISE EXCEPTION 'Entry already recorded with different data';
    END IF;
    RETURN;
  END IF;
  INSERT INTO public.question_session_results(id, user_id, question_plan_id, solved_questions, correct_questions, wrong_questions, note)
  VALUES (p_entry_id, plan.user_id, plan.id, p_questions, p_correct, p_wrong, saved_note);
END;
$$;
REVOKE ALL ON FUNCTION public.add_solved_questions(uuid, uuid, integer, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_solved_questions(uuid, uuid, integer, integer, integer, text) TO authenticated;


-- Create/edit a video goal or a standalone day/week subject goal.
-- User, subject and video associations cannot be changed through a goal edit.
CREATE OR REPLACE FUNCTION public.set_question_target_with_note(
  p_user_id uuid, p_subject_id uuid, p_date date, p_target integer, p_note text,
  p_period text DEFAULT 'day', p_video_id uuid DEFAULT NULL, p_plan_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  plan public.question_plans%ROWTYPE;
  resource uuid;
  goal_date date;
  saved_note text := nullif(btrim(p_note), '');
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL OR (p_user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF char_length(saved_note) > 1000 OR p_target IS NULL OR p_target NOT BETWEEN 1 AND 100000 OR p_date IS NULL
    OR p_period IS NULL OR p_period NOT IN ('day', 'week') THEN RAISE EXCEPTION 'Invalid target'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subjects WHERE id = p_subject_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Subject not found' USING ERRCODE = '42501';
  END IF;
  goal_date := CASE WHEN p_period = 'week' THEN date_trunc('week', p_date::timestamp)::date ELSE p_date END;
  IF p_video_id IS NOT NULL THEN
    IF p_period <> 'day' THEN RAISE EXCEPTION 'Video goals are daily'; END IF;
    SELECT r.id INTO resource FROM public.video_plan_items v
      JOIN public.resources r ON r.id = v.resource_id
      WHERE v.id = p_video_id AND v.user_id = p_user_id AND r.user_id = p_user_id AND r.subject_id = p_subject_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Video not found' USING ERRCODE = '42501'; END IF;
  END IF;
  IF p_plan_id IS NOT NULL THEN
    SELECT * INTO plan FROM public.question_plans WHERE id = p_plan_id FOR UPDATE;
    IF NOT FOUND OR plan.user_id <> p_user_id OR plan.subject_id IS DISTINCT FROM p_subject_id
      OR plan.video_plan_item_id IS DISTINCT FROM p_video_id OR plan.period <> p_period THEN
      RAISE EXCEPTION 'Question plan not found' USING ERRCODE = '42501';
    END IF;
    IF plan.note IS DISTINCT FROM saved_note AND EXISTS (SELECT 1 FROM public.question_session_results WHERE question_plan_id = plan.id) THEN
      RAISE EXCEPTION 'QUESTION_PLAN_NOTE_LOCKED' USING ERRCODE = '22023';
    END IF;
    UPDATE public.question_plans SET date = goal_date, target_questions = p_target, note = saved_note, archived_at = NULL WHERE id = plan.id;
    RETURN plan.id;
  ELSIF p_video_id IS NOT NULL THEN
    SELECT * INTO plan FROM public.question_plans WHERE user_id = p_user_id AND video_plan_item_id = p_video_id FOR UPDATE;
    IF FOUND THEN
      RETURN public.set_question_target_with_note(p_user_id, p_subject_id, p_date, p_target, p_note, p_period, p_video_id, plan.id);
    END IF;
    INSERT INTO public.question_plans(user_id, subject_id, resource_id, video_plan_item_id, date, kind, period, target_questions, note)
    VALUES (p_user_id, p_subject_id, resource, p_video_id, goal_date, 'video', 'day', p_target, saved_note)
    ON CONFLICT (user_id, video_plan_item_id) DO NOTHING RETURNING id INTO plan.id;
    IF plan.id IS NULL THEN
      SELECT id INTO plan.id FROM public.question_plans WHERE user_id = p_user_id AND video_plan_item_id = p_video_id;
      RETURN public.set_question_target_with_note(p_user_id, p_subject_id, p_date, p_target, p_note, p_period, p_video_id, plan.id);
    END IF;
  ELSE
    INSERT INTO public.question_plans(user_id, subject_id, date, kind, period, target_questions, note)
    VALUES (p_user_id, p_subject_id, goal_date, 'extra', p_period, p_target, saved_note)
    ON CONFLICT (user_id, subject_id, date, period, (md5(COALESCE(note, '')))) WHERE kind = 'extra'
    DO UPDATE SET target_questions = EXCLUDED.target_questions, archived_at = NULL
      WHERE question_plans.note IS NOT DISTINCT FROM EXCLUDED.note RETURNING id INTO plan.id;
  END IF;
  IF plan.id IS NULL THEN RAISE EXCEPTION 'Question goal could not be saved'; END IF;
  RETURN plan.id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_question_target_with_note(uuid, uuid, date, integer, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_question_target_with_note(uuid, uuid, date, integer, text, text, uuid, uuid) TO authenticated;

-- Keep older clients and note-free week planners compatible without erasing a topic.
CREATE OR REPLACE FUNCTION public.set_question_target(
  p_user_id uuid, p_subject_id uuid, p_date date, p_target integer,
  p_period text DEFAULT 'day', p_video_id uuid DEFAULT NULL, p_plan_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE saved_note text;
BEGIN
  IF p_plan_id IS NOT NULL THEN
    SELECT note INTO saved_note FROM public.question_plans WHERE id = p_plan_id;
  ELSIF p_video_id IS NOT NULL THEN
    SELECT note INTO saved_note FROM public.question_plans WHERE user_id = p_user_id AND video_plan_item_id = p_video_id;
  END IF;
  RETURN public.set_question_target_with_note(p_user_id, p_subject_id, p_date, p_target, saved_note, p_period, p_video_id, p_plan_id);
END;
$$;
REVOKE ALL ON FUNCTION public.set_question_target(uuid, uuid, date, integer, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_question_target(uuid, uuid, date, integer, text, uuid, uuid) TO authenticated;

-- Removing a goal retains its solved-question history and study time.
CREATE OR REPLACE FUNCTION public.archive_question_plan(p_plan_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE plan public.question_plans%ROWTYPE;
BEGIN
  SELECT * INTO plan FROM public.question_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR (plan.user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  UPDATE public.question_plans SET archived_at = COALESCE(archived_at, now()) WHERE id = plan.id;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_question_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_question_plan(uuid) TO authenticated;

-- Corrections change question counts only, preserving the stopwatch study session.
-- Replace the old RPC signature only; existing rows are retained.
DROP FUNCTION IF EXISTS public.update_question_result(uuid, integer, integer, integer);
CREATE OR REPLACE FUNCTION public.update_question_result(
  p_entry_id uuid, p_questions integer, p_correct integer DEFAULT NULL, p_wrong integer DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  entry public.question_session_results%ROWTYPE;
  saved_note text := nullif(btrim(p_note), '');
BEGIN
  SELECT * INTO entry FROM public.question_session_results WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR (entry.user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF entry.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Entry removed'; END IF;
  IF saved_note IS NOT NULL AND EXISTS (SELECT 1 FROM public.question_plans WHERE id = entry.question_plan_id AND note IS NOT NULL AND note IS DISTINCT FROM saved_note) THEN
    RAISE EXCEPTION 'QUESTION_PLAN_NOTE_MISMATCH' USING ERRCODE = '22023';
  END IF;
  saved_note := COALESCE((SELECT note FROM public.question_plans WHERE id = entry.question_plan_id), saved_note);
  IF char_length(saved_note) > 1000 OR p_questions IS NULL OR p_questions NOT BETWEEN 0 AND 100000
    OR p_correct < 0 OR p_correct > 100000 OR p_wrong < 0 OR p_wrong > 100000
    OR COALESCE(p_correct, 0) + COALESCE(p_wrong, 0) > p_questions THEN RAISE EXCEPTION 'Invalid question count'; END IF;
  UPDATE public.question_session_results SET solved_questions = p_questions,
    correct_questions = p_correct, wrong_questions = p_wrong, note = saved_note WHERE id = entry.id;
END;
$$;
REVOKE ALL ON FUNCTION public.update_question_result(uuid, integer, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_question_result(uuid, integer, integer, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_question_result(p_entry_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry public.question_session_results%ROWTYPE;
BEGIN
  SELECT * INTO entry FROM public.question_session_results WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR (entry.user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  UPDATE public.question_session_results SET deleted_at = COALESCE(deleted_at, now()) WHERE id = entry.id;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_question_result(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_question_result(uuid) TO authenticated;

-- Save a subject's daily targets in one transaction. Blank days are not sent and are preserved.
CREATE OR REPLACE FUNCTION public.save_question_week_targets(
  p_user_id uuid, p_subject_id uuid, p_week_start date, p_targets jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  week_start date := date_trunc('week', p_week_start::timestamp)::date;
  entry jsonb;
  saved integer := 0;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL OR (p_user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_week_start IS NULL OR p_targets IS NULL OR jsonb_typeof(p_targets) <> 'array' THEN
    RAISE EXCEPTION 'Invalid week targets' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_targets) NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'Invalid week targets' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subjects WHERE id = p_subject_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Subject not found' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(DISTINCT value->>'date') FROM jsonb_array_elements(p_targets)) <> jsonb_array_length(p_targets) THEN
    RAISE EXCEPTION 'Duplicate target dates' USING ERRCODE = '22023';
  END IF;
  -- Validate every item before the first write, including its exact calendar day.
  FOR entry IN SELECT value FROM jsonb_array_elements(p_targets) LOOP
    IF jsonb_typeof(entry) <> 'object' OR jsonb_typeof(entry->'target') IS DISTINCT FROM 'number'
      OR entry->>'target' !~ '^[0-9]{1,6}$'
      OR NOT EXISTS (SELECT 1 FROM generate_series(0, 6) AS d WHERE to_char(week_start + d, 'YYYY-MM-DD') = entry->>'date') THEN
      RAISE EXCEPTION 'Invalid week target' USING ERRCODE = '22023';
    END IF;
    IF (entry ? 'note' AND jsonb_typeof(entry->'note') NOT IN ('string', 'null')) OR char_length(entry->>'note') > 1000 THEN
      RAISE EXCEPTION 'Invalid question note' USING ERRCODE = '22023';
    END IF;
    IF (entry->>'target')::integer NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid week target' USING ERRCODE = '22023'; END IF;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('question-week:' || p_user_id::text || ':' || week_start::text, 0));
  FOR entry IN SELECT value FROM jsonb_array_elements(p_targets) ORDER BY value->>'date' LOOP
    -- Named plans stay on their own row; the core RPC checks ownership and locks topics with history.
    IF entry->>'plan_id' IS NOT NULL THEN
      IF entry->>'plan_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'Invalid question plan' USING ERRCODE = '22023';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.question_plans WHERE id = (entry->>'plan_id')::uuid
        AND user_id = p_user_id AND subject_id = p_subject_id AND date = (entry->>'date')::date
        AND kind = 'extra' AND period = 'day') THEN
        RAISE EXCEPTION 'Question plan not found' USING ERRCODE = '42501';
      END IF;
    END IF;
    PERFORM public.set_question_target_with_note(p_user_id, p_subject_id, (entry->>'date')::date,
      (entry->>'target')::integer, entry->>'note', 'day', NULL, (entry->>'plan_id')::uuid);
    saved := saved + 1;
  END LOOP;
  RETURN jsonb_build_object('saved', saved);
END;
$$;
REVOKE ALL ON FUNCTION public.save_question_week_targets(uuid, uuid, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_question_week_targets(uuid, uuid, date, jsonb) TO authenticated;

-- Separate RPC name prevents old installations silently discarding supplied topic notes.
CREATE OR REPLACE FUNCTION public.save_question_week_targets_with_notes(
  p_user_id uuid, p_subject_id uuid, p_week_start date, p_targets jsonb
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.save_question_week_targets(p_user_id, p_subject_id, p_week_start, p_targets);
$$;
REVOKE ALL ON FUNCTION public.save_question_week_targets_with_notes(uuid, uuid, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_question_week_targets_with_notes(uuid, uuid, date, jsonb) TO authenticated;

-- Admin-only, additive copy. Subject/exam names must resolve to exactly one owned target subject.
-- Video/resource foreign IDs, solved counts, sessions and notes are never copied.
CREATE OR REPLACE FUNCTION public.copy_question_week(
  p_source_user_id uuid, p_target_user_id uuid, p_week_start date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  week_start date := date_trunc('week', p_week_start::timestamp)::date;
  source_rows jsonb;
  entry record;
  candidates uuid[];
  target_subject uuid;
  inserted uuid;
  copied integer := 0;
  skipped integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF p_source_user_id IS NULL OR p_target_user_id IS NULL OR p_source_user_id = p_target_user_id OR p_week_start IS NULL
    OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Invalid copy target' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb) INTO source_rows FROM (
    SELECT q.subject_id, q.date, q.period, s.name AS subject_name, e.name AS exam_name, sum(q.target_questions)::bigint AS target
    FROM public.question_plans q
    LEFT JOIN public.subjects s ON s.id = q.subject_id AND s.user_id = p_source_user_id
    LEFT JOIN public.exams e ON e.id = s.exam_id AND e.user_id = p_source_user_id
    WHERE q.user_id = p_source_user_id AND q.archived_at IS NULL AND q.target_questions > 0
      AND q.date >= week_start AND q.date < week_start + 7
    GROUP BY q.subject_id, q.date, q.period, s.name, e.name
  ) AS g;
  IF jsonb_array_length(source_rows) = 0 THEN RAISE EXCEPTION 'QUESTION_COPY_EMPTY' USING ERRCODE = '22023'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(source_rows) AS x(date date, period text, subject_name text, exam_name text)
    GROUP BY date, period, lower(regexp_replace(btrim(subject_name), '\s+', ' ', 'g')),
      upper(regexp_replace(btrim(exam_name), '^(MEB[- ]|E-)', '', 'i')) HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'QUESTION_COPY_SOURCE_AMBIGUOUS' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('question-week:' || p_target_user_id::text || ':' || week_start::text, 0));
  FOR entry IN SELECT * FROM jsonb_to_recordset(source_rows) AS x(subject_id uuid, date date, period text, subject_name text, exam_name text, target bigint)
    ORDER BY date, subject_id, period LOOP
    SELECT array_agg(s.id ORDER BY s.id) INTO candidates FROM public.subjects s JOIN public.exams e ON e.id = s.exam_id
      WHERE s.user_id = p_target_user_id AND e.user_id = p_target_user_id
        AND lower(regexp_replace(btrim(s.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(entry.subject_name), '\s+', ' ', 'g'))
        AND upper(regexp_replace(btrim(e.name), '^(MEB[- ]|E-)', '', 'i')) = upper(regexp_replace(btrim(entry.exam_name), '^(MEB[- ]|E-)', '', 'i'));
    IF COALESCE(cardinality(candidates), 0) <> 1 THEN
      RAISE EXCEPTION 'QUESTION_COPY_SUBJECT_MAPPING' USING ERRCODE = '22023',
        DETAIL = jsonb_build_object('subject', COALESCE(entry.subject_name, 'Ders kaldırıldı'), 'exam', COALESCE(entry.exam_name, 'Sınav kaldırıldı'))::text;
    END IF;
    IF entry.target NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid copy question count' USING ERRCODE = '22023'; END IF;
    target_subject := candidates[1];
    IF EXISTS (SELECT 1 FROM public.question_plans WHERE user_id = p_target_user_id AND subject_id = target_subject
      AND date = entry.date AND period = entry.period AND archived_at IS NULL AND target_questions > 0) THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;
    inserted := NULL;
    INSERT INTO public.question_plans AS existing(user_id, subject_id, date, kind, period, target_questions)
      VALUES (p_target_user_id, target_subject, entry.date, 'extra', entry.period, entry.target::integer)
      ON CONFLICT (user_id, subject_id, date, period, (md5(COALESCE(note, '')))) WHERE kind = 'extra'
      DO UPDATE SET target_questions = EXCLUDED.target_questions, archived_at = NULL
        WHERE existing.note IS NULL AND (existing.archived_at IS NOT NULL OR existing.target_questions IS NULL)
      RETURNING id INTO inserted;
    IF inserted IS NULL THEN skipped := skipped + 1; ELSE copied := copied + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('copied', copied, 'skipped', skipped);
END;
$$;
REVOKE ALL ON FUNCTION public.copy_question_week(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_question_week(uuid, uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
