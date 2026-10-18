import test from 'node:test'
import assert from 'node:assert/strict'
import { examTemplateKey, readExamTemplate, examScoreLabel, examTemplateError } from '../src/lib/examTemplates.ts'

test('known exam aliases resolve without classifying unrelated personal exams', () => {
  for (const name of ['AGS', ' meb-ags ', 'MEB AGS']) assert.equal(examTemplateKey(name), 'ags')
  for (const name of ['YDS', 'e-YDS']) assert.equal(examTemplateKey(name), 'yds')
  assert.equal(examTemplateKey('IELTS'), 'ielts')
  assert.equal(examTemplateKey('ales'), 'ales')
  assert.equal(examTemplateKey('Kendi denemem'), null)
})
test('a YDS snapshot retains exact question names, order, counts and scoring', () => {
  const snapshot = { template_key: 'yds', name: 'YDS', description: 'Ana hesaptan', wrong_penalty: null, point_per_net: 1.25, question_types: [{ name: 'Dilbilgisi özel', question_count: 74 }, { name: 'Kelime özel', question_count: 6 }] }
  assert.deepEqual(readExamTemplate(snapshot), snapshot)
  assert.deepEqual(readExamTemplate({ ...snapshot, question_types: [{ name: 'İlk', question_count: 0 }] }).question_types, [{ name: 'İlk', question_count: 0 }])
  for (const patch of [{ question_types: [] }, { point_per_net: 0 }, { point_per_net: Infinity }, { wrong_penalty: -1 }, { question_types: [{ name: 'Test', question_count: 2.5 }] }]) assert.throws(() => readExamTemplate({ ...snapshot, ...patch }))
})
test('practice scores are not labelled as official IELTS bands or standardized AGS/ALES scores', () => {
  assert.equal(examScoreLabel({ base_template_key: 'ags' }), 'Net')
  assert.equal(examScoreLabel({ base_template_key: 'ales' }), 'Takip puanı')
  assert.equal(examScoreLabel({ base_template_key: 'ielts', point_per_net: 1, wrong_penalty: null }), 'Ham doğru')
  assert.equal(examScoreLabel({ base_template_key: 'ielts', point_per_net: 2 }), 'Takip puanı')
  assert.equal(examScoreLabel({ base_template_key: 'yds' }), 'Puan')
  assert.equal(examScoreLabel({}), 'Puan')
})
test('template errors identify setup and access failures without exposing server text', () => {
  assert.match(examTemplateError({ code: 'PGRST202' }), /exam_templates\.sql/)
  assert.match(examTemplateError({ code: '42501' }), /yönetici/)
  assert.doesNotMatch(examTemplateError({ message: '<script>private</script>' }), /script|private/)
})
