import test from 'node:test'
import assert from 'node:assert/strict'
import { monthKey, shiftMonth, monthLabel, monthlyPayload, monthlyTargetKey, readTopicTitles, sharedTopicsError } from '../src/lib/monthlyTopics.ts'
import { readTopicPages, fetchSharedTopics, fetchMonthlyData } from '../src/lib/sharedTopicsData.ts'
process.env.TZ='Europe/Istanbul'

test('month navigation uses month-first local dates across year boundaries and rejects invalid months',()=>{
  assert.equal(shiftMonth('2026-12',1),'2027-01')
  assert.equal(shiftMonth('2027-01',-1),'2026-12')
  assert.equal(monthLabel('2026-11-01'),'Kasım 2026')
  for(const value of ['2026-00','2026-13','2026-1','1999-12','2101-01','2026-11-01','x']) assert.equal(monthKey(value),null)
})
test('bulk topic entry trims lines and duplicates without merging different topics',()=>{
  assert.deepEqual(readTopicTitles(' Sayılar\r\n\nProblemler\n  Sayılar \nPROBLEMLER '),['Sayılar','Problemler'])
  assert.throws(()=>readTopicTitles('  \n'))
  assert.throws(()=>readTopicTitles('x'.repeat(501)))
  assert.throws(()=>readTopicTitles(Array.from({length:501},(_,i)=>String(i)).join('\n')))
})
test('monthly assignment uses stable source IDs, removes duplicates and rejects unavailable topics',()=>{
  const topics=[{key:'shared:1',id:'1',kind:'shared',archived:false},{key:'personal:1',id:'1',kind:'personal',archived:false},{key:'shared:2',id:'2',kind:'shared',archived:true}]
  assert.deepEqual(monthlyPayload(topics,['shared:1','shared:1','personal:1'],'2027-02',' Tekrar '),[{kind:'shared',topic_id:'1',month:'2027-02',note:'Tekrar'},{kind:'personal',topic_id:'1',month:'2027-02',note:'Tekrar'}])
  for(const keys of [[],['missing'],['shared:2']]) assert.throws(()=>monthlyPayload(topics,keys,'2027-02'))
  assert.throws(()=>monthlyPayload(topics,['shared:1'],'2027-13'))
  assert.throws(()=>monthlyPayload(topics,['shared:1'],'2027-02','x'.repeat(1001)))
  assert.equal(monthlyTargetKey({shared_topic_id:'1',personal_topic_id:null}),'shared:1')
  assert.equal(monthlyTargetKey({shared_topic_id:null,personal_topic_id:'1'}),'personal:1')
})
const clientFor = tables => {
  const calls=[]
  return { calls,from(table) {
    const call={table};calls.push(call)
    return {select(){return this},order(key){call.order=key;return this},eq(field,id){call.owner={field,id};return this},async maybeSingle(){ const data=tables[table]; return data ? {data:data.find(row=>row[call.owner.field]===call.owner.id)||null,error:null} : {data:null,error:{code:'42P01'}} },async range(from,to){
      const data=tables[table]
      if(!data)return {data:null,error:{code:'42P01'}}
      return {data:data.filter(row=>!call.owner||row[call.owner.field]===call.owner.id).slice(from,to+1),error:null}
    }}
  }}
}
test('shared fetch reads every page and only the selected account completion records',async()=>{
  const client=clientFor({ags_shared_subjects:[{id:'s',name:'Tarih',sort_order:0}],ags_shared_topics:Array.from({length:1007},(_,i)=>({id:String(i),subject_id:'s',title:String(i),sort_order:i})),ags_topic_progress:[{user_id:'alice',topic_id:'0',is_completed:true},{user_id:'bob',topic_id:'1',is_completed:true}]})
  const data=await fetchSharedTopics(client,'alice')
  assert.equal(data.topics.length,1007)
  assert.equal(data.progress.length,1)
  assert.equal(data.progress[0].user_id,'alice')
  assert.ok(client.calls.filter(call=>call.table==='ags_topic_progress').every(call=>call.owner.id==='alice'))
})
test('monthly picker separates shared and personal topic IDs and reads only the real admin account targets',async()=>{
  const client=clientFor({
    ags_topic_preferences:[{user_id:'admin',source:'shared'}],
    ags_shared_subjects:[{id:'s',name:'Tarih',sort_order:0}],ags_shared_topics:[{id:'t',subject_id:'s',title:'Ortak konu',sort_order:0,archived_at:null}],ags_topic_progress:[{user_id:'admin',topic_id:'t',is_completed:true}],
    topics:[{id:'t',user_id:'admin',subject_id:'personal-s',title:'Kendi konusu',is_completed:false},{id:'foreign',user_id:'bob',subject_id:'foreign-s',title:'Gizli'}],
    subjects:[{id:'personal-s',user_id:'admin',exam_id:'e',name:'Kelime'}],exams:[{id:'e',user_id:'admin',name:'YDS'}],
    monthly_topic_targets:[{id:'m',owner_id:'admin',shared_topic_id:'t',personal_topic_id:null,target_month:'2026-11-01'},{id:'other',owner_id:'bob',shared_topic_id:'t'}],
  })
  const data=await fetchMonthlyData(client,'admin')
  assert.deepEqual(data.topics.map(topic=>topic.key),['shared:t','personal:t'])
  assert.equal(data.topics[0].completed,true)
  assert.equal(data.topics[1].exam,'YDS')
  assert.equal(data.targets.length,1)
  assert.equal(data.targets[0].id,'m')
  await assert.rejects(readTopicPages(client,'missing'))
})
test('shared setup, permission and conflict errors are useful and do not echo private diagnostics',()=>{
  assert.match(sharedTopicsError({code:'PGRST202'}),/shared_ags_topics_monthly.sql/)
  assert.match(sharedTopicsError({code:'42501'}),/yalnızca admin/)
  assert.match(sharedTopicsError({code:'23505'}),/zaten var/)
  assert.doesNotMatch(sharedTopicsError({message:'private token'}),/private token/)
})
