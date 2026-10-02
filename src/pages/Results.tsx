import './SuitePages.css'
import './Results.css'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Calendar, Award, List, X, Edit3, Eye } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import Swal from 'sweetalert2'
import CustomSelect from '../components/CustomSelect'
import { useAdminStore } from '../lib/adminStore'

interface Exam { id: string; name: string; color: string; wrong_penalty: number | null; point_per_net: number }
interface QuestionType { id: string; exam_id: string; name: string; sort_order: number; question_count: number }
interface ExamResult { id: string; exam_id: string; title: string; date: string; created_at: string; is_draft?: boolean }
interface ResultDetail { id: string; result_id: string; question_type_id: string; correct_count: number; incorrect_count: number }

type Tab = 'list' | 'stats'

export default function Results() {
  const [userId, setUserId] = useState<string | null>(null)
  const [exams, setExams] = useState<Exam[]>([])
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([])
  const [results, setResults] = useState<ExamResult[]>([])
  const [details, setDetails] = useState<ResultDetail[]>([])
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState<Tab>('list')
  const [selectedExamId, setSelectedExamId] = useState<string>('')
  const { impersonatedUserId } = useAdminStore()

  // Yeni Sonuç Form State
  const [formStep, setFormStep] = useState(0)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [metric, setMetric] = useState<'net' | 'points'>('net')
  const [showForm, setShowForm] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0])
  const [formExamId, setFormExamId] = useState('')
  const [formScores, setFormScores] = useState<Record<string, { correct: number | '', incorrect: number | '' }>>({})
  const [editingResultId, setEditingResultId] = useState<string | null>(null)
  const [selectedDetailResult, setSelectedDetailResult] = useState<ExamResult | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const targetUid = impersonatedUserId || user.id
        setUserId(targetUid)
        Promise.all([
          supabase.from('exams').select('*').eq('user_id', targetUid),
          supabase.from('exam_question_types').select('*').eq('user_id', targetUid).order('sort_order'),
          supabase.from('exam_results').select('*').eq('user_id', targetUid).order('date', { ascending: false }),
          supabase.from('exam_result_details').select('*').eq('user_id', targetUid)
        ]).then(([r1, r2, r3, r4]) => {
          if (r1.data) setExams(r1.data)
          if (r2.data) setQuestionTypes(r2.data)
          if (r3.data) setResults(r3.data)
          if (r4.data) setDetails(r4.data)
          if (r1.data && r1.data.length > 0) setSelectedExamId(r1.data[0].id)
          setLoading(false)
        })
      }
    })
  }, [impersonatedUserId])

  const handleExamChange = (examId: string) => {
    setFormStep(0)
    setFormError('')
    setFormExamId(examId)
    const types = questionTypes.filter(q => q.exam_id === examId)
    const initialScores: Record<string, { correct: number | '', incorrect: number | '' }> = {}
    types.forEach(t => initialScores[t.id] = { correct: '', incorrect: '' })
    setFormScores(initialScores)
  }

  const formTypes = questionTypes.filter(q => q.exam_id === formExamId)
  const currentType = formTypes[formStep - 1]
  const validateType = (type: QuestionType) => {
    const score = formScores[type.id]
    if (!score || score.correct === '' || score.incorrect === '') return 'Doğru ve yanlış sayısını girin. Yoksa 0 yazın.'
    if (![score.correct, score.incorrect].every(n => Number.isInteger(n) && n >= 0)) return 'Sayılar sıfır veya pozitif tam sayı olmalı.'
    if (type.question_count > 0 && Number(score.correct) + Number(score.incorrect) > type.question_count) return `Toplam ${type.question_count} soruyu geçemez.`
    return ''
  }
  const nextStep = () => {
    const error = formStep === 0 ? (!formTitle.trim() || !formDate || !formExamId ? 'Deneme adını, sınavı ve tarihi girin.' : !formTypes.length ? 'Bu sınav için Ayarlar’dan soru türü ekleyin.' : '') : currentType ? validateType(currentType) : ''
    setFormError(error)
    if (!error) setFormStep(step => step + 1)
  }

  const saveResult = async (saveAsDraft: boolean = false) => {
    if (saving || !userId || !formExamId || !formTitle.trim() || !formDate) return
    const errors = formTypes.map(type => {
      const score = formScores[type.id]
      if (saveAsDraft && (!score || score.correct === '' || score.incorrect === '')) {
        const c = Number(score?.correct || 0), w = Number(score?.incorrect || 0)
        return ![c, w].every(n => Number.isInteger(n) && n >= 0) || (type.question_count > 0 && c + w > type.question_count) ? 'Soru sayılarını kontrol edin.' : ''
      }
      return validateType(type)
    })
    const error = errors.find(Boolean)
    if (error) { setFormError(error); return }
    setSaving(true); setFormError('')
    try {
      const resultId = editingResultId || crypto.randomUUID()
      const response = editingResultId
        ? await supabase.from('exam_results').update({ title: formTitle.trim(), date: formDate }).eq('id', resultId).select().single()
        : await supabase.from('exam_results').insert({ id: resultId, user_id: userId, exam_id: formExamId, title: formTitle.trim(), date: formDate, is_draft: true }).select().single()
      if (response.error) throw response.error
      setEditingResultId(resultId)
      setResults(prev => [response.data, ...prev.filter(r => r.id !== resultId)])
      // Reuse detail IDs so edits never delete the previous answers first.
      const rows = formTypes.map(type => ({
        id: details.find(d => d.result_id === resultId && d.question_type_id === type.id)?.id || crypto.randomUUID(),
        user_id: userId, result_id: resultId, question_type_id: type.id,
        correct_count: Number(formScores[type.id]?.correct || 0), incorrect_count: Number(formScores[type.id]?.incorrect || 0),
      }))
      if (rows.length) {
        const saved = await supabase.from('exam_result_details').upsert(rows, { onConflict: 'id' }).select()
        if (saved.error) throw saved.error
        setDetails(prev => [...prev.filter(d => !rows.some(row => row.id === d.id)), ...saved.data])
      }
      const finalized = await supabase.from('exam_results').update({ is_draft: saveAsDraft }).eq('id', resultId).select().single()
      if (finalized.error) throw finalized.error
      setResults(prev => [finalized.data, ...prev.filter(r => r.id !== resultId)].sort((a, b) => b.date.localeCompare(a.date)))
      setShowForm(false); setFormTitle(''); setFormScores({}); setEditingResultId(null); setFormStep(0)
      void Swal.fire({ title: saveAsDraft ? 'Taslak kaydedildi' : 'Deneme kaydedildi', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 })
    } catch (e) {
      setFormError(`Kaydedilemedi: ${e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Tekrar deneyin.'}`)
    } finally { setSaving(false) }
  }

  const resumeDraft = (result: ExamResult) => {
    setEditingResultId(result.id)
    setFormExamId(result.exam_id)
    setFormTitle(result.title)
    setFormDate(result.date)

    const resDetails = details.filter(d => d.result_id === result.id)
    const scores: Record<string, { correct: number | '', incorrect: number | '' }> = {}

    const types = questionTypes.filter(q => q.exam_id === result.exam_id)
    types.forEach(t => {
      const d = resDetails.find(det => det.question_type_id === t.id)
      scores[t.id] = {
        correct: d ? d.correct_count : '',
        incorrect: d ? d.incorrect_count : ''
      }
    })
    setFormScores(scores)
    setFormStep(0)
    setFormError('')
    setShowForm(true)
  }

  const deleteResult = async (id: string) => {
    const confirm = await Swal.fire({ title: 'Emin misiniz?', text: 'Bu sonuç kalıcı olarak silinecek.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sil', cancelButtonText: 'İptal', confirmButtonColor: '#ef4444' })
    if (confirm.isConfirmed) {
      await supabase.from('exam_results').delete().eq('id', id)
      setResults(prev => prev.filter(r => r.id !== id))
      setDetails(prev => prev.filter(d => d.result_id !== id))
    }
  }

  const calculateScore = (examId: string, resultId: string) => {
    const exam = exams.find(e => e.id === examId)
    if (!exam) return { net: 0, points: 0, totalCorrect: 0, totalIncorrect: 0 }
    
    const resDetails = details.filter(d => d.result_id === resultId)
    let correct = 0; let incorrect = 0;
    resDetails.forEach(d => { correct += d.correct_count; incorrect += d.incorrect_count })
    
    let net = correct
    if (exam.wrong_penalty && exam.wrong_penalty > 0) {
      net = correct - (incorrect / exam.wrong_penalty)
    }
    const points = net * (exam.point_per_net || 1)
    return { net: Math.max(0, parseFloat(net.toFixed(2))), points: Math.max(0, parseFloat(points.toFixed(2))), totalCorrect: correct, totalIncorrect: incorrect }
  }

  const chartData = useMemo(() => {
    if (!selectedExamId) return []
    const examResults = results.filter(r => r.exam_id === selectedExamId && !r.is_draft).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    return examResults.map(r => {
      const stats = calculateScore(selectedExamId, r.id)
      return { name: r.title, date: new Date(r.date).toLocaleDateString('tr-TR'), net: stats.net, points: stats.points }
    })
  }, [results, details, selectedExamId, exams])

  const activeDrafts = useMemo(() => {
    const oneDayAgo = new Date().getTime() - 24 * 60 * 60 * 1000
    return results.filter(r => r.is_draft && new Date(r.created_at || r.date).getTime() > oneDayAgo)
  }, [results])

  const finalizedResults = useMemo(() => {
    return results.filter(r => !r.is_draft)
  }, [results])

  const comparisonData = useMemo(() => {
    if (!selectedExamId) return null
    const examResults = results.filter(r => r.exam_id === selectedExamId && !r.is_draft).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    if (examResults.length < 2) return null

    const latest = examResults[0]
    const previous = examResults[1]

    const latestStats = calculateScore(selectedExamId, latest.id)
    const previousStats = calculateScore(selectedExamId, previous.id)

    const latestDetails = details.filter(d => d.result_id === latest.id)
    const previousDetails = details.filter(d => d.result_id === previous.id)

    const diffs = questionTypes.filter(q => q.exam_id === selectedExamId).map(qt => {
      const latDet = latestDetails.find(d => d.question_type_id === qt.id)
      const prevDet = previousDetails.find(d => d.question_type_id === qt.id)

      const latC = latDet ? latDet.correct_count : 0
      const latI = latDet ? latDet.incorrect_count : 0
      const prevC = prevDet ? prevDet.correct_count : 0
      const prevI = prevDet ? prevDet.incorrect_count : 0

      const exam = exams.find(e => e.id === selectedExamId)
      let latNet = latC
      let prevNet = prevC
      if (exam && exam.wrong_penalty && exam.wrong_penalty > 0) {
        latNet = latC - (latI / exam.wrong_penalty)
        prevNet = prevC - (prevI / exam.wrong_penalty)
      }
      const netDiff = latNet - prevNet

      return {
        name: qt.name,
        latestCorrect: latC,
        latestIncorrect: latI,
        previousCorrect: prevC,
        previousIncorrect: prevI,
        netDiff: parseFloat(netDiff.toFixed(2)),
      }
    })

    return {
      latestTitle: latest.title,
      previousTitle: previous.title,
      latestNet: latestStats.net,
      previousNet: previousStats.net,
      latestPoints: latestStats.points,
      previousPoints: previousStats.points,
      diffs,
    }
  }, [results, details, selectedExamId, exams, questionTypes])

  if (loading) return <div className="h-full flex items-center justify-center text-[#718096]">Yükleniyor...</div>

  return (
    <div className="suite-page suite-results flex flex-col h-full gap-4 pb-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between shrink-0 gap-3">
        <div>
          <p className="suite-eyebrow">GELİŞİMİNİ TAKİP ET</p>
          <h1 className="text-2xl font-semibold text-[#24354a] flex items-center gap-2">
            <Award className="h-6 w-6 text-[#4269a8]" /> Denemeler
          </h1>
          <p className="text-[15px] text-[#62748b] mt-1">Sınav ve deneme sonuçlarını kaydet, gelişimini takip et.</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setFormStep(0); setFormError(''); if (!showForm) { setEditingResultId(null); setFormTitle(''); setFormExamId(''); setFormScores({}) } }} className="bg-[#4269a8] hover:bg-blue-600 text-white font-medium text-sm px-4 py-2 rounded-lg transition-all flex items-center gap-2 self-start md:self-auto">
          {showForm ? <List className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Listeye Dön' : 'Yeni Sonuç Ekle'}
        </button>
      </div>

      {!showForm && (
        <div className="flex overflow-x-auto gap-2 shrink-0 border-b border-[#e3e9f0] pb-2">
          <button onClick={() => setTab('list')} className={`px-4 py-2 text-sm font-medium transition-all border-b-2 ${tab === 'list' ? 'border-[#4269a8] text-[#4269a8]' : 'border-transparent text-[#62748b] hover:text-[#24354a]'}`}>Tüm Sonuçlar</button>
          <button onClick={() => setTab('stats')} className={`px-4 py-2 text-sm font-medium transition-all border-b-2 ${tab === 'stats' ? 'border-[#4269a8] text-[#4269a8]' : 'border-transparent text-[#62748b] hover:text-[#24354a]'}`}>Gelişim Grafikleri</button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {showForm ? (
          <form className="result-wizard" onSubmit={event => { event.preventDefault(); if (formStep <= formTypes.length) nextStep(); else void saveResult(false) }}>
            <div className="result-wizard-head"><h2>{editingResultId ? 'Denemeyi düzenle' : 'Yeni deneme'}</h2><span>{formStep === 0 ? 'Deneme bilgileri' : formStep <= formTypes.length ? `${formStep} / ${formTypes.length}` : 'Özet'}</span></div>
            <div className="result-step-track"><span style={{ width: `${(formStep + 1) / (formTypes.length + 2) * 100}%` }} /></div>
            {formStep === 0 ? <div className="result-fields">
              <label>Sınav<CustomSelect disabled={!!editingResultId || saving} value={formExamId} onChange={handleExamChange} options={exams.map(e => ({ value: e.id, label: e.name }))} placeholder="Sınav seç" /></label>
              <label>Tarih<input type="date" required value={formDate} onChange={e => setFormDate(e.target.value)} /></label>
              <label className="result-wide">Deneme adı<input required value={formTitle} placeholder="Örn. Pegem 3. Deneme" onChange={e => setFormTitle(e.target.value)} /></label>
            </div> : currentType ? <div key={currentType.id} className="result-question">
              <h3>{currentType.name}</h3><p>{currentType.question_count > 0 ? `${currentType.question_count} soru` : 'Soru sayısı tanımlanmamış'}</p>
              <div className="result-fields">{(['correct', 'incorrect'] as const).map((field, i) => <label key={field} className={i === 0 ? 'result-correct' : 'result-incorrect'}>{i === 0 ? 'Doğru' : 'Yanlış'}<input autoFocus={i === 0} type="number" inputMode="numeric" min="0" step="1" max={currentType.question_count || undefined} value={formScores[currentType.id]?.[field] ?? ''} onChange={e => { setFormError(''); setFormScores(p => ({ ...p, [currentType.id]: { correct: p[currentType.id]?.correct ?? '', incorrect: p[currentType.id]?.incorrect ?? '', [field]: e.target.value === '' ? '' : Number(e.target.value) } })) }} /></label>)}</div>
              {currentType.question_count > 0 && <p>Boş: {Math.max(0, currentType.question_count - Number(formScores[currentType.id]?.correct || 0) - Number(formScores[currentType.id]?.incorrect || 0))}</p>}
            </div> : <div className="result-review"><h3>{formTitle}</h3>{formTypes.map((type, i) => <button type="button" key={type.id} onClick={() => setFormStep(i + 1)}><span>{type.name}</span><strong>{formScores[type.id]?.correct || 0} D · {formScores[type.id]?.incorrect || 0} Y</strong></button>)}</div>}
            {formError && <p className="result-error" role="alert">{formError}</p>}
            <fieldset disabled={saving} className="result-wizard-actions"><button type="button" disabled={formStep === 0} onClick={() => { setFormStep(step => step - 1); setFormError('') }}>Geri</button><button type="button" disabled={!formTitle.trim() || !formExamId || !formDate} onClick={() => void saveResult(true)}>Taslak</button><button type="submit" className="result-primary">{saving ? 'Kaydediliyor…' : formStep > formTypes.length ? 'Kaydet' : 'Devam'}</button></fieldset>
          </form>
        ) : tab === 'list' ? (
          <div className="space-y-6">
            {activeDrafts.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[13px] font-semibold text-orange-600 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#f5f7fa]0 animate-pulse" />
                  Yarım Kalan Taslaklar (Son 24 Saat)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeDrafts.map(r => {
                    const exam = exams.find(e => e.id === r.exam_id)
                    return (
                      <div key={r.id} className="bg-[#f5f7fa]/40 border border-orange-100 rounded-xl p-4 flex flex-col justify-between hover:shadow-sm transition-all relative group min-h-[140px]">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: exam?.color || '#cbd5e1' }}>
                              {exam?.name || 'Bilinmeyen Sınav'}
                            </span>
                            <button onClick={() => deleteResult(r.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:bg-red-50 p-1.5 rounded transition-all cursor-pointer">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <h3 className="text-[14px] font-semibold text-[#24354a] line-clamp-2">{r.title}</h3>
                        </div>
                        <button 
                          onClick={() => resumeDraft(r)}
                          className="mt-4 w-full py-2 text-[13px] font-semibold text-[#526a87] bg-orange-100 hover:bg-orange-200 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="h-3.5 w-3.5" /> Doldurmaya Devam Et
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {activeDrafts.length > 0 && (
                <h3 className="text-[13px] font-semibold text-[#62748b] uppercase tracking-wider">
                  Tamamlanmış Sınavlar
                </h3>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {finalizedResults.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-[#718096] flex flex-col items-center">
                    <Award className="h-12 w-12 opacity-20 mb-3" />
                    <p>Henüz tamamlanmış sınav sonucu bulunmuyor.</p>
                  </div>
                ) : (
                  finalizedResults.map(r => {
                    const exam = exams.find(e => e.id === r.exam_id)
                    const stats = calculateScore(r.exam_id, r.id)
                    return (
                      <div key={r.id} className="bg-white rounded-2xl border border-[#e3e9f0] p-4 hover:shadow-sm transition-all relative group flex flex-col justify-between min-h-[180px]">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: exam?.color || '#cbd5e1' }}>{exam?.name || 'Bilinmeyen Sınav'}</span>
                              <h3 className="text-[14px] font-semibold text-[#24354a] mt-2 line-clamp-2">{r.title}</h3>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => resumeDraft(r)} className="opacity-0 group-hover:opacity-100 text-blue-500 hover:bg-blue-50 p-1.5 rounded transition-all cursor-pointer mr-1" title="Düzenle">
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button onClick={() => deleteResult(r.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:bg-red-50 p-1.5 rounded transition-all cursor-pointer" title="Sil">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-[13px] text-[#62748b] mb-4">
                            <Calendar className="h-3 w-3" /> {new Date(r.date).toLocaleDateString('tr-TR')}
                          </div>
                          <div className="grid grid-cols-3 gap-2 border-t border-[#e3e9f0] pt-3">
                            <div className="text-center">
                              <p className="text-[12px] text-[#718096] font-semibold uppercase">Doğru</p>
                              <p className="text-lg font-semibold text-emerald-600">{stats.totalCorrect}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-[12px] text-[#718096] font-semibold uppercase">Yanlış</p>
                              <p className="text-lg font-semibold text-red-500">{stats.totalIncorrect}</p>
                            </div>
                            <div className="text-center bg-[#f8fafc] rounded-lg p-1.5 flex flex-col justify-center">
                              <p className="text-[11px] text-[#62748b] font-semibold uppercase mb-0.5">Net & Puan</p>
                              <p className="text-[13px] font-semibold text-[#62748b]">{stats.net} Net</p>
                              <p className="text-sm font-semibold text-[#4269a8]">{stats.points} Puan</p>
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={() => setSelectedDetailResult(r)}
                          className="mt-3 w-full py-1.5 text-[13px] font-semibold text-[#4269a8] bg-blue-50 hover:bg-blue-100 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" /> Detayları Göster
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="result-analysis">
            <div className="result-analysis-filter"><CustomSelect value={selectedExamId} onChange={setSelectedExamId} options={exams.map(e => ({ value: e.id, label: e.name }))} /><div>{(['net', 'points'] as const).map(value => <button key={value} aria-pressed={metric === value} onClick={() => setMetric(value)}>{value === 'net' ? 'Net' : 'Puan'}</button>)}</div></div>
            {chartData.length === 0 ? <p className="result-empty">Bu sınav için henüz deneme sonucu yok.</p> : <>
              <div className="result-kpis">{[
                ['Son sonuç', chartData.at(-1)![metric].toFixed(2)],
                ['Ortalama', (chartData.reduce((sum, r) => sum + r[metric], 0) / chartData.length).toFixed(2)],
                ['En iyi', Math.max(...chartData.map(r => r[metric])).toFixed(2)],
                ['Son değişim', chartData.length > 1 ? ((chartData.at(-1)![metric] - chartData.at(-2)![metric]) >= 0 ? '+' : '') + (chartData.at(-1)![metric] - chartData.at(-2)![metric]).toFixed(2) : '—'],
              ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
              <section className="result-chart"><h3>{metric === 'net' ? 'Net gelişimi' : 'Puan gelişimi'} <span>{chartData.length} deneme</span></h3><div style={{ height: 210 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf1f6" /><XAxis dataKey="date" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} /><RechartsTooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''} /><Area type="linear" dataKey={metric} name={metric === 'net' ? 'Net' : 'Puan'} stroke="#4269a8" fill="#eaf0fa" strokeWidth={2} /></AreaChart></ResponsiveContainer></div></section>
              {comparisonData && <section className="result-topic-changes"><h3>Son iki deneme · soru türleri</h3><div className="result-topic-head"><span>Soru türü</span><span>Önceki → Son</span><span>Net farkı</span></div>{comparisonData.diffs.map(diff => <div key={diff.name}><span>{diff.name}</span><span>{diff.previousCorrect}D {diff.previousIncorrect}Y → {diff.latestCorrect}D {diff.latestIncorrect}Y</span><strong className={diff.netDiff < 0 ? 'result-down' : 'result-up'}>{diff.netDiff > 0 ? '+' : ''}{diff.netDiff}</strong></div>)}</section>}
            </>}
          </div>
        )}
      {/* Details Modal */}
      {selectedDetailResult && (() => {
        const exam = exams.find(e => e.id === selectedDetailResult.exam_id)
        const stats = calculateScore(selectedDetailResult.exam_id, selectedDetailResult.id)
        const resDetails = details.filter(d => d.result_id === selectedDetailResult.id)
        
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl border border-[#e3e9f0] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-5 border-b border-[#e3e9f0] flex justify-between items-center bg-[#f8fafc]">
                <div>
                  <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: exam?.color || '#cbd5e1' }}>
                    {exam?.name}
                  </span>
                  <h3 className="text-md font-semibold text-[#24354a] mt-1">{selectedDetailResult.title}</h3>
                  <p className="text-[13px] text-[#718096]">{new Date(selectedDetailResult.date).toLocaleDateString('tr-TR')}</p>
                </div>
                <button onClick={() => setSelectedDetailResult(null)} className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#e3e9f0] hover:bg-[#f1f5f9] text-[#62748b] transition-all cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>
              
              {/* Body */}
              <div className="p-5 flex-1 overflow-y-auto space-y-4">
                {/* Stats Summary */}
                <div className="grid grid-cols-3 gap-3 p-3 bg-[#f8fafc] rounded-2xl border border-[#e3e9f0]">
                  <div className="text-center">
                    <p className="text-[11px] text-[#718096] font-semibold uppercase">Doğru</p>
                    <p className="text-lg font-semibold text-emerald-600">{stats.totalCorrect}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] text-[#718096] font-semibold uppercase">Yanlış</p>
                    <p className="text-lg font-semibold text-red-500">{stats.totalIncorrect}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] text-[#718096] font-semibold uppercase">Toplam Net</p>
                    <p className="text-lg font-semibold text-[#4269a8]">{stats.net}</p>
                  </div>
                </div>

                {/* Details list */}
                <div className="space-y-2">
                  <h4 className="text-[13px] font-semibold text-[#24354a] uppercase tracking-wider">Konu Detayları</h4>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {questionTypes
                      .filter(q => q.exam_id === selectedDetailResult.exam_id)
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map(qt => {
                        const det = resDetails.find(d => d.question_type_id === qt.id)
                        const correct = det ? det.correct_count : 0
                        const incorrect = det ? det.incorrect_count : 0
                        
                        let typeNet = correct
                        if (exam && exam.wrong_penalty && exam.wrong_penalty > 0) {
                          typeNet = correct - (incorrect / exam.wrong_penalty)
                        }
                        
                        return (
                          <div key={qt.id} className="flex justify-between items-center p-3 rounded-lg border border-[#e3e9f0] bg-white text-[13px]">
                            <div className="flex flex-col text-left">
                              <span className="font-semibold text-[#24354a]">{qt.name}</span>
                              {qt.question_count > 0 && (
                                <span className="text-[12px] text-gray-400">Toplam Soru: {qt.question_count}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-emerald-600 font-semibold">{correct} D</span>
                              <span className="text-red-500 font-semibold">{incorrect} Y</span>
                              <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-100 text-[#4269a8] font-semibold">
                                {typeNet.toFixed(2)} Net
                              </span>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
      </div>
    </div>
  )
}
