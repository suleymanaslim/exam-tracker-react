import { useState } from 'react'
import { BookMarked, Check, Pencil, RefreshCw, Users, X } from 'lucide-react'
import { topicSourceLabel } from '../lib/agsTopicSource'
import type { AgsTopicSource } from '../lib/agsTopicSource'
import '../pages/MonthlyPlan.css'

interface Props { source: AgsTopicSource | null; loading: boolean; saving: boolean; error: string; onChoose: (source: AgsTopicSource) => Promise<boolean>; onRetry: () => void }
export default function AgsTopicSourceChoice({ source, loading, saving, error, onChoose, onRetry }: Props) {
  const [changing, setChanging] = useState(false)
  const choose = async (value: AgsTopicSource) => { if (await onChoose(value)) setChanging(false) }
  return <section className="ags-source-choice" aria-busy={loading || saving} aria-label="AGS konu listesi seçimi">
    {loading ? <p className="monthly-muted">AGS konu tercihin yükleniyor…</p> : <>
      {source && !changing ? <div className="ags-source-current"><span><Check size={16} /><strong>{topicSourceLabel(source)}</strong></span><button type="button" className="monthly-button is-quiet" disabled={saving} onClick={() => setChanging(true)}><Pencil size={14} /> Listeyi değiştir</button></div> : <>
        <header><div><h2>AGS için hangi konu listesini kullanacaksın?</h2><p>Seçtiğin liste Konu Takibi’nde ve konu seçimlerinde kullanılır. Diğer liste gizlenir; kayıtların korunur.</p></div>{source && <button type="button" className="monthly-icon" disabled={saving} aria-label="Liste seçimini kapat" onClick={() => setChanging(false)}><X size={17} /></button>}</header>
        <div className="ags-source-options"><button type="button" disabled={saving || !!error} aria-pressed={source === 'shared'} onClick={() => void choose('shared')}><Users size={22} /><strong>Ortak listeyi kullan</strong><span>Adminin hazırladığı AGS başlıklarıyla ilerle. Tamamlanma işaretlerin sana özel kalır.</span></button><button type="button" disabled={saving || !!error} aria-pressed={source === 'personal'} onClick={() => void choose('personal')}><BookMarked size={22} /><strong>Kendi AGS listemi oluştur</strong><span>AGS konularını kendin ekle ve düzenle. Mevcut kişisel AGS konuların burada kalır.</span></button></div>
      </>}
      {saving && <p role="status" className="monthly-muted">Tercihin kaydediliyor…</p>}
      {error && <div className="monthly-error" role="alert">{error}<button type="button" className="monthly-button" disabled={saving} onClick={onRetry}><RefreshCw size={14} /> Tekrar dene</button></div>}
    </>}
  </section>
}
