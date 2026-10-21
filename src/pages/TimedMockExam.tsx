import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, AlarmClock, AlertTriangle, CheckCircle2, Clock3, Play, RotateCcw } from 'lucide-react'
import Swal from 'sweetalert2'
import { supabase } from '../lib/supabase'
import { useAdminStore } from '../lib/adminStore'
import { localDayKey } from '../lib/statsPeriod'

interface MockExamOption {
  id: string
  name: string
  color?: string | null
}

interface ActiveMockExam {
  examId: string
  examName: string
  examColor: string
  title: string
  durationMinutes: number
  startedAt: number
  endsAt: number
  date: string
}

const STORAGE_PREFIX = 'studytracker-active-mock-exam:'

function isActiveMockExam(value: unknown): value is ActiveMockExam {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ActiveMockExam>
  return typeof item.examId === 'string'
    && typeof item.examName === 'string'
    && typeof item.title === 'string'
    && typeof item.durationMinutes === 'number'
    && Number.isFinite(item.durationMinutes)
    && typeof item.startedAt === 'number'
    && Number.isFinite(item.startedAt)
    && typeof item.endsAt === 'number'
    && Number.isFinite(item.endsAt)
    && typeof item.date === 'string'
}

function formatRemaining(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
}

export default function TimedMockExam() {
  const navigate = useNavigate()
  const { impersonatedUserId } = useAdminStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [exams, setExams] = useState<MockExamOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedExamId, setSelectedExamId] = useState('')
  const [title, setTitle] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('120')
  const [activeExam, setActiveExam] = useState<ActiveMockExam | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const routedToResults = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError('')
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        if (!cancelled) {
          setLoadError('Oturum bilgisi alınamadı. Lütfen tekrar giriş yap.')
          setLoading(false)
        }
        return
      }

      const targetUserId = impersonatedUserId || auth.user.id
      const { data, error } = await supabase
        .from('exams')
        .select('id, name, color')
        .eq('user_id', targetUserId)
        .order('name')

      if (cancelled) return
      setUserId(targetUserId)
      if (error) {
        setLoadError('Sınavlar yüklenirken bir hata oluştu. Lütfen tekrar dene.')
      } else {
        const availableExams = (data || []) as MockExamOption[]
        setExams(availableExams)
        if (availableExams.length) setSelectedExamId(current => current || availableExams[0].id)
      }

      try {
        const saved = localStorage.getItem(STORAGE_PREFIX + targetUserId)
        if (saved) {
          const parsed: unknown = JSON.parse(saved)
          if (isActiveMockExam(parsed)) {
            setActiveExam({
              ...parsed,
              examColor: typeof parsed.examColor === 'string' ? parsed.examColor : '#4269a8',
            })
          } else {
            localStorage.removeItem(STORAGE_PREFIX + targetUserId)
          }
        }
      } catch {
        localStorage.removeItem(STORAGE_PREFIX + targetUserId)
      }
      setNow(Date.now())
      setLoading(false)
    }

    void load()
    return () => { cancelled = true }
  }, [impersonatedUserId])

  useEffect(() => {
    if (!activeExam) return
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [activeExam])

  const remainingSeconds = activeExam
    ? Math.max(0, Math.ceil((activeExam.endsAt - now) / 1000))
    : 0
  const selectedExam = exams.find(exam => exam.id === selectedExamId)
  const progress = activeExam
    ? Math.min(100, Math.max(0, ((activeExam.durationMinutes * 60 - remainingSeconds) / (activeExam.durationMinutes * 60)) * 100))
    : 0

  const routeToQuestionEntry = useCallback((exam: ActiveMockExam) => {
    if (routedToResults.current) return
    routedToResults.current = true
    if (userId) localStorage.removeItem(STORAGE_PREFIX + userId)
    const params = new URLSearchParams({
      mockExam: '1',
      examId: exam.examId,
      title: exam.title,
      date: exam.date,
    })
    navigate(`/results?${params.toString()}`)
  }, [navigate, userId])

  useEffect(() => {
    if (activeExam && remainingSeconds === 0) routeToQuestionEntry(activeExam)
  }, [activeExam, remainingSeconds, routeToQuestionEntry])

  const startExam = () => {
    const minutes = Number(durationMinutes)
    if (!selectedExam) {
      void Swal.fire({ icon: 'warning', title: 'Sınav seç', text: 'Denemeye başlamadan önce bir sınav seçmelisin.' })
      return
    }
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) {
      void Swal.fire({ icon: 'warning', title: 'Süre geçersiz', text: 'Süre 1 ile 600 dakika arasında tam sayı olmalı.' })
      return
    }
    if (!userId) return

    const startedAt = Date.now()
    const nextExam: ActiveMockExam = {
      examId: selectedExam.id,
      examName: selectedExam.name,
      examColor: selectedExam.color || '#4269a8',
      title: title.trim() || `${selectedExam.name} Denemesi`,
      durationMinutes: minutes,
      startedAt,
      endsAt: startedAt + minutes * 60_000,
      date: localDayKey(new Date(startedAt)),
    }
    routedToResults.current = false
    try {
      localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(nextExam))
    } catch {
      void Swal.fire({
        icon: 'error',
        title: 'Deneme başlatılamadı',
        text: 'Tarayıcıya sayaç bilgisi kaydedilemedi. Tarayıcı depolama alanını kontrol edip tekrar dene.',
      })
      return
    }
    setNow(startedAt)
    setActiveExam(nextExam)
  }

  const finishEarly = async () => {
    if (!activeExam || remainingSeconds === 0) return
    const confirmation = await Swal.fire({
      title: 'Denemeyi bitirmek istiyor musun?',
      text: 'Süre tamamlanmadan bitirirsen soru giriş ekranına geçeceksin.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Bitir ve soruları gir',
      cancelButtonText: 'Denemeye dön',
      confirmButtonColor: '#4269a8',
      reverseButtons: true,
    })
    if (confirmation.isConfirmed) routeToQuestionEntry(activeExam)
  }

  const cancelExam = async () => {
    if (!activeExam || !userId) return
    const confirmation = await Swal.fire({
      title: 'Denemeyi iptal et?',
      text: 'Bu deneme için sonuç girişi açılmayacak. İptal edilen denemeyi geri getiremezsin.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Denemeyi iptal et',
      cancelButtonText: 'Devam et',
      confirmButtonColor: '#dc2626',
      reverseButtons: true,
    })
    if (!confirmation.isConfirmed) return
    localStorage.removeItem(STORAGE_PREFIX + userId)
    routedToResults.current = false
    setActiveExam(null)
    setDurationMinutes('120')
    setTitle('')
  }

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-[#718096]">Sınavlar yükleniyor…</div>
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={() => navigate('/study')} className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#62748b] transition hover:text-[#24354a]">
            <ArrowLeft size={16} /> Çalışma alanına dön
          </button>
          <p className="text-xs font-bold tracking-[0.16em] text-[#4269a8]">DENEME MODU</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#24354a]">Süreli deneme çöz</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#62748b]">
            Sınavını ve süresini seç, kronometreyi başlat. Süre dolduğunda soru sonuçlarını girebileceğin ekrana geçeceksin.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#e3e9f0] bg-white px-3 py-2 text-sm font-medium text-[#526a87] shadow-sm">
          <AlarmClock size={17} /> Sayaçlı deneme
        </div>
      </header>

      {loadError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>}

      {activeExam ? (
        <section className="overflow-hidden rounded-3xl border border-[#dce5f0] bg-white shadow-sm">
          <div className="h-1.5 w-full bg-[#e7edf5]">
            <div className="h-full transition-[width] duration-1000" style={{ width: `${progress}%`, backgroundColor: activeExam.examColor }} />
          </div>
          <div className="flex flex-col items-center px-5 py-8 text-center sm:px-10 sm:py-12">
            <span className="rounded-full px-3 py-1 text-xs font-bold tracking-wide text-white" style={{ backgroundColor: activeExam.examColor }}>
              {activeExam.examName}
            </span>
            <h2 className="mt-4 text-xl font-semibold text-[#24354a]">{activeExam.title}</h2>
            <p className="mt-2 text-sm text-[#718096]">Süre dolduğunda sonuçlarını girmek için otomatik olarak yönlendirileceksin.</p>
            <div className={`my-8 flex items-center gap-3 rounded-2xl border px-5 py-5 sm:px-10 ${remainingSeconds <= 300 ? 'border-amber-200 bg-amber-50' : 'border-[#e3e9f0] bg-[#f8fafc]'}`}>
              <Clock3 className={remainingSeconds <= 300 ? 'text-amber-600' : 'text-[#4269a8]'} size={28} />
              <span aria-live="off" aria-label={`Kalan süre ${formatRemaining(remainingSeconds)}`} className={`font-mono text-4xl font-semibold tracking-tight tabular-nums sm:text-6xl ${remainingSeconds <= 300 ? 'text-amber-700' : 'text-[#24354a]'}`}>
                {formatRemaining(remainingSeconds)}
              </span>
            </div>
            {remainingSeconds <= 300 && remainingSeconds > 0 && (
              <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-amber-700"><AlertTriangle size={16} /> Son 5 dakika!</p>
            )}
            <div className="grid w-full max-w-lg grid-cols-2 gap-3 text-left">
              <div className="rounded-xl bg-[#f8fafc] p-4"><p className="text-xs font-medium text-[#718096]">Başlangıç</p><p className="mt-1 text-sm font-semibold text-[#24354a]">{new Date(activeExam.startedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</p></div>
              <div className="rounded-xl bg-[#f8fafc] p-4"><p className="text-xs font-medium text-[#718096]">Toplam süre</p><p className="mt-1 text-sm font-semibold text-[#24354a]">{activeExam.durationMinutes} dakika</p></div>
            </div>
            <div className="mt-8 flex w-full max-w-lg flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => void finishEarly()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#4269a8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#34578f]">
                <CheckCircle2 size={17} /> Denemeyi bitir ve soruları gir
              </button>
              <button type="button" onClick={() => void cancelExam()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#e3e9f0] px-4 py-3 text-sm font-semibold text-[#62748b] transition hover:bg-[#f8fafc]">
                <RotateCcw size={16} /> İptal et
              </button>
            </div>
            <p className="mt-4 text-xs leading-5 text-[#8190a3]">Sayfadan ayrılsan veya yenilesen bile sayaç çalışmaya devam eder.</p>
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-[#dce5f0] bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf3fb] text-[#4269a8]"><AlarmClock size={22} /></div>
            <div><h2 className="text-lg font-semibold text-[#24354a]">Denemeni hazırla</h2><p className="mt-1 text-sm leading-6 text-[#718096]">Mevcut sınav kayıtların kullanılır; sınav ve soru türleri Ayarlar bölümündeki bilgilerinden alınır.</p></div>
          </div>
          {exams.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#cbd7e6] bg-[#f8fafc] p-6 text-center">
              <AlertTriangle className="mx-auto mb-3 text-[#8190a3]" size={24} />
              <p className="font-semibold text-[#24354a]">Henüz sınav tanımlanmamış</p>
              <p className="mt-1 text-sm text-[#718096]">Deneme çözmek için önce Ayarlar bölümünden bir sınav eklemelisin.</p>
              <button type="button" onClick={() => navigate('/settings')} className="mt-4 rounded-xl bg-[#4269a8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#34578f]">Ayarlara git</button>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-semibold text-[#526a87]">
                Sınav
                <select value={selectedExamId} onChange={event => setSelectedExamId(event.target.value)} className="min-h-11 rounded-xl border border-[#dce5f0] bg-white px-3 font-medium text-[#24354a] outline-none focus:border-[#4269a8] focus:ring-2 focus:ring-[#4269a8]/15">
                  {exams.map(exam => <option key={exam.id} value={exam.id}>{exam.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-[#526a87]">
                Süre (dakika)
                <input type="number" min="1" max="600" step="1" value={durationMinutes} onChange={event => setDurationMinutes(event.target.value)} inputMode="numeric" required className="min-h-11 rounded-xl border border-[#dce5f0] bg-white px-3 font-medium text-[#24354a] outline-none focus:border-[#4269a8] focus:ring-2 focus:ring-[#4269a8]/15" />
                <span className="text-xs font-normal text-[#8190a3]">1–600 dakika arasında bir süre gir.</span>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-[#526a87] md:col-span-2">
                Deneme adı <span className="font-normal text-[#8190a3]">(isteğe bağlı)</span>
                <input value={title} onChange={event => setTitle(event.target.value)} maxLength={100} placeholder={selectedExam ? `${selectedExam.name} Denemesi` : 'Örn. Yayın adı / deneme numarası'} className="min-h-11 rounded-xl border border-[#dce5f0] bg-white px-3 font-medium text-[#24354a] outline-none focus:border-[#4269a8] focus:ring-2 focus:ring-[#4269a8]/15" />
              </label>
              <div className="rounded-2xl bg-[#f8fafc] p-4 md:col-span-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-[#24354a]"><Clock3 size={16} className="text-[#4269a8]" /> Başlamaya hazır mısın?</p>
                <p className="mt-1 text-sm leading-6 text-[#718096]">Başlat düğmesine bastığında süre hemen işlemeye başlar. Süre sonunda doğru ve yanlış sayılarını soru türlerine göre kaydedeceksin.</p>
              </div>
              <div className="md:col-span-2">
                <button type="button" onClick={startExam} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#4269a8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#34578f] sm:w-auto">
                  <Play size={17} fill="currentColor" /> Denemeyi başlat
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
