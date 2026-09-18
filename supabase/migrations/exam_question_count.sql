-- Add question_count column to exam_question_types
ALTER TABLE exam_question_types ADD COLUMN IF NOT EXISTS question_count INTEGER DEFAULT 0;
