-- DEHB modu: hazır setteki "soru çözümü" maddeleri (ör. YDS, Sözel Yetenek Deneme),
-- konuların kendiliğinden ilerlemesi ve yarının dersini bugüne alma.
-- adhd_mode.sql, adhd_topics.sql ve adhd_extras.sql'den SONRA, Supabase SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
BEGIN;

-- Soru çözümü maddeleri bir derse bağlı olmayabilir; o zaman adıyla (title) gösterilir.
ALTER TABLE public.adhd_daily_tasks ALTER COLUMN subject_id DROP NOT NULL;
ALTER TABLE public.adhd_daily_tasks
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS is_questions boolean NOT NULL DEFAULT false;
ALTER TABLE public.adhd_daily_tasks DROP CONSTRAINT IF EXISTS adhd_daily_tasks_title_check;
ALTER TABLE public.adhd_daily_tasks ADD CONSTRAINT adhd_daily_tasks_title_check CHECK (
  (title IS NULL OR char_length(btrim(title)) BETWEEN 1 AND 120) AND (subject_id IS NOT NULL OR title IS NOT NULL)
);

-- Admin'in hazır sete eklediği soru çözümü maddeleri: ad + haftanın günleri (1=Pzt … 7=Paz).
CREATE TABLE IF NOT EXISTS public.adhd_question_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  label      text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 120),
  days       smallint[] NOT NULL CHECK (cardinality(days) BETWEEN 1 AND 7 AND days <@ ARRAY[1,2,3,4,5,6,7]::smallint[]),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.adhd_question_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage own question items" ON public.adhd_question_items;
CREATE POLICY "Admins manage own question items" ON public.adhd_question_items FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND public.is_admin_user())
  WITH CHECK (owner_id = (SELECT auth.uid()) AND public.is_admin_user());
REVOKE ALL ON public.adhd_question_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adhd_question_items TO authenticated;

-- Süre kaydı: derse bağlı olmayan soru çözümünde çalışma geçmişine oturum yazılmaz, süre maddede tutulur.
CREATE OR REPLACE FUNCTION public.record_adhd_task_study(
  p_task_id uuid, p_session_id uuid, p_started_at timestamptz, p_ended_at timestamptz
) RETURNS public.adhd_daily_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  task public.adhd_daily_tasks;
  secs integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO task FROM public.adhd_daily_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND OR (task.user_id <> auth.uid() AND NOT public.is_admin_user()) THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = '42501';
  END IF;
  IF p_started_at IS NULL OR p_ended_at IS NULL OR p_ended_at < p_started_at OR p_ended_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Invalid session time' USING ERRCODE = '22023';
  END IF;
  secs := LEAST(floor(extract(epoch FROM p_ended_at - p_started_at))::integer, 6 * 3600);

  INSERT INTO public.adhd_task_sessions(session_id, task_id, seconds) VALUES (p_session_id, p_task_id, secs)
  ON CONFLICT (session_id) DO NOTHING;
  IF NOT FOUND THEN RETURN task; END IF; -- Tekrar gönderim: zaten sayıldı.

  IF secs >= 60 AND task.subject_id IS NOT NULL THEN
    INSERT INTO public.study_sessions(id, user_id, subject_id, resource_id, session_type, started_at, ended_at, duration_minutes)
    VALUES (p_session_id, task.user_id, task.subject_id, NULL, 'manual', p_started_at, p_started_at + make_interval(secs => secs), round(secs / 60.0, 2))
    ON CONFLICT (id) DO NOTHING;
  END IF;

  UPDATE public.adhd_daily_tasks
     SET studied_seconds = studied_seconds + secs,
         completed_at = CASE WHEN completed_at IS NULL AND studied_seconds + secs >= 60 THEN now() ELSE completed_at END
   WHERE id = p_task_id
  RETURNING * INTO task;
  RETURN task;
