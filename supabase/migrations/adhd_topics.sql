-- DEHB modu: günlük derslere konu bağlama ve kişinin konuyu "bitti" olarak işaretlemesi.
-- adhd_mode.sql'den SONRA, Supabase SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Konu, kişinin AGS tercihine göre kişisel (topics) veya ortak (ags_shared_topics) listeden gelir.
BEGIN;

ALTER TABLE public.adhd_daily_tasks
  ADD COLUMN IF NOT EXISTS topic_kind text,
  ADD COLUMN IF NOT EXISTS topic_id uuid,
  ADD COLUMN IF NOT EXISTS topic_title text,
  ADD COLUMN IF NOT EXISTS topic_completed_at timestamptz;

ALTER TABLE public.adhd_daily_tasks DROP CONSTRAINT IF EXISTS adhd_daily_tasks_topic_check;
ALTER TABLE public.adhd_daily_tasks ADD CONSTRAINT adhd_daily_tasks_topic_check CHECK (
  (topic_kind IS NULL AND topic_id IS NULL AND topic_title IS NULL)
  OR (topic_kind IN ('personal', 'shared') AND topic_id IS NOT NULL AND topic_title IS NOT NULL AND char_length(btrim(topic_title)) BETWEEN 1 AND 500)
);
CREATE INDEX IF NOT EXISTS adhd_daily_tasks_topic_idx ON public.adhd_daily_tasks(user_id, topic_kind, topic_id);

-- Kişi (veya admin) dersin konusunu bitti/bitmedi yapar; gerçek konu listesi de güncellenir.
CREATE OR REPLACE FUNCTION public.set_adhd_task_topic_done(p_task_id uuid, p_done boolean)
RETURNS public.adhd_daily_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  task public.adhd_daily_tasks;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO task FROM public.adhd_daily_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND OR (task.user_id <> auth.uid() AND NOT public.is_admin_user()) THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = '42501';
  END IF;
  IF task.topic_id IS NULL OR p_done IS NULL THEN RAISE EXCEPTION 'Task has no topic' USING ERRCODE = '22023'; END IF;

  IF task.topic_kind = 'personal' THEN
    UPDATE public.topics SET is_completed = p_done WHERE id = task.topic_id AND user_id = task.user_id;
  ELSE
    -- Ortak konular tablosu yalnızca ortak AGS listesi kurulduysa vardır; bu yüzden dinamik çalıştırılır.
    EXECUTE 'INSERT INTO public.ags_topic_progress(user_id, topic_id, is_completed, updated_at) VALUES ($1, $2, $3, now())
             ON CONFLICT (user_id, topic_id) DO UPDATE SET is_completed = EXCLUDED.is_completed, updated_at = now()'
      USING task.user_id, task.topic_id, p_done;
  END IF;

  -- Aynı konuyu taşıyan tüm günlük dersler aynı durumu gösterir.
  UPDATE public.adhd_daily_tasks
     SET topic_completed_at = CASE WHEN p_done THEN COALESCE(topic_completed_at, now()) ELSE NULL END
   WHERE user_id = task.user_id AND topic_kind = task.topic_kind AND topic_id = task.topic_id;

  SELECT * INTO task FROM public.adhd_daily_tasks WHERE id = p_task_id;
  RETURN task;
END;
$$;
REVOKE ALL ON FUNCTION public.set_adhd_task_topic_done(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_adhd_task_topic_done(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
