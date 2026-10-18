import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchMonthlyPlanAccess, fetchSharedMonthlyPlan, monthlyPlanAccessError } from '../src/lib/monthlyPlanAccess.ts'
import { groupMonthlyTargets } from '../src/lib/monthlyTopics.ts'

test('monthly courses group by stable subject identity, keeping identical course names in different exams separate', () => {
  const topics = [
    { key:'shared:1',subjectKey:'shared:s',subject:'Tarih',exam:'AGS',title:'Konu 10' },
    { key:'shared:2',subjectKey:'shared:s',subject:'Tarih',exam:'AGS',title:'Konu 2' },
    { key:'personal:3',subjectKey:'personal:s',subject:'Tarih',exam:'Başka sınav',title:'Başlık' },
    { key:'shared:4',subjectKey:'shared:m',subject:'Sayısal Yetenek',exam:'AGS',title:'Sayılar' },
  ]
  const targets = [
    {id:'a',shared_topic_id:'1',target_month:'2026-11-01'},
    {id:'b',shared_topic_id:'2',target_month:'2026-11-01'},
    {id:'c',personal_topic_id:'3',target_month:'2026-11-01'},
    {id:'d',shared_topic_id:'4',target_month:'2026-11-01'},
    {id:'future',shared_topic_id:'4',target_month:'2026-12-01'},
  ]
  const before=structuredClone({topics,targets})
  const groups=groupMonthlyTargets(topics,targets,'2026-11')
  assert.deepEqual(groups.map(group=>[group.exam,group.subject,group.items.length]),[['AGS','Sayısal Yetenek',1],['AGS','Tarih',2],['Başka sınav','Tarih',1]])
  assert.deepEqual(groups[1].items.map(row=>row.topic.title),['Konu 2','Konu 10'])
  assert.equal(groups.flatMap(group=>group.items).length,4)
  assert.deepEqual({topics,targets},before)
  assert.deepEqual(groupMonthlyTargets(topics,targets,'2027-01'),[])
})
test('missing topic references remain identifiable in their own group instead of disappearing from counts',()=>{
  const groups=groupMonthlyTargets([],[{id:'x',personal_topic_id:'removed',target_month:'2026-11-01'}],'2026-11')
  assert.equal(groups[0].subject,'Kaldırılan konular')
  assert.equal(groups[0].items[0].target.id,'x')
  assert.equal(groups[0].items[0].topic,undefined)
})
test('accessible plans come from verified server grants and malformed responses never enable navigation',async()=>{
  const plans=[{plan_owner_id:'admin',owner_name:'Süleyman',can_edit:false}]
  const calls=[]
  assert.deepEqual(await fetchMonthlyPlanAccess({async rpc(...args){calls.push(args);return {data:plans,error:null}}}),plans)
  assert.deepEqual(calls,[['get_accessible_monthly_plans']])
  for(const data of [null,{},[{plan_owner_id:'admin',owner_name:'Süleyman'}],[{plan_owner_id:'admin',owner_name:'Süleyman',can_edit:'true'}]]) await assert.rejects(fetchMonthlyPlanAccess({async rpc(){return {data,error:null}}}))
  assert.deepEqual(await fetchMonthlyPlanAccess({async rpc(){return {data:[],error:null}}}),[])
})
test('read-only snapshots request exactly one owner and reject another account response or mixed-owner targets',async()=>{
  const data={owner_id:'admin',agsTopicSource:'shared',topics:[],targets:[{owner_id:'admin'}]}
  const calls=[]
  assert.deepEqual(await fetchSharedMonthlyPlan({async rpc(...args){calls.push(args);return {data,error:null}}},'admin'),data)
  assert.deepEqual(calls,[['get_shared_monthly_plan',{p_owner_id:'admin'}]])
  for(const bad of [{...data,owner_id:'other'},{...data,targets:[{owner_id:'other'}]},{...data,agsTopicSource:'both'},{...data,topics:null}]) await assert.rejects(fetchSharedMonthlyPlan({async rpc(){return {data:bad,error:null}}},'admin'))
})
test('revoked access and missing SQL are actionable without disclosing arbitrary server diagnostics',async()=>{
  const failure={code:'42501',message:'private database details'}
  await assert.rejects(fetchSharedMonthlyPlan({async rpc(){return {data:null,error:failure}}},'admin'),error=>error===failure)
  await assert.rejects(fetchMonthlyPlanAccess({async rpc(){return {data:null,error:failure}}}),error=>error===failure)
  assert.match(monthlyPlanAccessError(failure),/iznin/)
  assert.match(monthlyPlanAccessError({code:'PGRST202'}),/monthly_plan_sharing.sql/)
  assert.doesNotMatch(monthlyPlanAccessError(failure),/private/)
  assert.doesNotMatch(monthlyPlanAccessError({message:'private token'}),/private token/)
})
