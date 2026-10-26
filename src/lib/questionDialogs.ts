import Swal from 'sweetalert2'
import { QUESTION_PRESETS, questionCount, questionAnswers, questionEntryAnswers, questionNote, solvedQuestionPresets } from './questionPlan'
import { matchingQuestionNotes } from './questionNoteHistory'
import { fetchQuestionNotes } from './questionPlanData'

export function questionInputOptions(initial = '', allowZero = false, presets: readonly number[] = QUESTION_PRESETS) {
  return {
    html: `<div class="question-dialog-presets" role="group" aria-label="Soru sayısı">${presets.map(count => `<button type="button" data-questions="${count}">${count}</button>`).join('')}</div>`,
    input: 'number' as const,
    inputLabel: 'Soru sayısı', inputValue: initial,
    inputAttributes: { min: allowZero ? '0' : '1', max: '100000', step: '1', inputmode: 'numeric' },
    didOpen: () => {
      Swal.getPopup()?.querySelectorAll<HTMLButtonElement>('[data-questions]').forEach(button => {
        button.addEventListener('click', () => {
          const input = Swal.getInput()
          if (input) { input.value = button.dataset.questions || ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus() }
        })
      })
    },
    inputValidator: (value: string) => questionCount(value, allowZero) === null ? 'Geçerli bir tam sayı girin.' : undefined,
  }
}
/** Refresh on subject changes; ignore closed dialogs and out-of-order responses. */
export function questionNotePicker(popup: HTMLElement, noteInput: HTMLInputElement, ownerId: string, listId: string) {
  let version = 0, expanded = false
  let notes: string[] = []
  const list = popup.querySelector<HTMLDataListElement>(`#${listId}`)
  const history = popup.querySelector<HTMLDivElement>('.question-note-history')
  const render = () => {
    history?.replaceChildren()
    if (noteInput.readOnly || !history) return
    const matches = matchingQuestionNotes(notes, noteInput.value)
    matches.forEach((note, index) => {
      const button = document.createElement('button')
      button.type = 'button'; button.textContent = note; button.title = note
      button.hidden = !expanded && index >= 3
      if (index >= 3) button.dataset.olderNote = 'true'
      button.addEventListener('click', () => {
        if (noteInput.readOnly) return
        noteInput.value = note
        noteInput.dispatchEvent(new Event('input', { bubbles: true }))
        noteInput.focus()
      })
      history.append(button)
    })
    if (matches.length > 3) {
      const toggle = document.createElement('button')
      toggle.type = 'button'; toggle.className = 'question-notes-toggle'
      toggle.textContent = expanded ? 'Daha az göster' : `Önceki notlar (${matches.length - 3})`
      toggle.setAttribute('aria-expanded', String(expanded))
      toggle.addEventListener('click', () => { expanded = !expanded; render(); history.querySelector<HTMLButtonElement>('.question-notes-toggle')?.focus() })
      history.append(toggle)
    }
  }
  noteInput.addEventListener('input', () => { expanded = false; render() })
  return (subjectId?: string | null) => {
    const request = ++version
    notes = []; expanded = false
    list?.replaceChildren(); history?.replaceChildren()
    if (!subjectId || noteInput.readOnly) return
    void fetchQuestionNotes(ownerId, subjectId).then(values => {
      if (request !== version || Swal.getPopup() !== popup || noteInput.readOnly) return
      notes = values
      for (const note of notes) {
        const option = document.createElement('option'); option.value = note; list?.append(option)
      }
      render()
    }).catch(() => { /* A failed lookup never prevents entering a note. */ })
  }
}

