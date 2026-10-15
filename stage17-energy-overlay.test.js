const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
const code=source.slice(source.indexOf('function drawIntakeGauge('),source.indexOf("$('energyDonut').addEventListener"));
function render(mode,base,food,exercise){
 const nodes=[],root={querySelector:()=>null,prepend(){}};
 const document={createElementNS:(ns,tag)=>{const e={tag,attrs:{},children:[],classList:{add(){}},setAttribute(k,v){this.attrs[k]=String(v)},append(x){this.children.push(x)},replaceChildren(){this.children=[]}};if(tag==='svg')nodes.push(e);return e}};
 vm.runInNewContext(code+`;draw${mode==='target'?'Target':'Intake'}Gauge(root,${base},${food},${exercise},true)`,{document,root});return nodes[0].children;
}
for(const mode of ['balance','target'])for(const [base,food,exercise] of [[2789,1880,336],[2789,2880,336],[2789,3880,336],[2100,1880,336],[2100,2880,336],[2100,3880,336],[2100,1880,0]]){
 const nodes=render(mode,base,food,exercise);
 const orange=nodes.filter(x=>x.attrs.stroke==='#ef9b43');
 const lower=Math.max(0,food-exercise),upper=food;
 const expectedOrange=exercise>0?(Math.floor((upper-0.0001)/base)-Math.floor(lower/base)+1):0;
 assert.equal(orange.length,expectedOrange,`${mode}: exercise overlay must preserve wrap segments`);
 for(const x of orange){assert.equal(x.attrs['stroke-width'],'21.75');assert.ok(x.attrs.d.includes('94.625'))}
 const blue=nodes.filter(x=>x.attrs.stroke==='#3299bc');
 for(const x of blue)assert.equal(x.attrs['stroke-width'],'29');
 const white=nodes.filter(x=>x.attrs.stroke==='#ffffff'&&x.tag==='line');
 assert.equal(white.length,1,`${mode}: legacy thick marker must exist`);
 assert.equal(white[0].attrs['stroke-width'],'4');
 assert.ok(nodes.some(x=>x.attrs.stroke==='#526b78'&&x.attrs['stroke-width']==='6'));
}
assert.match(source,/drawTargetGauge\(donut,adjustedGoal,food,e\.watch\?0:exercise,foodRecorded\)/);
console.log('14 shared-overlay geometry scenarios and target exercise call passed');
