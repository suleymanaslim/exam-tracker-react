-- 1. Profiller tablosunu oluştur
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  role TEXT DEFAULT 'user'
);

-- 2. Profilleri herkes görebilsin (Admin menüsünde listelemek için)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- 3. Adminin başkasının verilerini okuyup yazabilmesi için diğer tablolardaki güvenliği (RLS) devre dışı bırakıyoruz.
-- (Sistemde önemli veri tutulmayacağı için onaylandı)
ALTER TABLE public.exams DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pomodoro_settings DISABLE ROW LEVEL SECURITY;

-- Kendi hesabını Admin yapmak için bu satırı KENDİ EMAİL ADRESİN ile değiştir ve sadece bu satırı tekrar çalıştır!
-- Örnek: UPDATE public.profiles SET role = 'admin' WHERE email = 'benim@mailim.com';
