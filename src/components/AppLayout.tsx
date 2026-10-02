import './AppLayout.css'
import '@fontsource/source-sans-3/latin-ext-400.css'
import '@fontsource/source-sans-3/latin-ext-600.css'
import '@fontsource/source-sans-3/latin-400.css'
import '@fontsource/source-sans-3/latin-600.css'
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Calendar, Timer, History,
  BarChart3, Settings, LogOut,
  BookMarked, Award, PlayCircle
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTimerStore } from '../lib/timerStore'
import { useAdminStore } from '../lib/adminStore'
import { ShieldAlert } from 'lucide-react'

const navItems = [
  { href: '/',          label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/plan',      label: 'Haftalık Plan', icon: Calendar },
  { href: '/study',     label: 'Çalışma',       icon: Timer },
  { href: '/topics',    label: 'Konular',        icon: BookMarked },
  { href: '/history',   label: 'Geçmiş',        icon: History },
  { href: '/results',   label: 'Denemeler',      icon: Award },
  { href: '/videos',    label: 'Video Planı',    icon: PlayCircle },
  { href: '/stats',     label: 'İstatistikler',  icon: BarChart3 },
  { href: '/settings',  label: 'Ayarlar',        icon: Settings },
]

// Mobilden kaldırılan sayfalar: Konular, Geçmiş
const mobileNavItems = [
  { href: '/',          label: 'Ana Sayfa',     icon: LayoutDashboard },
  { href: '/study',     label: 'Çalış',         icon: Timer },
  { href: '/results',   label: 'Denemeler',     icon: Award },
  { href: '/videos',    label: 'Videolar',      icon: PlayCircle },
  { href: '/stats',     label: 'İstatistik',    icon: BarChart3 },
  { href: '/settings',  label: 'Ayarlar',       icon: Settings },
]

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [expanded, setExpanded] = useState(false)
  const { isRunning, secondsLeft } = useTimerStore()
  const { isAdmin, impersonatedUserId, setIsAdmin, setImpersonatedUserId } = useAdminStore()

  const [contextReady, setContextReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('role').eq('id', user.id).single().then(r => {
          if (cancelled) return
          const isUserAdmin = r.data?.role === 'admin'
          setIsAdmin(isUserAdmin)
          
          if (!isUserAdmin) setImpersonatedUserId(null)
          if (isUserAdmin) {
            const impId = searchParams.get('impersonate')
            if (impId) {
              setImpersonatedUserId(impId)
            }
          }
          setContextReady(true)
        })
      } else {
        setImpersonatedUserId(null)
        setContextReady(true)
      }
    })
    return () => { cancelled = true }
  }, [setIsAdmin, searchParams, setImpersonatedUserId])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setIsAdmin(false)
    setImpersonatedUserId(null)
    navigate('/login')
  }

  const timerMM = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const timerSS = String(secondsLeft % 60).padStart(2, '0')

  return (
    <div className="app-shell flex h-dvh w-full overflow-hidden bg-[#f0f4f8]">
      <aside className={`app-sidebar ${expanded ? 'is-expanded' : 'is-collapsed'}`} onMouseEnter={() => setExpanded(true)} onMouseLeave={e => { if (!e.currentTarget.contains(document.activeElement)) setExpanded(false) }} onFocus={() => setExpanded(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setExpanded(false) }}>
        <div className="app-brand"><img className="app-brand-image" src="/studytracker-logo.png" alt="StudyTracker logosu" width="36" height="36" /><div className="app-nav-label"><strong>StudyTracker</strong><span>Çalışma alanın</span></div></div>

        {isRunning && <Link to="/study" className="app-timer" aria-label={`Çalışmaya dön, kalan süre ${timerMM}:${timerSS}`}><span className="app-timer-dot" /><span>{timerMM}:{timerSS}</span></Link>}
        <nav className="app-nav" aria-label="Ana gezinme">
          <p className="app-nav-caption app-nav-label">ÇALIŞMA ALANI</p>
          {navItems.map(item => <Link key={item.href} to={item.href} title={item.label} aria-label={item.label} aria-current={location.pathname === item.href ? 'page' : undefined} className={`app-nav-link ${location.pathname === item.href ? 'is-active' : ''}`}><item.icon size={19} /><span className="app-nav-label">{item.label}</span></Link>)}
          {isAdmin && <Link to="/admin" title="Admin Paneli" aria-label="Admin Paneli" aria-current={location.pathname === '/admin' ? 'page' : undefined} className={`app-nav-link app-admin-link ${location.pathname === '/admin' ? 'is-active' : ''}`}><ShieldAlert size={19} /><span className="app-nav-label">Admin Paneli</span></Link>}
        </nav>
        <div className="app-sidebar-footer"><button onClick={handleLogout} title="Çıkış Yap" aria-label="Çıkış Yap" className="app-nav-link app-logout"><LogOut size={19} /><span className="app-nav-label">Çıkış Yap</span></button></div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        {/* Mobile Top Bar */}
        {location.pathname === '/' && (
          <div className="md:hidden flex items-center justify-between px-4 py-3 app-mobile-header shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#edf2f8]">
                <img src="/studytracker-logo.png" alt="" className="h-7 w-7 rounded-lg" />
              </div>
              <span className="text-[16px] font-semibold text-[#24354a]">StudyTracker</span>
            </div>
            {isRunning && (
              <div className="flex items-center gap-1.5 bg-blue-500/20 border border-blue-400/30 rounded-lg px-2.5 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-blue-300 text-[12px] font-mono font-bold">{timerMM}:{timerSS}</span>
              </div>
            )}
          </div>
        )}

        {isAdmin && impersonatedUserId && (
          <div className="shrink-0 border-b border-indigo-200 bg-indigo-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-indigo-900">Kullanıcı hesabını görüntülüyorsun</span>
              <button className="min-h-9 rounded-lg border border-indigo-200 bg-white px-3 font-semibold text-indigo-700" onClick={() => { setImpersonatedUserId(null); navigate('/admin') }}>Kendi hesabıma dön</button>
            </div>
            <nav aria-label="Kullanıcı hesabı sayfaları" className="mt-2 flex flex-wrap gap-1">
              {navItems.filter(item => item.href !== '/settings' && item.href !== '/study').map(item => <Link key={item.href} to={item.href} className={`rounded-lg px-3 py-2 text-xs font-medium ${location.pathname === item.href ? 'bg-indigo-600 text-white' : 'text-indigo-700 hover:bg-indigo-100'}`}>{item.label}</Link>)}
            </nav>
          </div>
        )}
        <div className="flex-1 overflow-auto p-4 md:p-5 pb-20 md:pb-5">
          <>{contextReady ? <Outlet key={impersonatedUserId || 'self'} /> : <p className="p-4 text-sm text-slate-500">Hesap yükleniyor…</p>}</>
        </div>
      </main>

      {/* ── Mobile Bottom Navigation ──────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 app-mobile-nav flex items-center justify-around px-1 py-1.5 z-50" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 6px)' }}>
        {mobileNavItems.map((item) => {
          const isActive = location.pathname === item.href
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex flex-col items-center justify-center gap-1 px-1 rounded-xl transition-all min-w-0 flex-1 h-12 ${
                isActive ? 'text-[#4269a8] bg-[#edf2f8]' : 'text-[#617187] hover:text-[#4269a8]'
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="text-[10px] font-semibold leading-none text-center whitespace-nowrap">{item.label}</span>
            </Link>
          )
        })}
        {isAdmin && (
          <Link
            to="/admin"
            className={`flex flex-col items-center justify-center gap-1 px-1 rounded-xl transition-all min-w-0 flex-1 h-12 ${
              location.pathname === '/admin' ? 'text-[#4269a8] bg-[#edf2f8]' : 'text-[#617187]'
            }`}
          >
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span className="text-[10px] font-semibold leading-none text-center whitespace-nowrap">Admin</span>
          </Link>
        )}
      </nav>
    </div>
  )
}
