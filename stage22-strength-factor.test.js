const assert=require('node:assert/strict');
const C=require('./core.js');
function calc(strength,cardio){const d={strengthWorkout:{kcal:strength,energyType:'net'},sessions:[{items:[{kind:'cardio',kcal:cardio,energyType:'net'}]}]};return C.exerciseEnergy(d,2000).net}
assert.equal(calc(100,100),170);
assert.equal(calc(0,100),100);
assert.equal(calc(100,0),70);
const d={strengthWorkout:{kcal:200,energyType:'gross',minutes:60},sessions:[{items:[{kind:'cardio',kcal:200,energyType:'gross',minutes:60}]}]};
assert.ok(Math.abs(C.exerciseEnergy(d,2400).net-170)<1e-8);
console.log('Strength 0.7 and cardio 1.0 verified');
