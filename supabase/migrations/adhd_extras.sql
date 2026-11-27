-- DEHB modu: ekstra çalışma ve "başka bir konu çalıştım".
-- adhd_mode.sql ve adhd_topics.sql'den SONRA, Supabase SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Konular ortak AGS listesinden gelir (ags_shared_topics); bu tablolar yoksa dersler konusuz eklenir.
BEGIN;

ALTER TABLE public.adhd_daily_tasks ADD COLUMN IF NOT EXISTS is_extra boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.adhd_normal_name(value text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g')) $$;

-- Kişi, DEHB modu açıkken kendi derslerinden birine bugün için ekstra çalışma ekler.
-- Konu: o dersin bitmemiş ve bugünden itibaren henüz planlanmamış ilk ortak AGS konusu.
CREATE OR REPLACE FUNCTION public.add_adhd_extra_task(p_subject_id uuid, p_day date)
RETURNS public.adhd_daily_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  local_today date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  subject_name text;
  next_id uuid;
  next_title text;
  next_order integer;
  task public.adhd_daily_tasks;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_day IS NULL OR p_day < local_today - 1 OR p_day > local_today + 1 THEN
    RAISE EXCEPTION 'Invalid day' USING ERRCODE = '22023';
  END IF;
  SELECT name INTO subject_name FROM public.subjects WHERE id = p_subject_id AND user_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subject not found' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.adhd_mode_settings WHERE user_id = uid AND enabled) THEN
    RAISE EXCEPTION 'ADHD mode is off' USING ERRCODE = '42501';
  END IF;

  IF to_regclass('public.ags_shared_topics') IS NOT NULL THEN
    EXECUTE $q$
      SELECT t.id, t.title FROM public.ags_shared_topics t
      JOIN public.ags_shared_subjects s ON s.id = t.subject_id
      WHERE public.adhd_normal_name(s.name) = public.adhd_normal_name($1) AND t.archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.ags_topic_progress p WHERE p.user_id = $2 AND p.topic_id = t.id AND p.is_completed)
        AND NOT EXISTS (SELECT 1 FROM public.adhd_daily_tasks d WHERE d.user_id = $2 AND d.topic_kind = 'shared' AND d.topic_id = t.id AND d.task_date >= $3)
      ORDER BY s.sort_order, t.sort_order, t.title
      LIMIT 1
    $q$ INTO next_id, next_title USING subject_name, uid, p_day;
  END IF;

  SELECT coalesce(max(sort_order) + 1, 0) INTO next_order FROM public.adhd_daily_tasks WHERE user_id = uid AND task_date = p_day;
  INSERT INTO public.adhd_daily_tasks(user_id, task_date, subject_id, note, sort_order, is_extra, topic_kind, topic_id, topic_title)
  VALUES (uid, p_day, p_subject_id, NULL, next_order, true,
          CASE WHEN next_id IS NULL THEN NULL ELSE 'shared' END, next_id, next_title)
  RETURNING * INTO task;
  RETURN task;
END;
$$;
REVOKE ALL ON FUNCTION public.add_adhd_extra_task(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_adhd_extra_task(uuid, date) TO authenticated;

-- "Başka bir konu çalıştım": dersin konusunu aynı derse ait başka bir ortak AGS konusuyla değiştirir.
CREATE OR REPLACE FUNCTION public.change_adhd_task_topic(p_task_id uuid, p_topic_id uuid)
RETURNS public.adhd_daily_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  task public.adhd_daily_tasks;
  new_title text;
  new_subject text;
  done boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO task FROM public.adhd_daily_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND OR (task.user_id <> auth.uid() AND NOT public.is_admin_user()) THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = '42501';
  END IF;
  IF to_regclass('public.ags_shared_topics') IS NULL THEN RAISE EXCEPTION 'Topic not found' USING ERRCODE = '22023'; END IF;

  EXECUTE 'SELECT t.title, s.name FROM public.ags_shared_topics t JOIN public.ags_shared_subjects s ON s.id = t.subject_id WHERE t.id = $1 AND t.archived_at IS NULL'
    INTO new_title, new_subject USING p_topic_id;
  IF new_title IS NULL THEN RAISE EXCEPTION 'Topic not found' USING ERRCODE = '22023'; END IF;
  IF public.adhd_normal_name(new_subject) IS DISTINCT FROM (SELECT public.adhd_normal_name(name) FROM public.subjects WHERE id = task.subject_id) THEN
    RAISE EXCEPTION 'Topic belongs to another subject' USING ERRCODE = '22023';
  END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.ags_topic_progress WHERE user_id = $1 AND topic_id = $2 AND is_completed)'
    INTO done USING task.user_id, p_topic_id;

  UPDATE public.adhd_daily_tasks
     SET topic_kind = 'shared', topic_id = p_topic_id, topic_title = new_title,
         topic_completed_at = CASE WHEN done THEN now() ELSE NULL END
   WHERE id = p_task_id
  RETURNING * INTO task;
  RETURN task;
END;
$$;
REVOKE ALL ON FUNCTION public.change_adhd_task_topic(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_adhd_task_topic(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
