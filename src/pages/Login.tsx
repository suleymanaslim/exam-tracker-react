import './Login.css'
import { useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    setError(null)
    try {
      const response = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (response.error) setError('Giriş yapılamadı. E-posta ve şifreni kontrol edip yeniden dene.')
    } catch {
      setError('Bağlantı kurulamadı. Lütfen yeniden dene.')
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <section className="login-intro" aria-label="StudyTracker">
          <div className="login-brand"><img src="/studytracker-logo.png" width="44" height="44" alt="" /><div><strong>StudyTracker</strong><span>Çalışma alanın</span></div></div>
          <div className="login-intro-message"><span className="login-eyebrow">KENDİ RİTMİNDE İLERLE</span><h2>Her gün,<br />bir adım ileri.</h2><p>Planın, odağın ve gelişimin<br />aynı yerde.</p></div>
          <div className="login-intro-footer"><span className="login-brand-dot" /> Bugün kendine zaman ayır.</div>
        </section>

        <section className="login-form-panel" aria-labelledby="login-title">
          <header><h1 id="login-title">Hoş geldin</h1><p>Çalışma alanına giriş yap.</p></header>
          <form onSubmit={handleLogin} aria-busy={loading}>
            <div className="login-field"><label htmlFor="login-email">E-posta</label><div className="login-input-wrap"><Mail size={18} aria-hidden="true" /><input id="login-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required disabled={loading} placeholder="E-posta adresin" value={email} onChange={event => setEmail(event.target.value)} aria-describedby={error ? 'login-error' : undefined} /></div></div>
            <div className="login-field"><label htmlFor="login-password">Şifre</label><div className="login-input-wrap"><LockKeyhole size={18} aria-hidden="true" /><input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required disabled={loading} placeholder="Şifren" value={password} onChange={event => setPassword(event.target.value)} aria-describedby={error ? 'login-error' : undefined} /><button className="login-password-toggle" type="button" disabled={loading} aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
            {error && <p id="login-error" className="login-error" role="alert">{error}</p>}
            <button type="submit" disabled={loading} className="login-submit">{loading ? <><LoaderCircle size={19} className="login-spinner" /> Giriş yapılıyor…</> : <>Giriş yap <ArrowRight size={18} aria-hidden="true" /></>}</button>
          </form>
        </section>
      </div>
    </main>
  )
}
