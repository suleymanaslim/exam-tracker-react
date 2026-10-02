-- 1. `resources` tablosuna `total_videos` ve `avg_video_duration` ekleme
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS total_videos INTEGER DEFAULT 0;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS avg_video_duration INTEGER DEFAULT 0;

-- 2. `video_plan_items` tablosunun oluşturulması
CREATE TABLE IF NOT EXISTS public.video_plan_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    video_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Row Level Security (RLS) Ayarları
ALTER TABLE public.video_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own video plan items"
    ON public.video_plan_items FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own video plan items"
    ON public.video_plan_items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own video plan items"
    ON public.video_plan_items FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own video plan items"
    ON public.video_plan_items FOR DELETE
    USING (auth.uid() = user_id);
