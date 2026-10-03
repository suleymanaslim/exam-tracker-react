-- One-time repair for existing accounts. Updates ONLY missing/default display names.
-- Real profile names, roles, passwords and study data remain untouched.
BEGIN;
WITH names AS (
  SELECT u.id, chosen.name
  FROM auth.users u
  CROSS JOIN LATERAL (
    SELECT btrim(candidate.name) AS name
    FROM (VALUES
      (1, u.raw_user_meta_data->>'display_name'),
      (2, u.raw_user_meta_data->>'full_name'),
      (3, u.raw_user_meta_data->>'name')
    ) candidate(priority, name)
    WHERE NULLIF(btrim(candidate.name), '') IS NOT NULL
      AND lower(btrim(candidate.name)) NOT IN ('kullanıcı', 'kullanici', 'user', 'isimsiz', 'isimsız', 'bilinmeyen')
    ORDER BY candidate.priority
    LIMIT 1
  ) chosen
)
UPDATE public.profiles p SET display_name = names.name
FROM names
WHERE p.id = names.id
  AND (NULLIF(btrim(p.display_name), '') IS NULL
    OR lower(btrim(p.display_name)) IN ('kullanıcı', 'kullanici', 'user', 'isimsiz', 'isimsız', 'bilinmeyen'));
COMMIT;
