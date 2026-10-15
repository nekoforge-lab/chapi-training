const assert=require('node:assert/strict');
const W=require('./workout-records');
for(const [id,type] of [['forearm',undefined],['bodyweight-circuit-v37','bodyweight']]){
 const it={id,tracking:'rounds',strengthType:type,rounds:2,done:true};
 assert.equal(W.isCircuit(it),true);assert.equal(W.totals(it).total,2);
 W.setValue(it,0,'rounds','3');W.setDone(it,0,false);assert.deepEqual(W.totals(it),{total:3,completed:0,unit:'周'});
 W.add(it);W.setValue(it,1,'rounds','2');W.setDone(it,1,true);assert.deepEqual(W.totals(it),{total:5,completed:2,unit:'周'});
 assert.equal(W.remove(it,0),true);assert.equal(W.remove(it,0),false);
 const copy=JSON.parse(JSON.stringify(it));assert.deepEqual(W.totals(copy),{total:2,completed:2,unit:'周'});
}
const normal={tracking:'sets',sets:[{kg:'12',reps:'10',rir:'3',done:false}]};
W.add(normal);W.setValue(normal,1,'reps','8');W.setDone(normal,1,true);assert.deepEqual(W.totals(normal),{total:2,completed:1,unit:'セット'});assert.equal(W.hasInput(normal,1),true);assert.equal(W.remove(normal,1),true);
const legacy={tracking:'rounds',roundEntries:[{kg:'6',rounds:'2',done:true}]};assert.deepEqual(W.totals(legacy),{total:2,completed:2,unit:'周'});
console.log('PASS: common records, legacy, serialization, forearm/bodyweight circuits, sets');
