-- Run once in Supabase SQL Editor. Never deletes personal exams or results.
-- YDS is captured from the sole configured admin YDS exam. If ambiguous, use
-- Settings > Exam settings > Publish as shared template on the intended account.
BEGIN;

CREATE TABLE IF NOT EXISTS public.exam_templates (
  template_key text PRIMARY KEY CHECK (template_key IN ('ags', 'yds', 'ales', 'ielts')),
  name text NOT NULL,
  color text NOT NULL,
  wrong_penalty numeric CHECK (wrong_penalty IS NULL OR (wrong_penalty >= 0 AND wrong_penalty::text NOT IN ('NaN','Infinity','-Infinity'))),
  point_per_net numeric NOT NULL CHECK (point_per_net > 0 AND point_per_net::text NOT IN ('NaN','Infinity','-Infinity')),
  question_types jsonb NOT NULL CHECK (jsonb_typeof(question_types) = 'array' AND jsonb_array_length(question_types) > 0),
  description text NOT NULL DEFAULT '',
  source_exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS base_template_key text;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS base_template_initialized boolean NOT NULL DEFAULT false;
ALTER TABLE public.exam_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exam_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.exam_templates TO authenticated;
GRANT ALL ON public.exam_templates TO service_role;
DROP POLICY IF EXISTS "Read shared exam templates" ON public.exam_templates;
CREATE POLICY "Read shared exam templates" ON public.exam_templates FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.exam_template_key(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE upper(btrim(p_name))
    WHEN 'AGS' THEN 'ags' WHEN 'MEB-AGS' THEN 'ags' WHEN 'MEB AGS' THEN 'ags'
    WHEN 'YDS' THEN 'yds' WHEN 'E-YDS' THEN 'yds'
    WHEN 'ALES' THEN 'ales' WHEN 'IELTS' THEN 'ielts' ELSE NULL END;
$$;

-- Private, transaction-safe snapshot of actual settings; no guessed YDS types.
CREATE OR REPLACE FUNCTION public._snapshot_exam_template(p_exam_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE e public.exams%ROWTYPE; k text; types jsonb;
BEGIN
  SELECT * INTO e FROM public.exams WHERE id = p_exam_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found' USING ERRCODE = 'P0002'; END IF;
  k := public.exam_template_key(e.name);
  IF k IS NULL THEN RAISE EXCEPTION 'Unsupported exam template' USING ERRCODE = '22023'; END IF;
  SELECT jsonb_agg(jsonb_build_object('name', q.name, 'question_count', COALESCE(q.question_count, 0)) ORDER BY q.sort_order, q.id)
  INTO types FROM public.exam_question_types q WHERE q.exam_id = e.id AND q.user_id = e.user_id;
  IF types IS NULL THEN RAISE EXCEPTION 'Add question types before publishing' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(types) t WHERE btrim(t->>'name') = '' OR (t->>'question_count')::integer < 0) THEN
    RAISE EXCEPTION 'Invalid question types' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.exam_templates(template_key, name, color, wrong_penalty, point_per_net, question_types, description, source_exam_id)
  VALUES (k, upper(k), COALESCE(e.color, '#4269a8'), e.wrong_penalty, COALESCE(e.point_per_net, 1), types,
    'Yönetici hesabındaki soru türleri, soru sayıları, sıra ve puanlama ayarlarından alındı.', e.id)
  ON CONFLICT (template_key) DO UPDATE SET color = EXCLUDED.color, wrong_penalty = EXCLUDED.wrong_penalty,
    point_per_net = EXCLUDED.point_per_net, question_types = EXCLUDED.question_types,
    description = EXCLUDED.description, source_exam_id = EXCLUDED.source_exam_id, updated_at = now();
  RETURN k;
END;
$$;
REVOKE ALL ON FUNCTION public._snapshot_exam_template(uuid) FROM PUBLIC, anon, authenticated;

-- Initialize empty accounts only. A marker preserves deliberate later deletions.
CREATE OR REPLACE FUNCTION public._apply_exam_templates(p_user_id uuid, p_template_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.exam_templates%ROWTYPE; e public.exams%ROWTYPE;
  created integer := 0; initialized integer := 0; preserved integer := 0; is_new boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_template_key IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.exam_templates WHERE template_key = p_template_key) THEN
    RAISE EXCEPTION 'Template not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('exam-templates:' || p_user_id::text, 0));
  FOR t IN SELECT * FROM public.exam_templates WHERE p_template_key IS NULL OR template_key = p_template_key ORDER BY template_key LOOP
    is_new := false;
    SELECT * INTO e FROM public.exams ex
    WHERE ex.user_id = p_user_id AND public.exam_template_key(ex.name) = t.template_key
    ORDER BY EXISTS (SELECT 1 FROM public.exam_question_types q WHERE q.exam_id = ex.id) DESC, ex.id
    LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.exams(user_id, name, color, wrong_penalty, point_per_net)
      VALUES (p_user_id, t.name, t.color, t.wrong_penalty, t.point_per_net) RETURNING * INTO e;
      created := created + 1; is_new := true;
    END IF;
    IF e.base_template_initialized
      OR EXISTS (SELECT 1 FROM public.exam_question_types WHERE exam_id = e.id)
      OR EXISTS (SELECT 1 FROM public.exam_results WHERE exam_id = e.id) THEN
      IF NOT e.base_template_initialized THEN
        UPDATE public.exams SET base_template_initialized = true WHERE id = e.id;
      END IF;
      preserved := preserved + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.exam_question_types(user_id, exam_id, name, question_count, sort_order)
    SELECT p_user_id, e.id, item->>'name', (item->>'question_count')::integer, (ordinality - 1)::integer
    FROM jsonb_array_elements(t.question_types) WITH ORDINALITY AS source(item, ordinality);
    -- Default-only blank exams inherit the rule; custom scoring stays untouched.
    UPDATE public.exams SET base_template_key = t.template_key, base_template_initialized = true,
      wrong_penalty = CASE WHEN is_new OR (e.wrong_penalty IS NULL AND COALESCE(e.point_per_net, 1) = 1) THEN t.wrong_penalty ELSE e.wrong_penalty END,
      point_per_net = CASE WHEN is_new OR (e.wrong_penalty IS NULL AND COALESCE(e.point_per_net, 1) = 1) THEN t.point_per_net ELSE e.point_per_net END
    WHERE id = e.id;
    initialized := initialized + 1;
  END LOOP;
  RETURN jsonb_build_object('created_exams', created, 'initialized_exams', initialized, 'preserved_exams', preserved);
END;
$$;
REVOKE ALL ON FUNCTION public._apply_exam_templates(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_exam_templates(p_user_id uuid, p_template_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS NULL OR (p_user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  RETURN public._apply_exam_templates(p_user_id, p_template_key);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_exam_templates(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_exam_templates(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_exam_template(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE k text; u record; count_users integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  -- Publishing always snapshots the signed-in administrator's own exam.
  IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = p_exam_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Select an exam from your own account' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('exam-template-publish', 0));
  k := public._snapshot_exam_template(p_exam_id);
  FOR u IN SELECT id FROM auth.users ORDER BY id LOOP
    PERFORM public._apply_exam_templates(u.id, k); count_users := count_users + 1;
  END LOOP;
  RETURN jsonb_build_object('template_key', k, 'accounts_checked', count_users);
END;
$$;
REVOKE ALL ON FUNCTION public.publish_exam_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_exam_template(uuid) TO authenticated;

-- Verified source formats; these are practice/net tracking bases, not official
-- standardized score/band calculations.
-- AGS: https://dokuman.osym.gov.tr/pdfdokuman/2026/MEB-AGS/konudagilimi08012026.pdf
-- ALES: https://dokuman.osym.gov.tr/pdfdokuman/2026/ALES-2/kilavuz_ales2d10062026.pdf
-- IELTS: https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail
INSERT INTO public.exam_templates(template_key, name, color, wrong_penalty, point_per_net, description, question_types) VALUES
('ags', 'AGS', '#3b82f6', 4, 1,
 '2026 konu ağırlıklarından oluşturulmuş 80 soruluk başlangıç dağılımı. Net takibi içindir; resmî AGS puanı hesaplanmaz.',
 '[{"name":"Sözel Yetenek","question_count":15},{"name":"Sayısal Yetenek","question_count":15},{"name":"Tarih","question_count":6},{"name":"Türkiye Coğrafyası","question_count":6},{"name":"Eğitim Bilimleri ve Türk Millî Eğitim Sistemi","question_count":30},{"name":"Mevzuat","question_count":8}]'),
('ales', 'ALES', '#f97316', 4, 1,
 '50 sayısal ve 50 sözel soru. Net takibi içindir; standartlaştırılmış resmî ALES puanı hesaplanmaz.',
 '[{"name":"Sayısal Yetenek","question_count":50},{"name":"Sözel Yetenek","question_count":50}]'),
('ielts', 'IELTS', '#a855f7', NULL, 1,
 'Listening ve Reading için 40’ar soruluk ham doğru takibi. Writing/Speaking ve resmî band puanı bu şablonun kapsamı dışındadır.',
 '[{"name":"Listening","question_count":40},{"name":"Reading","question_count":40}]')
ON CONFLICT (template_key) DO NOTHING;

DO $$
DECLARE candidates uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.exam_templates WHERE template_key = 'yds') THEN
    SELECT array_agg(e.id ORDER BY e.id) INTO candidates FROM public.exams e
    JOIN public.profiles p ON p.id = e.user_id
    WHERE p.role = 'admin' AND public.exam_template_key(e.name) = 'yds'
      AND EXISTS (SELECT 1 FROM public.exam_question_types q WHERE q.exam_id = e.id AND q.user_id = e.user_id);
    IF cardinality(candidates) = 1 THEN
      PERFORM public._snapshot_exam_template(candidates[1]);
    ELSE
      RAISE NOTICE 'YDS source is missing or ambiguous. On the main admin account, select YDS in Settings and publish its shared template.';
    END IF;
  END IF;
END;
$$;

-- Backfill every current account, including accounts without a profile yet.
DO $$
DECLARE u record;
BEGIN
  FOR u IN SELECT id FROM auth.users ORDER BY id LOOP
    PERFORM public._apply_exam_templates(u.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.initialize_profile_exam_templates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public._apply_exam_templates(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.initialize_profile_exam_templates() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS initialize_profile_exam_templates ON public.profiles;
CREATE TRIGGER initialize_profile_exam_templates AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.initialize_profile_exam_templates();

NOTIFY pgrst, 'reload schema';
COMMIT;
