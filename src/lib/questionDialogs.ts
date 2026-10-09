import Swal from 'sweetalert2'
import { QUESTION_PRESETS, questionCount, questionAnswers, questionEntryAnswers, questionNote, solvedQuestionPresets } from './questionPlan'
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
interface QuestionDialogContext { note?: string | null; ownerId?: string | null; subjectId?: string | null }
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
    noteInput.value = context.note || ''
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
    else if (context.ownerId && context.subjectId) {
      void fetchQuestionNotes(context.ownerId, context.subjectId).then(notes => {
        if (Swal.getPopup() !== popup || noteInput.readOnly) return
        const list = popup.querySelector('#question-note-list')
        const history = popup.querySelector<HTMLDivElement>('.question-note-history')
        for (const note of notes) {
          const option = document.createElement('option'); option.value = note; list?.append(option)
        }
        notes.slice(0, 5).forEach(note => {
          const button = document.createElement('button')
          button.type = 'button'; button.textContent = note; button.title = note
          button.addEventListener('click', () => { if (!noteInput.readOnly) { noteInput.value = note; noteInput.focus() } })
          history?.append(button)
        })
      }).catch(() => { /* A failed suggestion lookup never prevents entering a note. */ })
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
