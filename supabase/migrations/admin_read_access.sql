-- Apply once in the Supabase SQL editor. Frontend deployment cannot apply SQL.
-- Keep owner policies; permit verified administrators to READ protected pages.
BEGIN;

-- A user must not be able to grant themselves the role used by these policies.
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.role IS DISTINCT FROM 'user' THEN
        RAISE EXCEPTION 'Only a server administrator can assign profile roles';
      END IF;
    ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Only a server administrator can change profile roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_profile_role ON public.profiles;
CREATE TRIGGER protect_profile_role BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['video_plan_items', 'topics', 'exam_question_types', 'exam_results', 'exam_result_details'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins can read user data" ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY "Admins can read user data" ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = ''admin''))',
      table_name
    );
  END LOOP;
END;
$$;
COMMIT;
