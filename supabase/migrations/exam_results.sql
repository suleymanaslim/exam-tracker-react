-- Add new columns to exams table
ALTER TABLE exams ADD COLUMN IF NOT EXISTS wrong_penalty NUMERIC; -- e.g. 4 means 4 wrong takes 1 correct
ALTER TABLE exams ADD COLUMN IF NOT EXISTS point_per_net NUMERIC DEFAULT 1;

-- Create exam_question_types table
CREATE TABLE IF NOT EXISTS exam_question_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create exam_results table
CREATE TABLE IF NOT EXISTS exam_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create exam_result_details table
CREATE TABLE IF NOT EXISTS exam_result_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  result_id UUID NOT NULL REFERENCES exam_results(id) ON DELETE CASCADE,
  question_type_id UUID NOT NULL REFERENCES exam_question_types(id) ON DELETE CASCADE,
  correct_count INTEGER DEFAULT 0,
  incorrect_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS setup
ALTER TABLE exam_question_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_result_details ENABLE ROW LEVEL SECURITY;

-- Policies for exam_question_types
CREATE POLICY "Users can view their own question types"
  ON exam_question_types FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own question types"
  ON exam_question_types FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own question types"
  ON exam_question_types FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own question types"
  ON exam_question_types FOR DELETE
  USING (auth.uid() = user_id);

-- Policies for exam_results
CREATE POLICY "Users can view their own exam results"
  ON exam_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own exam results"
  ON exam_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own exam results"
  ON exam_results FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own exam results"
  ON exam_results FOR DELETE
  USING (auth.uid() = user_id);

-- Policies for exam_result_details
-- To keep it simple, we join with exam_results to check user_id, 
-- or we can just add user_id to exam_result_details as well.
-- Adding user_id makes RLS much easier. Let's alter table to add user_id.

ALTER TABLE exam_result_details ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE POLICY "Users can view their own exam result details"
  ON exam_result_details FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own exam result details"
  ON exam_result_details FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own exam result details"
  ON exam_result_details FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own exam result details"
  ON exam_result_details FOR DELETE
  USING (auth.uid() = user_id);
