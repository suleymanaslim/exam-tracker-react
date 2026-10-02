CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Disable Row Level Security so everyone/admin can read/write directly
ALTER TABLE public.system_settings DISABLE ROW LEVEL SECURITY;
