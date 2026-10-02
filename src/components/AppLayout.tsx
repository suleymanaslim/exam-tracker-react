import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Calendar, Timer, History,
  BarChart3, Settings, LogOut, GraduationCap,
  BookMarked, ChevronRight, Award, PlayCircle
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
    <div className="flex h-dvh w-full overflow-hidden bg-[#f0f4f8]">
      {/* ── Sidebar (Desktop Only) ─────────────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col shrink-0 bg-[#0a1628] transition-all duration-300 ${expanded ? 'w-[200px]' : 'w-[60px]'} relative group`}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-[14px] py-4 border-b border-white/10 overflow-hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 shrink-0">
            <GraduationCap className="h-4 w-4 text-white" />
          </div>
          <div className={`transition-all duration-200 overflow-hidden ${expanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
            <h1 className="text-[13px] font-bold tracking-tight leading-none text-white whitespace-nowrap">StudyTracker</h1>
            <p className="text-[10px] text-blue-300/60 mt-0.5 whitespace-nowrap">Süleyman'ın Paneli</p>
          </div>
        </div>

        {/* Timer pill — sadece çalışırken */}
        {isRunning && (
          <div className={`mx-2 mt-2 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center gap-2 px-2 py-1.5 overflow-hidden`}>
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <span className={`text-blue-300 text-[11px] font-mono font-bold transition-all duration-200 ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>
              {timerMM}:{timerSS}
            </span>
            {!expanded && <span className="text-blue-300 text-[9px] font-mono font-bold">{timerMM}</span>}
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-hidden">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                title={!expanded ? item.label : undefined}
                className={`flex items-center gap-3 rounded-lg px-[10px] py-2.5 transition-all duration-150 overflow-hidden ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/50 hover:bg-white/8 hover:text-white'
                }`}
              >
                <item.icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-blue-300' : ''}`} />
                <span className={`text-[13px] font-medium whitespace-nowrap transition-all duration-200 ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>
                  {item.label}
                </span>
              </Link>
            )
          })}
          {isAdmin && (
            <Link
              to="/admin"
              title={!expanded ? 'Admin Paneli' : undefined}
              className={`flex items-center gap-3 rounded-lg px-[10px] py-2.5 transition-all duration-150 overflow-hidden mt-4 border border-indigo-500/30 ${
                location.pathname === '/admin'
                  ? 'bg-indigo-500/20 text-indigo-300'
                  : 'text-indigo-400/60 hover:bg-indigo-500/10 hover:text-indigo-300'
              }`}
            >
              <ShieldAlert className="h-[18px] w-[18px] shrink-0" />
              <span className={`text-[13px] font-medium whitespace-nowrap transition-all duration-200 ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>
                Admin Paneli
              </span>
            </Link>
          )}
        </nav>

        {/* Expand hint */}
        <div className={`absolute right-[-10px] top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-[#1e3a5f] border border-white/10 flex items-center justify-center transition-all duration-300 ${expanded ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>
          <ChevronRight className="h-3 w-3 text-white/50" />
        </div>

        {/* Logout */}
        <div className="px-2 py-3 border-t border-white/10">
          <button
            onClick={handleLogout}
            title={!expanded ? 'Çıkış Yap' : undefined}
            className="flex w-full items-center gap-3 rounded-lg px-[10px] py-2.5 text-red-400/70 transition-all hover:bg-red-500/10 hover:text-red-400 overflow-hidden"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            <span className={`text-[13px] font-medium whitespace-nowrap transition-all duration-200 ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>
              Çıkış Yap
            </span>
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        {/* Mobile Top Bar */}
        {location.pathname === '/' && (
          <div className="md:hidden flex items-center justify-between px-4 py-3 bg-[#0a1628] border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
                <GraduationCap className="h-4 w-4 text-white" />
              </div>
              <span className="text-[14px] font-bold text-white">StudyTracker</span>
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0a1628] border-t border-white/10 flex items-center justify-around px-1 py-1.5 z-50" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 6px)' }}>
        {mobileNavItems.map((item) => {
          const isActive = location.pathname === item.href
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex flex-col items-center justify-center gap-1 px-1 rounded-xl transition-all min-w-0 flex-1 h-12 ${
                isActive ? 'text-blue-300 bg-white/10' : 'text-white/50 hover:text-white'
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="text-[9px] font-semibold leading-none text-center whitespace-nowrap">{item.label}</span>
            </Link>
          )
        })}
        {isAdmin && (
          <Link
            to="/admin"
            className={`flex flex-col items-center justify-center gap-1 px-1 rounded-xl transition-all min-w-0 flex-1 h-12 ${
              location.pathname === '/admin' ? 'text-indigo-300 bg-indigo-500/20' : 'text-indigo-400/60 hover:text-indigo-300'
            }`}
          >
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span className="text-[9px] font-semibold leading-none text-center whitespace-nowrap">Admin</span>
          </Link>
        )}
      </nav>
    </div>
  )
}
