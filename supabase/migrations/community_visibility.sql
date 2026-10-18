-- Run once in Supabase SQL Editor. Existing study/profile data is retained.
BEGIN;

CREATE TABLE IF NOT EXISTS public.dashboard_community_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  show_widget boolean NOT NULL DEFAULT true,
  share_statistics boolean NOT NULL DEFAULT true
);
ALTER TABLE public.dashboard_community_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dashboard_community_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.dashboard_community_preferences TO authenticated;
GRANT ALL ON public.dashboard_community_preferences TO service_role;

DROP POLICY IF EXISTS "Read own or admin community preferences" ON public.dashboard_community_preferences;
CREATE POLICY "Read own or admin community preferences" ON public.dashboard_community_preferences
  FOR SELECT TO authenticated USING (
    user_id = (SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.set_dashboard_community_preferences(
  p_user_id uuid, p_show_widget boolean, p_share_statistics boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE saved public.dashboard_community_preferences%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  IF p_show_widget IS NULL OR p_share_statistics IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid community preferences' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.dashboard_community_preferences(user_id, show_widget, share_statistics)
  VALUES (p_user_id, p_show_widget, p_share_statistics)
  ON CONFLICT (user_id) DO UPDATE
    SET show_widget = EXCLUDED.show_widget, share_statistics = EXCLUDED.share_statistics
  RETURNING * INTO saved;
  RETURN to_jsonb(saved);
END;
$$;
REVOKE ALL ON FUNCTION public.set_dashboard_community_preferences(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_dashboard_community_preferences(uuid, boolean, boolean) TO authenticated;

-- Return only publishable ranking data. A hidden widget returns no participants.
-- The viewer ID also supports verified admin impersonation.
CREATE OR REPLACE FUNCTION public.get_dashboard_community(
  p_viewer_id uuid, p_start timestamptz, p_end timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  visible boolean;
  sharing boolean;
  message text;
  participants jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_viewer_id IS NULL OR (p_viewer_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end)
    OR p_end <= p_start OR p_end - p_start > interval '2 days' THEN
    RAISE EXCEPTION 'Invalid day range' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(c.show_widget, true), COALESCE(c.share_statistics, true), COALESCE(p.daily_message, '')
  INTO visible, sharing, message
  FROM public.profiles p LEFT JOIN public.dashboard_community_preferences c ON c.user_id = p.id
  WHERE p.id = p_viewer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT visible THEN
    RETURN jsonb_build_object('show_widget', false, 'share_statistics', sharing, 'daily_message', message, 'entries', '[]'::jsonb);
  END IF;

  WITH publishable AS (
    SELECT p.id, p.display_name, p.email, p.daily_message
    FROM public.profiles p LEFT JOIN public.dashboard_community_preferences c ON c.user_id = p.id
    WHERE COALESCE(c.share_statistics, true)
  ), details AS (
    SELECT s.user_id,
      COALESCE(sub.name, 'Bilinmeyen Ders') || ' — ' || COALESCE(r.name, 'Genel') AS label,
      sum(s.duration_minutes) AS minutes
    FROM public.study_sessions s JOIN publishable p ON p.id = s.user_id
    LEFT JOIN public.subjects sub ON sub.id = s.subject_id AND sub.user_id = s.user_id
    LEFT JOIN public.resources r ON r.id = s.resource_id AND r.user_id = s.user_id
    WHERE s.started_at >= p_start AND s.started_at < p_end AND s.duration_minutes > 0
    GROUP BY s.user_id, COALESCE(sub.name, 'Bilinmeyen Ders') || ' — ' || COALESCE(r.name, 'Genel')
  ), totals AS (
    SELECT user_id, sum(minutes) AS total, jsonb_object_agg(label, minutes) AS details
    FROM details GROUP BY user_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', p.id, 'display_name', p.display_name, 'email', p.email,
    'message', COALESCE(p.daily_message, ''), 'total', COALESCE(t.total, 0),
    'details', COALESCE(t.details, '{}'::jsonb)
  ) ORDER BY COALESCE(t.total, 0) DESC, p.id), '[]'::jsonb)
  INTO participants
  FROM publishable p LEFT JOIN totals t ON t.user_id = p.id
  WHERE COALESCE(t.total, 0) > 0 OR COALESCE(btrim(p.daily_message), '') <> '';
  RETURN jsonb_build_object('show_widget', true, 'share_statistics', sharing, 'daily_message', message, 'entries', participants);
END;
$$;
REVOKE ALL ON FUNCTION public.get_dashboard_community(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_community(uuid, timestamptz, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
