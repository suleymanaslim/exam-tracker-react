-- Sınavlara tarih sütunu ekle
-- Bu SQL'i Supabase Dashboard > SQL Editor'de çalıştır

ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS exam_date DATE;
