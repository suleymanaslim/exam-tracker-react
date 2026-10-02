import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import Swal from 'sweetalert2'
import {
  BookMarked, ChevronDown, ChevronUp, Plus, Trash2,
  CheckSquare, Square, GripVertical, Check, X
} from 'lucide-react'
import { useAdminStore } from '../lib/adminStore'

interface Exam    { id: string; name: string; color: string }
interface Subject { id: string; exam_id: string; name: string }
interface Topic   {
  id: string; subject_id: string; title: string
  is_completed: boolean; sort_order: number
}

export default function Topics() {
  const [userId, setUserId]   = useState<string | null>(null)
  const [exams, setExams]     = useState<Exam[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics]   = useState<Topic[]>([])
  const [openExam, setOpenExam]       = useState<string | null>(null)
  const [openSubject, setOpenSubject] = useState<string | null>(null)
  const { impersonatedUserId } = useAdminStore()

  // Yeni konu ekleme
  const [addingTo, setAddingTo]   = useState<string | null>(null) // subject_id
  const [newTitle, setNewTitle]   = useState('')

  // Düzenleme
  const [editId, setEditId]     = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const targetUid = impersonatedUserId || user.id
      setUserId(targetUid)
      supabase.from('exams').select('*').eq('user_id', targetUid).order('name').then(r => { if (r.data) setExams(r.data) })
      supabase.from('subjects').select('*').eq('user_id', targetUid).then(r => { if (r.data) setSubjects(r.data) })
      supabase.from('topics').select('*').eq('user_id', targetUid).order('sort_order').then(r => { if (r.data) setTopics(r.data as Topic[]) })
    })
  }, [impersonatedUserId])

  const subjectTopics = (subjectId: string) =>
    topics.filter(t => t.subject_id === subjectId).sort((a, b) => a.sort_order - b.sort_order)

  // ── Konu ekle ──────────────────────────────────────────────────────────────
  const handleAdd = async (subjectId: string) => {
    if (!newTitle.trim() || !userId) return
    const existing = subjectTopics(subjectId)
    const sortOrder = existing.length > 0 ? existing[existing.length - 1].sort_order + 1 : 0
    const { data, error } = await supabase.from('topics').insert({
      user_id: userId,
      subject_id: subjectId,
      title: newTitle.trim(),
      is_completed: false,
      sort_order: sortOrder,
    }).select().single()
    
    if (error) { 
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'Veritabanı Hatası',
        html: `Konu eklenemedi.<br><br><b>Olası Neden:</b> Supabase'de <b>topics</b> tablosu oluşturulmamış veya API güncellenmemiş olabilir. Lütfen SQL Editor'den tabloyu oluşturduğunuzdan emin olun.`,
        confirmButtonColor: '#2563eb'
      })
      return 
    }
    
    setTopics(prev => [...prev, data as Topic])
    setNewTitle('')
  }

  // ── Tamamlandı toggle ──────────────────────────────────────────────────────
  const toggleComplete = async (topic: Topic) => {
    const newVal = !topic.is_completed
    await supabase.from('topics').update({ is_completed: newVal }).eq('id', topic.id)
    setTopics(prev => prev.map(t => t.id === topic.id ? { ...t, is_completed: newVal } : t))
  }

  // ── Sil ────────────────────────────────────────────────────────────────────
  const handleDelete = async (topicId: string) => {
    const res = await Swal.fire({
      title: 'Konuyu Sil',
      text: 'Bu konuyu silmek istediğinize emin misiniz?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Evet, Sil',
      cancelButtonText: 'İptal'
    })
    if (!res.isConfirmed) return
    await supabase.from('topics').delete().eq('id', topicId)
    setTopics(prev => prev.filter(t => t.id !== topicId))
  }

  // ── Sırala ─────────────────────────────────────────────────────────────────
  const moveUp = useCallback(async (topic: Topic) => {
    const subs = subjectTopics(topic.subject_id)
    const idx = subs.findIndex(t => t.id === topic.id)
    if (idx <= 0) return
    const prev = subs[idx - 1]
    // Swap sort_order
    await Promise.all([
      supabase.from('topics').update({ sort_order: prev.sort_order }).eq('id', topic.id),
      supabase.from('topics').update({ sort_order: topic.sort_order }).eq('id', prev.id),
    ])
    setTopics(p => p.map(t =>
      t.id === topic.id ? { ...t, sort_order: prev.sort_order } :
      t.id === prev.id  ? { ...t, sort_order: topic.sort_order } : t
    ))
  }, [topics])

  const moveDown = useCallback(async (topic: Topic) => {
    const subs = subjectTopics(topic.subject_id)
    const idx = subs.findIndex(t => t.id === topic.id)
    if (idx >= subs.length - 1) return
    const next = subs[idx + 1]
    await Promise.all([
      supabase.from('topics').update({ sort_order: next.sort_order }).eq('id', topic.id),
      supabase.from('topics').update({ sort_order: topic.sort_order }).eq('id', next.id),
    ])
    setTopics(p => p.map(t =>
      t.id === topic.id ? { ...t, sort_order: next.sort_order } :
      t.id === next.id  ? { ...t, sort_order: topic.sort_order } : t
    ))
  }, [topics])

  // ── Düzenle ────────────────────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editId || !editTitle.trim()) return
    await supabase.from('topics').update({ title: editTitle.trim() }).eq('id', editId)
    setTopics(prev => prev.map(t => t.id === editId ? { ...t, title: editTitle.trim() } : t))
    setEditId(null)
    setEditTitle('')
  }

  const examSubjects = (examId: string) => subjects.filter(s => s.exam_id === examId)

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-lg font-bold text-[#0f172a] flex items-center gap-2">
          <BookMarked className="h-5 w-5 text-[#2563eb]" /> Konu Takibi
        </h1>
        <p className="text-[12px] text-[#64748b]">Sınavlarına göre konuları gir, tamamlandıkça işaretle.</p>
      </div>

      {/* Exam accordion list */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
        {exams.length === 0 && (
          <div className="flex items-center justify-center h-full text-[#94a3b8] text-[13px]">
            Henüz sınav eklenmemiş. Ayarlar sayfasından başlayabilirsin.
          </div>
        )}

        {exams.map(exam => {
          const subs = examSubjects(exam.id)
          const examTopicCount = subs.reduce((a, s) => a + subjectTopics(s.id).length, 0)
          const examDoneCount  = subs.reduce((a, s) => a + subjectTopics(s.id).filter(t => t.is_completed).length, 0)
          const isExamOpen = openExam === exam.id

          return (
            <div key={exam.id} className="rounded-xl border border-[#e2e8f0] bg-white overflow-hidden">
              {/* Exam header */}
              <button
                onClick={() => setOpenExam(isExamOpen ? null : exam.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#f8fafc] transition-colors"
              >
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: exam.color }} />
                <span className="font-bold text-[#0f172a] text-sm flex-1 text-left">{exam.name}</span>
                {examTopicCount > 0 && (
                  <span className="text-[10px] font-semibold text-[#64748b] bg-[#f1f5f9] px-2 py-0.5 rounded-full">
                    {examDoneCount}/{examTopicCount} tamamlandı
                  </span>
                )}
                {/* Progress ring */}
                {examTopicCount > 0 && (
                  <div className="relative h-6 w-6">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="9" fill="none" stroke="#e2e8f0" strokeWidth="2.5" />
                      <circle cx="12" cy="12" r="9" fill="none" stroke={exam.color} strokeWidth="2.5"
                        strokeDasharray={2 * Math.PI * 9}
                        strokeDashoffset={2 * Math.PI * 9 * (1 - examDoneCount / examTopicCount)}
                        strokeLinecap="round" />
                    </svg>
                  </div>
                )}
                <ChevronDown className={`h-4 w-4 text-[#94a3b8] transition-transform ${isExamOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Subjects */}
              {isExamOpen && (
                <div className="border-t border-[#f1f5f9]">
                  {subs.length === 0 && (
                    <p className="px-6 py-3 text-[11px] text-[#94a3b8]">Bu sınava ders eklenmemiş.</p>
                  )}
                  {subs.map(sub => {
                    const ts = subjectTopics(sub.id)
                    const done = ts.filter(t => t.is_completed).length
                    const isSubOpen = openSubject === sub.id

                    return (
                      <div key={sub.id} className="border-b border-[#f8fafc] last:border-0">
                        {/* Subject header */}
                        <button
                          onClick={() => setOpenSubject(isSubOpen ? null : sub.id)}
                          className="w-full flex items-center gap-2 px-6 py-2.5 hover:bg-[#f8fafc] transition-colors text-left"
                        >
                          <span className="text-[12px] font-semibold text-[#0f172a] flex-1">{sub.name}</span>
                          {ts.length > 0 && (
                            <span className="text-[10px] text-[#64748b]">{done}/{ts.length}</span>
                          )}
                          <ChevronDown className={`h-3.5 w-3.5 text-[#94a3b8] transition-transform ${isSubOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Topics list */}
                        {isSubOpen && (
                          <div className="px-6 pb-3 space-y-1">
                            {ts.length === 0 && (
                              <p className="text-[11px] text-[#94a3b8] py-1">Henüz konu eklenmemiş.</p>
                            )}

                            {ts.map((topic, i) => (
                              <div key={topic.id} className="flex items-center gap-2 py-1 group">
                                <GripVertical className="h-3.5 w-3.5 text-[#e2e8f0] shrink-0" />

                                {/* Complete toggle */}
                                <button onClick={() => toggleComplete(topic)} className="shrink-0">
                                  {topic.is_completed
                                    ? <CheckSquare className="h-4 w-4 text-emerald-500" />
                                    : <Square className="h-4 w-4 text-[#cbd5e1] hover:text-[#64748b]" />
                                  }
                                </button>

                                {/* Title — edit inline */}
                                {editId === topic.id ? (
                                  <div className="flex items-center gap-1 flex-1">
                                    <input
                                      autoFocus
                                      value={editTitle}
                                      onChange={e => setEditTitle(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null) }}
                                      className="flex-1 h-7 rounded-lg border border-[#2563eb] px-2 text-[12px] focus:outline-none"
                                    />
                                    <button onClick={saveEdit} className="h-6 w-6 flex items-center justify-center rounded text-emerald-500 hover:bg-emerald-50">
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => setEditId(null)} className="h-6 w-6 flex items-center justify-center rounded text-[#94a3b8] hover:bg-[#f1f5f9]">
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <span
                                    onDoubleClick={() => { setEditId(topic.id); setEditTitle(topic.title) }}
                                    className={`flex-1 text-[12px] cursor-text select-none ${topic.is_completed ? 'line-through text-[#94a3b8]' : 'text-[#0f172a]'}`}
                                    title="Düzenlemek için çift tıkla"
                                  >
                                    {topic.title}
                                  </span>
                                )}

                                {/* Sırala + Sil */}
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => moveUp(topic)} disabled={i === 0} className="h-5 w-5 flex items-center justify-center rounded text-[#94a3b8] hover:text-[#0f172a] hover:bg-[#f1f5f9] disabled:opacity-30">
                                    <ChevronUp className="h-3 w-3" />
                                  </button>
                                  <button onClick={() => moveDown(topic)} disabled={i === ts.length - 1} className="h-5 w-5 flex items-center justify-center rounded text-[#94a3b8] hover:text-[#0f172a] hover:bg-[#f1f5f9] disabled:opacity-30">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                  <button onClick={() => handleDelete(topic.id)} className="h-5 w-5 flex items-center justify-center rounded text-red-400 hover:bg-red-50">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            ))}

                            {/* Konu ekle satırı */}
                            {addingTo === sub.id ? (
                              <div className="flex items-center gap-2 pt-1">
                                <div className="w-3.5 h-3.5 shrink-0" />
                                <Square className="h-4 w-4 text-[#e2e8f0] shrink-0" />
                                <input
                                  autoFocus
                                  value={newTitle}
                                  onChange={e => setNewTitle(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleAdd(sub.id)
                                    if (e.key === 'Escape') { setAddingTo(null); setNewTitle('') }
                                  }}
                                  placeholder="Konu adı yaz..."
                                  className="flex-1 h-7 rounded-lg border border-[#2563eb] px-2 text-[12px] placeholder:text-[#94a3b8] focus:outline-none"
                                />
                                <button onClick={() => handleAdd(sub.id)} className="h-6 w-6 flex items-center justify-center rounded text-emerald-500 hover:bg-emerald-50">
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => { setAddingTo(null); setNewTitle('') }} className="h-6 w-6 flex items-center justify-center rounded text-[#94a3b8] hover:bg-[#f1f5f9]">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setAddingTo(sub.id); setNewTitle(''); setEditId(null) }}
                                className="flex items-center gap-1.5 text-[11px] font-semibold text-[#2563eb] hover:text-blue-700 mt-1 transition-colors"
                              >
                                <Plus className="h-3.5 w-3.5" /> Konu Ekle
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
