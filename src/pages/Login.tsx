import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { GraduationCap, Lock, Mail } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    }
    setLoading(false)
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#0a1628]">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
        backgroundSize: '40px 40px'
      }} />

      <div className="relative z-10 w-full max-w-[400px] mx-4">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm mb-4 border border-white/10">
            <GraduationCap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Hoş Geldin, Süleyman
          </h1>
          <p className="text-sm text-blue-300/60 mt-1">
            Sınav Takip Sistemine giriş yap
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-blue-200/80">
                E-posta
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300/40" />
                <input
                  type="email"
                  required
                  placeholder="suleyman@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-3 py-2 text-sm text-white placeholder:text-blue-300/30 focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-transparent transition-all"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-blue-200/80">
                Şifre
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300/40" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-3 py-2 text-sm text-white placeholder:text-blue-300/30 focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-sm text-red-400">
                <span>Giriş yapılamadı. Bilgilerinizi kontrol edin.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#0a1628] transition-all hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-white/40 disabled:pointer-events-none disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Giriş yapılıyor...
                </span>
              ) : 'Giriş Yap'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
