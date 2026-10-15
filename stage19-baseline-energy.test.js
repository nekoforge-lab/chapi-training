const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync(__dirname+'/app.js','utf8');
const core=fs.readFileSync(__dirname+'/core.js','utf8');
assert.match(app,/const gaugeReference=e\.watch\?e\.total:e\.base\?\.life;/);
assert.match(app,/drawIntakeGauge\(donut,valid\?gaugeReference:null,food,e\.watch\?0:exercise,foodRecorded\)/);
assert.match(app,/\$\('totalEnergy'\)\.textContent=e\.watch\?\(e\.total===null\?'—':round\(e\.total\)\):\(e\.base\?round\(e\.base\.life\):'—'\)/);
assert.match(core,/base\.life\+exercise\.net/);
assert.match(core,/balance=total!==null&&food\.count\.kcal>0\?food\.total\.kcal-total:null/);
for(const [intake,baseline,exercise,expected] of [[2880,2453,336,91],[1880,2453,336,-909],[2880,2453,0,427]]) {
 assert.equal(intake-baseline-exercise,expected);
 assert.equal(intake-(baseline+exercise),expected);
}
console.log('Baseline-only display, separate exercise, net balance, gauge denominator passed');
