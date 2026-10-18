import { useEffect, useRef, useState } from 'react'
import { Layers3 } from 'lucide-react'
import Swal from 'sweetalert2'
import { supabase } from '../lib/supabase'
import { examTemplateError, examTemplateKey, readExamTemplate } from '../lib/examTemplates'
import type { ExamTemplate } from '../lib/examTemplates'

interface Props {
  userId: string; examId: string; examName: string; questionTypeCount: number;
  canPublish: boolean; onApplied: () => void
}

export default function ExamTemplatePanel({ userId, examId, examName, questionTypeCount, canPublish, onApplied }: Props) {
  const [templates, setTemplates] = useState<ExamTemplate[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const mounted = useRef(false)

  async function loadTemplates() {
    try {
      const { data, error } = await supabase.from('exam_templates').select('*').order('name')
      if (error) throw error
      const rows = (data || []).map(readExamTemplate)
      if (mounted.current) { setTemplates(rows); setError('') }
    } catch (error) { if (mounted.current) setError(examTemplateError(error)) }
    finally { if (mounted.current) setLoading(false) }
  }
  useEffect(() => {
    mounted.current = true
    void loadTemplates()
    return () => { mounted.current = false }
  }, [])

  const apply = async () => {
    if (submitting.current || loading || !templates.length) return
    submitting.current = true; setBusy(true); setError('')
    try {
      const { data, error } = await supabase.rpc('apply_exam_templates', { p_user_id: userId, p_template_key: selected || null })
      if (error) throw error
      if (!data || !Number.isInteger(data.initialized_exams)) throw new Error('Apply not confirmed')
      if (!mounted.current) return
      onApplied()
      void Swal.fire({ icon: 'success', title: data.initialized_exams > 0 ? `${data.initialized_exams} sınavın ayarları eklendi` : 'Eksik başlangıç ayarı yok', text: 'Mevcut soru türleri ve deneme kayıtları korundu.', toast: true, position: 'top-end', showConfirmButton: false, timer: 2400 })
    } catch (error) { if (mounted.current) setError(examTemplateError(error)) }
    finally { submitting.current = false; if (mounted.current) setBusy(false) }
  }
  const publish = async () => {
    if (submitting.current || !canPublish || !examId || !questionTypeCount || !examTemplateKey(examName)) return
    const confirmation = await Swal.fire({ title: `${examName} ortak şablonu`, text: `${questionTypeCount} soru türü, sırası, soru sayıları ve puanlama ayarları paylaşılacak. Eksik hesaplar tamamlanacak; kişisel ayarlar korunacak.`, showCancelButton: true, confirmButtonText: 'Şablonu paylaş', cancelButtonText: 'Vazgeç' })
    if (!confirmation.isConfirmed || submitting.current || !mounted.current) return
    submitting.current = true; setBusy(true); setError('')
    try {
      const { data, error } = await supabase.rpc('publish_exam_template', { p_exam_id: examId })
      if (error) throw error
      if (!data || !Number.isInteger(data.accounts_checked)) throw new Error('Publish not confirmed')
      if (!mounted.current) return
      await loadTemplates()
      if (!mounted.current) return
      onApplied()
      void Swal.fire({ icon: 'success', title: 'Ortak şablon güncellendi', text: `${data.accounts_checked} hesap kontrol edildi; eksik ayarlar tamamlandı.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 })
    } catch (error) { if (mounted.current) setError(examTemplateError(error)) }
    finally { submitting.current = false; if (mounted.current) setBusy(false) }
  }
  const template = templates.find(item => item.template_key === selected)
  return <section className="exam-template-panel" aria-label="Başlangıç sınav şablonları" aria-busy={busy || loading}>
    <h3><Layers3 size={16} /> Başlangıç şablonları</h3>
    <p>Hazır soru türlerini ve soru sayılarını ekle. Kişisel ayarların korunur.</p>
    <div className="exam-template-actions"><select aria-label="Başlangıç şablonu" disabled={busy || loading || !templates.length} value={selected} onChange={event => setSelected(event.target.value)}><option value="">Tüm eksik sınavlar</option>{templates.map(item => <option key={item.template_key} value={item.template_key}>{item.name} · {item.question_types.reduce((sum, q) => sum + q.question_count, 0)} soru</option>)}</select><button type="button" onClick={() => void apply()} disabled={busy || loading || !templates.length}>{busy ? 'İşleniyor…' : 'Eksikleri ekle'}</button></div>
    {template && <p className="exam-template-note">{template.description}</p>}
    {!loading && !templates.some(item => item.template_key === 'yds') && canPublish && <p className="exam-template-note">YDS şablonu henüz yok. Kendi YDS sınavını seçip aşağıdaki düğmeyle paylaşabilirsin.</p>}
    {canPublish && examTemplateKey(examName) && <button type="button" className="exam-template-publish" disabled={busy || loading || !questionTypeCount || !!error} onClick={() => void publish()}>Seçili {examName} ayarlarını ortak şablon yap</button>}
    {error && <p className="exam-template-error" role="alert">{error}<button type="button" disabled={busy} onClick={() => void loadTemplates()}>Yeniden dene</button></p>}
  </section>
}
