import './AppLayout.css'
import '@fontsource/source-sans-3/latin-ext-400.css'
import '@fontsource/source-sans-3/latin-ext-600.css'
import '@fontsource/source-sans-3/latin-400.css'
import '@fontsource/source-sans-3/latin-600.css'
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Suspense, lazy, useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, Calendar, CalendarDays, Timer, History,
  BarChart3, Settings, LogOut,
  BookMarked, Award, PlayCircle, BookOpenCheck, ListChecks
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { preloadRoute } from '../lib/routes'
import RouteBoundary from './RouteBoundary'
import { useTimerStore } from '../lib/timerStore'
import { useAdminStore } from '../lib/adminStore'
import { ShieldAlert } from 'lucide-react'
import { useMonthlyPlanAccess } from '../lib/useMonthlyPlanAccess'
import { useMockExamRuntime } from '../lib/useMockExamRuntime'
import { useMockExamStore } from '../lib/mockExamStore'
import { formatMockDuration, mockExamTime } from '../lib/mockExamSession'
import { ADHD_CHANGED_EVENT, readAdhdEnabled } from '../lib/adhdMode'

const AdhdToday = lazy(() => import('../pages/AdhdToday'))
const adhdCacheKey = (userId: string) => `adhd-mode:${userId}`
function cachedAdhd(userId: string) {
  try { const value = localStorage.getItem(adhdCacheKey(userId)); return value === null ? null : value === '1' } catch { return null }
}

