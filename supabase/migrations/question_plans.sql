-- Run this entire updated file in Supabase SQL Editor (also safe after the first version).
-- Adds question planning; existing videos, plans and study records are preserved.
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

CREATE INDEX IF NOT EXISTS question_plans_user_date ON public.question_plans(user_id, date);
-- Replaces only an index; no question rows are removed.
DROP INDEX IF EXISTS public.question_plans_extra_subject_day;
CREATE UNIQUE INDEX IF NOT EXISTS question_plans_extra_subject_period
  ON public.question_plans(user_id, subject_id, date, period) WHERE kind = 'extra';

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
CREATE OR REPLACE FUNCTION public.save_question_study_session(
  p_session_id uuid, p_question_plan_id uuid, p_user_id uuid, p_subject_id uuid,
  p_date date, p_questions integer, p_started_at timestamptz, p_ended_at timestamptz,
  p_duration_minutes numeric, p_correct integer DEFAULT NULL, p_wrong integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  plan public.question_plans%ROWTYPE;
  previous public.question_session_results%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_user_id IS NULL OR (p_user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_questions IS NULL OR p_questions < 0 OR p_questions > 100000
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
    ON CONFLICT (user_id, subject_id, date, period) WHERE kind = 'extra'
    DO UPDATE SET date = EXCLUDED.date RETURNING * INTO plan;
  ELSE
    SELECT * INTO plan FROM public.question_plans WHERE id = p_question_plan_id FOR UPDATE;
    IF NOT FOUND OR plan.user_id <> p_user_id OR plan.subject_id IS DISTINCT FROM p_subject_id THEN
      RAISE EXCEPTION 'Question plan not found' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF plan.subject_id IS NULL THEN RAISE EXCEPTION 'Subject removed'; END IF;
  SELECT * INTO previous FROM public.question_session_results WHERE session_id = p_session_id;
  IF FOUND THEN
    IF previous.question_plan_id <> plan.id OR previous.user_id <> plan.user_id OR previous.solved_questions <> p_questions
      OR previous.correct_questions IS DISTINCT FROM p_correct OR previous.wrong_questions IS DISTINCT FROM p_wrong THEN
      RAISE EXCEPTION 'Session already recorded with different data';
    END IF;
    RETURN;
  END IF;
  INSERT INTO public.study_sessions(id, user_id, subject_id, resource_id, session_type, started_at, ended_at, duration_minutes)
  VALUES (p_session_id, plan.user_id, plan.subject_id, plan.resource_id, 'manual', p_started_at, p_ended_at, p_duration_minutes);
  INSERT INTO public.question_session_results(session_id, user_id, question_plan_id, solved_questions, correct_questions, wrong_questions)
  VALUES (p_session_id, plan.user_id, plan.id, p_questions, p_correct, p_wrong);
END;
$$;
REVOKE ALL ON FUNCTION public.save_question_study_session(uuid, uuid, uuid, uuid, date, integer, timestamptz, timestamptz, numeric, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_question_study_session(uuid, uuid, uuid, uuid, date, integer, timestamptz, timestamptz, numeric, integer, integer) TO authenticated;

-- Manual extra questions have no study session and do not invent study time.
CREATE OR REPLACE FUNCTION public.add_solved_questions(
  p_entry_id uuid, p_question_plan_id uuid, p_questions integer,
  p_correct integer DEFAULT NULL, p_wrong integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  plan public.question_plans%ROWTYPE;
  previous public.question_session_results%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO plan FROM public.question_plans WHERE id = p_question_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question plan not found'; END IF;
  IF plan.user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_questions IS NULL OR p_questions < 1 OR p_questions > 100000 OR p_entry_id IS NULL
    OR p_correct < 0 OR p_correct > 100000 OR p_wrong < 0 OR p_wrong > 100000
    OR COALESCE(p_correct, 0) + COALESCE(p_wrong, 0) > p_questions THEN
    RAISE EXCEPTION 'Invalid question count';
  END IF;
  SELECT * INTO previous FROM public.question_session_results WHERE id = p_entry_id;
  IF FOUND THEN
    IF previous.question_plan_id <> plan.id OR previous.user_id <> plan.user_id OR previous.solved_questions <> p_questions OR previous.session_id IS NOT NULL
      OR previous.correct_questions IS DISTINCT FROM p_correct OR previous.wrong_questions IS DISTINCT FROM p_wrong THEN
      RAISE EXCEPTION 'Entry already recorded with different data';
    END IF;
    RETURN;
  END IF;
  INSERT INTO public.question_session_results(id, user_id, question_plan_id, solved_questions, correct_questions, wrong_questions)
  VALUES (p_entry_id, plan.user_id, plan.id, p_questions, p_correct, p_wrong);
END;
$$;
REVOKE ALL ON FUNCTION public.add_solved_questions(uuid, uuid, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_solved_questions(uuid, uuid, integer, integer, integer) TO authenticated;


-- Create/edit a video goal or a standalone day/week subject goal.
-- User, subject and video associations cannot be changed through a goal edit.
CREATE OR REPLACE FUNCTION public.set_question_target(
  p_user_id uuid, p_subject_id uuid, p_date date, p_target integer,
  p_period text DEFAULT 'day', p_video_id uuid DEFAULT NULL, p_plan_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  plan public.question_plans%ROWTYPE;
  resource uuid;
  goal_date date;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL OR (p_user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_target IS NULL OR p_target NOT BETWEEN 1 AND 100000 OR p_date IS NULL
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
    UPDATE public.question_plans SET date = goal_date, target_questions = p_target, archived_at = NULL WHERE id = plan.id;
    RETURN plan.id;
  ELSIF p_video_id IS NOT NULL THEN
    INSERT INTO public.question_plans(user_id, subject_id, resource_id, video_plan_item_id, date, kind, period, target_questions)
    VALUES (p_user_id, p_subject_id, resource, p_video_id, goal_date, 'video', 'day', p_target)
    ON CONFLICT (user_id, video_plan_item_id) DO UPDATE SET date = EXCLUDED.date,
      target_questions = EXCLUDED.target_questions, archived_at = NULL RETURNING id INTO plan.id;
  ELSE
    INSERT INTO public.question_plans(user_id, subject_id, date, kind, period, target_questions)
    VALUES (p_user_id, p_subject_id, goal_date, 'extra', p_period, p_target)
    ON CONFLICT (user_id, subject_id, date, period) WHERE kind = 'extra'
    DO UPDATE SET target_questions = EXCLUDED.target_questions, archived_at = NULL RETURNING id INTO plan.id;
  END IF;
  RETURN plan.id;
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
CREATE OR REPLACE FUNCTION public.update_question_result(
  p_entry_id uuid, p_questions integer, p_correct integer DEFAULT NULL, p_wrong integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry public.question_session_results%ROWTYPE;
BEGIN
  SELECT * INTO entry FROM public.question_session_results WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR (entry.user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF entry.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Entry removed'; END IF;
  IF p_questions IS NULL OR p_questions NOT BETWEEN 0 AND 100000
    OR p_correct < 0 OR p_correct > 100000 OR p_wrong < 0 OR p_wrong > 100000
    OR COALESCE(p_correct, 0) + COALESCE(p_wrong, 0) > p_questions THEN RAISE EXCEPTION 'Invalid question count'; END IF;
  UPDATE public.question_session_results SET solved_questions = p_questions,
    correct_questions = p_correct, wrong_questions = p_wrong WHERE id = entry.id;
END;
$$;
REVOKE ALL ON FUNCTION public.update_question_result(uuid, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_question_result(uuid, integer, integer, integer) TO authenticated;

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

NOTIFY pgrst, 'reload schema';
COMMIT;
