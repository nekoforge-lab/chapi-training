const assert=require('node:assert/strict');
const C=require('./core.js');
const s=C.fresh();
const t=s.templates[0], it=t.items[0], id=it.id, oldName=it.name;
s.days['2026-10-11']={sessions:[{id:'historical',items:[{id,name:oldName,kind:it.kind,sets:[{kg:14,reps:12,done:true}]}]}]};
// Same exercise renamed across all active templates; historical snapshots retain their original names.
for(const t of s.templates)for(const x of t.items)if(x.id===id)x.name='新しい表記';
const before=JSON.stringify(s.days);
const report=C.previewExerciseLibrary(s);
assert.equal(report.audit.collisions.length,0,'historical name must not be treated as an active collision');
assert(report.audit.historicalNameDifferences.some(x=>x.id===id));
assert.equal(report.exercises.find(x=>x.id===id).name,'新しい表記');
assert.equal(C.previous(s,id,'2026-10-13').item.sets[0].kg,14);
assert.equal(JSON.stringify(s.days),before,'historical records must remain unchanged');
// A genuine active conflict must still be detected.
s.templates.push({id:'conflict',name:'test',items:[{id,name:'別の運動',kind:it.kind}]});
assert(C.previewExerciseLibrary(s).audit.collisions.some(x=>x.id===id));
console.log('PASS: rename regression / historical preservation / previous lookup / active collision');
