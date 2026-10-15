const assert=require('node:assert/strict');
const C=require('./core.js');
const s=C.fresh();
const id='custom-123';
const original={id,name:'旧名称',annotation:'旧説明',kind:'strength',sets:[{kg:16,reps:10,rir:3,done:true}]};
s.days['2026-10-12']={sessions:[{id:'a',items:[C.clone(original)]}]};
s.days['2026-10-13']={sessions:[{id:'b',items:[C.clone(original)]}]};
const before=JSON.stringify(s.days);
s.exerciseLibrary=[{id,name:'新名称',annotation:'新説明',kind:'strength'}];
for(const day of Object.values(s.days)){
 const item=day.sessions[0].items[0];
 assert.deepEqual(C.exercisePresentation(s,item),{name:'新名称',annotation:'新説明'});
 assert.equal(item.sets[0].kg,16);
}
assert.equal(JSON.stringify(s.days),before,'rename must not modify any saved record');
const old=C.fresh();const oldItem={id:'squat',name:'DBスクワット',kind:'strength'};
assert.equal(C.exercisePresentation(old,oldItem).name,'ダンベルスクワット');
// Deletion hides the master and falls back to the preserved last snapshot.
s.deletedExerciseIds=[id];
assert.deepEqual(C.exercisePresentation(s,{id,name:'最終名称',annotation:'最終説明'}),{name:'最終名称',annotation:'最終説明'});
// No ID: no fuzzy name matching, no accidental rewrite.
assert.deepEqual(C.exercisePresentation(s,{name:'旧名称',annotation:'旧説明'}),{name:'旧名称',annotation:'旧説明'});
console.log('PASS: stage09 exercise presentation / rename / delete fallback / record integrity');