const navItems = [
  { href: '/',          label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/plan',      label: 'Haftalık Plan', icon: Calendar },
  { href: '/study',     label: 'Çalışma',       icon: Timer },
  { href: '/topics',    label: 'Konular',        icon: BookMarked },
  { href: '/history',   label: 'Geçmiş',        icon: History },
  { href: '/results',   label: 'Denemeler',      icon: Award },
  { href: '/videos',    label: 'Video Planı',    icon: PlayCircle },
  { href: '/questions', label: 'Soru Planı',     icon: BookOpenCheck },
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

function MockRuntime({ ownerId }: { ownerId: string | null }) {
  useMockExamRuntime(ownerId)
  return null
}

function StudyTimerBadge({ mobile = false }: { mobile?: boolean }) {
  const isRunning = useTimerStore(state => state.isRunning)
  const secondsLeft = useTimerStore(state => state.secondsLeft)
  const mode = useTimerStore(state => state.mode)
  if (!isRunning) return null
  const label = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`
  return <Link to="/study" className={mobile ? 'app-timer app-timer-mobile' : 'app-timer'} aria-label={`Çalışmaya dön, ${mode === 'stopwatch' ? 'çalışılan süre' : 'kalan süre'} ${label}`}><span className="app-timer-dot" /><span>{label}</span></Link>
}

function MockExamBadge() {
  const { active: mockExam, now } = useMockExamStore()
  const { pathname } = useLocation()
  if (!mockExam || pathname === '/timed-mock-exam' || (mockExam.recorded && pathname === '/results')) return null
  const time = mockExamTime(mockExam, now)
  return <Link to={mockExam.recorded ? '/results' : '/timed-mock-exam'} className="app-mock-return" aria-label={`${mockExam.title}, ${mockExam.recorded ? 'sonuçları gir' : 'denemeye dön'}`}>
    <Timer size={17} aria-hidden="true" />
    <span className="app-mock-return-title"><strong>{mockExam.title}</strong><span>{mockExam.recorded ? 'Sonuç girişi bekliyor' : mockExam.finishedAt !== undefined ? 'Süre kaydı bekliyor' : 'Deneme devam ediyor'}</span></span>
    <span className="app-mock-return-clock">{formatMockDuration(mockExam.mode === 'countdown' ? time.remaining ?? 0 : time.elapsed)}</span>
    <span className="app-mock-return-action">{mockExam.recorded ? 'Sonuçları gir' : 'Denemeye dön'}</span>
  </Link>
}

export default function AppLayout({ userId }: { userId: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [expanded, setExpanded] = useState(false)
  const sidebarTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleSidebar = (open: boolean, delay: number) => {
    if (sidebarTimer.current) clearTimeout(sidebarTimer.current)
    sidebarTimer.current = setTimeout(() => setExpanded(open), delay)
  }
  useEffect(() => () => { if (sidebarTimer.current) clearTimeout(sidebarTimer.current) }, [])
  const { isAdmin: storedIsAdmin, impersonatedUserId, setIsAdmin, setImpersonatedUserId } = useAdminStore()

  const requestedImpersonation = searchParams.get('impersonate')
  const [roleAccount, setRoleAccount] = useState<string | null>(null)
  const isAdmin = roleAccount === userId && storedIsAdmin
  // Only impersonation/admin routes need a role check before mounting their contents.
  const contextReady = roleAccount === userId || (!impersonatedUserId && !requestedImpersonation && location.pathname !== '/admin' && location.pathname !== '/adhd-plan')
  const navPath = location.pathname === '/timed-mock-exam' ? '/study' : location.pathname
  const { plans: monthlyPlans } = useMonthlyPlanAccess()
  const canViewMonthlyPlan = isAdmin || monthlyPlans.length > 0

  useEffect(() => {
    let cancelled = false
    void supabase.from('profiles').select('id,role,display_name,email').eq('id', userId).maybeSingle().then(result => {
      if (cancelled) return
      const admin = !result.error && result.data?.role === 'admin'
      setIsAdmin(admin)
      if (!admin) setImpersonatedUserId(null)
      else if (requestedImpersonation) setImpersonatedUserId(requestedImpersonation)
      setRoleAccount(userId)
    })
    return () => { cancelled = true }
  }, [userId, requestedImpersonation, setIsAdmin, setImpersonatedUserId])

  // DEHB modu: son bilinen değer anında kullanılır, arkada sunucudan doğrulanır.
  const [adhd, setAdhd] = useState<{ owner: string; enabled: boolean | null }>(() => ({ owner: userId, enabled: cachedAdhd(userId) }))
  useEffect(() => {
    let active = true
    const check = () => readAdhdEnabled(userId).then(enabled => {
      if (!active) return
      setAdhd({ owner: userId, enabled })
      try { localStorage.setItem(adhdCacheKey(userId), enabled ? '1' : '0') } catch { /* optional cache */ }
    }, () => { if (active) setAdhd(previous => previous.owner === userId && previous.enabled !== null ? previous : { owner: userId, enabled: false }) })
    void check()
    window.addEventListener('focus', check); window.addEventListener(ADHD_CHANGED_EVENT, check)
    return () => { active = false; window.removeEventListener('focus', check); window.removeEventListener(ADHD_CHANGED_EVENT, check) }
  }, [userId])
  const adhdEnabled = adhd.owner === userId ? adhd.enabled : null

  // Admin "Hesaba Gir" ile DEHB modundaki bir kişiye girdiğinde o kişinin DEHB ekranını görür.
  const viewedUserId = isAdmin ? impersonatedUserId : null
  const [viewedAdhd, setViewedAdhd] = useState<{ owner: string | null; enabled: boolean | null }>({ owner: null, enabled: null })
  const [fullViewFor, setFullViewFor] = useState<string | null>(null)
  useEffect(() => {
    if (!viewedUserId) return
    let active = true
    const check = () => readAdhdEnabled(viewedUserId).then(enabled => { if (active) setViewedAdhd({ owner: viewedUserId, enabled }) }, () => { if (active) setViewedAdhd({ owner: viewedUserId, enabled: false }) })
    void check()
    window.addEventListener(ADHD_CHANGED_EVENT, check)
    return () => { active = false; window.removeEventListener(ADHD_CHANGED_EVENT, check) }
  }, [viewedUserId])
  const viewedIsAdhd = Boolean(viewedUserId) && viewedAdhd.owner === viewedUserId && viewedAdhd.enabled === true
  const showViewedAdhd = viewedIsAdhd && fullViewFor !== viewedUserId

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setIsAdmin(false)
    setImpersonatedUserId(null)
    navigate('/login')
  }

  // Admin her zaman tam paneli görür; DEHB modu yalnızca kullanıcının kendi oturumunda açılır.
  if (adhdEnabled === null && !storedIsAdmin) return <div className="flex h-dvh items-center justify-center text-slate-500" role="status">Yükleniyor…</div>
  if (adhdEnabled && !storedIsAdmin) {
    return <div className="adhd-shell"><Suspense fallback={<div className="route-loading" role="status">Hazırlanıyor…</div>}><AdhdToday userId={userId} onLogout={handleLogout} /></Suspense></div>
  }
  if (viewedUserId && viewedAdhd.owner !== viewedUserId) return <div className="flex h-dvh items-center justify-center text-slate-500" role="status">Hesap yükleniyor…</div>
  if (viewedUserId && showViewedAdhd) {
    return <div className="adhd-shell">
      <div className="adhd-admin-banner" role="region" aria-label="Admin görünümü">
        <span><strong>Admin görünümü</strong> · Kişinin gördüğü DEHB ekranı</span>
        <span className="adhd-admin-banner-actions">
          <button type="button" onClick={() => { setImpersonatedUserId(null); navigate(`/adhd-plan?user=${viewedUserId}`) }}>Planı düzenle</button>
          <button type="button" onClick={() => setFullViewFor(viewedUserId)}>Tam görünüm</button>
          <button type="button" onClick={() => { setImpersonatedUserId(null); navigate('/admin') }}>Kendi hesabıma dön</button>
        </span>
      </div>
      <Suspense fallback={<div className="route-loading" role="status">Hazırlanıyor…</div>}><AdhdToday key={viewedUserId} userId={viewedUserId} /></Suspense>
    </div>
  }

  return (
    <div className="app-shell flex h-dvh w-full overflow-hidden bg-[#f0f4f8]">
      <MockRuntime ownerId={contextReady ? impersonatedUserId || userId : null} />
      <aside className={`app-sidebar ${expanded ? 'is-expanded' : 'is-collapsed'}`} onMouseEnter={() => scheduleSidebar(true, 120)} onMouseLeave={() => scheduleSidebar(false, 320)} onFocus={() => scheduleSidebar(true, 0)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) scheduleSidebar(false, 320) }}>
        <div className="app-brand"><img className="app-brand-image" src="/studytracker-logo.png" alt="StudyTracker logosu" width="36" height="36" /><div className="app-nav-label"><strong>StudyTracker</strong><span>Çalışma alanın</span></div></div>

        <StudyTimerBadge />
        <nav className="app-nav" aria-label="Ana gezinme">
          <p className="app-nav-caption app-nav-label">ÇALIŞMA ALANI</p>
          {navItems.map(item => <Link key={item.href} to={item.href} onMouseEnter={() => preloadRoute(item.href)} onFocus={() => preloadRoute(item.href)} title={item.label} aria-label={item.label} aria-current={navPath === item.href ? 'page' : undefined} className={`app-nav-link ${navPath === item.href ? 'is-active' : ''}`}><item.icon size={19} /><span className="app-nav-label">{item.label}</span></Link>)}
          {canViewMonthlyPlan && <Link to="/monthly-plan" title="Aylık Plan" aria-label="Aylık Plan" aria-current={location.pathname === '/monthly-plan' ? 'page' : undefined} className={`app-nav-link ${location.pathname === '/monthly-plan' ? 'is-active' : ''}`}><CalendarDays size={19} /><span className="app-nav-label">Aylık Plan</span></Link>}
          {isAdmin && <Link to="/adhd-plan" title="DEHB Haftalık Plan" aria-label="DEHB Haftalık Plan" aria-current={location.pathname === '/adhd-plan' ? 'page' : undefined} className={`app-nav-link ${location.pathname === '/adhd-plan' ? 'is-active' : ''}`}><ListChecks size={19} /><span className="app-nav-label">DEHB Planı</span></Link>}
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
            <StudyTimerBadge mobile />
          </div>
        )}

        {isAdmin && impersonatedUserId && (
          <div className="shrink-0 border-b border-indigo-200 bg-indigo-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-indigo-900">Kullanıcı hesabını görüntülüyorsun</span>
              {viewedIsAdhd && <button className="min-h-9 rounded-lg border border-indigo-200 bg-white px-3 font-semibold text-indigo-700" onClick={() => setFullViewFor(null)}>DEHB görünümüne dön</button>}
              <button className="min-h-9 rounded-lg border border-indigo-200 bg-white px-3 font-semibold text-indigo-700" onClick={() => { setImpersonatedUserId(null); navigate('/admin') }}>Kendi hesabıma dön</button>
            </div>
            <nav aria-label="Kullanıcı hesabı sayfaları" className="mt-2 flex flex-wrap gap-1">
              {navItems.filter(item => item.href !== '/settings' && item.href !== '/study').map(item => <Link key={item.href} to={item.href} onMouseEnter={() => preloadRoute(item.href)} onFocus={() => preloadRoute(item.href)} className={`rounded-lg px-3 py-2 text-xs font-medium ${navPath === item.href ? 'bg-indigo-600 text-white' : 'text-indigo-700 hover:bg-indigo-100'}`}>{item.label}</Link>)}
            </nav>
          </div>
        )}
        <MockExamBadge />
        <div className="flex-1 overflow-auto p-4 md:p-5 pb-20 md:pb-5">
          <RouteBoundary key={location.pathname}><Suspense fallback={<div className="route-loading" role="status">Sayfa hazırlanıyor…</div>}>{contextReady ? <Outlet key={impersonatedUserId || userId} /> : <p className="p-4 text-sm text-slate-500">Hesap yükleniyor…</p>}</Suspense></RouteBoundary>
        </div>
      </main>

      {/* ── Mobile Bottom Navigation ──────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 app-mobile-nav flex items-center justify-around px-1 py-1.5 z-50" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 6px)' }}>
        {mobileNavItems.map((item) => {
          const isActive = navPath === item.href
          return (
            <Link
              key={item.href}
              to={item.href} onMouseEnter={() => preloadRoute(item.href)} onFocus={() => preloadRoute(item.href)}
              className={`flex flex-col items-center justify-center gap-1 px-1 rounded-xl transition-all min-w-0 flex-1 h-12 ${
                isActive ? 'text-[#4269a8] bg-[#edf2f8]' : 'text-[#617187] hover:text-[#4269a8]'
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="text-[10px] font-semibold leading-none text-center whitespace-nowrap">{item.label}</span>
            </Link>
          )
        })}
        {!isAdmin && monthlyPlans.length > 0 && <Link to="/monthly-plan" className={`flex flex-col items-center justify-center gap-1 px-1 rounded-xl transition-all min-w-0 flex-1 h-12 ${location.pathname === '/monthly-plan' ? 'text-[#4269a8] bg-[#edf2f8]' : 'text-[#617187]'}`}><CalendarDays className="h-5 w-5 shrink-0" /><span className="text-[10px] font-semibold leading-none whitespace-nowrap">Aylık Plan</span></Link>}
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
