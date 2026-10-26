import './SuitePages.css'
import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { supabase, getCurrentUser } from '../lib/supabase'
import Swal from 'sweetalert2'
import {
  History as HistoryIcon, Pencil, Trash2, Check,
  Clock, Shield, Globe, BookOpen, Calculator, Target
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAdminStore } from '../lib/adminStore'
import { recordedMinutes } from '../lib/timerRecovery'
import { fetchQuestionData, questionPlanError } from '../lib/questionPlanData'
import { questionCompletionOptions, readQuestionAnswers } from '../lib/questionDialogs'
import { mergeHistoryEntries } from '../lib/historyEntries'
import type { HistoryEntry, StudyHistorySession } from '../lib/historyEntries'
import type { QuestionLog, QuestionPlan } from '../lib/questionPlan'
import './QuestionPlan.css'

interface Subject { id: string; exam_id: string; name: string }
interface Exam { id: string; name: string; color: string }
interface Resource { id: string; subject_id: string; name: string }

const examIcons: Record<string, LucideIcon> = {
  AGS: Shield, YDS: Globe, IELTS: BookOpen, ALES: Calculator,
}
function mockExamDisplayTitle(note: string | null) {
  if (!note?.trim()) return ''
  const separatorIndex = note.indexOf(' · ')
  return (separatorIndex >= 0 ? note.slice(separatorIndex + 3) : note).trim()
}

function mockExamDisplayExam(note: string | null) {
  if (!note?.trim()) return ''
  const separatorIndex = note.indexOf(' · ')
  return separatorIndex > 0 ? note.slice(0, separatorIndex).trim() : ''
}

const typeLabels: Record<string, string> = {
  pomodoro_long: 'Uzun Pomodoro',
  pomodoro_short: 'Kısa Pomodoro',
  manual: 'Manuel',
  mock_exam: 'Deneme çözme',
  question_solve: 'Soru çözümü',
}

interface EditState {
  id: string
  duration_minutes: number
  note: string
  subject_id: string
  resource_id: string
}

