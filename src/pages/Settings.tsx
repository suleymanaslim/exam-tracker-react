import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { seedAllData } from '../lib/seed'
import Swal from 'sweetalert2'
import CustomSelect from '../components/CustomSelect'
import {
  Settings as SettingsIcon, Save, Download, Clock, Plus, Trash2, Pencil, Check, X,
  Shield, Globe, BookOpen, Calculator, Target, ChevronRight, ChevronDown, ChevronUp, Database
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAdminStore } from '../lib/adminStore'
import { defaultVocabularyText } from '../lib/defaultVocabulary'
import { useSettingsStore } from '../lib/settingsStore'

interface Exam { id: string; name: string; color: string; exam_date: string | null; wrong_penalty: number | null; point_per_net: number }
interface Subject { id: string; exam_id: string; name: string }
interface Resource { id: string; subject_id: string; name: string; author: string | null; publisher: string | null; resource_type: string; url: string | null; total_videos: number; avg_video_duration: number }
interface PomodoroSettings { id: string; long_focus_minutes: number; long_break_minutes: number; short_focus_minutes: number; short_break_minutes: number }
interface QuestionType { id: string; exam_id: string; name: string; sort_order: number; question_count: number }

const examIcons: Record<string, LucideIcon> = { AGS: Shield, YDS: Globe, IELTS: BookOpen, ALES: Calculator }
const typeLabels: Record<string, string> = { video_ders: 'Video Ders', soru_bankasi: 'Soru Bankası', kitap: 'Kitap', deneme: 'Deneme', site: 'Site', diger: 'Diğer' }

type Tab = 'resources' | 'exam_settings' | 'pomodoro' | 'exam_dates' | 'export' | 'vocabulary'