END;
$$;
REVOKE ALL ON FUNCTION public.record_adhd_task_study(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_adhd_task_study(uuid, uuid, timestamptz, timestamptz) TO authenticated;

-- ── Konular kendiliğinden ilerler ─────────────────────────────────────────
-- Bugünden itibaren henüz başlanmamış (süre 0, bitmemiş) planlı derslere, her derste bitmemiş
-- ortak AGS konuları sırayla dağıtılır. Bir konu bitince sonraki dersler bir sonraki konuya kayar.
-- Başlanmış/biten dersler, ekstra çalışmalar ve soru çözümleri olduğu gibi kalır.
CREATE OR REPLACE FUNCTION public.advance_adhd_topics(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  local_today date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  changed integer := 0;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL OR (p_user_id <> auth.uid() AND NOT public.is_admin_user()) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF to_regclass('public.ags_shared_topics') IS NULL THEN RETURN 0; END IF;
  EXECUTE $q$
    WITH flexible AS (
      SELECT d.id, s.id AS shared_subject_id,
             row_number() OVER (PARTITION BY s.id ORDER BY d.task_date, d.sort_order, d.created_at, d.id) AS n
      FROM public.adhd_daily_tasks d
      JOIN public.subjects sub ON sub.id = d.subject_id
      JOIN public.ags_shared_subjects s ON public.adhd_normal_name(s.name) = public.adhd_normal_name(sub.name)
      WHERE d.user_id = $1 AND d.task_date >= $2 AND d.completed_at IS NULL AND d.studied_seconds = 0
        AND NOT d.is_extra AND NOT d.is_questions
    ), open_topics AS (
      SELECT t.id, t.title, t.subject_id,
             row_number() OVER (PARTITION BY t.subject_id ORDER BY t.sort_order, t.title, t.id) AS n
      FROM public.ags_shared_topics t
      WHERE t.archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.ags_topic_progress p WHERE p.user_id = $1 AND p.topic_id = t.id AND p.is_completed)
    ), target AS (
      SELECT f.id, o.id AS topic_id, o.title
      FROM flexible f LEFT JOIN open_topics o ON o.subject_id = f.shared_subject_id AND o.n = f.n
    )
    UPDATE public.adhd_daily_tasks d
       SET topic_kind = CASE WHEN t.topic_id IS NULL THEN NULL ELSE 'shared' END,
           topic_id = t.topic_id, topic_title = t.title, topic_completed_at = NULL
      FROM target t
     WHERE d.id = t.id AND (d.topic_id IS DISTINCT FROM t.topic_id OR d.topic_kind IS DISTINCT FROM CASE WHEN t.topic_id IS NULL THEN NULL ELSE 'shared' END)
  $q$ USING p_user_id, local_today;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;
REVOKE ALL ON FUNCTION public.advance_adhd_topics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_adhd_topics(uuid) TO authenticated;

-- ── Yarının dersini bugüne al (ekstra çalışmadan) ──────────────────────────
CREATE OR REPLACE FUNCTION public.pull_adhd_task_forward(p_task_id uuid, p_day date)
RETURNS public.adhd_daily_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  local_today date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  task public.adhd_daily_tasks;
  next_order integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_day IS NULL OR p_day < local_today - 1 OR p_day > local_today + 1 THEN RAISE EXCEPTION 'Invalid day' USING ERRCODE = '22023'; END IF;
  SELECT * INTO task FROM public.adhd_daily_tasks WHERE id = p_task_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found' USING ERRCODE = '42501'; END IF;
  IF task.task_date <= p_day OR task.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Task cannot be moved' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(max(sort_order) + 1, 0) INTO next_order FROM public.adhd_daily_tasks WHERE user_id = task.user_id AND task_date = p_day;
  UPDATE public.adhd_daily_tasks SET task_date = p_day, is_extra = true, sort_order = next_order WHERE id = p_task_id RETURNING * INTO task;
  RETURN task;
END;
$$;
REVOKE ALL ON FUNCTION public.pull_adhd_task_forward(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pull_adhd_task_forward(uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
