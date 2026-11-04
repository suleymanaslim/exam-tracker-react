import { useState } from 'react'
import { Pencil, Trash2, Plus, X } from 'lucide-react'
import { MAX_POMODORO_PRESETS, removePomodoroPreset, type PomodoroPreset } from '../lib/pomodoroPresets'
import { usePomodoroPreferences } from '../lib/usePomodoroPreferences'

export default function PomodoroPresetSettings() {
  const source = usePomodoroPreferences()
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState(''), [focus, setFocus] = useState('45'), [rest, setRest] = useState('10')
  const [notice, setNotice] = useState('')
  const busy = source.loading || source.saving || source.readOnly
  const clear = () => { setEditing(null); setName(''); setFocus('45'); setRest('10') }
  const edit = (preset: PomodoroPreset) => { setEditing(preset.id); setName(preset.name); setFocus(String(preset.focusMinutes)); setRest(String(preset.breakMinutes)); setNotice('') }
  return <section className="border-t border-[#e3e9f0] pt-5" aria-label="Hazır sayaçlarım">
    <h4 className="text-sm font-semibold text-[#24354a]">Hazır sayaçlarım</h4>
    <p className="mt-1 text-[13px] text-[#62748b]">Odak ve mola sürelerini kaydet, çalışma ekranında seç. Son seçimin hesabında korunur. Mola istemiyorsan 0 yaz.</p>
    {source.loading ? <p role="status" className="mt-3 text-sm">Sayaçlar yükleniyor…</p> : <>
      {source.readOnly && <p className="mt-3 text-sm text-[#62748b]">Hazır sayaçlarını kendi hesabında düzenleyebilirsin.</p>}
      <ul className="my-3 space-y-2">{source.preferences.presets.map(preset => <li key={preset.id} className="flex items-center gap-2 rounded-lg border border-[#e3e9f0] p-3">
        <div className="min-w-0 flex-1"><strong className="block break-words text-sm font-semibold">{preset.name}</strong><span className="text-xs text-[#62748b]">{preset.focusMinutes} dk odak · {preset.breakMinutes} dk mola{source.preferences.selectedId === preset.id ? ' · Seçili' : ''}</span></div>
        <button type="button" disabled={busy} onClick={() => edit(preset)} aria-label={`${preset.name} sayacını düzenle`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#4269a8] hover:bg-[#edf3fb] disabled:opacity-40"><Pencil size={16} /></button>
        <button type="button" disabled={busy} onClick={async () => { if (await source.save(removePomodoroPreset(source.preferences, preset.id))) { if (editing === preset.id) clear(); setNotice(source.preferences.selectedId === preset.id ? 'Sayaç silindi. Uzun Pomodoro seçildi; devam eden oturumun korunur.' : 'Sayaç silindi.') } }} aria-label={`${preset.name} sayacını sil`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#62748b] hover:bg-[#f8fafc] disabled:opacity-40"><Trash2 size={16} /></button>
      </li>)}</ul>
      {!source.preferences.presets.length && <p className="my-3 text-xs text-[#62748b]">Henüz özel sayaç eklemedin. Kısa ve Uzun Pomodoro da çalışma ekranında hazır.</p>}
      <form onSubmit={async event => {
        event.preventDefault(); setNotice('')
        const preset = { id: editing || crypto.randomUUID(), name, focusMinutes: Number(focus), breakMinutes: Number(rest) }
        const presets = editing ? source.preferences.presets.map(item => item.id === editing ? preset : item) : [...source.preferences.presets, preset]
        if (await source.save({ ...source.preferences, presets })) { clear(); setNotice('Sayaç kaydedildi. Çalışma ekranından seçebilirsin.') }
      }}>
        <fieldset disabled={busy || (!editing && source.preferences.presets.length >= MAX_POMODORO_PRESETS)} className="space-y-3 disabled:opacity-50">
          <label className="block text-xs text-[#62748b]">Sayaç adı<input required maxLength={40} value={name} onChange={event => setName(event.target.value)} placeholder="Örn. Derin çalışma" className="mt-1 h-10 w-full rounded-lg border border-[#e3e9f0] px-3 text-sm text-[#24354a]" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-[#62748b]">Odak (dk)<input required type="number" min={1} max={180} step={1} value={focus} onChange={event => setFocus(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#e3e9f0] px-3 text-sm text-[#24354a]" /></label>
            <label className="text-xs text-[#62748b]">Mola (dk)<input required type="number" min={0} max={60} step={1} value={rest} onChange={event => setRest(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#e3e9f0] px-3 text-sm text-[#24354a]" /></label>
          </div>
          <div className="flex gap-2"><button type="submit" className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-[#4269a8] px-3 text-sm font-semibold text-white"><Plus size={15} />{source.saving ? 'Kaydediliyor…' : editing ? 'Değişiklikleri kaydet' : 'Sayaç ekle'}</button>{editing && <button type="button" onClick={clear} className="flex min-h-10 items-center gap-1 rounded-lg border border-[#e3e9f0] px-3 text-sm"><X size={14} />Vazgeç</button>}</div>
        </fieldset>
        {!editing && source.preferences.presets.length >= MAX_POMODORO_PRESETS && <p className="mt-2 text-xs text-[#62748b]">En fazla 20 hazır sayaç ekleyebilirsin.</p>}
      </form>
    </>}
    {source.error && <p role="alert" className="mt-3 text-sm text-red-700">{source.error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-[#4269a8]">{notice}</p>}
  </section>
}
