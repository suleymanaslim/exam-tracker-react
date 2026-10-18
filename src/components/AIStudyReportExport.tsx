import { useEffect, useRef, useState } from 'react'
import { BrainCircuit, Check, Copy, Download, LoaderCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { buildAIStudyReport } from '../lib/aiStudyReport'
import { fetchAIReportData } from '../lib/aiStudyReportData'

export default function AIStudyReportExport({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false)
  const [json, setJson] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [generatedAt, setGeneratedAt] = useState('')
  const [counts, setCounts] = useState('')
  const mounted = useRef(false)
  const submitting = useRef(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDetailsElement>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const generate = async () => {
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError(''); setJson(''); setCopied(false)
    try {
      const data = await fetchAIReportData(supabase, userId)
      if (!mounted.current) return
      const report = buildAIStudyReport(data)
      setJson(JSON.stringify(report, null, 2))
      setGeneratedAt(report.olusturulma_zamani)
      setCounts(`${report.kayit_sayilari.analize_dahil_calisma} çalışma · ${report.kayit_sayilari.analize_dahil_soru_kaydi} soru kaydı · ${report.kayit_sayilari.kesinlesmis_deneme} deneme`)
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : 'Rapor oluşturulamadı. Tekrar dene.') }
    finally { submitting.current = false; if (mounted.current) setBusy(false) }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `kisisel-ai-calisma-analizi-${generatedAt.slice(0, 10)}.json`
    document.body.appendChild(anchor); anchor.click(); anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(json); if (mounted.current) { setCopied(true); setError('') } }
    catch { if (mounted.current) { setError('Otomatik kopyalanamadı. Aşağıdaki metni seçip kopyalayabilir veya dosyayı indirebilirsin.'); if (previewRef.current) previewRef.current.open = true; textRef.current?.focus(); textRef.current?.select() } }
  }
  const button = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50'
  return <section className="mx-auto w-full max-w-2xl rounded-2xl border border-[#e3e9f0] bg-white p-5 md:p-7" aria-busy={busy}>
    <div className="mb-5 flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#edf2f8] text-[#4269a8]"><BrainCircuit size={21} /></span><div><h2 className="text-lg font-semibold text-[#24354a]">Kişisel AI çalışma analizi</h2><p className="mt-1 text-sm leading-relaxed text-[#62748b]">Tüm geçmişin, bu hafta ve son tamamlanan hafta; tek JSON ve hazır analiz promptu.</p></div></div>
    <div className="grid gap-3 border-y border-[#e3e9f0] py-4 text-sm sm:grid-cols-2">
      <p><strong className="block font-semibold text-[#24354a]">Plan ve gerçekleşen</strong><span className="text-[#62748b]">Dersler, süreler, videolar, soru hedefleri ve çözümler.</span></p>
      <p><strong className="block font-semibold text-[#24354a]">Kişiye özel öneriler</strong><span className="text-[#62748b]">AGS öncelikleri, deneme değişimleri ve gelecek haftanın çalışma + soru planı.</span></p>
    </div>
    <p className="my-4 text-sm leading-relaxed text-[#62748b]">JSON’u kullandığın AI’ya yükleyip <span className="font-semibold text-[#24354a]">“İçindeki promptu uygula”</span> yaz. Dosya, seçili hesabın çalışma notlarını da içerir.</p>
    <button type="button" className={`${button} w-full bg-[#4269a8] text-white hover:bg-[#365c96] sm:w-auto`} onClick={() => void generate()} disabled={busy}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <BrainCircuit size={16} />}{busy ? 'Tüm kayıtlar hazırlanıyor…' : json ? 'JSON’u güncelle' : 'AI analiz JSON’unu oluştur'}</button>
    <div aria-live="polite">{error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {json && <div className="mt-5 space-y-3"><p className="text-sm text-[#62748b]">{counts}<br /><span className="text-xs">Hazırlanma: {new Date(generatedAt).toLocaleString('tr-TR')}</span></p><div className="flex flex-wrap gap-2"><button type="button" className={`${button} bg-[#4269a8] text-white hover:bg-[#365c96]`} onClick={download}><Download size={16} /> JSON’u indir</button><button type="button" className={`${button} border border-[#e3e9f0] text-[#4269a8] hover:bg-[#f8fafc]`} onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Kopyalandı' : 'JSON’u kopyala'}</button></div><details ref={previewRef} className="text-sm text-[#62748b]"><summary className="cursor-pointer py-1">JSON’u görüntüle</summary><textarea ref={textRef} aria-label="AI analiz JSON içeriği" readOnly value={json} className="mt-2 h-56 w-full resize-y rounded-lg border border-[#e3e9f0] bg-[#f8fafc] p-3 font-mono text-xs text-[#24354a]" /></details></div>}
    </div>
  </section>
}
