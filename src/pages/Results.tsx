import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, TrendingUp, Calendar, Award, List, X, Edit3, Eye } from 'lucide-react'
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
    setFormExamId(examId)
    const types = questionTypes.filter(q => q.exam_id === examId)
    const initialScores: Record<string, { correct: number | '', incorrect: number | '' }> = {}
    types.forEach(t => initialScores[t.id] = { correct: '', incorrect: '' })
    setFormScores(initialScores)
  }

  const saveResult = async (saveAsDraft: boolean = false) => {
    if (!userId || !formExamId || !formTitle.trim()) return

    let resData: ExamResult | null = null

    if (editingResultId) {
      const { data } = await supabase.from('exam_results').update({
        title: formTitle.trim(), date: formDate, is_draft: saveAsDraft
      }).eq('id', editingResultId).select().single()
      resData = data
    } else {
      const { data } = await supabase.from('exam_results').insert({
        user_id: userId, exam_id: formExamId, title: formTitle.trim(), date: formDate, is_draft: saveAsDraft
      }).select().single()
      resData = data
    }

    if (resData) {
      if (editingResultId) {
        await supabase.from('exam_result_details').delete().eq('result_id', resData.id)
        setDetails(prev => prev.filter(d => d.result_id !== resData!.id))
      }

      const detailsToInsert = Object.entries(formScores).map(([qtId, scores]) => ({
        user_id: userId, result_id: resData!.id, question_type_id: qtId,
        correct_count: scores.correct === '' ? 0 : Number(scores.correct),
        incorrect_count: scores.incorrect === '' ? 0 : Number(scores.incorrect)
      }))

      if (detailsToInsert.length > 0) {
        const { data: detData } = await supabase.from('exam_result_details').insert(detailsToInsert).select()
        if (detData) setDetails(prev => [...prev, ...detData])
      }

      if (editingResultId) {
        const updatedRes = resData
        setResults(prev => prev.map(r => r.id === updatedRes.id ? updatedRes : r).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))
      } else {
        const insertedRes = resData
        setResults(prev => [insertedRes, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))
      }

      setShowForm(false)
      setFormTitle('')
      setFormScores({})
      setEditingResultId(null)
      Swal.fire({ title: 'Başarılı!', text: saveAsDraft ? 'Taslak kaydedildi.' : 'Sınav sonucu eklendi.', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 })
    }
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

  if (loading) return <div className="h-full flex items-center justify-center text-[#94a3b8]">Yükleniyor...</div>

  return (
    <div className="flex flex-col h-full gap-4 pb-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between shrink-0 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a] flex items-center gap-2">
            <Award className="h-6 w-6 text-[#2563eb]" /> Denemeler
          </h1>
          <p className="text-[13px] text-[#64748b] mt-1">Sınav ve deneme sonuçlarını kaydet, gelişimini takip et.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="bg-[#2563eb] hover:bg-blue-600 text-white font-medium text-sm px-4 py-2 rounded-lg transition-all flex items-center gap-2 self-start md:self-auto">
          {showForm ? <List className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Listeye Dön' : 'Yeni Sonuç Ekle'}
        </button>
      </div>

      {!showForm && (
        <div className="flex overflow-x-auto gap-2 shrink-0 border-b border-[#e2e8f0] pb-2">
          <button onClick={() => setTab('list')} className={`px-4 py-2 text-sm font-medium transition-all border-b-2 ${tab === 'list' ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-[#64748b] hover:text-[#0f172a]'}`}>Tüm Sonuçlar</button>
          <button onClick={() => setTab('stats')} className={`px-4 py-2 text-sm font-medium transition-all border-b-2 ${tab === 'stats' ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-[#64748b] hover:text-[#0f172a]'}`}>Gelişim Grafikleri</button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {showForm ? (
          <div className="max-w-2xl mx-auto bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm mt-4">
            <h2 className="text-lg font-bold text-[#0f172a] mb-4">Yeni Deneme Ekle</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-[#64748b] uppercase">Sınav</label>
                  <CustomSelect
                    value={formExamId}
                    onChange={handleExamChange}
                    options={exams.map(e => ({ value: e.id, label: e.name }))}
                    placeholder="Sınav Seçin..."
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#64748b] uppercase">Tarih</label>
                  <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="mt-1 w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm focus:border-[#2563eb] outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#64748b] uppercase">Deneme Adı / Başlığı</label>
                <input type="text" placeholder="Örn: 2024 YDS İlkbahar, Pegem 3. Deneme" value={formTitle} onChange={e => setFormTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm focus:border-[#2563eb] outline-none" />
              </div>

              {formExamId && questionTypes.filter(q => q.exam_id === formExamId).length > 0 ? (
                <div className="border-t border-[#e2e8f0] pt-4 mt-2">
                  <h3 className="text-sm font-bold text-[#0f172a] mb-3">Soru Türlerine Göre Doğru/Yanlış</h3>
                  <div className="space-y-3">
                    {questionTypes.filter(q => q.exam_id === formExamId).map(qt => (
                      <div key={qt.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#f8fafc] rounded-xl border border-[#e2e8f0]">
                        <div className="flex flex-col text-left">
                          <span className="text-sm font-bold text-[#0f172a]">{qt.name}</span>
                          {qt.question_count > 0 && (
                            <span className="text-[11px] text-gray-400">{qt.question_count} Soru</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 sm:flex sm:items-center gap-3">
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wide">Doğru</span>
                            <input type="number" min="0" value={formScores[qt.id]?.correct} onChange={e => {
                              const val = e.target.value === '' ? '' : parseInt(e.target.value);
                              setFormScores(p => ({...p, [qt.id]: { ...p[qt.id], correct: val }}));
                            }} className="w-full sm:w-20 h-11 rounded-xl border-2 border-emerald-200 px-3 text-center text-lg font-bold outline-none focus:border-emerald-500 bg-white" />
                          </div>
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="text-[11px] font-bold text-red-500 uppercase tracking-wide">Yanlış</span>
                            <input type="number" min="0" value={formScores[qt.id]?.incorrect} onChange={e => {
                              const val = e.target.value === '' ? '' : parseInt(e.target.value);
                              setFormScores(p => ({...p, [qt.id]: { ...p[qt.id], incorrect: val }}));
                            }} className="w-full sm:w-20 h-11 rounded-xl border-2 border-red-200 px-3 text-center text-lg font-bold outline-none focus:border-red-500 bg-white" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : formExamId ? (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
                  Bu sınav için henüz soru türü tanımlanmamış. Önce "Ayarlar -&gt; Sınav Ayarları" menüsünden soru türlerini (Örn: Paragraf, Matematik) eklemelisiniz.
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 mt-4">
                <button 
                  onClick={() => saveResult(true)} 
                  disabled={!formTitle || !formExamId} 
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all disabled:opacity-50 cursor-pointer text-sm"
                >
                  Taslak Olarak Kaydet
                </button>
                <button 
                  onClick={() => saveResult(false)} 
                  disabled={!formTitle || !formExamId} 
                  className="bg-[#2563eb] hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 cursor-pointer text-sm"
                >
                  Kaydet ve Tamamla
                </button>
              </div>
            </div>
          </div>
        ) : tab === 'list' ? (
          <div className="space-y-6">
            {activeDrafts.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-orange-600 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                  Yarım Kalan Taslaklar (Son 24 Saat)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeDrafts.map(r => {
                    const exam = exams.find(e => e.id === r.exam_id)
                    return (
                      <div key={r.id} className="bg-orange-50/40 border border-orange-100 rounded-xl p-4 flex flex-col justify-between hover:shadow-md transition-all relative group min-h-[140px]">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: exam?.color || '#cbd5e1' }}>
                              {exam?.name || 'Bilinmeyen Sınav'}
                            </span>
                            <button onClick={() => deleteResult(r.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:bg-red-50 p-1.5 rounded transition-all cursor-pointer">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <h3 className="text-[14px] font-bold text-[#0f172a] line-clamp-2">{r.title}</h3>
                        </div>
                        <button 
                          onClick={() => resumeDraft(r)}
                          className="mt-4 w-full py-2 text-xs font-bold text-orange-700 bg-orange-100 hover:bg-orange-200 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
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
                <h3 className="text-xs font-bold text-[#64748b] uppercase tracking-wider">
                  Tamamlanmış Sınavlar
                </h3>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {finalizedResults.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-[#94a3b8] flex flex-col items-center">
                    <Award className="h-12 w-12 opacity-20 mb-3" />
                    <p>Henüz tamamlanmış sınav sonucu bulunmuyor.</p>
                  </div>
                ) : (
                  finalizedResults.map(r => {
                    const exam = exams.find(e => e.id === r.exam_id)
                    const stats = calculateScore(r.exam_id, r.id)
                    return (
                      <div key={r.id} className="bg-white rounded-xl border border-[#e2e8f0] p-4 hover:shadow-md transition-all relative group flex flex-col justify-between min-h-[180px]">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: exam?.color || '#cbd5e1' }}>{exam?.name || 'Bilinmeyen Sınav'}</span>
                              <h3 className="text-[14px] font-bold text-[#0f172a] mt-2 line-clamp-2">{r.title}</h3>
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
                          <div className="flex items-center gap-1 text-[11px] text-[#64748b] mb-4">
                            <Calendar className="h-3 w-3" /> {new Date(r.date).toLocaleDateString('tr-TR')}
                          </div>
                          <div className="grid grid-cols-3 gap-2 border-t border-[#e2e8f0] pt-3">
                            <div className="text-center">
                              <p className="text-[10px] text-[#94a3b8] font-semibold uppercase">Doğru</p>
                              <p className="text-lg font-bold text-emerald-600">{stats.totalCorrect}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-[10px] text-[#94a3b8] font-semibold uppercase">Yanlış</p>
                              <p className="text-lg font-bold text-red-500">{stats.totalIncorrect}</p>
                            </div>
                            <div className="text-center bg-[#f8fafc] rounded-lg p-1.5 flex flex-col justify-center">
                              <p className="text-[9px] text-[#64748b] font-bold uppercase mb-0.5">Net & Puan</p>
                              <p className="text-xs font-semibold text-[#64748b]">{stats.net} Net</p>
                              <p className="text-sm font-black text-[#2563eb]">{stats.points} Puan</p>
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={() => setSelectedDetailResult(r)}
                          className="mt-3 w-full py-1.5 text-xs font-bold text-[#2563eb] bg-blue-50 hover:bg-blue-100 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
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
          <div className="flex flex-col gap-4 mt-2">
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="text-xs font-semibold text-[#64748b] uppercase">Hangi Sınavın Gelişimini Görmek İstiyorsun?</label>
              <CustomSelect
                value={selectedExamId}
                onChange={setSelectedExamId}
                options={exams.map(e => ({ value: e.id, label: e.name }))}
                className="w-full sm:w-[250px]"
              />
            </div>
            
            {chartData.length < 2 ? (
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-12 text-center text-[#94a3b8]">
                <TrendingUp className="h-12 w-12 mx-auto opacity-20 mb-3" />
                <p>Grafik çizebilmek için bu sınava ait en az 2 deneme sonucu girmelisiniz.</p>
              </div>
            ) : (
              <>
                {comparisonData && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Sol/Orta: Karşılaştırma dairesi */}
                    <div className="md:col-span-1 bg-white rounded-xl border border-[#e2e8f0] p-5 flex flex-col items-center justify-center relative min-h-[220px]">
                      <h4 className="text-[11px] font-bold text-[#64748b] uppercase mb-4 tracking-wider">Son İki Deneme Kıyaslama</h4>
                      <div className="relative flex items-center justify-center">
                        <div className="w-28 h-28 rounded-full border-[6px] border-[#2563eb] flex flex-col items-center justify-center bg-blue-50/20 shadow-inner">
                          <span className="text-[9px] font-bold text-[#64748b] uppercase">Son Net</span>
                          <span className="text-2xl font-black text-[#0f172a]">{comparisonData.latestNet}</span>
                          <span className="text-[9px] text-[#2563eb] font-bold mt-0.5">{comparisonData.latestPoints} Puan</span>
                        </div>
                      </div>
                      
                      {/* Sol Alt: Önceki Net */}
                      <div className="mt-4 flex flex-col items-center">
                        <span className="text-[9px] font-bold text-[#94a3b8] uppercase tracking-wider">Önceki Net</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-sm font-bold text-[#64748b]">{comparisonData.previousNet}</span>
                          <span className="text-[10px] text-gray-400 font-semibold">({comparisonData.previousPoints} Puan)</span>
                        </div>
                      </div>
                    </div>

                    {/* Sağ: Soru Tipi Gelişimleri */}
                    <div className="md:col-span-2 bg-white rounded-xl border border-[#e2e8f0] p-5 flex flex-col justify-between">
                      <h4 className="text-[11px] font-bold text-[#0f172a] mb-3 uppercase tracking-wider">
                        Konu Bazlı Net Değişimleri
                      </h4>
                      <div className="flex-1 overflow-y-auto space-y-2 max-h-[160px] pr-1">
                        {comparisonData.diffs.map((diff, idx) => {
                          const isUp = diff.netDiff > 0
                          const isDown = diff.netDiff < 0
                          return (
                            <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] text-[11px]">
                              <span className="font-semibold text-[#0f172a]">{diff.name}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-[#94a3b8] text-[10px]">
                                  {diff.previousCorrect}D {diff.previousIncorrect}Y ➜ {diff.latestCorrect}D {diff.latestIncorrect}Y
                                </span>
                                {isUp && (
                                  <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold flex items-center gap-0.5">
                                    +{diff.netDiff} Net 📈
                                  </span>
                                )}
                                {isDown && (
                                  <span className="px-2 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 font-bold flex items-center gap-0.5">
                                    {diff.netDiff} Net 📉
                                  </span>
                                )}
                                {!isUp && !isDown && (
                                  <span className="px-2 py-0.5 rounded bg-gray-50 border border-gray-200 text-gray-600 font-semibold">
                                    Değişim yok
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 h-[320px] flex flex-col">
                <h3 className="text-sm font-bold text-[#0f172a] mb-6 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[#2563eb]" /> Net / Puan Gelişimi
                </h3>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} dy={10} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        labelStyle={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '4px' }}
                      />
                      <Area type="monotone" name="Net" dataKey="net" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorNet)" activeDot={{ r: 6, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }} />
                      <Area type="monotone" name="Puan" dataKey="points" stroke="#8b5cf6" strokeWidth={3} fillOpacity={0} activeDot={{ r: 6, fill: '#8b5cf6', stroke: '#fff', strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
          </div>
        )}
      {/* Details Modal */}
      {selectedDetailResult && (() => {
        const exam = exams.find(e => e.id === selectedDetailResult.exam_id)
        const stats = calculateScore(selectedDetailResult.exam_id, selectedDetailResult.id)
        const resDetails = details.filter(d => d.result_id === selectedDetailResult.id)
        
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-5 border-b border-[#e2e8f0] flex justify-between items-center bg-[#f8fafc]">
                <div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: exam?.color || '#cbd5e1' }}>
                    {exam?.name}
                  </span>
                  <h3 className="text-md font-bold text-[#0f172a] mt-1">{selectedDetailResult.title}</h3>
                  <p className="text-xs text-[#94a3b8]">{new Date(selectedDetailResult.date).toLocaleDateString('tr-TR')}</p>
                </div>
                <button onClick={() => setSelectedDetailResult(null)} className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#e2e8f0] hover:bg-[#f1f5f9] text-[#64748b] transition-all cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>
              
              {/* Body */}
              <div className="p-5 flex-1 overflow-y-auto space-y-4">
                {/* Stats Summary */}
                <div className="grid grid-cols-3 gap-3 p-3 bg-[#f8fafc] rounded-xl border border-[#e2e8f0]">
                  <div className="text-center">
                    <p className="text-[9px] text-[#94a3b8] font-bold uppercase">Doğru</p>
                    <p className="text-lg font-black text-emerald-600">{stats.totalCorrect}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-[#94a3b8] font-bold uppercase">Yanlış</p>
                    <p className="text-lg font-black text-red-500">{stats.totalIncorrect}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-[#94a3b8] font-bold uppercase">Toplam Net</p>
                    <p className="text-lg font-black text-[#2563eb]">{stats.net}</p>
                  </div>
                </div>

                {/* Details list */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-[#0f172a] uppercase tracking-wider">Konu Detayları</h4>
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
                          <div key={qt.id} className="flex justify-between items-center p-3 rounded-lg border border-[#e2e8f0] bg-white text-xs">
                            <div className="flex flex-col text-left">
                              <span className="font-semibold text-[#0f172a]">{qt.name}</span>
                              {qt.question_count > 0 && (
                                <span className="text-[10px] text-gray-400">Toplam Soru: {qt.question_count}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-emerald-600 font-bold">{correct} D</span>
                              <span className="text-red-500 font-bold">{incorrect} Y</span>
                              <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-100 text-[#2563eb] font-bold">
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
