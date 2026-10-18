-- Run this entire file in Supabase SQL Editor. Existing personal topics and progress are preserved.
BEGIN;

-- Role checks below must not be bypassable through a normal profile edit.
CREATE OR REPLACE FUNCTION public.guard_shared_study_role()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
    (TG_OP = 'INSERT' AND NEW.role IS DISTINCT FROM 'user') OR
    (TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role)
  ) THEN RAISE EXCEPTION 'Only a server administrator can assign profile roles' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_shared_study_role ON public.profiles;
CREATE TRIGGER guard_shared_study_role BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_shared_study_role();

CREATE OR REPLACE FUNCTION public.is_shared_study_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;
REVOKE ALL ON FUNCTION public.is_shared_study_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_shared_study_admin() TO authenticated;

CREATE TABLE IF NOT EXISTS public.ags_shared_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ags_shared_subjects_name_key ON public.ags_shared_subjects
  (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));
CREATE TABLE IF NOT EXISTS public.ags_shared_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.ags_shared_subjects(id),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 500),
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ags_shared_topics_title_key ON public.ags_shared_topics
  (subject_id, lower(regexp_replace(btrim(title), '\s+', ' ', 'g')));
CREATE TABLE IF NOT EXISTS public.ags_topic_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.ags_shared_topics(id),
  is_completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, topic_id)
);
CREATE TABLE IF NOT EXISTS public.monthly_topic_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_topic_id uuid REFERENCES public.ags_shared_topics(id),
  personal_topic_id uuid REFERENCES public.topics(id) ON DELETE CASCADE,
  target_month date NOT NULL CHECK (extract(day FROM target_month) = 1 AND extract(year FROM target_month) BETWEEN 2000 AND 2100),
  note text CHECK (char_length(note) <= 1000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(shared_topic_id, personal_topic_id) = 1),
  UNIQUE (owner_id, shared_topic_id),
  UNIQUE (owner_id, personal_topic_id)
);

ALTER TABLE public.ags_shared_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ags_shared_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ags_topic_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_topic_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shared_subject_read ON public.ags_shared_subjects;
CREATE POLICY shared_subject_read ON public.ags_shared_subjects FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS shared_topic_read ON public.ags_shared_topics;
CREATE POLICY shared_topic_read ON public.ags_shared_topics FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS own_shared_progress ON public.ags_topic_progress;
CREATE POLICY own_shared_progress ON public.ags_topic_progress FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_shared_study_admin()));
DROP POLICY IF EXISTS own_admin_monthly_plan ON public.monthly_topic_targets;
CREATE POLICY own_admin_monthly_plan ON public.monthly_topic_targets FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND (SELECT public.is_shared_study_admin()));
REVOKE ALL ON public.ags_shared_subjects, public.ags_shared_topics, public.ags_topic_progress, public.monthly_topic_targets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ags_shared_subjects, public.ags_shared_topics, public.ags_topic_progress, public.monthly_topic_targets TO authenticated;