export default function Settings() {
  const { impersonatedUserId, isAdmin } = useAdminStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('resources')
  const [exams, setExams] = useState<Exam[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([])
  const [pomSettings, setPomSettings] = useState<PomodoroSettings | null>(null)
  const [openExam, setOpenExam] = useState<string | null>(null)
  const [openSubject, setOpenSubject] = useState<string | null>(null)

  // Sınav Ayarları state'leri
  const [selExamSettings, setSelExamSettings] = useState<string>('')
  const [editWrongPenalty, setEditWrongPenalty] = useState<string>('')
  const [editPointPerNet, setEditPointPerNet] = useState<string>('1')
  const [newQuestionType, setNewQuestionType] = useState<string>('')
  const [newQuestionCount, setNewQuestionCount] = useState<string>('')

  // Add forms
  const [addExamName, setAddExamName] = useState('')
  const [addSubjectName, setAddSubjectName] = useState('')
  const [addSubjectExam, setAddSubjectExam] = useState('')
  const [addResName, setAddResName] = useState('')
  const [addResType, setAddResType] = useState('kitap')
  const [addResSubject, setAddResSubject] = useState('')
  const [addResAuthor, setAddResAuthor] = useState('')
  const [addResPublisher, setAddResPublisher] = useState('')
  const [addResTotalVideos, setAddResTotalVideos] = useState('')
  const [addResAvgDuration, setAddResAvgDuration] = useState('')

  // Edit
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [pendingDates, setPendingDates] = useState<Record<string, string>>({})

  // Seed & save states
  const [seeding, setSeeding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [exportWeekOffset, setExportWeekOffset] = useState(0) // 0 = bu hafta, -1 = geçen hafta, ...
  const [seedDone, setSeedDone] = useState(false)
  const { offDay, setOffDay } = useSettingsStore()
  
  // YKS Vocabulary Edit State
  const [vocabText, setVocabText] = useState('')
  const [savingVocab, setSavingVocab] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const targetUid = impersonatedUserId || user.id
        setUserId(targetUid)
        loadAll(targetUid)
      }
    })

    // Fetch yks_vocabulary_program
    supabase.from('system_settings').select('value').eq('key', 'yks_vocabulary_program').single()
      .then(r => {
        if (r.data?.value) {
          setVocabText(r.data.value)
        } else {
          const local = localStorage.getItem('yks_vocabulary_program')
          setVocabText(local || defaultVocabularyText)
        }
      })
  }, [impersonatedUserId])

  const loadAll = (uid: string) => {
    supabase.from('exams').select('*').eq('user_id', uid).then(r => { if (r.data) setExams(r.data) })
    supabase.from('subjects').select('*').eq('user_id', uid).then(r => { if (r.data) setSubjects(r.data) })
    supabase.from('resources').select('*').eq('user_id', uid).then(r => { if (r.data) setResources(r.data) })
    supabase.from('exam_question_types').select('*').eq('user_id', uid).order('sort_order').then(r => { if (r.data) setQuestionTypes(r.data) })
    supabase.from('pomodoro_settings').select('*').eq('user_id', uid).single().then(r => { if (r.data) setPomSettings(r.data) })
  }

  // SEED & RESET
  const handleSeed = async () => {
    if (!userId) return
    const res = await Swal.fire({
      title: 'İndeks Akademi Kaynakları Yüklenecek',
      text: 'Mevcut ders, kaynak ve planlarınız silinip yerlerine İndeks Akademi AGS, YDS, vb. kaynakları eklenecek. Emin misiniz?',
      icon: 'info',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Evet, Yükle',
      cancelButtonText: 'İptal'
    })
    if (!res.isConfirmed) return
    
    setSeeding(true)
    await seedAllData(userId)
    loadAll(userId)
    setSeeding(false)
    setSeedDone(true)
    setTimeout(() => setSeedDone(false), 3000)
  }

  // Exam CRUD
  const addExam = async () => {
    if (!userId || !addExamName.trim()) return
    const colors = ['#2563eb', '#0891b2', '#7c3aed', '#059669', '#ea580c', '#db2777', '#ca8a04']
    const color = colors[Math.floor(Math.random() * colors.length)]
    const { data } = await supabase.from('exams').insert({
      user_id: userId,
      name: addExamName.trim(),
      color
    }).select().single()
    if (data) setExams(prev => [...prev, data])
    setAddExamName('')
  }

  const deleteExam = async (id: string) => {
    const res = await Swal.fire({
      title: 'Emin misiniz?',
      text: 'Bu sınav ve altındaki tüm ders, kaynak ve kayıtlar silinecek. Geri alınamaz.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Evet, Sil',
      cancelButtonText: 'İptal'
    })
    if (!res.isConfirmed) return
    
    await supabase.from('exams').delete().eq('id', id)
    setExams(prev => prev.filter(e => e.id !== id))
    setSubjects(prev => prev.filter(s => s.exam_id !== id))
    setResources(prev => prev.filter(r => !subjects.find(s => s.exam_id === id && s.id === r.subject_id)))
    if (openExam === id) {
      setOpenExam(null)
      setOpenSubject(null)
    }
  }

  // Subject CRUD
  const addSubject = async () => {
    if (!userId || !addSubjectExam || !addSubjectName.trim()) return
    const { data } = await supabase.from('subjects').insert({ user_id: userId, exam_id: addSubjectExam, name: addSubjectName.trim() }).select().single()
    if (data) setSubjects(prev => [...prev, data])
    setAddSubjectName('')
  }

  const deleteSubject = async (id: string) => {
    const res = await Swal.fire({
      title: 'Emin misiniz?',
      text: 'Bu ders ve altındaki tüm kaynaklar silinecek. Geri alınamaz.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Evet, Sil',
      cancelButtonText: 'İptal'
    })
    if (!res.isConfirmed) return
    
    await supabase.from('subjects').delete().eq('id', id)
    setSubjects(prev => prev.filter(s => s.id !== id))
    setResources(prev => prev.filter(r => r.subject_id !== id))
  }

  // Resource CRUD
  const addResource = async () => {
    if (!userId || !addResSubject || !addResName.trim()) return
    const { data } = await supabase.from('resources').insert({
      user_id: userId, subject_id: addResSubject, name: addResName.trim(),
      resource_type: addResType, author: addResAuthor || null, publisher: addResPublisher || null,
      total_videos: addResType === 'video_ders' ? (parseInt(addResTotalVideos) || 0) : 0,
      avg_video_duration: addResType === 'video_ders' ? (parseInt(addResAvgDuration) || 0) : 0
    }).select().single()
    if (data) setResources(prev => [...prev, data])
    setAddResName(''); setAddResAuthor(''); setAddResPublisher(''); setAddResTotalVideos(''); setAddResAvgDuration('')
  }

  const deleteResource = async (id: string) => {
    const res = await Swal.fire({
      title: 'Kaynağı Sil',
      text: 'Bu kaynağı silmek istediğinize emin misiniz?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Evet, Sil',
      cancelButtonText: 'İptal'
    })
    if (!res.isConfirmed) return
    
    await supabase.from('resources').delete().eq('id', id)
    setResources(prev => prev.filter(r => r.id !== id))
  }

  const startEditRes = (r: Resource) => { setEditId(r.id); setEditName(r.name) }
  const saveEditRes = async () => {
    if (!editId) return
    await supabase.from('resources').update({ name: editName }).eq('id', editId)
    setResources(prev => prev.map(r => r.id === editId ? { ...r, name: editName } : r))
    setEditId(null)
  }

  // Pomodoro save
  const handleSavePom = async () => {
    if (!pomSettings) return
    setSaving(true)
    await supabase.from('pomodoro_settings').update({
      long_focus_minutes: pomSettings.long_focus_minutes, long_break_minutes: pomSettings.long_break_minutes,
      short_focus_minutes: pomSettings.short_focus_minutes, short_break_minutes: pomSettings.short_break_minutes,
    }).eq('id', pomSettings.id)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  // Sınav Ayarları CRUD
  const saveExamSettings = async () => {
    if (!selExamSettings) return
    const penalty = editWrongPenalty ? parseFloat(editWrongPenalty) : null
    const point = parseFloat(editPointPerNet) || 1
    await supabase.from('exams').update({ wrong_penalty: penalty, point_per_net: point }).eq('id', selExamSettings)
    setExams(prev => prev.map(e => e.id === selExamSettings ? { ...e, wrong_penalty: penalty, point_per_net: point } : e))
    Swal.fire({ title: 'Kaydedildi', text: 'Puanlama ayarları güncellendi.', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 })
  }

  const addQuestionType = async () => {
    if (!userId || !selExamSettings || !newQuestionType.trim()) return
    const sortOrder = questionTypes.filter(q => q.exam_id === selExamSettings).length
    const count = parseInt(newQuestionCount) || 0
    const { data } = await supabase.from('exam_question_types').insert({
      user_id: userId, exam_id: selExamSettings, name: newQuestionType.trim(), sort_order: sortOrder, question_count: count
    }).select().single()
    if (data) setQuestionTypes(prev => [...prev, data])
    setNewQuestionType('')
    setNewQuestionCount('')
  }

  const deleteQuestionType = async (id: string) => {
    const res = await Swal.fire({ title: 'Sil', text: 'Soru türünü silmek istediğinize emin misiniz?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Evet', cancelButtonText: 'İptal' })
    if (!res.isConfirmed) return
    await supabase.from('exam_question_types').delete().eq('id', id)
    setQuestionTypes(prev => prev.filter(q => q.id !== id))
  }

  const moveQuestionType = async (index: number, direction: 'up' | 'down') => {
    const typesForExam = questionTypes.filter(q => q.exam_id === selExamSettings).sort((a, b) => a.sort_order - b.sort_order)
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === typesForExam.length - 1) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    const currentItem = typesForExam[index]
    const targetItem = typesForExam[targetIndex]

    const tempOrder = currentItem.sort_order
    currentItem.sort_order = targetItem.sort_order
    targetItem.sort_order = tempOrder

    await Promise.all([
      supabase.from('exam_question_types').update({ sort_order: currentItem.sort_order }).eq('id', currentItem.id),
      supabase.from('exam_question_types').update({ sort_order: targetItem.sort_order }).eq('id', targetItem.id)
    ])

    const { data } = await supabase.from('exam_question_types').select('*').eq('user_id', userId).order('sort_order')
    if (data) setQuestionTypes(data)
  }

  useEffect(() => {
    if (selExamSettings) {
      const ex = exams.find(e => e.id === selExamSettings)
      if (ex) {
        setEditWrongPenalty(ex.wrong_penalty ? ex.wrong_penalty.toString() : '')
        setEditPointPerNet(ex.point_per_net ? ex.point_per_net.toString() : '1')
      }
    }
  }, [selExamSettings, exams])

  // JSON Export - week helpers
  const getWeekRange = (offset: number) => {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now)
    monday.setDate(diff + offset * 7)
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(sunday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    return { monday, sunday }
  }

  const formatWeekLabel = (offset: number) => {
    const { monday, sunday } = getWeekRange(offset)
    const fmt = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
    if (offset === 0) return `Bu Hafta (${fmt(monday)} – ${fmt(sunday)})`
    if (offset === -1) return `Geçen Hafta (${fmt(monday)} – ${fmt(sunday)})`
    return `${fmt(monday)} – ${fmt(sunday)}`
  }

  const handleExportJSON = async () => {
    if (!userId) return
    setGenerating(true)
    const { monday, sunday } = getWeekRange(exportWeekOffset)
    const weekStart = monday.toISOString().split('T')[0]
    const { data: plan } = await supabase.from('weekly_plans').select('id').eq('user_id', userId).eq('week_start_date', weekStart).single()
    let planItems: any[] = []
    if (plan) { const { data } = await supabase.from('plan_items').select('*, subjects(name), resources(name)').eq('weekly_plan_id', plan.id); planItems = data ?? [] }
    const { data: sessions } = await supabase.from('study_sessions').select('*, subjects(name), resources(name)').eq('user_id', userId).gte('started_at', monday.toISOString()).lte('started_at', sunday.toISOString())
    
    // Fetch practice exams for the week
    const { data: examsData } = await supabase.from('exam_results').select('*, exams(name, wrong_penalty, point_per_net)').eq('user_id', userId).gte('created_at', monday.toISOString()).lte('created_at', sunday.toISOString())
    
    let detailsData: any[] = []
    if (examsData && examsData.length > 0) {
      const resultIds = examsData.map(e => e.id)
      const { data: dData } = await supabase.from('exam_result_details').select('*').in('result_id', resultIds)
      detailsData = dData || []
    }
    
    const totalPlanned = planItems.reduce((s: number, i: any) => s + i.planned_minutes, 0)
    const totalCompleted = (sessions ?? []).reduce((s: number, i: any) => s + i.duration_minutes, 0)
    
    let denemeDurumu = "Bu hafta deneme çözülmedi"
    if (examsData && examsData.length > 0) {
      denemeDurumu = examsData.map(e => {
        const details = detailsData.filter(d => d.result_id === e.id)
        let correct = 0
        let incorrect = 0
        details.forEach(d => { correct += d.correct_count; incorrect += d.incorrect_count })
        
        let net = correct
        const penalty = e.exams?.wrong_penalty
        if (penalty && penalty > 0) {
          net = correct - (incorrect / penalty)
        }
        net = Math.max(0, parseFloat(net.toFixed(2)))
        let points = net * (e.exams?.point_per_net || 1)
        points = Math.max(0, parseFloat(points.toFixed(2)))
        
        return `${e.exams?.name || 'Sınav'}: ${correct}D ${incorrect}Y ${net}Net (${points} Puan)`
      }).join(' | ')
    }

    const report = {
      hafta: weekStart, 
      toplam_planlanan_dk: totalPlanned, 
      toplam_calisan_dk: totalCompleted,
      gerceklesme_orani: totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0,
      deneme_sinavi_durumu: denemeDurumu,
      plan_maddeleri: planItems.map(i => ({ gun: i.day_of_week, ders: i.subjects?.name ?? '-', kaynak: i.resources?.name ?? '-', planlanan_dk: i.planned_minutes })),
      calisma_kayitlari: (sessions ?? []).map(s => ({ ders: s.subjects?.name ?? '-', kaynak: s.resources?.name ?? '-', tur: s.session_type, sure_dk: s.duration_minutes, tarih: new Date(s.started_at).toLocaleString('tr-TR') })),
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `haftalik-rapor-${weekStart}.json`; a.click(); URL.revokeObjectURL(url)
    setGenerating(false)
  }

  const handleSaveVocabulary = async () => {
    setSavingVocab(true)
    const { error } = await supabase.from('system_settings').upsert({
      key: 'yks_vocabulary_program',
      value: vocabText
    })

    if (error) {
      localStorage.setItem('yks_vocabulary_program', vocabText)
      Swal.fire({
        icon: 'warning',
        title: 'Veritabanına Kaydedilemedi',
        text: 'Ayarlar tarayıcı hafızasına (localStorage) kaydedildi. SQL tablosunu oluşturmak için migration dosyasını çalıştırmalısınız. Hata: ' + error.message,
        confirmButtonText: 'Tamam'
      })
    } else {
      Swal.fire({
        icon: 'success',
        title: 'Başarılı',
        text: 'Kelime programı başarıyla kaydedildi.',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 1500
      })
    }
    setSavingVocab(false)
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between shrink-0 gap-3">
        <div>
          <h1 className="text-lg font-bold text-[#0f172a] flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-[#2563eb]" /> Ayarlar
          </h1>
          <p className="text-[12px] text-[#64748b]">Kaynakları yönet, Pomodoro ayarla, rapor indir.</p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button onClick={handleSeed} disabled={seeding}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-700 hover:bg-emerald-100 transition-all disabled:opacity-50">
            <Database className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{seeding ? 'Yükleniyor...' : seedDone ? '✓ Tamamlandı!' : 'İndeks Akademi Kaynakları Yükle'}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-1.5 shrink-0 pb-2 md:pb-0">
        {[
          { key: 'resources' as Tab, label: 'Kaynak Yönetimi' },
          { key: 'exam_settings' as Tab, label: 'Sınav Ayarları' },
          { key: 'pomodoro' as Tab, label: 'Pomodoro' },
          { key: 'exam_dates' as Tab, label: 'Sınav Tarihleri' },
          { key: 'export' as Tab, label: 'JSON Rapor' },
          ...(isAdmin ? [{ key: 'vocabulary' as Tab, label: 'YKS Kelimeleri' }] : [])
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`whitespace-nowrap px-4 py-2 rounded-lg text-[12px] font-medium transition-all ${tab === t.key ? 'bg-[#0a1628] text-white' : 'bg-white border border-[#e2e8f0] text-[#64748b] hover:text-[#0f172a]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 lg:overflow-hidden overflow-y-auto">
        {tab === 'resources' && (
          <div className="flex flex-col lg:flex-row h-full gap-3 pb-4 lg:pb-0">
            {/* Sol: Sınav kartları */}
            <div className="w-full lg:w-[280px] shrink-0 lg:overflow-y-auto space-y-2 lg:pr-1">
              {exams.map(exam => {
                const Icon = examIcons[exam.name] ?? Target
                const isOpen = openExam === exam.id
                const examSubjects = subjects.filter(s => s.exam_id === exam.id)
                return (
                  <div key={exam.id} className="rounded-xl border border-[#e2e8f0] bg-white overflow-hidden">
                    <button onClick={() => { setOpenExam(isOpen ? null : exam.id); setOpenSubject(null); setAddSubjectExam(exam.id) }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-[#f8fafc] transition-all group relative">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: exam.color }}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-[13px] font-bold text-[#0f172a]">{exam.name}</h3>
                        <p className="text-[10px] text-[#94a3b8]">{examSubjects.length} ders</p>
                      </div>
                      <div 
                        onClick={(e) => { e.stopPropagation(); deleteExam(exam.id); }}
                        className="opacity-0 group-hover:opacity-100 absolute right-10 h-7 w-7 flex items-center justify-center rounded text-red-400 hover:bg-red-50 transition-all z-10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </div>
                      {isOpen ? <ChevronDown className="h-4 w-4 text-[#94a3b8]" /> : <ChevronRight className="h-4 w-4 text-[#94a3b8]" />}
                    </button>
                    {isOpen && (
                      <div className="border-t border-[#e2e8f0] px-3 py-2 space-y-1">
                        {examSubjects.map(sub => (
                          <div key={sub.id} className="flex items-center group">
                            <button onClick={() => { setOpenSubject(sub.id); setAddResSubject(sub.id) }}
                              className={`flex-1 text-left px-2 py-1.5 rounded-md text-[12px] font-medium transition-all ${openSubject === sub.id ? 'bg-[#eff6ff] text-[#2563eb]' : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]'}`}>
                              {sub.name}
                            </button>
                            <button onClick={() => deleteSubject(sub.id)}
                              className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded text-red-400 hover:bg-red-50 transition-all">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        {/* Add subject */}
                        <div className="flex gap-1.5 mt-2 pt-2 border-t border-[#f1f5f9]">
                          <input value={addSubjectName} onChange={e => setAddSubjectName(e.target.value)} placeholder="Yeni ders adı..."
                            className="flex-1 h-7 rounded-md border border-[#e2e8f0] px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#2563eb]/30" />
                          <button onClick={addSubject} disabled={!addSubjectName.trim()}
                            className="h-7 w-7 flex items-center justify-center rounded-md bg-[#2563eb] text-white disabled:opacity-30">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              
              <div className="rounded-xl border border-[#e2e8f0] bg-white p-3 flex gap-2">
                <input value={addExamName} onChange={e => setAddExamName(e.target.value)} placeholder="Yeni sınav ekle..."
                  className="flex-1 h-8 rounded-lg border border-[#e2e8f0] px-3 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30" />
                <button onClick={addExam} disabled={!addExamName.trim()}
                  className="h-8 px-3 rounded-lg bg-[#2563eb] text-white text-[12px] font-bold disabled:opacity-40 flex items-center justify-center gap-1">
                  <Plus className="h-3 w-3" /> Ekle
                </button>
              </div>
            </div>

            {/* Sağ: Seçili dersin kaynakları */}
            <div className="flex-1 rounded-xl border border-[#e2e8f0] bg-white flex flex-col overflow-hidden min-h-[400px] lg:min-h-0 shrink-0">
              {openSubject ? (() => {
                const sub = subjects.find(s => s.id === openSubject)
                const subResources = resources.filter(r => r.subject_id === openSubject)
                const exam = exams.find(e => e.id === sub?.exam_id)
                return (
                  <>
                    <div className="border-b border-[#e2e8f0] px-5 py-3 shrink-0 flex items-center justify-between">
                      <div>
                        <h3 className="text-[13px] font-bold text-[#0f172a]">{sub?.name}</h3>
                        <p className="text-[10px] text-[#94a3b8]">{exam?.name} · {subResources.length} kaynak</p>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                      {subResources.map(r => (
                        <div key={r.id} className="flex items-center gap-3 rounded-lg border border-[#e2e8f0] p-3 group hover:shadow-sm transition-all">
                          <div className="flex-1 min-w-0">
                            {editId === r.id ? (
                              <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                                className="w-full h-7 rounded border border-[#2563eb] px-2 text-[12px] focus:outline-none" />
                            ) : (
                              <>
                                <p className="text-[12px] font-semibold text-[#0f172a] truncate">{r.name}</p>
                                <p className="text-[10px] text-[#94a3b8] flex items-center gap-2">
                                  <span className="px-1.5 py-0.5 rounded bg-[#f1f5f9] text-[9px] font-medium">{typeLabels[r.resource_type] ?? r.resource_type}</span>
                                  {r.author && <span>{r.author}</span>}
                                  {r.publisher && <span>· {r.publisher}</span>}
                                </p>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {editId === r.id ? (
                              <>
                                <button onClick={saveEditRes} className="h-6 w-6 flex items-center justify-center rounded text-emerald-500 hover:bg-emerald-50"><Check className="h-3.5 w-3.5" /></button>
                                <button onClick={() => setEditId(null)} className="h-6 w-6 flex items-center justify-center rounded text-[#94a3b8] hover:bg-[#f1f5f9]"><X className="h-3.5 w-3.5" /></button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEditRes(r)} className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded text-[#64748b] hover:bg-[#f1f5f9] transition-all"><Pencil className="h-3 w-3" /></button>
                                <button onClick={() => deleteResource(r.id)} className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded text-red-400 hover:bg-red-50 transition-all"><Trash2 className="h-3 w-3" /></button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Add resource form */}
                    <div className="border-t border-[#e2e8f0] px-4 py-3 shrink-0 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <input value={addResName} onChange={e => setAddResName(e.target.value)} placeholder="Kaynak adı"
                          className="col-span-2 h-8 rounded-lg border border-[#e2e8f0] px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#2563eb]/30" />
                        <select value={addResType} onChange={e => setAddResType(e.target.value)}
                          className="h-8 rounded-lg border border-[#e2e8f0] px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#2563eb]/30">
                          {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input value={addResAuthor} onChange={e => setAddResAuthor(e.target.value)} placeholder="Yazar (opsiyonel)"
                          className="h-8 rounded-lg border border-[#e2e8f0] px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#2563eb]/30" />
                        <input value={addResPublisher} onChange={e => setAddResPublisher(e.target.value)} placeholder="Yayınevi (opsiyonel)"
                          className="h-8 rounded-lg border border-[#e2e8f0] px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#2563eb]/30" />
                        <button onClick={addResource} disabled={!addResName.trim()}
                          className="h-8 rounded-lg bg-[#0a1628] text-white text-[11px] font-semibold hover:bg-[#1a365d] disabled:opacity-40 flex items-center justify-center gap-1">
                          <Plus className="h-3 w-3" /> Ekle
                        </button>
                      </div>
                      {addResType === 'video_ders' && (
                        <div className="grid grid-cols-2 gap-2 mt-2 p-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg">
                          <div>
                            <label className="text-[10px] font-semibold text-[#64748b] block mb-1">Toplam Video Sayısı</label>
                            <input type="number" min="0" value={addResTotalVideos} onChange={e => setAddResTotalVideos(e.target.value)} placeholder="Örn: 50"
                              className="w-full h-8 rounded border border-[#e2e8f0] px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#2563eb]/30" />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-[#64748b] block mb-1">Ortalama Süre (Dk)</label>
                            <input type="number" min="0" value={addResAvgDuration} onChange={e => setAddResAvgDuration(e.target.value)} placeholder="Örn: 35"
                              className="w-full h-8 rounded border border-[#e2e8f0] px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#2563eb]/30" />
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )
              })() : (
                <div className="flex-1 flex flex-col items-center justify-center text-[#94a3b8] text-[13px]">
                  <BookOpen className="h-10 w-10 mb-3 opacity-30" />
                  <p>Soldaki listeden bir sınav ve ders seçin.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'exam_settings' && (
          <div className="h-full overflow-y-auto px-4">
            <div className="flex flex-col gap-4 max-w-2xl mx-auto py-4">
              <h2 className="text-md font-bold text-[#0f172a]">Sınav Ayarları ve Soru Türleri</h2>
              <div className="p-4 rounded-xl border border-[#e2e8f0] bg-white space-y-4">
                <div>
                  <label className="text-xs font-semibold text-[#64748b] uppercase">Sınav Seç</label>
                  <CustomSelect
                    value={selExamSettings}
                    onChange={setSelExamSettings}
                    options={exams.map(e => ({ value: e.id, label: e.name }))}
                    placeholder="Sınav seçin..."
                    className="mt-1"
                  />
                </div>

                {selExamSettings && (
                  <>
                    <div className="border-t border-[#e2e8f0] pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-[#64748b] uppercase flex items-center gap-1">Yanlış Doğruyu Götürür Mü? <span title="Örn: 4 yanlış 1 doğru için 4 yazın. Boş bırakırsanız ceza uygulanmaz." className="cursor-help text-blue-500">(?)</span></label>
                        <input 
                          type="number" min="0" step="0.5" placeholder="Örn: 4"
                          value={editWrongPenalty} onChange={e => setEditWrongPenalty(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-[#64748b] uppercase">Net Başına Puan</label>
                        <input 
                          type="number" min="0.1" step="0.05" placeholder="Örn: 1.25"
                          value={editPointPerNet} onChange={e => setEditPointPerNet(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none"
                        />
                      </div>
                    </div>
                    <button onClick={saveExamSettings} className="w-full bg-[#2563eb] hover:bg-blue-600 text-white font-medium text-sm py-2 rounded-lg transition-all">Puanlama Ayarlarını Kaydet</button>

                    <div className="border-t border-[#e2e8f0] pt-4 mt-4">
                      <label className="text-xs font-semibold text-[#64748b] uppercase mb-2 block">Bu Sınavdaki Soru Türleri</label>
                      <div className="space-y-2 mb-3">
                        {questionTypes
                          .filter(q => q.exam_id === selExamSettings)
                          .sort((a, b) => a.sort_order - b.sort_order)
                          .map((q, idx, arr) => (
                            <div key={q.id} className="flex items-center justify-between p-2 rounded-lg bg-[#f8fafc] border border-[#e2e8f0]">
                              <span className="text-sm font-medium text-[#0f172a]">{q.name} {q.question_count > 0 && <span className="text-xs text-gray-400">({q.question_count} Soru)</span>}</span>
                              <div className="flex items-center gap-1">
                                <button 
                                  disabled={idx === 0}
                                  onClick={() => moveQuestionType(idx, 'up')}
                                  className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </button>
                                <button 
                                  disabled={idx === arr.length - 1}
                                  onClick={() => moveQuestionType(idx, 'down')}
                                  className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                                <button onClick={() => deleteQuestionType(q.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-all ml-1 cursor-pointer">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        {questionTypes.filter(q => q.exam_id === selExamSettings).length === 0 && (
                          <p className="text-xs text-[#94a3b8] italic">Henüz bu sınava soru türü eklenmedi.</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="text" placeholder="Örn: Paragraf, Dilbilgisi, Matematik..."
                          value={newQuestionType} onChange={e => setNewQuestionType(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addQuestionType()}
                          className="flex-1 rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none"
                        />
                        <input 
                          type="number" min="0" placeholder="Soru Sayısı"
                          value={newQuestionCount} onChange={e => setNewQuestionCount(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addQuestionType()}
                          className="w-24 rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none"
                        />
                        <button onClick={addQuestionType} className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-sm px-4 py-2 rounded-lg transition-all flex items-center gap-1 shrink-0 cursor-pointer">
                          <Plus className="h-4 w-4" /> Ekle
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="mt-4 p-4 rounded-xl border border-[#e2e8f0] bg-white space-y-4">
                <h3 className="text-sm font-bold text-[#0f172a] mb-2">Genel Ayarlar</h3>
                <div>
                  <label className="text-xs font-semibold text-[#64748b] uppercase">Off Day (Dinlenme Günü)</label>
                  <select
                    value={offDay}
                    onChange={(e) => setOffDay(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none"
                  >
                    <option value={0}>Yok (Boş gün istemiyorum)</option>
                    <option value={1}>Pazartesi</option>
                    <option value={2}>Salı</option>
                    <option value={3}>Çarşamba</option>
                    <option value={4}>Perşembe</option>
                    <option value={5}>Cuma</option>
                    <option value={6}>Cumartesi</option>
                    <option value={7}>Pazar</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'pomodoro' && pomSettings && (
          <div className="h-full flex items-start justify-center pt-8">
            <div className="w-full max-w-md rounded-xl border border-[#e2e8f0] bg-white p-6 space-y-5">
              <h3 className="text-sm font-bold text-[#0f172a] flex items-center gap-2"><Clock className="h-4 w-4 text-[#2563eb]" /> Pomodoro Ayarları</h3>
              <div className="rounded-lg bg-[#f8fafc] p-4 space-y-3">
                <h4 className="text-[12px] font-bold text-[#0f172a]">Uzun Pomodoro</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-[#94a3b8] uppercase">Odak (dk)</label>
                    <input type="number" min={10} max={120} value={pomSettings.long_focus_minutes}
                      onChange={e => setPomSettings({ ...pomSettings, long_focus_minutes: Number(e.target.value) })}
                      className="mt-1 w-full h-9 rounded-lg border border-[#e2e8f0] bg-white px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-[#94a3b8] uppercase">Mola (dk)</label>
                    <input type="number" min={1} max={30} value={pomSettings.long_break_minutes}
                      onChange={e => setPomSettings({ ...pomSettings, long_break_minutes: Number(e.target.value) })}
                      className="mt-1 w-full h-9 rounded-lg border border-[#e2e8f0] bg-white px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30" />
                  </div>
                </div>
              </div>
              <div className="rounded-lg bg-[#f8fafc] p-4 space-y-3">
                <h4 className="text-[12px] font-bold text-[#0f172a]">Kısa Pomodoro</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-[#94a3b8] uppercase">Odak (dk)</label>
                    <input type="number" min={5} max={60} value={pomSettings.short_focus_minutes}
                      onChange={e => setPomSettings({ ...pomSettings, short_focus_minutes: Number(e.target.value) })}
                      className="mt-1 w-full h-9 rounded-lg border border-[#e2e8f0] bg-white px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-[#94a3b8] uppercase">Mola (dk)</label>
                    <input type="number" min={1} max={15} value={pomSettings.short_break_minutes}
                      onChange={e => setPomSettings({ ...pomSettings, short_break_minutes: Number(e.target.value) })}
                      className="mt-1 w-full h-9 rounded-lg border border-[#e2e8f0] bg-white px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30" />
                  </div>
                </div>
              </div>
              <button onClick={handleSavePom} disabled={saving}
                className="w-full h-9 rounded-lg bg-[#0a1628] text-white text-[12px] font-semibold hover:bg-[#1a365d] disabled:opacity-40 flex items-center justify-center gap-1.5">
                <Save className="h-3.5 w-3.5" /> {saving ? 'Kaydediliyor...' : saved ? '✓ Kaydedildi!' : 'Kaydet'}
              </button>
            </div>
          </div>
        )}

        {tab === 'exam_dates' && (
          <div className="h-full flex items-start justify-center pt-8">
            <div className="w-full max-w-md rounded-xl border border-[#e2e8f0] bg-white p-6 space-y-4">
              <h3 className="text-sm font-bold text-[#0f172a] flex items-center gap-2"><Clock className="h-4 w-4 text-[#2563eb]" /> Sınav Tarihleri</h3>
              <p className="text-[12px] text-[#64748b]">Her sınav için tarih girin. Dashboard'da geri sayım gösterilecek.</p>
              <div className="space-y-3">
                {exams.map(exam => {
                  const Icon = examIcons[exam.name] ?? Target
                  return (
                    <div key={exam.id} className="flex items-center gap-3 rounded-lg border border-[#e2e8f0] p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white shrink-0" style={{ backgroundColor: exam.color }}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-[13px] font-bold text-[#0f172a] flex-1">{exam.name}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={pendingDates[exam.id] !== undefined ? pendingDates[exam.id] : (exam.exam_date ?? '')}
                          onChange={(e) => setPendingDates(prev => ({ ...prev, [exam.id]: e.target.value }))}
                          className="h-9 rounded-lg border border-[#e2e8f0] px-3 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                        />
                        {pendingDates[exam.id] !== undefined && pendingDates[exam.id] !== (exam.exam_date ?? '') && (
                          <button
                            onClick={async () => {
                              const val = pendingDates[exam.id] || null
                              await supabase.from('exams').update({ exam_date: val }).eq('id', exam.id)
                              setExams(prev => prev.map(ex => ex.id === exam.id ? { ...ex, exam_date: val } : ex))
                              setPendingDates(prev => { const n = { ...prev }; delete n[exam.id]; return n })
                            }}
                            className="h-9 px-3 rounded-lg bg-[#2563eb] text-white text-[11px] font-bold hover:bg-blue-600 transition-all flex items-center gap-1 shrink-0"
                          >
                            <Save className="h-3 w-3" /> Kaydet
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'export' && (
          <div className="h-full flex items-start justify-center pt-8">
            <div className="w-full max-w-sm bg-white rounded-xl border border-[#e2e8f0] p-5 md:p-6 flex flex-col items-center justify-center text-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#2563eb]">
                <Download className="h-7 w-7" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#0f172a] mb-1">JSON Rapor Oluştur</h4>
                <p className="text-[12px] text-[#64748b]">Haftayı seçerek plan ve çalışma verilerini JSON formatında indir.</p>
              </div>

              {/* Week Picker */}
              <div className="w-full flex items-center justify-between gap-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3 py-2.5">
                <button
                  onClick={() => setExportWeekOffset(o => o - 1)}
                  className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[#e2e8f0] text-[#64748b] transition-all cursor-pointer"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-[12px] font-semibold text-[#0f172a] text-center leading-tight">
                  {formatWeekLabel(exportWeekOffset)}
                </span>
                <button
                  onClick={() => setExportWeekOffset(o => Math.min(0, o + 1))}
                  disabled={exportWeekOffset >= 0}
                  className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[#e2e8f0] text-[#64748b] transition-all cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>

              <button onClick={handleExportJSON} disabled={generating}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#0a1628] px-5 py-2.5 text-[12px] font-semibold text-white hover:bg-[#1a365d] disabled:opacity-40 transition-all cursor-pointer">
                <Download className="h-3.5 w-3.5" /> {generating ? 'Oluşturuluyor...' : 'Raporu İndir (.json)'}
              </button>
            </div>
          </div>
        )}

        {tab === 'vocabulary' && isAdmin && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#f1f5f9]">
              <div>
                <h3 className="text-sm font-bold text-[#0f172a] flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-indigo-500" /> YKS/YDT Kelime Programı Düzenleme
                </h3>
                <p className="text-[11px] text-[#64748b] mt-0.5">Kelime listesini güncelleyin. Her gün için "Day [Sayı]" başlığıyla başlayıp yeni güne kadar kelimeleri alt alta yazın.</p>
              </div>
              <button 
                onClick={handleSaveVocabulary} 
                disabled={savingVocab}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 text-white font-bold text-xs px-4 py-2 hover:bg-indigo-600 transition-all cursor-pointer disabled:opacity-50 shrink-0 shadow-sm"
              >
                <Save className="h-4 w-4" /> {savingVocab ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
              </button>
            </div>
            
            <div className="flex-1 flex flex-col gap-2">
              <textarea 
                value={vocabText} 
                onChange={e => setVocabText(e.target.value)} 
                className="w-full h-[400px] md:h-[500px] rounded-lg border border-[#e2e8f0] p-3 text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold"
                placeholder="Day 1&#10;Academic Words...&#10;1 intervention&#10;2 accomplishment&#10;..."
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
