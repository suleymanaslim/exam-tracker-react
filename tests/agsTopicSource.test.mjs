import test from 'node:test'
import assert from 'node:assert/strict'
import { isAgsExam, usesTopicSource, readAgsTopicSource, agsTopicSourceError } from '../src/lib/agsTopicSource.ts'
import { fetchMonthlyData } from '../src/lib/sharedTopicsData.ts'
import { fetchAIReportData, AI_REPORT_TABLES } from '../src/lib/aiStudyReportData.ts'
import { buildAIStudyReport } from '../src/lib/aiStudyReport.ts'

test('AGS classification covers legacy aliases and renamed templates without hiding other exams', () => {
  for (const exam of [{name:'AGS'},{name:' MEB-AGS '},{name:'MEB AGS'},{name:'Özel ad',base_template_key:'ags'}]) assert.equal(isAgsExam(exam),true)
  for (const exam of [{name:'YDS'},{name:'ALES'},{name:'IELTS'},undefined]) assert.equal(isAgsExam(exam),false)
})
test('only the chosen AGS source is visible; no choice hides both sources while preserving YDS', () => {
  for (const source of ['shared','personal',null]) {
    assert.equal(usesTopicSource({kind:'shared',isAgs:true},source),source==='shared')
    assert.equal(usesTopicSource({kind:'personal',isAgs:true},source),source==='personal')
    assert.equal(usesTopicSource({kind:'personal',isAgs:false},source),true)
  }
})
function fixture(source) {
  const user_id='owner', calls=[]
  const tables=Object.fromEntries(Object.values(AI_REPORT_TABLES).map(table=>[table,[]]))
  Object.assign(tables,{
    ags_topic_preferences:source===null?[]:[{user_id,source}],
    exams:[{id:'ags',user_id,name:'AGS',point_per_net:1,wrong_penalty:4},{id:'alias',user_id,name:'Özel ad',base_template_key:'ags',point_per_net:1,wrong_penalty:4},{id:'yds',user_id,name:'YDS',point_per_net:1.25,wrong_penalty:null}],
    subjects:[{id:'sa',user_id,exam_id:'ags',name:'Tarih'},{id:'alias-sub',user_id,exam_id:'alias',name:'Sayısal'},{id:'sy',user_id,exam_id:'yds',name:'Kelime'}],
    topics:[{id:'pa',user_id,subject_id:'sa',title:'Kişisel AGS',is_completed:true},{id:'pm',user_id,subject_id:'alias-sub',title:'Kişisel özel AGS',is_completed:false},{id:'py',user_id,subject_id:'sy',title:'YDS konusu',is_completed:true}],
    study_sessions:[{id:'ss',user_id,subject_id:'sa',resource_id:null,duration_minutes:45,started_at:'2026-10-18T08:00:00Z'}],
    ags_shared_subjects:[{id:'shared-sub',name:'Tarih',sort_order:0}],
    ags_shared_topics:[{id:'common',subject_id:'shared-sub',title:'Ortak AGS',sort_order:0,archived_at:null}],
    ags_topic_progress:[{user_id,topic_id:'common',is_completed:false},{user_id:'other',topic_id:'common',is_completed:true}],
    monthly_topic_targets:[{id:'mc',owner_id:user_id,shared_topic_id:'common',personal_topic_id:null,target_month:'2026-11-01'},{id:'ma',owner_id:user_id,shared_topic_id:null,personal_topic_id:'pa',target_month:'2026-11-01'},{id:'mm',owner_id:user_id,shared_topic_id:null,personal_topic_id:'pm',target_month:'2026-11-01'},{id:'my',owner_id:user_id,shared_topic_id:null,personal_topic_id:'py',target_month:'2026-11-01'}],
  })
  const client={calls,from(table) {
    const call={table};calls.push(call)
    const rows=()=>tables[table]?.filter(row=>!call.owner||row[call.owner.field]===call.owner.id)
    return {select(){return this},order(){return this},eq(field,id){call.owner={field,id};return this},async maybeSingle(){return tables[table]?{data:rows()[0]||null,error:null}:{data:null,error:{code:'42P01'}}},async range(start,end){return tables[table]?{data:rows().slice(start,end+1),count:rows().length,error:null}:{data:null,count:null,error:{code:'42P01'}}}}
  }}
  return {client,tables}
}
test('monthly picker and calendar counts hide the other AGS source and preserve its underlying plan rows', async () => {
  const {client,tables}=fixture('shared'), original=JSON.stringify(tables.monthly_topic_targets)
  let data=await fetchMonthlyData(client,'owner')
  assert.deepEqual(data.topics.map(topic=>topic.key),['shared:common','personal:py'])
  assert.deepEqual(data.targets.map(target=>target.id),['mc','my'])
  tables.ags_topic_preferences[0].source='personal'
  data=await fetchMonthlyData(client,'owner')
  assert.deepEqual(data.topics.map(topic=>topic.key),['personal:pa','personal:pm','personal:py'])
  assert.deepEqual(data.targets.map(target=>target.id),['ma','mm','my'])
  tables.ags_topic_preferences[0].source='shared'
  data=await fetchMonthlyData(client,'owner')
  assert.deepEqual(data.targets.map(target=>target.id),['mc','my'])
  assert.equal(JSON.stringify(tables.monthly_topic_targets),original)
})
test('an undecided account has no AGS picker options or AGS calendar totals', async () => {
  const {client}=fixture(null)
  const data=await fetchMonthlyData(client,'owner')
  assert.equal(data.agsTopicSource,null)
  assert.deepEqual(data.topics.map(topic=>topic.key),['personal:py'])
  assert.deepEqual(data.targets.map(target=>target.id),['my'])
  assert.ok(!client.calls.some(call=>call.table.startsWith('ags_shared_')))
})
test('AI JSON uses the account source, keeps all study time, and never uses another account progress', async () => {
  for (const source of ['shared','personal',null]) {
    const {client}=fixture(source)
    const reportData=await fetchAIReportData(client,'owner')
    const report=buildAIStudyReport(reportData,new Date('2026-10-18T16:00:00Z'))
    assert.equal(reportData.agsTopicSource,source)
    assert.equal(report.ozetler.tum_gecmis.kaydedilen_calisma_dakika,45)
    const titles=report.ayrintilar.konular.map(row=>row.konu)
    assert.ok(titles.includes('YDS konusu'))
    assert.equal(titles.includes('Kişisel AGS'),source==='personal')
    assert.equal(titles.includes('Kişisel özel AGS'),source==='personal')
    assert.equal(titles.includes('Ortak AGS'),source==='shared')
    if(source==='shared')assert.equal(report.ayrintilar.konular.find(row=>row.konu==='Ortak AGS').tamamlandi,false)
    else assert.ok(!client.calls.some(call=>call.table.startsWith('ags_shared_')))
  }
})
test('missing preference setup hides AGS topics in AI export with an explicit incomplete-source explanation', async () => {
  const {client,tables}=fixture('shared');delete tables.ags_topic_preferences
  const data=await fetchAIReportData(client,'owner')
  assert.equal(data.agsTopicSource,null)
  assert.deepEqual(data.topics.map(topic=>topic.title),['YDS konusu'])
  await assert.rejects(readAgsTopicSource(client,'owner'),/ags_topic_source.sql/)
  assert.match(agsTopicSourceError({code:'PGRST202'}),/ags_topic_source.sql/)
})
