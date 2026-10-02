BEGIN;

DROP POLICY IF EXISTS "Admins can manage video plans"
ON public.video_plan_items;

CREATE POLICY "Admins can manage video plans"
ON public.video_plan_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  )
);

COMMIT;
