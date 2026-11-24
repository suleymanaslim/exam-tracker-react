-- DEHB modu: admin bir kullanıcı için sade "bugün" ekranını açar ve günlük ders listesi ekler.
-- Supabase SQL Editor'de dosyanın tamamını bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
$$;
REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

CREATE TABLE IF NOT EXISTS public.adhd_mode_settings (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.adhd_daily_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_date       date NOT NULL,
  subject_id      uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  note            text CHECK (note IS NULL OR char_length(note) <= 200),
  sort_order      integer NOT NULL DEFAULT 0,
  studied_seconds integer NOT NULL DEFAULT 0 CHECK (studied_seconds >= 0),
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adhd_daily_tasks_user_date_idx ON public.adhd_daily_tasks(user_id, task_date, sort_order);

-- Aynı kronometre kaydının iki kez sayılmasını önler.
CREATE TABLE IF NOT EXISTS public.adhd_task_sessions (
  session_id uuid PRIMARY KEY,
  task_id    uuid NOT NULL REFERENCES public.adhd_daily_tasks(id) ON DELETE CASCADE,
  seconds    integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.adhd_mode_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adhd_daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adhd_task_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read own or admin" ON public.adhd_mode_settings;
DROP POLICY IF EXISTS "Admins manage" ON public.adhd_mode_settings;
CREATE POLICY "Read own or admin" ON public.adhd_mode_settings FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin_user());
CREATE POLICY "Admins manage" ON public.adhd_mode_settings FOR ALL TO authenticated
  USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "Read own or admin" ON public.adhd_daily_tasks;
DROP POLICY IF EXISTS "Admins manage" ON public.adhd_daily_tasks;
CREATE POLICY "Read own or admin" ON public.adhd_daily_tasks FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin_user());
CREATE POLICY "Admins manage" ON public.adhd_daily_tasks FOR ALL TO authenticated
  USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

REVOKE ALL ON public.adhd_mode_settings, public.adhd_daily_tasks, public.adhd_task_sessions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adhd_mode_settings, public.adhd_daily_tasks TO authenticated;
REVOKE ALL ON public.adhd_task_sessions FROM authenticated;

-- Kronometre bittiğinde çağrılır: çalışma süresini kaydeder, 1 dakika ve üzeri dersi "yapıldı" yapar.
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

  IF secs >= 60 THEN
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

COMMIT;