export default function History() {
  const [studySessions, setSessions] = useState<StudyHistorySession[]>([])
  const [questionPlans, setQuestionPlans] = useState<QuestionPlan[]>([])
  const [questionLogs, setQuestionLogs] = useState<QuestionLog[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const ownerRef = useRef<string | null>(null)
  const requestVersion = useRef(0)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [edit, setEdit] = useState<EditState | null>(null)

  const { impersonatedUserId } = useAdminStore()

  const loadHistory = useCallback(async (uid: string) => {
    const version = ++requestVersion.current
    try {
      const [history, questions, exams, subjects, resources] = await Promise.all([
        supabase.from('study_sessions').select('*').eq('user_id', uid).order('started_at', { ascending: false }).limit(100),
        fetchQuestionData(uid),
        supabase.from('exams').select('*').eq('user_id', uid),
        supabase.from('subjects').select('*').eq('user_id', uid),
        supabase.from('resources').select('*').eq('user_id', uid),
      ])
      for (const response of [history, exams, subjects, resources]) if (response.error) throw response.error
      if (ownerRef.current !== uid || requestVersion.current !== version) return
      setSessions(history.data || []); setQuestionPlans(questions.plans); setQuestionLogs(questions.logs)
      setExams(exams.data || []); setSubjects(subjects.data || []); setResources(resources.data || []); setError('')
    } catch (failure) {
      if (ownerRef.current === uid && requestVersion.current === version) setError(questionPlanError(failure as { code?: string }))
    } finally { if (ownerRef.current === uid && requestVersion.current === version) setLoading(false) }
  }, [])
  useEffect(() => {
    let active = true
    ownerRef.current = null; requestVersion.current++
    setSessions([]); setQuestionPlans([]); setQuestionLogs([]); setEdit(null); setLoading(true); setError('')
    void getCurrentUser().then(({ data: { user } }) => {
      if (!active) return
      if (!user) { setLoading(false); return }
      ownerRef.current = impersonatedUserId || user.id
      void loadHistory(ownerRef.current)
    })
    const refresh = () => { if (ownerRef.current) void loadHistory(ownerRef.current) }
    window.addEventListener('question-data-changed', refresh)
    window.addEventListener('study-session-saved', refresh)
    return () => { active = false; ownerRef.current = null; requestVersion.current++; window.removeEventListener('question-data-changed', refresh); window.removeEventListener('study-session-saved', refresh) }
  }, [impersonatedUserId, loadHistory])
  const sessions = useMemo(() => mergeHistoryEntries(studySessions, questionPlans, questionLogs), [studySessions, questionPlans, questionLogs])

  const subjectToExam = useMemo(() => {
    const map: Record<string, string> = {}
    subjects.forEach(s => { map[s.id] = s.exam_id })
    return map
  }, [subjects])

  const examsById = useMemo(() => new Map(exams.map(exam => [exam.id, exam])), [exams])
  const subjectsById = useMemo(() => new Map(subjects.map(subject => [subject.id, subject])), [subjects])
  const resourcesById = useMemo(() => new Map(resources.map(resource => [resource.id, resource])), [resources])
  const getExam = (subjectId: string | null) => {
    if (!subjectId) return null
    return examsById.get(subjectToExam[subjectId]) ?? null
  }
  const getSubjectName = (id: string | null) => subjectsById.get(id || '')?.name ?? '-'
  const getResourceName = (id: string | null) => {
    if (!id) return '-'
    return resourcesById.get(id)?.name ?? '-'
  }

  const handleDelete = async (entry: HistoryEntry) => {
    const questionOnly = entry.session_type === 'question_solve'
    const res = await Swal.fire({
      title: 'Kaydı Sil',
      text: questionOnly ? 'Bu soru çözümü kaydı silinecek ve soru toplamlarından çıkarılacak.' : entry.question ? 'Çalışma süresi ve bu oturuma bağlı soru çözümü birlikte silinecek.' : 'Bu çalışma kaydını silmek istediğinize emin misiniz?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#718096',
      confirmButtonText: 'Evet, Sil',
      cancelButtonText: 'İptal'
    })
    if (!res.isConfirmed) return
    const result = questionOnly
      ? await supabase.rpc('remove_question_result', { p_entry_id: entry.question!.id })
      : await supabase.from('study_sessions').delete().eq('id', entry.id)
    if (result.error) { void Swal.fire('Silinemedi', questionPlanError(result.error), 'error'); return }
    window.dispatchEvent(new Event('question-data-changed'))
  }

  const editQuestions = async (entry: HistoryEntry) => {
    const log = entry.question
    if (!log || !ownerRef.current) return
    const owner = ownerRef.current
    const result = await Swal.fire({
      ...questionCompletionOptions(String(log.solved_questions), log.correct_questions, log.wrong_questions, false, undefined, { note: log.note, boundNote: questionPlans.find(plan => plan.id === log.question_plan_id)?.note, ownerId: owner, subjectId: entry.subject_id }),
      title: 'Çözüm kaydını düzenle', showCancelButton: true, confirmButtonText: 'Kaydet', cancelButtonText: 'Vazgeç',
      showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async value => {
        const answers = readQuestionAnswers(value)
        if (!answers || ownerRef.current !== owner) return false
        const response = await supabase.rpc('update_question_result', { p_entry_id: log.id, p_questions: answers.solved_questions, p_correct: answers.correct_questions, p_wrong: answers.wrong_questions, p_note: answers.note })
        if (response.error) { Swal.showValidationMessage(questionPlanError(response.error)); return false }
        return true
      },
    })
    if (result.isConfirmed) window.dispatchEvent(new Event('question-data-changed'))
  }
  const startEdit = (s: HistoryEntry) => {
    if (s.session_type === 'question_solve') { void editQuestions(s); return }
    setEdit({
      id: s.id,
      duration_minutes: recordedMinutes(s.duration_minutes),
      note: s.note ?? '',
      subject_id: s.subject_id ?? '',
      resource_id: s.resource_id ?? '',
    })
  }

  const saveEdit = async () => {
    if (!edit) return
    if (!Number.isInteger(edit.duration_minutes) || edit.duration_minutes <= 0) {
      void Swal.fire('Geçersiz süre', 'Dakika olarak pozitif bir tam sayı girin.', 'warning')
      return
    }
    const session = sessions.find(s => s.id === edit.id)
    if (!session) return

    const newEnd = new Date(new Date(session.started_at).getTime() + edit.duration_minutes * 60000)
    const { error: saveError } = await supabase.from('study_sessions').update({
      duration_minutes: edit.duration_minutes,
      ended_at: newEnd.toISOString(),
      note: edit.note || null,
      subject_id: edit.subject_id || null,
      resource_id: edit.resource_id || null,
      is_edited: true,
    }).eq('id', edit.id)

    if (saveError) { void Swal.fire('Kaydedilemedi', 'Çalışma kaydı güncellenemedi. Tekrar deneyin.', 'error'); return }

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
    const groups: Record<string, HistoryEntry[]> = {}
    sessions.forEach(s => {
      const d = new Date(s.started_at).toLocaleDateString('sv-SE')
      if (!groups[d]) groups[d] = []
      groups[d].push(s)
    })
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [sessions])

  return (
    <div className="suite-page suite-history flex flex-col h-full gap-3">
      {/* Header */}
      <div className="shrink-0">
        <p className="suite-eyebrow">ÇALIŞMA ARŞİVİN</p>
          <h1 className="text-lg font-semibold text-[#24354a] flex items-center gap-2">
          <HistoryIcon className="h-5 w-5 text-[#4269a8]" /> Çalışma Geçmişi
        </h1>
        <p className="text-[14px] text-[#62748b]">Tüm çalışma kayıtlarını incele, ders/kaynak düzenle veya sil.</p>
      </div>

      {error && <div role="alert" className="question-error">{error}<button onClick={() => ownerRef.current && void loadHistory(ownerRef.current)}>Tekrar dene</button></div>}

      {/* Edit Modal */}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={cancelEdit}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-[#4269a8] px-6 py-4">
              <h2 className="text-white font-semibold text-base flex items-center gap-2">
                <Pencil className="h-4 w-4" /> Kaydı Düzenle
              </h2>
              <p className="text-[#718096] text-[14px] mt-0.5">Ders, kaynak, süre veya notu güncelleyebilirsin.</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Sınav Seçimi */}
              <div>
                <label className="text-[13px] font-semibold text-[#62748b] uppercase tracking-wider">Sınav</label>
                <select
                  value={editSubjectExam}
                  onChange={e => {
                    // Sınavı değiştirince ders ve kaynağı sıfırla
                    const firstSub = subjects.find(s => s.exam_id === e.target.value)
                    setEdit(prev => prev ? { ...prev, subject_id: firstSub?.id ?? '', resource_id: '' } : prev)
                  }}
                  className="mt-1 w-full h-10 rounded-2xl border border-[#e3e9f0] bg-[#f8fafc] px-3 text-[15px] text-[#24354a] focus:outline-none focus:ring-2 focus:ring-[#4269a8]/30"
                >
                  <option value="">Sınav seç...</option>
                  {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              {/* Ders Seçimi */}
              <div>
                <label className="text-[13px] font-semibold text-[#62748b] uppercase tracking-wider">Ders</label>
                <select
                  value={edit.subject_id}
                  onChange={e => setEdit(prev => prev ? { ...prev, subject_id: e.target.value, resource_id: '' } : prev)}
                  className="mt-1 w-full h-10 rounded-2xl border border-[#e3e9f0] bg-[#f8fafc] px-3 text-[15px] text-[#24354a] focus:outline-none focus:ring-2 focus:ring-[#4269a8]/30"
                >
                  <option value="">Ders seç...</option>
                  {editFilteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Kaynak Seçimi */}
              <div>
                <label className="text-[13px] font-semibold text-[#62748b] uppercase tracking-wider">Kaynak</label>
                <select
                  value={edit.resource_id}
                  onChange={e => setEdit(prev => prev ? { ...prev, resource_id: e.target.value } : prev)}
                  disabled={!edit.subject_id}
                  className="mt-1 w-full h-10 rounded-2xl border border-[#e3e9f0] bg-[#f8fafc] px-3 text-[15px] text-[#24354a] focus:outline-none focus:ring-2 focus:ring-[#4269a8]/30 disabled:opacity-50"
                >
                  <option value="">Kaynak seç (opsiyonel)...</option>
                  {editFilteredResources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              {/* Süre */}
              <div>
                <label className="text-[13px] font-semibold text-[#62748b] uppercase tracking-wider">Süre (dakika)</label>
                <input
                  type="number" min={1} step={1} value={edit.duration_minutes}
                  onChange={e => setEdit(prev => prev ? { ...prev, duration_minutes: Number(e.target.value) } : prev)}
                  className="mt-1 w-full h-10 rounded-2xl border border-[#e3e9f0] bg-[#f8fafc] px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#4269a8]/30"
                />
              </div>

              {/* Not */}
              <div>
                <label className="text-[13px] font-semibold text-[#62748b] uppercase tracking-wider">Not (opsiyonel)</label>
                <input
                  type="text" value={edit.note}
                  onChange={e => setEdit(prev => prev ? { ...prev, note: e.target.value } : prev)}
                  placeholder="ör. 30 soru çözdüm"
                  className="mt-1 w-full h-10 rounded-2xl border border-[#e3e9f0] bg-[#f8fafc] px-3 text-[15px] placeholder:text-[#718096] focus:outline-none focus:ring-2 focus:ring-[#4269a8]/30"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={cancelEdit}
                className="flex-1 h-10 rounded-2xl border border-[#e3e9f0] text-[15px] font-semibold text-[#62748b] hover:bg-[#f8fafc] transition-all"
              >
                İptal
              </button>
              <button
                onClick={saveEdit}
                className="flex-1 h-10 rounded-xl bg-[#4269a8] text-white text-[15px] font-semibold hover:bg-blue-600 transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-500/20"
              >
                <Check className="h-4 w-4" /> Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 min-h-0 rounded-2xl border border-[#e3e9f0] bg-white overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1 flex flex-col">
          <div className="min-w-[700px] flex-1 flex flex-col">
            {/* Header row */}
            <div className="grid grid-cols-[36px_1fr_1fr_90px_80px_90px_60px] gap-3 px-4 py-2.5 border-b border-[#e3e9f0] bg-[#f8fafc] text-[12px] font-semibold uppercase tracking-wider text-[#718096] shrink-0">
          <span></span>
          <span>Ders / Deneme</span>
          <span>Kaynak</span>
          <span>Tür</span>
          <span>Süre / Soru</span>
          <span>Tarih</span>
          <span></span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[#718096] text-[15px]">
              <Clock className="h-8 w-8 mb-2 opacity-40" />
              {loading ? 'Yükleniyor…' : error ? 'Kayıtlar yüklenemedi.' : 'Henüz çalışma kaydı yok.'}
            </div>
          ) : (
            grouped.map(([date, dateSessions]) => (
              <div key={date}>
                {/* Date group header */}
                <div className="px-4 py-1.5 bg-[#f8fafc] border-b border-[#e3e9f0] sticky top-0 z-10">
                  <span className="text-[12px] font-semibold text-[#62748b] uppercase tracking-wider">
                    {formatDate(dateSessions[0].started_at)}
                    <span className="ml-2 text-[#718096] normal-case font-normal">
                      — {recordedMinutes(dateSessions.reduce((a, s) => a + s.duration_minutes, 0))} dk toplam
                    </span>
                  </span>
                </div>

                {dateSessions.map(s => {
                  const exam = getExam(s.subject_id)
                  const ExamIcon = exam ? (examIcons[exam.name] ?? Target) : Target
                  return (
                    <div
                      key={s.id}
                      className="grid grid-cols-[36px_1fr_1fr_90px_80px_90px_60px] gap-3 px-4 py-2.5 border-b border-[#f1f5f9] items-center hover:bg-[#f8fafc] transition-colors group text-[14px]"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-md text-white" style={{ backgroundColor: exam?.color ?? '#718096' }}>
                        <ExamIcon className="h-3.5 w-3.5" />
                      </div>

                      <div className="min-w-0">
                        <p className="font-semibold text-[#24354a] break-words">{s.session_type === 'mock_exam' ? (mockExamDisplayTitle(s.note) || 'Deneme') : getSubjectName(s.subject_id)}</p>
                        {s.session_type === 'mock_exam' && (mockExamDisplayExam(s.note) || s.subject_id) && <p className="mt-0.5 truncate text-xs text-[#8190a3]" title={s.note || undefined}>{mockExamDisplayExam(s.note) || getSubjectName(s.subject_id)}</p>}
                        {s.question?.note && <p className="mt-0.5 text-xs text-[#62748b] break-words">{s.question.note}</p>}
                        {s.question && (s.question.correct_questions != null || s.question.wrong_questions != null) && <p className="mt-0.5 text-xs text-[#62748b]">{[s.question.correct_questions != null ? `${s.question.correct_questions} doğru` : '', s.question.wrong_questions != null ? `${s.question.wrong_questions} yanlış` : ''].filter(Boolean).join(' · ')}</p>}
                      </div>

                      <div className="min-w-0">
                        <p className="text-[#62748b] break-words">{getResourceName(s.resource_id)}</p>
                      </div>

                      <span>
                        <span className={`px-1.5 py-0.5 rounded text-[12px] font-medium ${
                          s.session_type === 'mock_exam' ? 'bg-violet-50 text-violet-600' : s.session_type === 'manual' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                          {s.question ? 'Soru çözümü' : typeLabels[s.session_type] ?? s.session_type}
                        </span>
                      </span>

                      <span className="font-semibold text-[#24354a]">
                        {s.duration_minutes > 0 && <span className="block">{recordedMinutes(s.duration_minutes)} dk</span>}
                        {s.question && <button type="button" className="block text-xs text-[#4269a8] underline decoration-dotted" onClick={() => void editQuestions(s)} title="Soru çözümünü düzenle">{s.question.solved_questions} soru</button>}
                        {s.is_edited && <span className="text-[11px] text-orange-400 ml-1">✎</span>}
                      </span>

                      <span className="text-[13px] text-[#718096]">{formatTime(s.started_at)}</span>

                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => startEdit(s)}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-[#62748b] hover:bg-[#edf2f8] hover:text-[#4269a8] transition-all"
                          title="Düzenle"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(s)}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 transition-all"
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
