-- Run after shared_ags_topics_monthly.sql and ags_topic_source.sql.
-- Adds read-only sharing. Existing plans, topics and progress are not changed.
BEGIN;

CREATE TABLE IF NOT EXISTS public.monthly_plan_viewers (
  plan_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_owner_id, viewer_id),
  CHECK (plan_owner_id <> viewer_id)
);
ALTER TABLE public.monthly_plan_viewers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS monthly_plan_viewer_read ON public.monthly_plan_viewers;
CREATE POLICY monthly_plan_viewer_read ON public.monthly_plan_viewers FOR SELECT TO authenticated
  USING (viewer_id = (SELECT auth.uid()) OR (plan_owner_id = (SELECT auth.uid()) AND (SELECT public.is_shared_study_admin())));
REVOKE ALL ON public.monthly_plan_viewers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.monthly_plan_viewers TO authenticated;

CREATE OR REPLACE FUNCTION public.set_monthly_plan_viewer(p_viewer_id uuid, p_allowed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_shared_study_admin() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_viewer_id IS NULL OR p_viewer_id = auth.uid() OR p_allowed IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_viewer_id
  ) THEN RAISE EXCEPTION 'Invalid viewer' USING ERRCODE = '22023'; END IF;
  IF p_allowed THEN
    INSERT INTO public.monthly_plan_viewers(plan_owner_id, viewer_id) VALUES (auth.uid(), p_viewer_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.monthly_plan_viewers WHERE plan_owner_id = auth.uid() AND viewer_id = p_viewer_id;
  END IF;
  RETURN jsonb_build_object('viewer_id', p_viewer_id, 'allowed', p_allowed);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_accessible_monthly_plans()
RETURNS TABLE(plan_owner_id uuid, owner_name text, can_edit boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id, COALESCE(NULLIF(btrim(p.display_name), ''), 'Yönetici'), p.id = auth.uid()
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL AND p.role = 'admin' AND (
    p.id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.monthly_plan_viewers v WHERE v.plan_owner_id = p.id AND v.viewer_id = auth.uid()
    )
  )
  ORDER BY (p.id = auth.uid()) DESC, p.display_name, p.id;
$$;

-- Do not open personal topic/catalog tables to viewers. Return only planned titles,
-- their course labels and target months; never the owner's study/completion records.
CREATE OR REPLACE FUNCTION public.get_shared_monthly_plan(p_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE source text; result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_owner_id AND role = 'admin') OR NOT (
    p_owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.monthly_plan_viewers WHERE plan_owner_id = p_owner_id AND viewer_id = auth.uid()
    )
  ) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT pref.source INTO source FROM public.ags_topic_preferences pref WHERE pref.user_id = p_owner_id;
  WITH planned AS (
    SELECT mt.*, jsonb_build_object(
      'key', 'shared:' || t.id, 'id', t.id, 'kind', 'shared', 'subjectKey', 'shared:' || s.id,
      'subject', s.name, 'exam', 'AGS · Ortak', 'title', t.title,
      'completed', false, 'archived', t.archived_at IS NOT NULL, 'isAgs', true
    ) AS topic
    FROM public.monthly_topic_targets mt
    JOIN public.ags_shared_topics t ON t.id = mt.shared_topic_id
    JOIN public.ags_shared_subjects s ON s.id = t.subject_id
    WHERE mt.owner_id = p_owner_id AND source = 'shared'
    UNION ALL
    SELECT mt.*, jsonb_build_object(
      'key', 'personal:' || t.id, 'id', t.id, 'kind', 'personal', 'subjectKey', 'personal:' || t.subject_id,
      'subject', COALESCE(s.name, 'Ders kaldırıldı'), 'exam', COALESCE(e.name, 'Kişisel'), 'title', t.title,
      'completed', false, 'archived', false,
      'isAgs', COALESCE(to_jsonb(e)->>'base_template_key' = 'ags' OR upper(btrim(e.name)) IN ('AGS', 'MEB-AGS', 'MEB AGS'), false)
    ) AS topic
    FROM public.monthly_topic_targets mt
    JOIN public.topics t ON t.id = mt.personal_topic_id AND t.user_id = p_owner_id
    LEFT JOIN public.subjects s ON s.id = t.subject_id AND s.user_id = p_owner_id
    LEFT JOIN public.exams e ON e.id = s.exam_id AND e.user_id = p_owner_id
    WHERE mt.owner_id = p_owner_id AND (
      source = 'personal' OR NOT COALESCE(to_jsonb(e)->>'base_template_key' = 'ags' OR upper(btrim(e.name)) IN ('AGS', 'MEB-AGS', 'MEB AGS'), false)
    )
  )
  SELECT jsonb_build_object(
    'owner_id', p_owner_id, 'agsTopicSource', source,
    'topics', COALESCE(jsonb_agg(topic ORDER BY target_month, id), '[]'::jsonb),
    'targets', COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'owner_id', owner_id, 'shared_topic_id', shared_topic_id, 'personal_topic_id', personal_topic_id,
      'target_month', target_month, 'note', note
    ) ORDER BY target_month, id), '[]'::jsonb)
  ) INTO result FROM planned;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_monthly_plan_viewer(uuid, boolean), public.get_accessible_monthly_plans(), public.get_shared_monthly_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_monthly_plan_viewer(uuid, boolean), public.get_accessible_monthly_plans(), public.get_shared_monthly_plan(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
