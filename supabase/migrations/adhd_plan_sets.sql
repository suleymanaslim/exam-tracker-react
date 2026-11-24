-- DEHB modu için admin'in tekrar kullanabileceği haftalık ders setleri.
-- adhd_mode.sql'den SONRA, Supabase SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
BEGIN;

CREATE TABLE IF NOT EXISTS public.adhd_plan_sets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  -- [{ "day": 1-7, "subject_name": "Tarih", "note": "20 soru" }] — ders adıyla saklanır, her kullanıcıya uygulanabilir.
  items      jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adhd_plan_sets_owner_idx ON public.adhd_plan_sets(owner_id, created_at);

ALTER TABLE public.adhd_plan_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage own sets" ON public.adhd_plan_sets;
CREATE POLICY "Admins manage own sets" ON public.adhd_plan_sets FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND public.is_admin_user())
  WITH CHECK (owner_id = (SELECT auth.uid()) AND public.is_admin_user());

REVOKE ALL ON public.adhd_plan_sets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adhd_plan_sets TO authenticated;

COMMIT;
