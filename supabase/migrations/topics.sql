-- Topics tablosunu oluştur
-- Bu SQL'i Supabase Dashboard > SQL Editor'de çalıştır

CREATE TABLE IF NOT EXISTS public.topics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  is_completed  BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS politikaları
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own topics"
  ON public.topics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own topics"
  ON public.topics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own topics"
  ON public.topics FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own topics"
  ON public.topics FOR DELETE
  USING (auth.uid() = user_id);

-- İndeks
CREATE INDEX IF NOT EXISTS topics_subject_id_idx ON public.topics(subject_id);
CREATE INDEX IF NOT EXISTS topics_user_id_idx ON public.topics(user_id);
