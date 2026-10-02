import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Swal from 'sweetalert2'
import {
  History as HistoryIcon, Pencil, Trash2, Check,
  Clock, Shield, Globe, BookOpen, Calculator, Target
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAdminStore } from '../lib/adminStore'

interface Session {
  id: string; subject_id: string | null; resource_id: string | null
  session_type: string; started_at: string; ended_at: string
  duration_minutes: number; note: string | null; is_edited: boolean
}
interface Subject { id: string; exam_id: string; name: string }
interface Exam { id: string; name: string; color: string }
interface Resource { id: string; subject_id: string; name: string }

const examIcons: Record<string, LucideIcon> = {
  AGS: Shield, YDS: Globe, IELTS: BookOpen, ALES: Calculator,
}
const typeLabels: Record<string, string> = {
  pomodoro_long: 'Uzun Pomodoro',
  pomodoro_short: 'Kısa Pomodoro',
  manual: 'Manuel',
}

interface EditState {
  id: string
  duration_minutes: number
  note: string
  subject_id: string
  resource_id: string
}

export default function History() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [edit, setEdit] = useState<EditState | null>(null)

  const { impersonatedUserId } = useAdminStore()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const targetUid = impersonatedUserId || user.id
        loadSessions(targetUid)
        supabase.from('exams').select('*').eq('user_id', targetUid).then(r => { if (r.data) setExams(r.data as Exam[]) })
        supabase.from('subjects').select('*').eq('user_id', targetUid).then(r => { if (r.data) setSubjects(r.data as Subject[]) })
        supabase.from('resources').select('*').eq('user_id', targetUid).then(r => { if (r.data) setResources(r.data as Resource[]) })
      }
    })
  }, [impersonatedUserId])

  const loadSessions = async (uid: string) => {
    const { data } = await supabase.from('study_sessions').select('*').eq('user_id', uid).order('started_at', { ascending: false }).limit(100)
    if (data) setSessions(data as Session[])
  }

  const subjectToExam = useMemo(() => {
    const map: Record<string, string> = {}
    subjects.forEach(s => { map[s.id] = s.exam_id })
    return map
  }, [subjects])

  const getExam = (subjectId: string | null) => {
    if (!subjectId) return null
    return exams.find(e => e.id === subjectToExam[subjectId]) ?? null
  }
  const getSubjectName = (id: string | null) => subjects.find(s => s.id === id)?.name ?? '-'
  const getResourceName = (id: string | null) => {
    if (!id) return '-'
    return resources.find(r => r.id === id)?.name ?? '-'
  }

  const handleDelete = async (id: string) => {
    const res = await Swal.fire({
      title: 'Kaydı Sil',
      text: 'Bu çalışma kaydını silmek istediğinize emin misiniz?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Evet, Sil',
      cancelButtonText: 'İptal'
    })
    if (!res.isConfirmed) return
    await supabase.from('study_sessions').delete().eq('id', id)
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  const startEdit = (s: Session) => {
    setEdit({
      id: s.id,
      duration_minutes: s.duration_minutes,
      note: s.note ?? '',
      subject_id: s.subject_id ?? '',
      resource_id: s.resource_id ?? '',
    })
  }

  const saveEdit = async () => {
    if (!edit) return
    const session = sessions.find(s => s.id === edit.id)
    if (!session) return

    const newEnd = new Date(new Date(session.started_at).getTime() + edit.duration_minutes * 60000)
    await supabase.from('study_sessions').update({
      duration_minutes: edit.duration_minutes,
      ended_at: newEnd.toISOString(),
      note: edit.note || null,
      subject_id: edit.subject_id || null,
      resource_id: edit.resource_id || null,
      is_edited: true,
    }).eq('id', edit.id)

    setSessions(prev => prev.map(s => s.id === edit.id ? {
      ...s,
      duration_minutes: edit.duration_minutes,
      ended_at: newEnd.toISOString(),
      note: edit.note || null,
      subject_id: edit.subject_id || null,
      resource_id: edit.resource_id || null,
      is_edited: true,
    } : s))
    setEdit(null)
    await Swal.fire({ icon: 'success', title: 'Kaydedildi', text: 'Çalışma kaydı güncellendi.', timer: 1800, showConfirmButton: false })
  }

  const cancelEdit = () => setEdit(null)

  const formatTime = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { weekday: 'short', day: '2-digit', month: 'short' })

  // Editing için filtrelenmiş listeler
  const editSubjectExam = edit ? subjects.find(s => s.id === edit.subject_id)?.exam_id ?? '' : ''
  const editFilteredSubjects = subjects.filter(s => s.exam_id === editSubjectExam || !editSubjectExam)
  const editFilteredResources = resources.filter(r => r.subject_id === edit?.subject_id)

  // Grupla: tarihe göre
  const grouped = useMemo(() => {
    const groups: Record<string, Session[]> = {}
    sessions.forEach(s => {
      const d = s.started_at.split('T')[0]
      if (!groups[d]) groups[d] = []
      groups[d].push(s)
    })
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [sessions])

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-lg font-bold text-[#0f172a] flex items-center gap-2">
          <HistoryIcon className="h-5 w-5 text-[#2563eb]" /> Çalışma Geçmişi
        </h1>
        <p className="text-[12px] text-[#64748b]">Tüm çalışma kayıtlarını incele, ders/kaynak düzenle veya sil.</p>
      </div>

      {/* Edit Modal */}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={cancelEdit}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-[#0a1628] px-6 py-4">
              <h2 className="text-white font-bold text-base flex items-center gap-2">
                <Pencil className="h-4 w-4" /> Kaydı Düzenle
              </h2>
              <p className="text-[#94a3b8] text-[12px] mt-0.5">Ders, kaynak, süre veya notu güncelleyebilirsin.</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Sınav Seçimi */}
              <div>
                <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Sınav</label>
                <select
                  value={editSubjectExam}
                  onChange={e => {
                    // Sınavı değiştirince ders ve kaynağı sıfırla
                    const firstSub = subjects.find(s => s.exam_id === e.target.value)
                    setEdit(prev => prev ? { ...prev, subject_id: firstSub?.id ?? '', resource_id: '' } : prev)
                  }}
                  className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                >
                  <option value="">Sınav seç...</option>
                  {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              {/* Ders Seçimi */}
              <div>
                <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Ders</label>
                <select
                  value={edit.subject_id}
                  onChange={e => setEdit(prev => prev ? { ...prev, subject_id: e.target.value, resource_id: '' } : prev)}
                  className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                >
                  <option value="">Ders seç...</option>
                  {editFilteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Kaynak Seçimi */}
              <div>
                <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Kaynak</label>
                <select
                  value={edit.resource_id}
                  onChange={e => setEdit(prev => prev ? { ...prev, resource_id: e.target.value } : prev)}
                  disabled={!edit.subject_id}
                  className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 disabled:opacity-50"
                >
                  <option value="">Kaynak seç (opsiyonel)...</option>
                  {editFilteredResources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              {/* Süre */}
              <div>
                <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Süre (dakika)</label>
                <input
                  type="number" min={1} value={edit.duration_minutes}
                  onChange={e => setEdit(prev => prev ? { ...prev, duration_minutes: Number(e.target.value) } : prev)}
                  className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                />
              </div>

              {/* Not */}
              <div>
                <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Not (opsiyonel)</label>
                <input
                  type="text" value={edit.note}
                  onChange={e => setEdit(prev => prev ? { ...prev, note: e.target.value } : prev)}
                  placeholder="ör. 30 soru çözdüm"
                  className="mt-1 w-full h-10 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={cancelEdit}
                className="flex-1 h-10 rounded-xl border border-[#e2e8f0] text-[13px] font-semibold text-[#64748b] hover:bg-[#f8fafc] transition-all"
              >
                İptal
              </button>
              <button
                onClick={saveEdit}
                className="flex-1 h-10 rounded-xl bg-[#2563eb] text-white text-[13px] font-bold hover:bg-blue-600 transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-500/20"
              >
                <Check className="h-4 w-4" /> Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 min-h-0 rounded-xl border border-[#e2e8f0] bg-white overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1 flex flex-col">
          <div className="min-w-[700px] flex-1 flex flex-col">
            {/* Header row */}
            <div className="grid grid-cols-[36px_1fr_1fr_90px_80px_90px_60px] gap-3 px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc] text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8] shrink-0">
          <span></span>
          <span>Ders</span>
          <span>Kaynak</span>
          <span>Tür</span>
          <span>Süre</span>
          <span>Tarih</span>
          <span></span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[#94a3b8] text-[13px]">
              <Clock className="h-8 w-8 mb-2 opacity-40" />
              Henüz çalışma kaydı yok.
            </div>
          ) : (
            grouped.map(([date, dateSessions]) => (
              <div key={date}>
                {/* Date group header */}
                <div className="px-4 py-1.5 bg-[#f8fafc] border-b border-[#e2e8f0] sticky top-0 z-10">
                  <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
                    {formatDate(dateSessions[0].started_at)}
                    <span className="ml-2 text-[#94a3b8] normal-case font-normal">
                      — {dateSessions.reduce((a, s) => a + s.duration_minutes, 0)} dk toplam
                    </span>
                  </span>
                </div>

                {dateSessions.map(s => {
                  const exam = getExam(s.subject_id)
                  const ExamIcon = exam ? (examIcons[exam.name] ?? Target) : Target
                  return (
                    <div
                      key={s.id}
                      className="grid grid-cols-[36px_1fr_1fr_90px_80px_90px_60px] gap-3 px-4 py-2.5 border-b border-[#f1f5f9] items-center hover:bg-[#f8fafc] transition-colors group text-[12px]"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-md text-white" style={{ backgroundColor: exam?.color ?? '#94a3b8' }}>
                        <ExamIcon className="h-3.5 w-3.5" />
                      </div>

                      <div className="min-w-0">
                        <p className="font-semibold text-[#0f172a] truncate">{getSubjectName(s.subject_id)}</p>
                      </div>

                      <div className="min-w-0">
                        <p className="text-[#64748b] truncate">{getResourceName(s.resource_id)}</p>
                      </div>

                      <span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          s.session_type === 'manual' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                          {typeLabels[s.session_type] ?? s.session_type}
                        </span>
                      </span>

                      <span className="font-semibold text-[#0f172a]">
                        {s.duration_minutes} dk
                        {s.is_edited && <span className="text-[9px] text-orange-400 ml-1">✎</span>}
                      </span>

                      <span className="text-[11px] text-[#94a3b8]">{formatTime(s.started_at)}</span>

                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => startEdit(s)}
                          className="opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded-lg text-[#64748b] hover:bg-[#eff6ff] hover:text-[#2563eb] transition-all"
                          title="Düzenle"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 transition-all"
                          title="Sil"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
          </div>
        </div>
      </div>
    </div>
  )
}
