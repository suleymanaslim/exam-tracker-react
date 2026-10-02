-- Add is_draft column to exam_results table
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;
