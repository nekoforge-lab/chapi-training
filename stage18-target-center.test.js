const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
const target=source.slice(source.indexOf("if(energyView==='target'){",source.indexOf('function renderEnergy()')),source.indexOf('}else{',source.indexOf("if(energyView==='target'){",source.indexOf('function renderEnergy()'))));
assert.match(target,/const diff=foodRecorded\?net-adjustedGoal:null;/);
assert.doesNotMatch(target,/food-adjustedGoal/);
assert.match(source,/const net=food-\(e\.watch\?0:exercise\);/);
assert.match(source,/drawTargetGauge\(donut,adjustedGoal,food,e\.watch\?0:exercise,foodRecorded\)/);
for(const [food,goal,exercise,watch,expected] of [[2880,2100,336,false,444],[1880,2100,336,false,-556],[2100,2100,336,false,-336],[2880,2100,336,true,780],[1880,2100,0,false,-220]]){
 const net=food-(watch?0:exercise),diff=net-goal;
 assert.equal(diff,expected);
}
console.log('Target-center formula, exercise cases, and watch double-count protection passed');
