const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('styles.css','utf8');
const app=fs.readFileSync('app.js','utf8');
const core=fs.readFileSync('core.js','utf8');
for(const name of ['摂取カロリー','運動消費カロリー','生活消費カロリー','目標摂取カロリー']){
  assert(html.includes(`<span class="energy-metric-label">${name}</span>`),name);
}
assert(css.includes('.energy-dashboard .energy-metric-stack .energy-metric-label{\n  white-space:normal;max-width:100%;text-align:center;'));
assert(html.includes('v3.9 正規版'));
assert(html.includes('3.8.20-energy-labels'));
assert(fs.readFileSync('sw.js','utf8').includes('chapi-fit-shell-v39-strength07'));
console.log('stage20 label checks passed');
