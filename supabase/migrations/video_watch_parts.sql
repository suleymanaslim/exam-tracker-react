-- Run once in Supabase SQL Editor before deploying this feature.
-- Existing plans/progress are preserved. Completed split videos can only be deleted.
BEGIN;
ALTER TABLE public.video_plan_items ADD COLUMN IF NOT EXISTS watched_count integer DEFAULT 0;
ALTER TABLE public.video_plan_items ADD COLUMN IF NOT EXISTS is_completed boolean DEFAULT false;
ALTER TABLE public.video_plan_items ADD COLUMN IF NOT EXISTS watch_parts_total integer NOT NULL DEFAULT 1;
ALTER TABLE public.video_plan_items ADD COLUMN IF NOT EXISTS watch_parts_done integer NOT NULL DEFAULT 0;
ALTER TABLE public.video_plan_items ADD COLUMN IF NOT EXISTS completion_week date;
ALTER TABLE public.video_plan_items ADD COLUMN IF NOT EXISTS planned_date date;

CREATE OR REPLACE FUNCTION public.guard_video_watch_parts()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.completion_week IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Completed video is locked; delete the record to remove it' USING ERRCODE = '23514';
  END IF;
  IF NEW.watch_parts_total NOT BETWEEN 1 AND 4 OR NEW.watch_parts_done < 0
    OR NEW.watch_parts_done > NEW.watch_parts_total THEN
    RAISE EXCEPTION 'Invalid video parts' USING ERRCODE = '23514';
  END IF;
  IF NEW.watch_parts_total > 1 THEN
    IF NEW.video_count IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'Only single videos can be split' USING ERRCODE = '23514';
    END IF;
    NEW.watched_count := CASE WHEN NEW.watch_parts_done = NEW.watch_parts_total THEN 1 ELSE 0 END;
    NEW.is_completed := NEW.watch_parts_done = NEW.watch_parts_total;
    NEW.completion_week := CASE WHEN NEW.is_completed
      THEN coalesce(NEW.completion_week, date_trunc('week', now() AT TIME ZONE 'Europe/Istanbul')::date) ELSE NULL END;
    -- A caller cannot assign completion to a different week.
    IF TG_OP = 'INSERT' OR OLD.completion_week IS NULL THEN
      NEW.completion_week := CASE WHEN NEW.is_completed
        THEN date_trunc('week', now() AT TIME ZONE 'Europe/Istanbul')::date ELSE NULL END;
    END IF;
    IF NEW.completion_week IS NOT NULL THEN
      NEW.planned_date := coalesce(NEW.planned_date, NEW.date);
      NEW.date := NEW.completion_week;
    END IF;
  ELSIF NEW.watch_parts_done <> 0 OR NEW.completion_week IS NOT NULL THEN
    RAISE EXCEPTION 'Split progress requires a split video' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_video_watch_parts ON public.video_plan_items;
CREATE TRIGGER guard_video_watch_parts BEFORE INSERT OR UPDATE ON public.video_plan_items
FOR EACH ROW EXECUTE FUNCTION public.guard_video_watch_parts();

-- One row lock makes retries idempotent and prevents partial/double completion.
CREATE OR REPLACE FUNCTION public.set_video_watch_parts(p_item_id uuid, p_total integer, p_done integer)
RETURNS public.video_plan_items LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE item public.video_plan_items%ROWTYPE;
BEGIN
  SELECT * INTO item FROM public.video_plan_items WHERE id = p_item_id FOR UPDATE;
  IF auth.uid() IS NULL OR NOT FOUND OR (item.user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF item.video_count <> 1 OR p_total IS NULL OR p_total NOT BETWEEN 2 AND 4
    OR p_done IS NULL OR p_done NOT BETWEEN 0 AND p_total THEN
    RAISE EXCEPTION 'Invalid video parts' USING ERRCODE = '23514';
  END IF;
  IF item.completion_week IS NOT NULL THEN
    IF item.watch_parts_total = p_total AND item.watch_parts_done = p_done THEN RETURN item; END IF;
    RAISE EXCEPTION 'Completed video is locked' USING ERRCODE = '23514';
  END IF;
  UPDATE public.video_plan_items SET watch_parts_total = p_total, watch_parts_done = p_done
    WHERE id = item.id RETURNING * INTO item;
  RETURN item;
END;
$$;
REVOKE ALL ON FUNCTION public.set_video_watch_parts(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_video_watch_parts(uuid, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_video_plan_items(p_item_ids uuid[])
RETURNS SETOF public.video_plan_items LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE item public.video_plan_items%ROWTYPE; processed integer := 0;
BEGIN
  IF auth.uid() IS NULL OR p_item_ids IS NULL OR cardinality(p_item_ids) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  FOR item IN SELECT * FROM public.video_plan_items WHERE id = ANY(p_item_ids) ORDER BY id FOR UPDATE LOOP
    IF item.user_id <> auth.uid() AND NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
    processed := processed + 1;
    IF item.completion_week IS NOT NULL THEN RETURN NEXT item; CONTINUE; END IF;
    UPDATE public.video_plan_items SET watched_count = video_count, is_completed = true,
      watch_parts_done = CASE WHEN watch_parts_total > 1 THEN watch_parts_total ELSE 0 END
      WHERE id = item.id RETURNING * INTO item;
    RETURN NEXT item;
  END LOOP;
  IF processed <> cardinality(p_item_ids) THEN RAISE EXCEPTION 'Video not found' USING ERRCODE = '42501'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_video_plan_items(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_video_plan_items(uuid[]) TO authenticated;

-- Reset editable progress only. Monday completion records are never altered.
CREATE OR REPLACE FUNCTION public.reset_video_watch_progress(p_user_id uuid, p_resource_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL OR p_resource_id IS NULL
    OR (p_user_id <> auth.uid() AND NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  UPDATE public.video_plan_items SET watched_count = 0, is_completed = false, watch_parts_done = 0
    WHERE user_id = p_user_id AND resource_id = p_resource_id AND completion_week IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.reset_video_watch_progress(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_video_watch_progress(uuid, uuid) TO authenticated;
COMMIT;