interface QuestionDialogContext { boundNote?: string | null; note?: string | null; ownerId?: string | null; subjectId?: string | null }
export function questionCompletionOptions(initial = '', correct?: number | null, wrong?: number | null, locked = false, target?: number | null, context: QuestionDialogContext = {}) {
  const options = questionInputOptions(initial, true, solvedQuestionPresets(target))
  return { ...options, didOpen: () => {
    options.didOpen()
    const popup = Swal.getPopup()
    const input = Swal.getInput()
    const correctInput = popup?.querySelector<HTMLInputElement>('#question-correct')
    const wrongInput = popup?.querySelector<HTMLInputElement>('#question-wrong')
    const noteInput = popup?.querySelector<HTMLInputElement>('#question-note')
    if (!popup || !input || !correctInput || !wrongInput || !noteInput) return
    correctInput.value = correct == null ? '' : String(correct)
    wrongInput.value = wrong == null ? '' : String(wrong)
    noteInput.value = context.boundNote || context.note || ''
    if (context.boundNote) {
      noteInput.readOnly = true
      noteInput.setAttribute('aria-describedby', 'question-bound-note-help')
      const help = document.createElement('small'); help.id = 'question-bound-note-help'
      help.textContent = 'Bu çözüm seçtiğin planın konusuna kaydedilecek.'
      noteInput.parentElement?.append(help)
    }
    if (correct != null || wrong != null) popup.querySelector('details')?.setAttribute('open', '')
    let manualTotal = initial
    const synchronizeTotal = () => {
      const automatic = correctInput.value !== '' || wrongInput.value !== ''
      popup.dataset.autoQuestions = String(automatic)
      const answers = automatic ? questionEntryAnswers('', correctInput.value, wrongInput.value) : null
      input.value = automatic ? (answers ? String(answers.solved_questions) : '') : manualTotal
      input.readOnly = automatic || locked
      popup.querySelectorAll<HTMLButtonElement>('[data-questions]').forEach(button => { button.disabled = automatic || locked })
      const label = popup.querySelector('.swal2-input-label')
      if (label) label.textContent = automatic ? 'Toplam soru · otomatik' : 'Soru sayısı'
    }
    // Opening an old record does not silently change its historical total.
    correctInput.addEventListener('input', synchronizeTotal)
    wrongInput.addEventListener('input', synchronizeTotal)
    input.addEventListener('input', () => { if (popup.dataset.autoQuestions !== 'true') manualTotal = input.value })
    if (locked) lockQuestionInputs()
    else if (!context.boundNote && context.ownerId && context.subjectId) {
      questionNotePicker(popup, noteInput, context.ownerId, 'question-note-list')(context.subjectId)
    }
  }, html: options.html
    + '<details class="question-dialog-answers"><summary>Doğru / yanlış (isteğe bağlı)</summary><div><label>Doğru<input id="question-correct" type="number" min="0" max="100000" step="1" inputmode="numeric" placeholder="—"></label><label>Yanlış<input id="question-wrong" type="number" min="0" max="100000" step="1" inputmode="numeric" placeholder="—"></label></div></details>'
    + '<label class="question-dialog-note">Konu / not (isteğe bağlı)<input id="question-note" type="text" maxlength="1000" list="question-note-list" placeholder="Örn. Sözcükte anlam" autocomplete="off"></label><datalist id="question-note-list"></datalist><div class="question-note-history" aria-label="Önceki konu ve notlar"></div>' }
}
export function readQuestionAnswers(value: unknown) {
  const popup = Swal.getPopup()
  const correct = popup?.querySelector<HTMLInputElement>('#question-correct')?.value || ''
  const wrong = popup?.querySelector<HTMLInputElement>('#question-wrong')?.value || ''
  const answers = popup?.dataset.autoQuestions === 'true' ? questionEntryAnswers(value, correct, wrong) : questionAnswers(value, correct, wrong)
  if (!answers) { Swal.showValidationMessage('Soru, doğru ve yanlış sayıları için geçerli tam sayılar girin.'); return null }
  const note = questionNote(popup?.querySelector<HTMLInputElement>('#question-note')?.value)
  if (note === undefined) { Swal.showValidationMessage('Konu/not en fazla 1000 karakter olabilir.'); return null }
  return { ...answers, note }
}

export function lockQuestionInputs() {
  const popup = Swal.getPopup()
  const input = Swal.getInput()
  if (input) input.readOnly = true
  popup?.querySelectorAll<HTMLInputElement>('#question-correct, #question-wrong, #question-note').forEach(field => { field.readOnly = true })
  popup?.querySelectorAll<HTMLButtonElement>('[data-questions], .question-note-history button').forEach(button => { button.disabled = true })
}
