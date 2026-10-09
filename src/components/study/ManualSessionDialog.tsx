import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { Exam, Subject } from './types'

interface Props {
  exams: Exam[]
  subjects: Subject[]
  examId: string
  subjectId: string
  duration: number | ''
  date: string
  note: string
  saving: boolean
  onExam: (id: string) => void
  onSubject: (id: string) => void
  onDuration: (value: number | '') => void
  onDate: (value: string) => void
  onNote: (value: string) => void
  onSave: () => void
  onClose: () => void
}

export default function ManualSessionDialog({ exams, subjects, examId, subjectId, duration, date, note, saving, onExam, onSubject, onDuration, onDate, onNote, onSave, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="study-manual-dialog" aria-labelledby="manual-session-title" onCancel={event => { event.preventDefault(); if (!saving) onClose() }} onClick={event => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom
    if (event.target === event.currentTarget && outside && !saving) onClose()
  }}>
    <form onSubmit={event => { event.preventDefault(); onSave() }}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="manual-session-title" className="text-base font-semibold">Çalışma ekle</h2>
        <button type="button" onClick={onClose} disabled={saving} className="study-icon-button" aria-label="Kapat"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label>Sınav<select required value={examId} onChange={event => onExam(event.target.value)}><option value="">Sınav seç</option>{exams.map(exam => <option key={exam.id} value={exam.id}>{exam.name}</option>)}</select></label>
        <label>Ders<select required value={subjectId} disabled={!examId} onChange={event => onSubject(event.target.value)}><option value="">Ders seç</option>{subjects.filter(subject => subject.exam_id === examId).map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
        <label>Süre (dk)<input required type="number" min="1" step="1" value={duration} onChange={event => onDuration(event.target.value === '' ? '' : Math.max(1, Math.trunc(Number(event.target.value))))} /></label>
        <label>Tarih<input required type="date" value={date} onChange={event => onDate(event.target.value)} /></label>
        <label className="col-span-2">Not <span className="font-normal">(isteğe bağlı)</span><input type="text" value={note} onChange={event => onNote(event.target.value)} /></label>
      </div>
      <div className="mt-6 flex justify-end gap-2 border-t border-[var(--study-line)] pt-4">
        <button type="button" className="study-button study-button-secondary" onClick={onClose} disabled={saving}>Vazgeç</button>
        <button type="submit" className="study-button study-button-primary" disabled={!examId || !subjectId || !duration || saving}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
      </div>
    </form>
  </dialog>
}
