-- Run the entire script together in Supabase SQL Editor.
-- Recreate the dependent view with its supplied definition, owner and grants.
-- RESTRICT prevents removal of other dependent objects; any failure rolls back.
BEGIN;

DROP VIEW public.v_plan_item_progress RESTRICT;

ALTER TABLE public.study_sessions
  ALTER COLUMN duration_minutes TYPE numeric(12,6)
  USING duration_minutes::numeric(12,6);

CREATE VIEW public.v_plan_item_progress AS
SELECT
  pi.id AS plan_item_id,
  pi.weekly_plan_id,
  pi.day_of_week,
  pi.planned_minutes,
  COALESCE(SUM(ss.duration_minutes), 0::numeric) AS completed_minutes
FROM public.plan_items pi
LEFT JOIN public.study_sessions ss ON ss.plan_item_id = pi.id
GROUP BY pi.id;

ALTER VIEW public.v_plan_item_progress OWNER TO postgres;
GRANT ALL PRIVILEGES ON public.v_plan_item_progress
  TO postgres WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON public.v_plan_item_progress
  TO anon, authenticated, service_role;

COMMIT;