-- Starter subject labels match the application's existing AGS subjects; users enter the topic list.
INSERT INTO public.ags_shared_subjects(id, name, sort_order) VALUES
  ('a6500000-0000-4000-8000-000000000001', 'Eğitim Bilimleri ve Türk Milli Eğitim Sistemi', 0),
  ('a6500000-0000-4000-8000-000000000002', 'Mevzuat Bilgisi', 10),
  ('a6500000-0000-4000-8000-000000000003', 'Tarih', 20),
  ('a6500000-0000-4000-8000-000000000004', 'Türkiye Coğrafyası', 30),
  ('a6500000-0000-4000-8000-000000000005', 'Sayısal Yetenek', 40),
  ('a6500000-0000-4000-8000-000000000006', 'Sözel Yetenek', 50)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.save_ags_shared_subject(p_name text, p_subject_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
  IF NOT public.is_shared_study_admin() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid subject' USING ERRCODE = '22023'; END IF;
  IF p_subject_id IS NOT NULL THEN
    UPDATE public.ags_shared_subjects SET name = btrim(p_name) WHERE id = p_subject_id RETURNING id INTO result;
    IF result IS NULL THEN RAISE EXCEPTION 'Subject not found' USING ERRCODE = '22023'; END IF;
  ELSE
    INSERT INTO public.ags_shared_subjects(name, sort_order)
      SELECT btrim(p_name), COALESCE(max(sort_order) + 10, 0) FROM public.ags_shared_subjects
      ON CONFLICT (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) DO UPDATE SET name = public.ags_shared_subjects.name
      RETURNING id INTO result;
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_ags_shared_topics(p_subject_id uuid, p_titles text[], p_topic_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE input_title text; topic uuid; saved integer := 0;
BEGIN
  IF NOT public.is_shared_study_admin() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ags_shared_subjects WHERE id = p_subject_id) OR p_titles IS NULL
    OR COALESCE(cardinality(p_titles), 0) NOT BETWEEN 1 AND 500 OR (p_topic_id IS NOT NULL AND cardinality(p_titles) <> 1) THEN
    RAISE EXCEPTION 'Invalid topic list' USING ERRCODE = '22023';
  END IF;
  FOREACH input_title IN ARRAY p_titles LOOP
    IF input_title IS NULL OR char_length(btrim(input_title)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid topic title' USING ERRCODE = '22023'; END IF;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('ags-subject:' || p_subject_id::text, 0));
  FOREACH input_title IN ARRAY p_titles LOOP
    IF p_topic_id IS NOT NULL THEN
      UPDATE public.ags_shared_topics SET title = btrim(input_title) WHERE id = p_topic_id AND subject_id = p_subject_id RETURNING id INTO topic;
      IF NOT FOUND THEN RAISE EXCEPTION 'Topic not found' USING ERRCODE = '22023'; END IF;
    ELSE
      INSERT INTO public.ags_shared_topics AS existing(subject_id, title, sort_order)
        SELECT p_subject_id, btrim(input_title), COALESCE(max(sort_order) + 10, 0) FROM public.ags_shared_topics WHERE subject_id = p_subject_id
        ON CONFLICT (subject_id, lower(regexp_replace(btrim(title), '\s+', ' ', 'g')))
        DO UPDATE SET archived_at = NULL RETURNING id INTO topic;
    END IF;
    saved := saved + 1;
  END LOOP;
  RETURN jsonb_build_object('saved', saved);
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_ags_shared_topic(p_topic_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_shared_study_admin() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  UPDATE public.ags_shared_topics SET archived_at = COALESCE(archived_at, now()) WHERE id = p_topic_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_ags_topic_completion(p_user_id uuid, p_topic_id uuid, p_completed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL OR (p_user_id <> auth.uid() AND NOT public.is_shared_study_admin()) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF p_completed IS NULL OR NOT EXISTS (SELECT 1 FROM public.ags_shared_topics WHERE id = p_topic_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Topic not found' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.ags_topic_progress(user_id, topic_id, is_completed) VALUES (p_user_id, p_topic_id, p_completed)
    ON CONFLICT (user_id, topic_id) DO UPDATE SET is_completed = EXCLUDED.is_completed, updated_at = now();
END;
$$;

-- Only an explicit admin action publishes their OWN existing AGS titles; completions remain personal.
CREATE OR REPLACE FUNCTION public.publish_existing_ags_topics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row record; subject uuid; saved integer := 0;
BEGIN
  IF NOT public.is_shared_study_admin() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  FOR row IN SELECT s.name, t.title FROM public.topics t
    JOIN public.subjects s ON s.id = t.subject_id AND s.user_id = auth.uid()
    JOIN public.exams e ON e.id = s.exam_id AND e.user_id = auth.uid()
    WHERE t.user_id = auth.uid() AND (upper(btrim(e.name)) IN ('AGS', 'MEB-AGS', 'MEB AGS') OR to_jsonb(e)->>'base_template_key' = 'ags')
    ORDER BY s.name, t.sort_order, t.id LOOP
    subject := public.save_ags_shared_subject(row.name);
    PERFORM public.save_ags_shared_topics(subject, ARRAY[row.title]);
    saved := saved + 1;
  END LOOP;
  RETURN jsonb_build_object('saved', saved);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_monthly_topic_targets(p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry jsonb; topic uuid; month date; saved integer := 0; kind text;
BEGIN
  IF NOT public.is_shared_study_admin() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Invalid targets' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid targets' USING ERRCODE = '22023'; END IF;
  -- Serialize one admin's edits. A retry moves/updates the same target rather than adding a duplicate.
  PERFORM pg_advisory_xact_lock(hashtextextended('monthly-plan:' || auth.uid()::text, 0));
  FOR entry IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(entry) <> 'object' OR entry->>'kind' IS NULL OR entry->>'kind' NOT IN ('shared', 'personal')
      OR COALESCE(entry->>'month', '') !~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'
      OR char_length(COALESCE(entry->>'note', '')) > 1000 OR entry->>'topic_id' IS NULL
      OR (entry ? 'note' AND jsonb_typeof(entry->'note') NOT IN ('string', 'null')) THEN
      RAISE EXCEPTION 'Invalid target' USING ERRCODE = '22023';
    END IF;
    topic := (entry->>'topic_id')::uuid; month := ((entry->>'month') || '-01')::date; kind := entry->>'kind';
    IF kind = 'shared' THEN
      IF NOT EXISTS (SELECT 1 FROM public.ags_shared_topics WHERE id = topic AND archived_at IS NULL) THEN
        RAISE EXCEPTION 'Topic not found' USING ERRCODE = '42501';
      END IF;
      INSERT INTO public.monthly_topic_targets(owner_id, shared_topic_id, target_month, note)
        VALUES (auth.uid(), topic, month, nullif(btrim(entry->>'note'), ''))
        ON CONFLICT (owner_id, shared_topic_id) DO UPDATE SET target_month = EXCLUDED.target_month, note = EXCLUDED.note, updated_at = now();
    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.topics t JOIN public.subjects s ON s.id = t.subject_id AND s.user_id = auth.uid()
        WHERE t.id = topic AND t.user_id = auth.uid()) THEN RAISE EXCEPTION 'Topic not found' USING ERRCODE = '42501'; END IF;
      INSERT INTO public.monthly_topic_targets(owner_id, personal_topic_id, target_month, note)
        VALUES (auth.uid(), topic, month, nullif(btrim(entry->>'note'), ''))
        ON CONFLICT (owner_id, personal_topic_id) DO UPDATE SET target_month = EXCLUDED.target_month, note = EXCLUDED.note, updated_at = now();
    END IF;
    saved := saved + 1;
  END LOOP;
  RETURN jsonb_build_object('saved', saved);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_monthly_topic_target(p_target_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_shared_study_admin() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.monthly_topic_targets WHERE id = p_target_id AND owner_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.save_ags_shared_subject(text, uuid), public.save_ags_shared_topics(uuid, text[], uuid),
  public.archive_ags_shared_topic(uuid), public.set_ags_topic_completion(uuid, uuid, boolean), public.publish_existing_ags_topics(),
  public.save_monthly_topic_targets(jsonb), public.remove_monthly_topic_target(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ags_shared_subject(text, uuid), public.save_ags_shared_topics(uuid, text[], uuid),
  public.archive_ags_shared_topic(uuid), public.set_ags_topic_completion(uuid, uuid, boolean), public.publish_existing_ags_topics(),
  public.save_monthly_topic_targets(jsonb), public.remove_monthly_topic_target(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
