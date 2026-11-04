import { Link } from 'react-router-dom'
import { pomodoroLabel, pomodoroMode, type PomodoroPreset } from '../../lib/pomodoroPresets'
import { ChevronDown, Settings2 } from 'lucide-react'
import type { Exam, Subject, Resource, PomodoroSettings, SessionMode, SelectionSource } from './types'

interface Props {
  mode: SessionMode
  source: SelectionSource
  examId: string
  subjectId: string
  resourceId: string
  exams: Exam[]
  subjects: Subject[]
  playlists: Resource[]
  settings: PomodoroSettings
  blocks: number
  presets: PomodoroPreset[]
  selectedPresetId: string
  presetBusy: boolean
  presetError: string
  onPreset: (id: string) => void
  onSource: (source: SelectionSource) => void
  onTimedMockExam: () => void
  onMode: (mode: SessionMode) => void
  onExam: (id: string) => void
  onSubject: (id: string) => void
  onResource: (id: string) => void
  onBlocks: (count: number) => void
  onSetting: (key: keyof PomodoroSettings, value: number) => void
}

export default function SessionSetup({ mode, source, examId, subjectId, resourceId, exams, subjects, playlists, settings, blocks, presets, selectedPresetId, presetBusy, presetError, onPreset, onSource, onMode, onExam, onSubject, onResource, onBlocks, onSetting, onTimedMockExam }: Props) {
  const family = mode === 'questions' ? 'questions' : mode === 'stopwatch' ? 'stopwatch' : 'focus'
  const subject = subjects.find(item => item.id === subjectId)
  return <div className="study-session-setup">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="study-source-picker flex items-center gap-1" role="group" aria-label="Çalışma kaynağı">
        {([{ key: 'plan', label: 'Planlı görev' }, { key: 'free', label: 'Serbest çalışma' }] as const).map(option => <button type="button" key={option.key} aria-pressed={source === option.key} onClick={() => onSource(option.key)} className={source === option.key ? 'is-selected' : ''}>{option.label}</button>)}
      </div>
      <div className="study-segments flex items-center rounded-lg p-0.5" role="group" aria-label="Çalışma modu">
        {([{ key: 'focus', label: 'Odak' }, { key: 'stopwatch', label: 'Kronometre' }, { key: 'questions', label: 'Soru çöz' }] as const).map(option => <button type="button" key={option.key} aria-pressed={family === option.key} onClick={() => { if (family !== option.key) onMode(option.key === 'focus' ? pomodoroMode(selectedPresetId) : option.key) }} className={family === option.key ? 'is-selected' : ''}>{option.label}</button>)}
        <button type="button" onClick={onTimedMockExam}>Deneme çöz</button>
      </div>
    </div>
    {family === 'focus' && <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
      <div className="study-focus-length flex min-w-0 flex-1 flex-wrap items-center gap-2" role="group" aria-label="Odak süresi">
        <label className="min-w-0 flex-1">Hazır sayaç<select aria-label="Hazır Pomodoro sayacı" disabled={presetBusy} value={selectedPresetId} onChange={event => onPreset(event.target.value)}>
          {presets.map(preset => <option key={preset.id} value={preset.id}>{pomodoroLabel(preset)}</option>)}
        </select></label>
        <button type="button" disabled={presetBusy} aria-pressed={mode !== 'manual'} className={mode !== 'manual' ? 'is-selected' : ''} onClick={() => onMode(pomodoroMode(selectedPresetId))}>Pomodoro</button>
        <button type="button" aria-pressed={mode === 'manual'} className={mode === 'manual' ? 'is-selected' : ''} onClick={() => onMode('manual')}>Kesintisiz</button>
      </div>
      <details className="study-options-drawer">
        <summary className="study-quiet-link flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs" aria-label="Odak ve mola sürelerini düzenle"><Settings2 size={13} /><span className="sr-only">Süre ayarları</span></summary>
        <div className="study-options-content">
          <Link to="/settings?tab=pomodoro" className="col-span-2 study-quiet-link">Hazır sayaç ekle veya düzenle</Link>
          {mode === 'manual' && <label className="col-span-2">Kesintisiz odak<select value={blocks} onChange={event => onBlocks(Number(event.target.value))}>{[1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{count * settings.long_focus_minutes} dk</option>)}</select></label>}
          {([{ key: 'short_focus_minutes', label: 'Kısa odak (dk)' }, { key: 'short_break_minutes', label: 'Kısa mola (dk)' }, { key: 'long_focus_minutes', label: 'Uzun odak (dk)' }, { key: 'long_break_minutes', label: 'Uzun mola (dk)' }] as const).map(field => <label key={field.key}>{field.label}<input type="number" min="1" max="180" value={settings[field.key]} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && Number.isInteger(value) && value >= 1 && value <= 180) onSetting(field.key, value) }} /></label>)}
        </div>
      </details>
    </div>}
    {presetError && <p role="alert" className="mt-2 text-xs text-red-700">{presetError}</p>}
    {source === 'free' && <details className="study-free-selection mt-3" open={!subjectId}>
      <summary className="study-quiet-link flex min-h-9 cursor-pointer items-center gap-2 rounded-md text-xs"><span>{subject ? `${subject.name} · Değiştir` : 'Ders seç'}</span><ChevronDown size={12} /></summary>
      <div className="grid grid-cols-2 gap-3 pb-1 pt-2">
        <label>Sınav<select aria-label="Sınav" value={examId} onChange={event => onExam(event.target.value)}><option value="">Sınav seç</option>{exams.map(exam => <option key={exam.id} value={exam.id}>{exam.name}</option>)}</select></label>
        <label>Ders<select aria-label="Ders" value={subjectId} disabled={!examId} onChange={event => onSubject(event.target.value)}><option value="">Ders seç</option>{subjects.filter(item => item.exam_id === examId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {playlists.length > 0 && <label className="col-span-2">Oynatma listesi <span className="font-normal">(isteğe bağlı)</span><select value={playlists.some(resource => resource.id === resourceId) ? resourceId : ''} onChange={event => onResource(event.target.value)}><option value="">Liste seç</option>{playlists.map((resource, index) => <option key={resource.id} value={resource.id}>{subject?.name}{playlists.length > 1 ? ` · Liste ${index + 1}` : ''}{resource.total_videos ? ` · ${resource.total_videos} video` : ''}</option>)}</select></label>}
      </div>
    </details>}
  </div>
}
