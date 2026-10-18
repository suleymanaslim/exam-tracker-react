-- Run after shared_ags_topics_monthly.sql. This changes visibility only; topic/progress rows are preserved.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ags_topic_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('shared', 'personal')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ags_topic_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_ags_topic_preference ON public.ags_topic_preferences;
CREATE POLICY own_ags_topic_preference ON public.ags_topic_preferences FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_shared_study_admin()));
REVOKE ALL ON public.ags_topic_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ags_topic_preferences TO authenticated;

CREATE OR REPLACE FUNCTION public.set_ags_topic_source(p_user_id uuid, p_source text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL OR (p_user_id <> auth.uid() AND NOT public.is_shared_study_admin()) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('shared', 'personal') THEN RAISE EXCEPTION 'Invalid topic source' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.ags_topic_preferences(user_id, source) VALUES (p_user_id, p_source)
    ON CONFLICT (user_id) DO UPDATE SET source = EXCLUDED.source, updated_at = now();
  RETURN p_source;
END;
$$;
REVOKE ALL ON FUNCTION public.set_ags_topic_source(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ags_topic_source(uuid, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
