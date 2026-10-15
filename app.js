(()=>{'use strict';
const W=ChapiWorkoutRecords,C=ChapiCore,KEY='chapi-training-v2',OLDKEY='chapi-training-v1',BACKUP='chapi-training-v2-before-v3',RESTORE='chapi-training-before-restore',VERSION='3.8.20';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2),today=()=>C.iso(new Date()),round=(n,d=0)=>Number(n).toLocaleString('ja-JP',{maximumFractionDigits:d}),signed=n=>(n>0?'+':n===0?'±':'')+round(n),color=n=>n===null?'':n<0?'negative':n>0?'positive':'neutral';
let store,blocked=false,recoveryExported=false,externalConflict=false,rawOriginal='',current=today(),draft,savedDraft='',activeTab='record',month=current.slice(0,7)+'-01',selectedDetail=current,editing=null,targetsDraft=null,goalDraft=null,graphMode='weight',graphWeek=current,noticeTimer,settingsDirty=false,loadedToday=today();
const dirtySections=new Set();function markDirty(section){dirtySections.add(section);settingsDirty=true}function cleanSection(section){dirtySections.delete(section);settingsDirty=dirtySections.size>0}
function notice(s){$('notice').textContent=s;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{$('notice').textContent=''},6000)}
function download(obj,name){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([typeof obj==='string'?obj:JSON.stringify(obj,null,2)],{type:'application/json'}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000)}
try{rawOriginal=localStorage.getItem(KEY)||'';const old=localStorage.getItem(OLDKEY);store=rawOriginal?C.migrate(JSON.parse(rawOriginal)):old?C.migrate(C.fromV1(JSON.parse(old))):C.fresh();if(rawOriginal&&Number(JSON.parse(rawOriginal).schemaRevision||0)<3&&!localStorage.getItem(BACKUP))localStorage.setItem(BACKUP,rawOriginal)}catch(e){blocked=true;store=C.fresh();$('fatal').classList.remove('hidden');$('fatal').innerHTML='<b>保存データを安全に読み込めませんでした。</b><p>元データを上書きせず、保存を停止しています。</p><button id="recoverRaw">元データを書き出す</button><p>'+esc(e.message)+'</p>';$('recoverRaw').onclick=()=>{download(rawOriginal||'', 'chapi-recovery.json');recoveryExported=true;notice('元データを書き出しました。設定から正常なバックアップを復元できます。')}}
function persist(next=store){if(blocked){notice('元データ保護のため保存を停止しています。先に書き出してください。');return false}try{localStorage.setItem(KEY,JSON.stringify(next));store=next;return true}catch(e){notice('保存できませんでした。入力は画面に残っています。空き容量を確認しバックアップしてください。');return false}}
// Do not overwrite storage at startup: migration is committed only on an explicit save.
// Stage 1 library: initialize in memory; persist only after an explicit user action.
const BUILTIN_LIBRARY_NAMES={bench:['DBベンチプレス','ダンベルベンチプレス'],press:['DBショルダープレス','ダンベルショルダープレス'],squat:['DBスクワット','ダンベルスクワット'],rdl:['DB RDL','ダンベルルーマニアンデッドリフト'],shrug:['DBシュラッグ','ダンベルシュラッグ']};
function libraryView(){
 const preview=C.previewExerciseLibrary(store);
 const existing=Array.isArray(store.exerciseLibrary)?store.exerciseLibrary:[];
 const byId=new Map(existing.map(x=>[x.id,{...x}]));
 for(const x of preview.exercises)if(!byId.has(x.id)&&!(store.deletedExerciseIds||[]).includes(x.id))byId.set(x.id,x);
 for(const [id,names] of Object.entries(BUILTIN_LIBRARY_NAMES)){
  const item=byId.get(id);
  if(item&&item.name===names[0])item.name=names[1];
 }
 return {items:[...byId.values()].filter(x=>!isLegacyGenericCircuit(x)),audit:preview.audit};
}
function isLegacyGenericCircuit(x){return x?.name==='サーキットトレーニング'&&x?.kind==='strength'}
function exerciseRegistrationOptions(){return [['sets','通常トレーニング'],['weighted-rounds','重量別サーキット'],['bodyweight-rounds','自重・加重・補助サーキット']];}
function registrationType(x){return x.kind==='cardio'?'cardio':x.tracking==='rounds'?(x.strengthType==='bodyweight'?'bodyweight-rounds':'weighted-rounds'):'sets'}
function exerciseConfig(x){const type=registrationType(x);return type==='weighted-rounds'?{tracking:'rounds',strengthType:'normal',rounds:2}:type==='bodyweight-rounds'?{tracking:'rounds',strengthType:'bodyweight',rounds:2}:{tracking:'sets',strengthType:x.strengthType||'normal',sets:3}}
function archivedIds(data=store){const preview=C.previewExerciseLibrary(data);const existing=Array.isArray(data.exerciseLibrary)?data.exerciseLibrary:[];return new Set(existing.filter(x=>x.archived).map(x=>x.id))}
function activeTemplateItems(t,kind=null,data=store){const hidden=archivedIds(data);return t.items.filter(i=>!hidden.has(i.id)&&(kind===null||(i.kind==='cardio')===(kind==='cardio')))}
function librarySave(mutator){const next=C.clone(store);const view=libraryView();next.exerciseLibrary=C.clone(view.items);mutator(next.exerciseLibrary,next);return persist(next)}
const EXERCISE_PARTS=['胸','背中','肩','腕','脚','腹筋・体幹','その他'];
function registrationLabel(x){return x.kind==='cardio'?'有酸素運動':exerciseRegistrationOptions().find(([v])=>v===registrationType(x))?.[1]||'通常トレーニング'}
function libraryForm(existing=null){
 const panel=$('exerciseLibraryEditor'),form=$('exerciseLibraryForm');panel.classList.remove('hidden');form.replaceChildren();
 $('exerciseLibraryEditorTitle').textContent=existing?'種目を編集':'新しい種目を登録';
 const make=(title,element)=>{const label=document.createElement('label');label.textContent=title;label.append(element);form.append(label);return element};
 const name=document.createElement('input');name.value=existing?.name||'';name.placeholder='種目名';name.maxLength=100;make('種目名',name);
 const type=document.createElement('select');for(const [value,label] of [...exerciseRegistrationOptions(),['cardio','有酸素運動']])type.add(new Option(label,value));type.value=existing?registrationType(existing):'sets';make('記録方式',type);
 const category=document.createElement('select');for(const part of EXERCISE_PARTS)category.add(new Option(part,part));category.value=existing?.category&&EXERCISE_PARTS.includes(existing.category)?existing.category:existing?exerciseCategory(existing):'その他';make('部位・カテゴリ',category);const categoryLabel=category.parentElement;
 const annotation=document.createElement('textarea');annotation.rows=4;annotation.placeholder='実施手順・フォームの注意点など（任意）';annotation.value=existing?.annotation||'';make('種目の説明（記録画面にも表示）',annotation);
 type.onchange=()=>{categoryLabel.classList.toggle('hidden',type.value==='cardio')};type.onchange();
 const actions=document.createElement('div');actions.className='actions';const save=button(existing?'変更を保存':'種目を登録',()=>{
  const value=name.value.trim();if(!value){notice('種目名を入力してください');name.focus();return}
  const t=type.value,kind=t==='cardio'?'cardio':'strength',config=t==='weighted-rounds'?{tracking:'rounds',strengthType:'normal',rounds:2}:t==='bodyweight-rounds'?{tracking:'rounds',strengthType:'bodyweight',rounds:2}:t==='sets'?{tracking:'sets',strengthType:'normal',sets:3}:{};
  const nextCategory=kind==='cardio'?'有酸素運動':category.value;
  if(existing&&registrationType(existing)!==t){const used=store.templates.some(p=>p.items.some(i=>i.id===existing.id));const historical=Object.values(store.days).some(d=>(d.sessions||[]).some(s=>s.items.some(i=>i.id===existing.id)));if((used||historical)&&!confirm('記録方式を変更します。過去の記録はそのまま残りますが、既存のプリセットにも新しい方式が適用されます。続けますか？'))return}
  const ok=librarySave((items,next)=>{const id=existing?.id||uid();let item=items.find(i=>i.id===id);if(!item){item={id,archived:false};items.push(item)}Object.assign(item,{name:value,kind,...config,category:nextCategory,annotation:annotation.value});if(kind==='cardio'){delete item.tracking;delete item.strengthType}for(const p of next.templates)for(const it of p.items)if(it.id===id){Object.assign(it,{name:value,kind,...config,category:nextCategory,annotation:annotation.value});if(kind==='cardio'){delete it.tracking;delete it.strengthType}}});
  if(ok){panel.classList.add('hidden');renderLibrary();renderTemplates();refreshPickers();renderExercises();notice(existing?'種目を更新しました。過去の記録は保持されます':'種目を登録しました')}
 });actions.append(save,button('キャンセル',()=>panel.classList.add('hidden'),'outline'));form.append(actions);panel.scrollIntoView({behavior:'smooth',block:'start'});
}
function addLibraryExercise(){libraryForm()}
function libraryUsage(id){const presets=store.templates.filter(t=>t.items.some(i=>i.id===id));const days=Object.entries(store.days).filter(([_,d])=>(d.sessions||[]).some(s=>s.items.some(i=>i.id===id))).map(([date])=>date);return {presets,days}}
function deleteLibraryExercise(x){
 const usage=libraryUsage(x.id);const warning=usage.days.length?`過去の運動記録が${usage.days.length}日分あります。\n過去の記録は削除せず保持します。\n`:'';
 const presetWarning=usage.presets.length?`登録済みメニュー${usage.presets.length}件から、この種目を除外します。\n`:'';
 if(!confirm(`「${x.name}」をライブラリから完全削除しますか？\n${warning}${presetWarning}この操作は元に戻せません。`))return;
 if(librarySave((items,next)=>{next.exerciseLibrary=items.filter(i=>i.id!==x.id);for(const p of next.templates)p.items=p.items.filter(i=>i.id!==x.id);for(const d of Object.values(next.days))for(const session of d.sessions||[])for(const it of session.items||[])if(it.id===x.id){it.name=x.name;it.annotation=x.annotation||''}next.deletedExerciseIds=[...new Set([...(next.deletedExerciseIds||[]),x.id])]})){for(const session of draft.sessions)for(const it of session.items)if(it.id===x.id){it.name=x.name;it.annotation=x.annotation||''}renderLibrary();renderTemplates();refreshPickers();renderExercises();notice('種目を削除しました。過去の記録は保持されています')}
}
function renderLibrary(){
 const root=$('exerciseLibraryList');if(!root)return;root.replaceChildren();const view=libraryView();
 const warning=$('exerciseLibraryWarning');warning.textContent=view.audit.collisions.length||view.audit.missing.length?`既存データにIDの不一致 ${view.audit.collisions.length}件、ID欠落 ${view.audit.missing.length}件があります。該当種目は自動統合せず、履歴を変更しません。`:'既存の種目IDと履歴は変更しません。';
 const archived=$('showArchivedExercises').checked;
 for(const x of view.items.filter(x=>!!x.archived===archived)){
  const line=document.createElement('div');line.className='template-card';const heading=document.createElement('h3');heading.textContent=x.name;
  const meta=document.createElement('p');meta.className='hint';meta.textContent=registrationLabel(x)+' · '+(x.kind==='cardio'?'有酸素運動':x.category||exerciseCategory(x));
  line.append(heading,meta);if(x.annotation){const note=document.createElement('p');note.className='annotation';note.textContent=x.annotation;line.append(note)}
  const actions=document.createElement('div');actions.className='actions';actions.append(button('編集',()=>libraryForm(x),'outline'));
  actions.append(button(archived?'復元':'アーカイブ',()=>{if(!archived&&!confirm('この種目を通常の選択一覧から隠しますか？過去の記録は残ります。'))return;if(librarySave(items=>{items.find(i=>i.id===x.id).archived=!archived})){renderLibrary();renderTemplates();refreshPickers();notice(archived?'復元しました':'アーカイブしました')}},'outline'));
  actions.append(button('完全削除',()=>deleteLibraryExercise(x),'danger'));line.append(actions);root.append(line);
 }
 if(!root.children.length)root.innerHTML='<p class="hint">該当する種目はありません。</p>';
}
function pickLibraryExercise(index){
 const items=libraryView().items.filter(x=>!x.archived&&x.kind===editing.items[index].kind);
 if(!items.length){notice('選択できる種目がありません。先にライブラリへ登録してください');return}
 const panel=$('templateExercisePicker');panel.replaceChildren();panel.classList.remove('hidden');
 const title=document.createElement('h3');title.textContent='プリセットに入れる種目を選択';panel.append(title);
 const select=document.createElement('select');for(const x of items)select.add(new Option(x.name,x.id));panel.append(select);
 const actions=document.createElement('div');actions.className='actions';actions.append(button('この種目を選ぶ',()=>{
  const chosen=items.find(x=>x.id===select.value);if(!chosen)return;
  if(editing.items.some((item,i)=>i!==index&&item.id===chosen.id)){notice('この種目はプリセット内にすでに登録されています');return}
  editing.items[index]={...editing.items[index],...exerciseConfig(chosen),id:chosen.id,name:chosen.name,kind:chosen.kind,category:chosen.category,annotation:chosen.annotation||''};panel.classList.add('hidden');renderEditor();
 }),button('キャンセル',()=>panel.classList.add('hidden'),'outline'));panel.append(actions);panel.scrollIntoView({behavior:'smooth',block:'center'});
}
const DRAFT_KEY='chapi-training-v37-autosave-draft';
let autoState='saved',journalError=false;
function autoStatus(message,failed=false){
 document.querySelectorAll('.auto-save-status').forEach(el=>{el.textContent=message;el.classList.toggle('save-failed',failed)})
}
function journalDraft(){
 if(blocked)return false;
 try{
  sync();
  const payload={version:1,date:current,base:savedDraft,draft:C.clone(draft),time:Date.now()};
  localStorage.setItem(DRAFT_KEY,JSON.stringify(payload));
  journalError=false;autoStatus('入力を保護しました（自動保存）');
  return true;
 }catch(e){journalError=true;autoStatus('保存失敗：入力を保護できません',true);return false}
}
function clearJournal(){
 try{localStorage.removeItem(DRAFT_KEY)}catch(e){autoStatus('保存済みですが下書きの整理に失敗しました',true)}
}
function restoreJournal(){
 if(blocked)return;
 try{
  const raw=localStorage.getItem(DRAFT_KEY);if(!raw)return;
  const j=JSON.parse(raw);
  if(j.version!==1||!C.date(j.date)||!j.draft)return;
  // A changed saved base may indicate an external update: never silently overwrite it.
  const baseNow=JSON.stringify(C.normalizeDay(store.days[j.date]));
  if(j.base!==baseNow){autoStatus('別の保存記録があります。下書きは保持中',true);return}
  if(JSON.stringify(j.draft)===baseNow){clearJournal();return}
  if(j.date!==current)chooseDate(j.date);
  draft=C.normalizeDay(j.draft);
  $('weight').value=draft.weight??'';$('daynote').value=draft.note||'';
  $('restDay').checked=!!draft.restDay;
  $('watchEnabled').checked=!!draft.watchEnabled;
  $('watchMode').value=draft.watchMode==='active'?'active':'total';
  $('watchTotalKcal').value=draft.watchTotalKcal??'';
  renderWatch();renderExercises();renderStrengthTotal();renderFood();renderEnergy();renderWeek();
  autoStatus('直前の入力を復元しました（下書き）');
 }catch(e){autoStatus('下書きの復元に失敗しました。元の記録は保持',true)}
}
// Compare with the nearest dated measurements, never with a fixed adult-only minimum.
const confirmedWeightByDay=new Map();
function weightAlert(){
 const raw=draft?.weight;
 if(raw===''||raw===null||raw===undefined)return null;
 const value=Number(raw);
 if(!Number.isFinite(value)||value<=0)return null;
 const neighbors=Object.entries(store.days).filter(([date,day])=>
   date!==current&&C.date(date)&&C.numeric(day.weight)&&Number(day.weight)>0
 ).map(([date,day])=>({date,weight:Number(day.weight),gap:Math.abs(C.daysBetween(current,date))}))
 .filter(x=>x.gap<=30).sort((a,b)=>a.gap-b.gap).slice(0,2);
 const flagged=neighbors.filter(x=>Math.abs(value-x.weight)>=5&&Math.abs(value-x.weight)/x.weight>=.10);
 return flagged.length?{value,neighbors:flagged}:null;
}
function weightApproval(interactive=false){
 const alert=weightAlert();
 if(!alert)return true;
 if(confirmedWeightByDay.get(current)===String(draft.weight))return true;
 if(!interactive){
  autoStatus('体重が前後の記録から大きく変化しています。確認待ち（下書き保護中）',true);
  return false;
 }
 const comparisons=alert.neighbors.map(x=>`${x.date}：${x.weight} kg`).join('\n');
 if(confirm(`体重 ${alert.value} kg は近い日付の記録と大きく異なります。\n${comparisons}\n\n入力値が正しい場合は「OK」で保存します。修正する場合は「キャンセル」を押してください。`)){
  confirmedWeightByDay.set(current,String(draft.weight));return true
 }
 // Cancel means discard only the rejected weight, not other unsaved fields.
 const savedWeight=C.normalizeDay(store.days[current]).weight;
 draft.weight=savedWeight??'';
 $('weight').value=draft.weight;
 confirmedWeightByDay.delete(current);
 if(dayDirty())journalDraft();else clearJournal();
 autoStatus('体重の変更を取り消しました（ほかの下書きは保持）');
 renderEnergy();
 return false;
}
function validAutoDraft(){
 if(draft.weight!==''&&(!C.nonnegative(draft.weight)||Number(draft.weight)<=0))return false;
 for(const [key] of C.meals)for(const f of ['kcal','p','f','c']){const v=draft.meals?.[key]?.[f];if(v!==''&&v!=null&&!C.nonnegative(v))return false}
 if(draft.strengthWorkout)for(const f of ['minutes','kcal']){const v=draft.strengthWorkout[f];if(v!==''&&v!=null&&!C.nonnegative(v))return false}
 if(draft.watchEnabled&&draft.watchTotalKcal!==''&&(!Number.isInteger(Number(draft.watchTotalKcal))||Number(draft.watchTotalKcal)<0))return false;
 for(const sess of draft.sessions)for(const it of sess.items){
  for(const f of ['minutes','km','steps','kcal','rounds'])if(it[f]!==''&&it[f]!=null&&!C.nonnegative(it[f]))return false;
  for(const st of it.roundEntries||[])for(const f of ['kg','rounds'])if(st[f]!==''&&st[f]!=null&&(!C.nonnegative(st[f])||(f==='rounds'&&!Number.isInteger(Number(st[f])))))return false;
  for(const st of it.sets||[])for(const f of ['kg','reps','rir'])if(st[f]!==''&&st[f]!=null&&!C.nonnegative(st[f]))return false;
 }
 // Preserve manual confirmation for unusually large nutrition values.
 const old=C.normalizeDay(store.days[current]).meals;
 for(const [key] of C.meals)for(const [f,limit] of [['kcal',10000],['p',1000],['f',1000],['c',1000]]){
  const v=draft.meals?.[key]?.[f];if(v!==''&&v!=null&&Number(v)>limit&&String(v)!==String(old?.[key]?.[f]??''))return false
 }
 return true;
}
function autoCommit(){
 if(blocked||!draft)return false;
 sync();
 if(!dayDirty()){clearJournal();autoStatus('保存済み');return true}
 if(!validAutoDraft()){autoStatus('下書きを保護中（数値を確認）');return false}
 if(!weightApproval(false))return false;
 const next=C.clone(store);next.days[current]=C.clone(draft);
 try{if(!localStorage.getItem('chapi-training-before-autosave-v37'))localStorage.setItem('chapi-training-before-autosave-v37',JSON.stringify(store))}catch(e){autoStatus('事前バックアップを作れません。手動保存を利用してください',true);return false}
 if(!persist(next)){autoStatus('保存失敗：保存ボタンで再試行してください',true);return false}
 savedDraft=JSON.stringify(draft);clearJournal();autoStatus('自動保存済み');
 return true;
}
function chooseDate(day){current=day;draft=C.normalizeDay(store.days[day]);savedDraft=JSON.stringify(draft);$('recordDate').value=day;$('weight').value=draft.weight??'';$('daynote').value=draft.note||'';$('restDay').checked=!!draft.restDay;$('watchEnabled').checked=!!draft.watchEnabled;$('watchMode').value=draft.watchMode==='active'?'active':'total';$('watchTotalKcal').value=draft.watchTotalKcal??'';renderWatch();renderExercises();renderStrengthTotal();renderFood();renderEnergy();renderWeek()}
function sync(){if(!draft)return;draft.weight=$('weight').value;draft.note=$('daynote').value;draft.restDay=$('restDay').checked;draft.watchEnabled=$('watchEnabled').checked;draft.watchMode=$('watchMode').value;draft.watchTotalKcal=$('watchTotalKcal').value;}
function renderWatch(){const on=$('watchEnabled').checked,active=$('watchMode').value==='active';$('watchInputRow').classList.toggle('hidden',!on);$('watchKcalLabel').textContent=active?'アクティブ消費カロリー（kcal）':'1日の総消費カロリー（kcal）';$('watchHint').textContent=!on?'従来の推定消費を使用します。':active?'推定基礎代謝（BMR）＋アクティブ消費で概算します。記録済み運動は追加しません。プロフィール不足・空欄・0の場合は従来計算に戻ります（0は未計測として警告）。':'総消費をそのまま採用します。生活活動係数・運動消費は追加しません。空欄・0の場合は従来計算に戻ります（0は未計測として警告）。';}
function dayDirty(){sync();return JSON.stringify(draft)!==savedDraft}
function changeDate(day){if(day!==current&&dayDirty()&&weightAlert()&&!weightApproval(false)){journalDraft();notice('体重の急変を確認するか修正してから日付を切り替えてください');$('recordDate').value=current;return false}if(day!==current&&dayDirty()){journalDraft();autoCommit()}if(!C.date(day)){notice('日付を確認してください');return false}if(day!==current&&dayDirty()&&!confirm('未保存の変更があります。下書きは保持されますが、日付を切り替えますか？')){$('recordDate').value=current;return false}if(day!==current)chooseDate(day);return true}
function saveDay(){sync();if(!weightApproval(true))return false;if(draft.weight!==''&&(!C.nonnegative(draft.weight)||Number(draft.weight)<=0)){notice('体重は0より大きい数値を入力してください');return false}for(const [key] of C.meals)for(const f of ['kcal','p','f','c']){const v=draft.meals?.[key]?.[f];if(v!==''&&v!=null&&!C.nonnegative(v)){notice('食事は0以上の数値で入力してください');return false}}if(draft.strengthWorkout){for(const f of ['minutes','kcal']){const v=draft.strengthWorkout[f];if(v!==''&&v!=null&&!C.nonnegative(v)){notice('筋トレ全体の時間・消費カロリーは0以上にしてください');return false}}}for(const sess of draft.sessions)for(const it of sess.items){for(const f of ['minutes','km','steps','kcal','rounds'])if(it[f]!==''&&it[f]!=null&&!C.nonnegative(it[f])){notice('運動の数値は0以上にしてください');return false}for(const st of it.roundEntries||[])for(const f of ['kg','rounds'])if(st[f]!==''&&st[f]!=null&&(!C.nonnegative(st[f])||(f==='rounds'&&!Number.isInteger(Number(st[f]))))){notice('サーキットの重量・周回数を確認してください');return false}for(const st of it.sets||[])for(const f of ['kg','reps','rir'])if(st[f]!==''&&st[f]!=null&&!C.nonnegative(st[f])){notice('セットの数値を確認してください');return false}}// Flag unusually large newly-entered food values without rewriting older records.
if(draft.watchEnabled&&draft.watchTotalKcal!==''&&(!Number.isInteger(Number(draft.watchTotalKcal))||Number(draft.watchTotalKcal)<0)){notice('ウォッチの消費カロリーは0以上の整数で入力してください');return false}
const originalMeals=C.normalizeDay(store.days[current]).meals;
const unusual=[];
for(const [meal,name] of C.meals)for(const [field,unit,limit] of [['kcal','kcal',10000],['p','g',1000],['f','g',1000],['c','g',1000]]){
  const value=draft.meals?.[meal]?.[field];
  if(value===''||value==null||Number(value)<=limit)continue;
  if(String(value)===String(originalMeals?.[meal]?.[field]??''))continue;
  unusual.push(`${name} ${field.toUpperCase()}：${value} ${unit}`);
}
if(unusual.length&&!confirm('食事に通常より大きな数値があります。入力ミスではありませんか？\n'+unusual.join('\n')+'\nこの数値で保存しますか？'))return false;
const next=C.clone(store);next.days[current]=C.clone(draft);if(!persist(next))return false;savedDraft=JSON.stringify(draft);clearJournal();autoStatus('保存済み');notice('この日の記録と食事を保存しました');renderEnergy();renderWeek();if(activeTab==='calendar')renderCalendar();return true}
function saveOneMeal(key){
 const meal=draft.meals?.[key];if(!meal){notice('食事の入力がありません');return false}
 for(const f of ['kcal','p','f','c']){const v=meal[f];if(v!==''&&v!=null&&!C.nonnegative(v)){notice('食事は0以上の数値で入力してください');return false}}
 const next=C.clone(store),base=C.normalizeDay(next.days[current]);
 base.meals[key]=C.clone(meal);
 next.days[current]=base;
 if(!persist(next))return false;
 // 保存した食事だけを保存済みスナップショットに反映。ほかの未保存入力は保持。
 const snapshot=JSON.parse(savedDraft);snapshot.meals[key]=C.clone(meal);savedDraft=JSON.stringify(snapshot);
 if(dayDirty())journalDraft();else clearJournal();
 notice((C.meals.find(m=>m[0]===key)?.[1]||'食事')+'を保存しました ✓');
 renderFoodSummary();renderEnergy();renderWeek();return true;
}
// v3.6: Only the selected meal is persisted; other unsaved day edits are untouched.
function mealHasRecord(meal){return !!(meal&&(meal.skipped===true||String(meal.note||'').trim()||['kcal','p','f','c'].some(f=>C.nonnegative(meal[f]))||(Array.isArray(meal.aiItems)&&meal.aiItems.length>0)))}
function replaceOneMeal(key,replacement,message){
 const previous=draft.meals[key]===undefined?undefined:C.clone(draft.meals[key]);
 draft.meals[key]=C.clone(replacement);
 if(!saveOneMeal(key)){if(previous===undefined)delete draft.meals[key];else draft.meals[key]=previous;renderFood();return false}
 renderFood();notice(message);return true;
}
function deleteOneMeal(key){
 const name=C.meals.find(m=>m[0]===key)?.[1]||'食事';
 if(!mealHasRecord(draft.meals[key])){notice(name+'は未記録です');return}
 if(!confirm(current+' の'+name+'を削除して未記録に戻しますか？\nカロリー・PFC・備考・AI食品内訳が削除されます。ほかの食事は変更しません。'))return;
 replaceOneMeal(key,{},name+'を削除しました');
}
function copyPreviousMeal(key){
 const name=C.meals.find(m=>m[0]===key)?.[1]||'食事',previousDate=C.plusDays(current,-1);
 const source=C.normalizeDay(store.days[previousDate]).meals[key];
 if(!mealHasRecord(source)){notice(previousDate+' の'+name+'は未記録のためコピーできません');return}
 if(mealHasRecord(draft.meals[key])&&!confirm(current+' の'+name+'を、'+previousDate+' の記録で上書きしますか？\n現在の備考・AI食品内訳も置き換わります。'))return;
 replaceOneMeal(key,source,previousDate+' の'+name+'をコピーしました');
}
function aiDiscard(){aiPending=null;$('aiAccept').disabled=true;$('aiAcceptTop').disabled=true;$('aiPreview').replaceChildren();}
function switchTab(name){if(name===activeTab)return;if(activeTab==='settings'&&name!=='settings'&&settingsDirty&&!confirm('設定に未保存の変更があります。設定を保存せず移動しますか？'))return;sync();activeTab=name;for(const p of document.querySelectorAll('.page'))p.classList.toggle('hidden',p.id!==name);document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));if(name==='record'){refreshPickers();renderExercises();renderEnergy();renderWeek()}if(name==='food')renderFood();if(name==='calendar')renderCalendar();if(name==='progress')renderGraphs();if(name==='history')renderHistory();if(name==='templates'){renderTemplates();renderLibrary()}if(name==='settings'){renderSettings();dirtySections.clear();settingsDirty=false}window.scrollTo?.({top:0,behavior:'smooth'})}
function numberInput(label,value,change,{step='0.1',min='0',max,placeholder='未入力'}={}){const box=document.createElement('label');box.textContent=label;const input=document.createElement('input');input.type='number';input.inputMode=step==='1'?'numeric':'decimal';input.min=min;input.step=step;if(max)input.max=max;input.value=value??'';input.placeholder=placeholder;input.oninput=()=>change(input.value);box.append(input);return box}
function textInput(label,value,change,area=false){const box=document.createElement('label');box.textContent=label;const input=document.createElement(area?'textarea':'input');input.value=value??'';input.oninput=()=>change(input.value);box.append(input);return box}
function button(label,fn,cls='outline'){const b=document.createElement('button');b.textContent=label;b.className=cls;b.onclick=fn;return b}
function selectInput(label,value,options,change){const box=document.createElement('label');box.textContent=label;const input=document.createElement('select');for(const [v,text] of options)input.add(new Option(text,v));input.value=value??'';input.onchange=()=>change(input.value);box.append(input);return box}
const EXERCISE_CATEGORIES=['プリセット','有酸素運動','胸','背中','肩','腕','脚','腹筋・体幹','その他'];
function exerciseCategory(x){if(x.kind==='cardio')return '有酸素運動';if(EXERCISE_PARTS.includes(x.category))return x.category;const n=String(x.name||'');if(/チェストサポート(?:・|\s|-)?(?:ロー|ロウ)|チェストサポーテッド(?:・|\s|-)?(?:ロー|ロウ)/.test(n))return '背中';if(/ベンチ|チェスト|フライ|プッシュアップ|腕立て|胸/.test(n))return '胸';if(/ルーマニアンデッドリフト|\bRDL\b|ＲＤＬ/.test(n))return '脚';if(/シュラッグ/.test(n))return '背中';if(/ロー|プル|懸垂|デッドリフト|背中|ラット/.test(n))return '背中';if(/ショルダー|サイドレイズ|フロントレイズ|リアレイズ|肩/.test(n))return '肩';if(/カール|トライセプス|スカル|腕|前腕/.test(n))return '腕';if(/スクワット|ランジ|カーフ|レッグ|ヒップ|脚|ブルガリアン/.test(n))return '脚';if(/プランク|クランチ|腹|ローラー|体幹|上体起こし|シットアップ/.test(n))return '腹筋・体幹';return 'その他'}
function refreshPickers(){const category=$('exerciseCategory'),picker=$('exercisePicker');if(!category||!picker)return;const old=category.value;category.replaceChildren();for(const name of EXERCISE_CATEGORIES)category.add(new Option(name,name));category.value=EXERCISE_CATEGORIES.includes(old)?old:'プリセット';refreshExerciseOptions()}
const BUILTIN_DISPLAY_NAMES={'bench':'ダンベルベンチプレス','press':'ダンベルショルダープレス','squat':'ダンベルスクワット','rdl':'ダンベルルーマニアンデッドリフト','shrug':'ダンベルシュラッグ'};
function displayExerciseName(item){return C.exercisePresentation(store,item).name}
function displayExerciseAnnotation(item){return C.exercisePresentation(store,item).annotation}
function refreshExerciseOptions(){const category=$('exerciseCategory').value,picker=$('exercisePicker');picker.replaceChildren();if(category==='プリセット'){for(const t of store.templates){const items=activeTemplateItems(t);if(items.length>1)picker.add(new Option(t.name+'（'+items.length+'種目）','template:'+t.id))}}else{const seen=new Set();for(const item of libraryView().items){if(item.archived||isLegacyGenericCircuit(item)||item.kind==='cardio'&&item.name==='有酸素運動'||exerciseCategory(item)!==category||seen.has(item.id))continue;seen.add(item.id);picker.add(new Option(displayExerciseName(item),'item:'+item.id))}}$('addExercise').disabled=!picker.options.length}
function addSelectedExercise(){const value=$('exercisePicker').value;if(!value)return;if(value.startsWith('template:')){const t=store.templates.find(t=>t.id===value.slice(9));if(t)addItemsToDay(t,activeTemplateItems(t));return}const id=value.slice(5);const library=libraryView().items.find(i=>i.id===id);if(!library)return;const source=store.templates.flatMap(t=>t.items).find(i=>i.id===id);const item=source?{...C.clone(source),...C.clone(library),...(library.kind==='cardio'?{}:exerciseConfig(library))}:{...C.clone(library),...(library.kind==='cardio'?{}:exerciseConfig(library))};addItemsToDay({id:null,name:'単体種目'},[item])}
function addItemsToDay(source,itemsInput){sync();const t=source;const items=itemsInput.map(i=>{const out={...C.clone(i),...(i.id==='bodyweight-circuit-v37'?{tracking:'rounds',strengthType:'bodyweight'}:{}),note:'',...(i.kind==='cardio'?{minutes:'',kcal:'',energyType:'unknown'}:{})};if(i.kind==='cardio'){out.km='';out.steps='';delete out.sets}else if(i.tracking==='rounds'){out.rounds='';out.done=false;out.roundEntries=[{kg:'',rounds:'',done:false}];delete out.sets}else{const prev=C.previous(store,i.id,current),weights=(prev?.item.sets||[]).filter(s=>s.done);out.sets=Array.from({length:Math.max(1,Math.min(30,Number(i.sets)||3))},(_,n)=>({kg:i.strengthType==='bodyweight'?'':(weights[n]?.kg??weights.at(-1)?.kg??''),reps:'',rir:'',done:false,loadMode:i.strengthType==='bodyweight'?'normal':undefined}))}return out});const orders=draft.sessions.flatMap(x=>x.items).map(x=>x.displayOrder).filter(Number.isFinite);const start=orders.length?Math.max(...orders)+1:draft.sessions.flatMap(x=>x.items).length;items.forEach((item,i)=>item.displayOrder=start+i);draft.sessions.push({id:uid(),name:t.name,templateId:t.id||null,items});renderExercises();renderEnergy()}
function renderStrengthTotal(){const w=draft.strengthWorkout||{};$('strengthTotalMinutes').value=w.minutes??'';$('strengthTotalKcal').value=w.kcal??'';$('strengthTotalType').value=w.energyType||'unknown'}
function updateStrengthTotal(field,value){if(!draft.strengthWorkout)draft.strengthWorkout={minutes:'',kcal:'',energyType:'unknown'};draft.strengthWorkout[field]=value;renderEnergy()}
// Conservative speed-band MET references. Output is NET exercise energy, not gross energy.
function cardioEstimateKind(it){const name=String(it.name||'').toLowerCase(),id=String(it.id||'').toLowerCase();if(id==='walk'||/ウォーキング|散歩|歩行/.test(name))return 'walk';if(id==='running'||/ランニング|ジョギング|ジョグ|走/.test(name))return 'run';if(/サイクリング|自転車|ロードバイク|サイクル/.test(name))return 'cycle';return null}
function estimateCardio(it){const kind=cardioEstimateKind(it),minutes=Number(it.minutes),km=Number(it.km),w=C.weightAt(store,current,draft)?.weight;if(!kind||it.minutes===''||it.km===''||!(minutes>0&&minutes<=1440&&km>0&&km<=500&&w>0))return null;const speed=km*60/minutes;if(!Number.isFinite(speed)||speed>90)return null;let met;
 if(kind==='walk'){if(speed<1||speed>9)return null;met=speed<3.2?2.5:speed<4.8?3.3:speed<5.6?3.8:speed<6.4?4.8:5.5}
 else if(kind==='run'){if(speed<5||speed>25)return null;met=speed<8?6:speed<9.7?8.3:speed<11.3?9.8:speed<12.9?11:12.8}
 else {if(speed<5||speed>55)return null;met=speed<16?4:speed<19?6.8:speed<22.5?8:speed<25.5?10:12}
 // Standard MET kcal/min convention, subtracting 1 MET resting energy.
 return {kcal:Math.round(Math.max(0,(met-1)*3.5*w/200*minutes)),speed,weight:w,kind};}
function moveDayExercise(position,direction){const entries=draft.sessions.flatMap((sess,si)=>sess.items.map((it,ii)=>({it,si,ii})));entries.sort((a,b)=>(Number.isFinite(a.it.displayOrder)?a.it.displayOrder:a.si*1000+a.ii)-(Number.isFinite(b.it.displayOrder)?b.it.displayOrder:b.si*1000+b.ii));const other=position+direction;if(other<0||other>=entries.length)return;[entries[position],entries[other]]=[entries[other],entries[position]];entries.forEach((entry,i)=>{entry.it.displayOrder=i});renderExercises();journalDraft();autoCommit()}
function renderExercises(){const root=$('strengthSessions');root.innerHTML='';$('cardioSessions').replaceChildren();const entries=[];draft.sessions.forEach((sess,si)=>sess.items.forEach((it,ii)=>entries.push({sess,si,it,ii})));entries.sort((a,b)=>(Number.isFinite(a.it.displayOrder)?a.it.displayOrder:a.si*1000+a.ii)-(Number.isFinite(b.it.displayOrder)?b.it.displayOrder:b.si*1000+b.ii));let count=0;entries.forEach(({sess,si,it,ii},position)=>{count++;const kind=it.kind==='cardio'?'cardio':'strength';const wrap=document.createElement('article');wrap.className='exercise';const head=document.createElement('div');head.className='row';const h=document.createElement('h3');h.textContent=displayExerciseName(it)||'名称未設定';const up=button('↑',()=>moveDayExercise(position,-1),'outline button-small');up.disabled=position===0;up.setAttribute('aria-label','この運動を上へ');const down=button('↓',()=>moveDayExercise(position,1),'outline button-small');down.disabled=position===entries.length-1;down.setAttribute('aria-label','この運動を下へ');head.append(h,up,down,button('削除',()=>{if(confirm('この日の「'+(it.name||'運動')+'」を削除しますか？ 保存するまでは確定しません。')){draft.sessions[si].items.splice(ii,1);if(!draft.sessions[si].items.length)draft.sessions.splice(si,1);renderExercises();renderEnergy()}},'danger button-small'));wrap.append(head);const origin=document.createElement('p');origin.className='hint';origin.textContent=sess.name||'';wrap.append(origin);if(displayExerciseAnnotation(it)){const annotation=document.createElement('p');annotation.className='annotation';annotation.textContent=displayExerciseAnnotation(it);wrap.append(annotation)}
if(kind==='strength'){const details=document.createElement('details');details.innerHTML='<summary>前回の記録を見る</summary>';const previous=C.previous(store,it.id,current),box=document.createElement('div');box.className='previous';if(previous){const p=previous.item;box.innerHTML='<b>'+esc(previous.date)+'（閲覧のみ）</b>';const lines=(p.sets||[]).map((s,i)=>`${i+1}セット：${s.kg??'—'} kg × ${s.reps??'—'} 回 / RIR ${s.rir??'—'}${s.done?' ✓':''}`);if(p.rounds!==undefined)lines.unshift('周回数：'+(p.rounds||'未入力')+' 周');if(p.roundEntries?.length)lines.unshift(...p.roundEntries.map((s,n)=>`${n+1}行：${s.kg===''?'重量未入力':s.kg+' kg'} × ${s.rounds||'—'} 周${s.done?' ✓':''}`));for(const line of lines){const el=document.createElement('p');el.textContent=line;box.append(el)}if(p.note){const note=document.createElement('p');note.textContent='備考：'+p.note;box.append(note)}}else box.textContent='前回記録なし';details.append(box);wrap.append(details);
if(it.strengthType==='bodyweight'&&Array.isArray(it.sets)){const modeBox=selectInput('自重の負荷',it.loadMode||'normal',[['normal','自重のみ'],['added','加重あり（追加重量を入力）'],['assisted','補助あり（重量入力なし）']],v=>{it.loadMode=v;renderExercises();journalDraft();autoCommit()});wrap.append(modeBox);if(it.loadMode==='added'){const help=document.createElement('p');help.className='hint';help.textContent='追加した重りの重量（kg）を入力します。体重は含めません。';wrap.append(help)}if(it.loadMode!=='added'&&it.sets.some(st=>st.kg!==''&&st.kg!=null)){const note=document.createElement('p');note.className='hint';note.textContent='以前の追加重量は保持していますが、現在の負荷モードでは記録に使用しません。加重ありに戻すと再表示されます。';wrap.append(note)}}
if(it.tracking==='rounds'&&!Array.isArray(it.sets)){W.ensure(it);
const bodyweight=it.strengthType==='bodyweight';
if(bodyweight){const mode=selectInput('サーキットの負荷',it.loadMode||'normal', [['normal','自重のみ'],['added','加重あり'],['assisted','補助あり']],v=>{it.loadMode=v;renderExercises();journalDraft();autoCommit()});wrap.append(mode);if(it.loadMode==='added'){const help=document.createElement('p');help.className='hint';help.textContent='追加した重量（kg）を入力します。体重は含めません。';wrap.append(help)}else if(it.roundEntries.some(st=>st.kg!==''&&st.kg!=null)){const help=document.createElement('p');help.className='hint';help.textContent='以前の追加重量は保持しています。加重ありに戻すと再表示されます。';wrap.append(help)}}
const totalLabel=document.createElement('p');totalLabel.className='round-total';const refreshTotals=()=>{const t=W.totals(it);totalLabel.textContent='合計周回数：'+t.total+' 周／完了周回数：'+t.completed+' 周'};
const showWeight=!bodyweight||it.loadMode==='added';
it.roundEntries.forEach((st,n)=>{const row=document.createElement('div');row.className='round-entry';if(showWeight)row.append(numberInput(bodyweight?'追加重量 kg':'重量 kg',st.kg,v=>W.setValue(it,n,'kg',v),{step:'0.5'}));row.append(numberInput('周回数',st.rounds,v=>{W.setValue(it,n,'rounds',v);refreshTotals();renderEnergy()},{step:'1',min:'0'}));const done=document.createElement('label');done.className='check';const ck=document.createElement('input');ck.type='checkbox';ck.checked=!!st.done;ck.onchange=()=>{W.setDone(it,n,ck.checked);refreshTotals()};done.append(ck,'完了');row.append(done);const del=button('削除',()=>{if(it.roundEntries.length<=1){notice('最低1行は残してください');return}if(W.hasInput(it,n)&&!confirm('入力済みの周回行を削除しますか？'))return;W.remove(it,n);renderExercises()},'outline button-small');del.setAttribute('aria-label',`${it.name} ${n+1}行目を削除`);row.append(del);wrap.append(row)});
refreshTotals();wrap.append(totalLabel);const acts=document.createElement('div');acts.className='circuit-add-row';acts.append(button('＋周回行を追加',()=>{W.add(it);renderExercises()},'outline'));wrap.append(acts)
}else{const labels=document.createElement('div');labels.className='set-head'+(it.strengthType==='bodyweight'&&it.loadMode!=='added'?' no-weight':'');labels.innerHTML='<span>#</span>'+(it.strengthType==='bodyweight'&&it.loadMode!=='added'?'':'<span>'+(it.strengthType==='bodyweight'?'追加 kg':'重量 kg')+'</span>')+'<span>回数</span><span>RIR</span><span>完了</span>';wrap.append(labels);(it.sets||[]).forEach((st,n)=>{const row=document.createElement('div');row.className='set-row'+(it.strengthType==='bodyweight'&&it.loadMode!=='added'?' no-weight':'');const idx=document.createElement('span');idx.textContent=n+1;row.append(idx);for(const f of ['kg','reps','rir']){if(f==='kg'&&it.strengthType==='bodyweight'&&it.loadMode!=='added')continue;const inp=document.createElement('input');inp.type='number';inp.inputMode='decimal';inp.min='0';inp.step=f==='kg'?'0.5':'1';inp.value=st[f]??'';inp.setAttribute('aria-label',`${it.name} ${n+1}セット ${f==='kg'?'重量 kg':f==='reps'?'回数':'RIR'}`);inp.oninput=()=>W.setValue(it,n,f,inp.value);row.append(inp)}const ck=document.createElement('input');ck.type='checkbox';ck.checked=!!st.done;ck.setAttribute('aria-label',`${it.name} ${n+1}セット 完了`);ck.onchange=()=>W.setDone(it,n,ck.checked);row.append(ck);wrap.append(row)});const acts=document.createElement('div');acts.className='actions set-actions';acts.append(button('＋セット',()=>{W.add(it);renderExercises()}),button('－セット',()=>{if(it.sets?.length>1){const last=it.sets.at(-1);if(W.hasInput(it,it.sets.length-1)&&!confirm('入力済みの最後のセットを削除しますか？'))return;W.remove(it,it.sets.length-1);renderExercises()}}));wrap.append(acts)}}
if(kind==='cardio'){const vals=document.createElement('div');vals.className='two';vals.append(numberInput('運動時間（分）',it.minutes,v=>{it.minutes=v;renderEnergy()},{step:'0.1'}));if(kind==='cardio'&&!it.noDistance)vals.append(numberInput('距離（km）',it.km,v=>it.km=v,{step:'0.01'}));if(kind==='cardio'&&!it.noDistance)vals.append(numberInput('歩数（歩・任意）',it.steps,v=>it.steps=v,{step:'1'}));wrap.append(vals);
const energyBox=document.createElement('div');energyBox.className='energy-inputs';energyBox.innerHTML='<h4>この運動の消費カロリー</h4>';energyBox.append(numberInput('入力値（kcal・空欄で削除）',it.kcal,v=>{it.kcal=v;renderEnergy()},{step:'1'}),selectInput('入力値の区分',it.energyType||'unknown',[['unknown','未確認（合計は未算出）'],['net','正味消費（安静時分を含まない）'],['gross','総消費（安静時分を含む）']],v=>{it.energyType=v;renderEnergy()}));const hint=document.createElement('p');hint.className='hint';hint.textContent='総消費は運動時間が必要です。まとめて計測したカロリーは一つの記録だけに入力し、各種目への重複入力を避けてください。未入力分は加算しません。';energyBox.append(hint);wrap.append(energyBox);
 const estimateKind=cardioEstimateKind(it)||cardioEstimateKind({name:sess.name,id:sess.templateId});
 if(estimateKind&&!it.noDistance){const estimator=document.createElement('div');estimator.className='cardio-estimator';const title=document.createElement('strong');title.textContent='距離・時間・体重から消費カロリーを推定';estimator.append(title);const info=document.createElement('p');info.className='hint';const accept=button('推定値を採用して保存',()=>{const result=estimateCardio({...it,name:estimateKind==='cycle'?'サイクリング':estimateKind==='run'?'ランニング':'ウォーキング'});if(!result){notice('時間・距離・体重を確認してください');return}const oldKcal=it.kcal,oldType=it.energyType;it.kcal=String(result.kcal);it.energyType='net';if(!saveDay()){it.kcal=oldKcal;it.energyType=oldType;return}renderExercises();notice('推定 '+result.kcal+' kcal（正味）を採用して記録を保存しました ✓')},'');const update=()=>{const r=estimateCardio({...it,name:estimateKind==='cycle'?'サイクリング':estimateKind==='run'?'ランニング':'ウォーキング'});info.textContent=r?`参考推定：${r.kcal.toLocaleString('ja-JP')} kcal（正味）／平均 ${r.speed.toFixed(1)} km/h ／体重 ${r.weight.toFixed(1)} kg`:'運動時間・距離・記録日の体重が必要です。速度が想定範囲外の場合は推定できません。';accept.disabled=!r};update();estimator.append(info,accept);const caution=document.createElement('p');caution.className='hint';caution.textContent=estimateKind==='cycle'?'自転車は坂道・風・路面・走行姿勢などで消費量が大きく変わります。参考値として利用してください。':'速度帯による概算です。坂道・地形・体調によって実際の消費量と異なります。';estimator.append(caution);wrap.append(estimator);
 // Refresh the estimator without destroying the active number input or keyboard focus.
 const fields=vals.querySelectorAll('input');fields.forEach(field=>field.addEventListener('input',update));
 }
 }wrap.append(textInput('備考',it.note,v=>it.note=v,true));const saveActions=document.createElement('div');saveActions.className='actions exercise-save-actions';saveActions.append(button('記録を保存',saveDay));wrap.append(saveActions);root.append(wrap)});if(!count)root.innerHTML='<p class="hint">まだ登録がありません。メニューを選んで追加できます。</p>'}
function renderLegacy(){const box=$('legacyEnergy');box.classList.toggle('hidden',!C.numeric(draft.calories));if(!C.numeric(draft.calories))return;box.innerHTML='<h2>旧記録の活動カロリー</h2><p>'+esc(draft.calories)+' kcal <small>元の入力値を保持</small></p><p class="hint">運動以外の活動を含む可能性があるため、運動の合計へは自動加算しません。内容が確認できた運動だけを個別登録してください。</p>';const label=document.createElement('label');label.className='check';const ck=document.createElement('input');ck.type='checkbox';ck.checked=!!draft.legacyCaloriesResolved;ck.onchange=()=>{draft.legacyCaloriesResolved=ck.checked;renderEnergy()};label.append(ck,'内容を確認済み（元の値は残す）');box.append(label)}
$('watchEnabled').addEventListener('change',()=>{sync();renderWatch();renderEnergy()});$('watchTotalKcal').addEventListener('input',()=>{sync();renderEnergy()});$('watchMode').addEventListener('change',()=>{sync();renderWatch();renderEnergy()});
// The SVG is presentation-only: no stored data or balance calculation is changed.
function drawIntakeGauge(root,total,food,exercise,foodRecorded=true,goal=null){
 let svg=root.querySelector('.energy-ring-svg');
 if(!svg){svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 220 220');svg.setAttribute('aria-hidden','true');svg.classList.add('energy-ring-svg');root.prepend(svg)}
 svg.replaceChildren();
 const ns='http://www.w3.org/2000/svg',point=(deg,r)=>{const rad=(deg-90)*Math.PI/180;return [110+r*Math.cos(rad),110+r*Math.sin(rad)]};
 const add=(tag,attrs)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));svg.append(el);return el};
 const arc=(start,end,color,{orange=false}={})=>{if(end-start<0.001)return;const span=Math.min(360,end-start),r=orange?94.625:91,w=orange?21.75:29;if(span>=359.999){add('circle',{cx:110,cy:110,r,fill:'none',stroke:color,'stroke-width':w});return}const [x1,y1]=point(orange?start+span:start,r),[x2,y2]=point(orange?start:start+span,r);add('path',{d:`M ${x1} ${y1} A ${r} ${r} 0 ${span>180?1:0} ${orange?0:1} ${x2} ${y2}`,fill:'none',stroke:color,'stroke-width':w})};
 const marker=(deg,thick)=>{const [x1,y1]=point(deg,75),[x2,y2]=point(deg,107);if(thick)add('line',{x1,y1,x2,y2,stroke:'#526b78','stroke-opacity':0.55,'stroke-width':6,'stroke-linecap':'round'});add('line',{x1,y1,x2,y2,stroke:thick?'#ffffff':'#f5f9fb','stroke-width':thick?4:2,'stroke-linecap':'round'})};
 add('circle',{cx:110,cy:110,r:91,fill:'none',stroke:'#e7eff2','stroke-width':29});
 if(!(total>0&&Number.isFinite(total)))return;
 const toDeg=value=>value/total*360;
 const blue=Math.min(food,total);
 arc(0,toDeg(blue),'#3299bc');
 if(food>total)arc(0,toDeg(Math.min(food-total,total)),'#e96b78');
 if(exercise>0){
  // Orange starts at the food endpoint and sweeps counterclockwise over blue, with the inner blue edge visible.
  const lower=Math.max(0,food-exercise),upper=food;
  if(upper-lower>=total)arc(0,360,'#ef9b43',{orange:true});
  else {let cursor=lower;while(cursor<upper-0.0001){const lap=Math.floor(cursor/total),boundary=(lap+1)*total,next=Math.min(upper,boundary);arc(toDeg(cursor-lap*total),toDeg(next-lap*total),'#ef9b43',{orange:true});cursor=next}}
  // Once exercise exceeds intake, continue counterclockwise from twelve o'clock.
  const extra=Math.min(exercise-food,total/2);
  if(extra>0){const span=toDeg(extra),[x1,y1]=point(0,94.625),[x2,y2]=point(-span,94.625);add('path',{d:`M ${x1} ${y1} A 94.625 94.625 0 ${span>180?1:0} 0 ${x2} ${y2}`,fill:'none',stroke:'#ef9b43','stroke-width':21.75})}
  marker(toDeg(food%total),false);
 }
 const net=food-exercise;
 // The white marker follows net intake; for surplus it follows the red endpoint.
 // No food entry: no net intake can be calculated, so omit the marker.
 if(foodRecorded)marker(net<0?-toDeg(Math.min(-net,total/2)):toDeg(Math.max(0,net)%total),true);

}
// Daily Energy view is UI-only. Never store this preference in day records.
let energyView='balance';
function drawTargetGauge(root,goal,food,exercise,foodRecorded){
 // Shared geometry with expenditure mode; only the reference denominator differs.
 drawIntakeGauge(root,goal,food,exercise,foodRecorded);
}
$('energyDonut').addEventListener('click',()=>{energyView=energyView==='target'?'balance':'target';renderEnergy()});
$('energyDonut').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();energyView=energyView==='target'?'balance':'target';renderEnergy()}});
function renderEnergy(){if(!draft)return;sync();const e=C.energy(store,current,draft),target=Number(store.foodTargets?.kcal)||2000;$('energyHeading').textContent='デイリーエネルギー';$('energyDate').textContent=current+(current===today()?' · 今日':'');$('totalEnergy').textContent=e.watch?(e.total===null?'—':round(e.total)):(e.base?round(e.base.life):'—');$('energyBreakdown').textContent=e.watch?(e.watchMode==='active'?'推定基礎代謝＋ウォッチのアクティブ消費（運動の重複加算なし）':'スマートウォッチ入力の総消費を採用（運動消費の追加なし）'):e.base?`基準推定消費 ${round(e.base.life)} kcal（運動は別枠 ${round(e.exercise.net)} kcal）${e.exercise.unresolved?'（確認済み分）':''}`:'プロフィール・生活活動・体重を設定すると表示します。';const cautions=[];if(!e.watch&&e.exercise.unresolved)cautions.push('運動の区分／時間が未確認のため総消費は未算出です。');if(!e.watch&&e.exercise.missing)cautions.push('運動カロリーの空欄は加算していません。');if(!draft.sessions.length)cautions.push('登録された運動の追加消費は0 kcalです（実際の運動量が0とは限りません）。');if(!e.food.complete)cautions.push('食事入力が未完了のため収支は暫定または未算出です。');if(draft.watchEnabled&&draft.watchTotalKcal!==''&&Number(draft.watchTotalKcal)===0)cautions.push('ウォッチ0 kcalは未計測として扱い、従来の推定消費に切り替えています。');if(false&&e.watch&&e.watchMode!=='active'&&e.exercise.net>0)cautions.push(e.exercise.net>Math.min(Math.max(0,Number(e.exercise.net)||0),Math.max(0,e.watchMode==='active'?Number(draft.watchTotalKcal):Number(e.total)-(e.base?.bmr||0)))?'運動記録のオレンジはウォッチの活動消費を上限に縮小した参考表示です。運動記録自体は変更していません。':'運動記録のオレンジは参考表示です。ウォッチ計測値に重複加算していません。');if(e.legacy)cautions.push('旧活動カロリーは未確認・合計対象外です。');$('energyCaution').textContent=cautions.join(' ');$('intakeValue').textContent=e.food.count.kcal?round(e.food.total.kcal):'—';$('balanceValue').textContent=e.balance===null?'—':signed(e.balance);$('balanceValue').className=color(e.balance);
 const adjustedGoal=target;$('energyTargetMain').textContent=round(adjustedGoal);$('energyExerciseMain').textContent=e.base?round(e.exercise.net):'—';
 const donut=$('energyDonut'),status=$('balanceStatus');const legend=donut.parentElement?.querySelector('.energy-legend');if(legend)legend.classList.toggle('watch-no-exercise',!!e.watch);
 // In ordinary mode the ring reference is baseline daily expenditure EXCLUDING recorded exercise.
 // Watch mode retains its existing measured-total behavior. Food advances clockwise;
 // recorded additional exercise moves backward from food's endpoint.
 const gaugeReference=e.watch?e.total:e.base?.life;
 const valid=e.total!==null&&gaugeReference!==null&&Number.isFinite(gaugeReference)&&gaugeReference>0;
 const foodRecorded=e.food.count.kcal>0;
 const food=foodRecorded?Math.max(0,e.food.total.kcal):0;
 // Exercise overlay is only shown when no watch mode is active.
 // C.energy() alone decides whether to add it to total expenditure.
 const recordedExercise=Math.max(0,Number(e.exercise?.net)||0);
 // Watch already includes exercise. Its measured activity is the visual ceiling.
 const watchCeiling=e.watch?(e.watchMode==='active'?Number(draft.watchTotalKcal):Math.max(0,Number(e.total)-(e.base?.bmr||0))):Infinity;
 const exercise=e.watch?0:Math.min(recordedExercise,Math.max(0,watchCeiling));
 if(energyView==='target')drawTargetGauge(donut,adjustedGoal,food,e.watch?0:exercise,foodRecorded);
 else drawIntakeGauge(donut,valid?gaugeReference:null,food,e.watch?0:exercise,foodRecorded);
 $('energySwitchHint').textContent=energyView==='target'?'グラフをタップで消費収支に切り替え':'グラフをタップで食事目標に切り替え';
 $('energyLegendBalance').classList.toggle('hidden',energyView!=='balance');
 $('energyLegendTarget').classList.toggle('hidden',energyView!=='target');
 const net=food-(e.watch?0:exercise);
 const isPlus=e.balance!==null&&e.balance>0;
 if(energyView==='target'){
  const diff=foodRecorded?net-adjustedGoal:null;
  $('balanceValue').textContent=diff===null?'—':signed(diff);
  $('balanceValue').className=color(diff);
  $('energyCenterLabel').textContent='食事目標との差';
  status.textContent=diff===null?'食事未登録':diff>0?'目標超過':diff===0?'目標達成':'目標まで残り';
 }else{
  $('balanceValue').textContent=e.balance===null?'—':signed(e.balance);
  $('balanceValue').className=color(e.balance);
  $('energyCenterLabel').textContent='収支';
  status.textContent=!valid?'未算出':!foodRecorded?'食事未登録':net<0?'運動が摂取を超過':e.balance===0?'±0':isPlus?'摂取超過':'消費超過';
 }
 donut.setAttribute('aria-label',(energyView==='target'?'食事目標の達成状況。':'消費収支の状況。')+(valid?`食事目標 ${round(adjustedGoal)} kcal、摂取 ${foodRecorded?round(food)+' kcal':'未登録'}、運動記録 ${round(exercise)} kcal${e.watch?'（ウォッチ計測値に含まれるため差引表示なし）':''}、収支 ${e.balance===null?'未算出':signed(e.balance)+' kcal'}${e.watch?'（ウォッチ計測に運動を二重加算しません）':''}`:'総消費が未算出'));
 $('energyBmr').textContent=e.base?round(e.base.bmr):'—';
 $('energyExercise').textContent=e.base?round(e.exercise.net):'—';$('energyExerciseNote').textContent=e.watch?(e.watchMode==='active'?'参考値・ウォッチに含まれるため加算なし':'ウォッチ優先・運動分は加算なし'):'';$('energyExercise').title=e.watch?'ウォッチ計測値に重複加算しません。ウォッチのアクティブモードではゲージに運動分を二重表示しません。':'';
 $('energyActivity').textContent=e.base?round(Math.max(0,e.base.life-e.base.bmr)):'—';if(e.watch&&e.watchMode==='active'){$('energyActivity').title='参考値：ウォッチのアクティブ消費に含まれるため加算しません';}else{$('energyActivity').removeAttribute('title');}const adjusted=adjustedGoal;$('baseDailyTarget').textContent=round(target)+' kcal';$('dailyTarget').textContent=round(adjusted)+' kcal';$('dailyProgress').value=Math.min(100,e.food.total.kcal/adjusted*100);$('dailyRemaining').textContent=e.food.count.kcal?(e.food.total.kcal<=adjusted?'今日の目標まで残り '+round(adjusted-e.food.total.kcal):'今日の目標を '+round(e.food.total.kcal-adjusted)+' 超過')+' kcal':'食事を入力すると進捗を表示します。';renderMascot(e,adjusted);$('energyDetails').innerHTML=e.watch?'<p>'+(e.watchMode==='active'?'推定基礎代謝 '+round(e.base.bmr)+' kcal ＋ アクティブ消費 '+round(Number(draft.watchTotalKcal))+' kcal（概算・生活活動係数なし）':'スマートウォッチ総消費：'+round(e.total)+' kcal（入力値をそのまま採用）')+' / 運動の二重加算なし</p>':e.base?`<p>基礎代謝 ${round(e.base.bmr)} kcal / 日<br>生活活動係数 ×${e.base.activity}<br>参照体重 ${e.base.w.weight} kg（${e.base.w.date}）<br>年齢 ${e.base.age}歳<br>体重維持の推定値 ${e.total===null?'未算出':round(e.total)+' kcal / 日'}<br>減量参考値 ${round(e.base.life-Math.min(400,e.base.life*.15))} kcal / 日（生活消費から最大15%・400 kcalを差し引く概算）</p>`:'<p class="hint">成人プロフィールと過去または当日の体重記録が必要です。</p>';}
function mascotAssessment(e,adjusted,rest=false){
 // 未入力と「食べなかった」は別。間食は任意で、朝昼夕の記録を待つ。
 const required=['breakfast','lunch','dinner'];
 const missing=required.filter(key=>{const m=draft.meals?.[key]||{};return !m.skipped&&!['kcal','p','f','c'].some(f=>C.nonnegative(m[f]));});
 if(missing.length){
  const names={breakfast:'朝食',lunch:'昼食',dinner:'夕食'};
  return {face:'🤖',grade:'記録待ち',title:missing.length===3?'今日のごはんを記録してね！':'まだ食事の記録が途中だよ！',advice:'未記録：'+missing.map(k=>names[k]).join('・')+'。食べていない場合は「食べなかった」を選んでね。揃ったらカロリー収支を評価するよ。'};
 }
 if(e.balance===null)return {face:'🤖',grade:'記録待ち',title:'消費カロリーを確認しよう！',advice:'食事の記録は揃ったよ。体重・プロフィール・運動の入力を確認すると、収支を評価できるよ。'};
 const g=C.goalAt(store,current),goalDaily=g&&Number.isFinite(Number(g.daily))?Number(g.daily):0;
 const diff=e.balance-goalDaily;
 const protein=e.food.count.p>0?e.food.total.p/Math.max(1,Number(store.foodTargets?.p)||130):null;
 // 収支の目標との差を主軸にする。極端な赤字を高評価しない。
 let score=Math.abs(diff)<=250?88:Math.abs(diff)<=450?78:Math.abs(diff)<=700?65:Math.abs(diff)<=1000?48:30;
 if(protein!==null)score+=protein>=.8?7:protein>=.55?1:-5;
 if(e.balance< -900)score-=22;
 if(e.balance< -1300)score-=15;
 // 食事が入力済みでも摂取が極端に少ない日は、赤字の大きさにかかわらず高評価にしない。
 // BMRは推定値であり、ここでは診断ではなく記録確認を促す保守的な警告に用いる。
 const intake=e.food.total.kcal;
 const bmr=e.base?.bmr;
 const intakeTooLow=intake===0||(Number.isFinite(bmr)&&bmr>0&&intake<bmr*.6);
 if(intakeTooLow)score=Math.min(score,39);
 if(rest)score+=intakeTooLow?0:2;
 const grade=score>=90?'満点':score>=75?'良い':score>=60?'並':score>=40?'良くない':'悪い';
 const faces={'満点':'🤖✨','良い':'🤖💚','並':'🤖','良くない':'🤖💭','悪い':'🤖🌧️'};
 const amount=Math.round(Math.abs(e.balance));
 const title=e.balance<0?'今日は'+amount+' kcalの消費超過だね':e.balance>0?'今日は'+amount+' kcalの摂取超過だね':'今日は摂取と消費がほぼ同じだね';
 let advice=intakeTooLow?'摂取カロリーが極端に少ないようだよ。記録漏れがないか確認して、無理な食事制限は避けよう。':e.balance< -900?'赤字が大きめだよ。食事の記録漏れや体調を確認して、無理な制限は避けよう。':
 '目標の収支（'+(goalDaily<0?'−':goalDaily>0?'+':'±')+Math.round(Math.abs(goalDaily))+' kcal）との差は約'+Math.round(Math.abs(diff))+' kcal。1日だけでなく週間の傾向も見ていこう。';
 if(protein!==null&&protein<.8)advice+=' タンパク質も少し意識してね。';
 if(rest)advice+=' 休息日は回復と睡眠も大切に。';
 return {face:faces[grade],grade,title,advice};
}
function renderMascot(e,adjusted){
 const m=mascotAssessment(e,adjusted,!!draft.restDay);
 $('mascotFace').textContent=m.face;
 $('mascotArt').src='./genkun-'+({'満点':0,'良い':1,'並':2,'良くない':3,'悪い':4}[m.grade]??2)+'.png?v=3.5-coach2-fullbody';
 $('mascotGrade').textContent=m.grade;
 const bubble=$('mascotMessage');bubble.replaceChildren();
 const heading=document.createElement('strong');heading.className='mascot-coach-title';heading.textContent=m.title;
 const detail=document.createElement('span');detail.className='mascot-coach-advice';detail.textContent=m.advice;
 bubble.append(heading,detail);bubble.classList.remove('hidden');
}

// AI food detail v1: extra optional meal property; existing scalar fields remain authoritative.
const AI_FIELDS=['kcal','p','f','c'];
function aiNum(v){return v===''||v===null||v===undefined?'':Number(v)}
function aiSum(items){const out={};for(const f of AI_FIELDS){out[f]=items.every(it=>it[f]!==''&&it[f]!==null&&it[f]!==undefined)?String(Math.round(items.reduce((n,it)=>n+Number(it[f]),0)*10)/10):''}return out}
function aiApplyTotals(key){const meal=draft.meals[key],t=aiSum(meal.aiItems||[]);for(const f of AI_FIELDS)meal[f]=t[f];meal.skipped=false;meal.aiStale=false;renderFood();renderEnergy();renderWeek()}
function aiItemEditor(key,wrap){const meal=draft.meals[key]||{};if(!Array.isArray(meal.aiItems)||!meal.aiItems.length)return;const details=document.createElement('details');details.className='ai-item-details';const summary=document.createElement('summary');summary.textContent=`食品別内訳（${meal.aiItems.length}品）${meal.aiStale?' ⚠ 合計と未同期':''}`;details.append(summary);
 meal.aiItems.forEach((it,index)=>{const box=document.createElement('div');box.className='ai-item';const name=textInput('食品名',it.name,v=>{it.name=v});box.append(name);const amount=textInput('分量',it.amount,v=>{it.amount=v});box.append(amount);const grid=document.createElement('div');grid.className='food-grid';for(const [f,label] of [['kcal','kcal'],['p','P (g)'],['f','F (g)'],['c','C (g)']]){const input=numberInput(label,it[f],v=>{it[f]=v;meal.aiStale=true;summary.textContent=`食品別内訳（${meal.aiItems.length}品） ⚠ 合計と未同期`});grid.append(input)}box.append(grid);box.append(textInput('根拠・不明点',it.note||'',v=>{it.note=v},true));const del=button('この食品を削除',()=>{if(!confirm('この食品を内訳から削除しますか？'))return;meal.aiItems.splice(index,1);meal.aiStale=true;renderFood()},'outline');box.append(del);details.append(box)});
 const add=button('＋ 食品を追加',()=>{meal.aiItems.push({name:'新しい食品',amount:'',kcal:'',p:'',f:'',c:'',note:'要確認'});meal.aiStale=true;renderFood()},'outline');const apply=button('内訳から合計を再計算',()=>{if(!meal.aiItems.length){notice('食品がありません');return}aiApplyTotals(key)});details.append(add,apply);const note=document.createElement('p');note.className='hint';note.textContent='編集後は「内訳から合計を再計算」を押してください。未入力の栄養素は0にせず空欄になります。保存は別途必要です。';details.append(note);wrap.append(details)}
function aiCopyRequest(){
 const key=$('aiMealSelect').value,name=C.meals.find(x=>x[0]===key)?.[1]||'食事';
 const description=$('aiDescription').value.trim();
 const prompt=`あなたはChapi Fit用の食事栄養推定アシスタントです。以下の${name}（${current}）の食品別エネルギー（kcal）とP/F/C（各g）を推定し、ユーザーと確認してから取り込み用JSONを作ってください。

【ユーザーの食事説明】
${description||'文章での説明なし。添付写真がある場合は写真を参照してください。'}

【写真の扱い】
・この依頼文は写真を自動添付しません。ユーザーがこのAIアプリに添付した料理写真、商品パッケージ、栄養成分表示の写真を参照してください。写真がない場合は見たと主張しないでください。
・栄養成分表示は「100g当たり」「1個当たり」「1食当たり」などの基準単位を読み取り、実際に食べた量に換算してください。ラベルが読めない数値は捏造せず、読めない箇所を明示してください。
・ラベルの数値と食べた量は区別し、食べた量が不明なら確認してください。写真だけで重量を正確に測定できるとは主張しないでください。

【推定の原則】
1. ユーザーが伝えた実測量・摂取量・確定した栄養値と、判読できる商品ラベルを優先してください。食事写真による推定はその次です。数値の出典を区別してください。
2. 不明な量は一般値や写真から妥当な仮定を置いて暫定推定してください。kcal/P/F/Cの4値をできるだけ出し、根拠と不確かさを説明してください。推定不能な値だけnullとし、nullと0を混同しないでください。
3. 複合料理の栄養表示やユーザーの「料理全体で○kcal」がある場合は、その値に含まれる油・ソースを別計上しないでください。別計上が必要なものは衣や追加の調理油など実際に表示に含まれない部分に限り、二重計上を避けてください。
4. 食材の誤認を避けてください。見た目だけで味噌汁の具や肉の部位を断定せず、疑わしいものは「推定」と明記してください。推定が積み重なり過大評価にならないよう料理全体の妥当性も確認してください。
5. 食品ごとに「実測／商品ラベル／写真推定／一般値／仮定あり／不明」の根拠、量、加熱前後、皮の有無、衣・吸油などを簡潔に記録してください。

【会話の進め方：重要】
・最初の回答ではJSONを出さず、日本語の読みやすい一覧で食品ごとの推定量・kcal・P/F/Cと合計、根拠・仮定を示してください。
・カロリーに大きく影響する不確かな点を優先して、確認事項を少数だけ質問してください。質問だけで回答を止めず、まず暫定推定を提示してください。
・確認事項は必ず「【確認したいこと】」という見出しの下に、番号付き箇条書きで、質問の要点を太字にして目立たせてください。本文中に質問を埋もれさせないでください。汁物・煮物など具材が見分けにくい料理は、具材を確認する質問も候補にしてください。
・ユーザーの訂正を受けたら再計算して変更点を説明し、確認を求めてください。ユーザーが「OK」「確定」「JSONを出して」などと伝えたら最終JSONを発行してください。ユーザーが確認を省略してJSONを希望した場合も発行してください。
・説明も写真もなく食品を特定できない場合は食品を創作せず、情報提供を依頼してください。

【最終JSONの形式】
確認後の最終回答は、前置きなしで次の形式のJSONコードブロック1つだけにしてください。余分なキーや合計行は付けないでください。食品ごとに1要素、数値は非負のJSON数値（文字列ではない）とし、極端な小数精度を避けてください。
{ "format":"chapi-food-v1", "items":[{"name":"食品名","amount":"200g（推定）","kcal":200,"p":4,"f":1,"c":45,"note":"根拠：一般値・仮定あり。量は200gと仮定。"}] }
数値が不明な場合のみnullを使い、食品が特定できない場合はJSON発行前に食事情報を確認してください。`; 
 copy(prompt);
}
function aiParse(text){if(text.length>50000)throw Error('テキストが長すぎます（5万文字以内）');const blocks=[...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(m=>m[1].trim());let data=null;for(const t of [...blocks,text.trim()]){try{const parsed=JSON.parse(t);if(parsed?.format==='chapi-food-v1'){data=parsed;break}}catch(e){}}if(!data)throw Error('chapi-food-v1形式のJSONが見つかりません');if(!Array.isArray(data.items)||!data.items.length||data.items.length>40)throw Error('食品は1〜40件にしてください');return data.items.map(it=>{if(!it||typeof it!=='object'||typeof it.name!=='string'||!it.name.trim()||it.name.length>120)throw Error('食品名が不正です');const item={name:it.name.trim(),amount:String(it.amount??'').slice(0,100),note:String(it.note??'').slice(0,500)};for(const f of AI_FIELDS){const v=it[f];if(v===null||v===''||v===undefined){item[f]='';continue}if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>10000)throw Error(`${it.name}の${f}が不正です`);item[f]=String(v)}return item})}
let aiPending=null;
function aiPreview(){
 try{
  aiPending=aiParse($('aiResult').value);
  const sum=aiSum(aiPending),root=$('aiPreview');root.replaceChildren();
  const title=document.createElement('h3');title.textContent=`取り込み内容を確認（${aiPending.length}品）`;root.append(title);
  const total=document.createElement('section');total.className='ai-preview-total';
  const label=document.createElement('div');label.className='ai-preview-caption';label.textContent='合計カロリー';
  const energy=document.createElement('strong');energy.className='ai-preview-energy';energy.textContent=`${sum.kcal===''?'未算出':sum.kcal} kcal`;
  const macros=document.createElement('div');macros.className='ai-preview-macros';
  for(const [f,name] of [['p','P'],['f','F'],['c','C']]){const cell=document.createElement('span');cell.textContent=`${name} ${sum[f]===''?'未算出':sum[f]+'g'}`;macros.append(cell)}
  total.append(label,energy,macros);root.append(total);
  const list=document.createElement('div');list.className='ai-preview-list';
  for(const it of aiPending){
   const card=document.createElement('section');card.className='ai-preview-card';
   const heading=document.createElement('div');heading.className='ai-preview-heading';
   const food=document.createElement('div');const name=document.createElement('strong');name.textContent=it.name;const amount=document.createElement('small');amount.textContent=it.amount||'分量未入力';food.append(name,amount);
   const kcal=document.createElement('strong');kcal.className='ai-preview-kcal';kcal.textContent=`${it.kcal===''?'未入力':it.kcal} kcal`;
   heading.append(food,kcal);
   const macros=document.createElement('div');macros.className='ai-preview-macros';for(const [f,n] of [['p','P'],['f','F'],['c','C']]){const span=document.createElement('span');span.textContent=`${n} ${it[f]===''?'未入力':it[f]+'g'}`;macros.append(span)}
   const details=document.createElement('details');details.className='ai-preview-note';const summary=document.createElement('summary');summary.textContent='推定根拠・不明点を見る';const note=document.createElement('p');note.textContent=it.note||'根拠の記載なし';details.append(summary,note);
   card.append(heading,macros,details);list.append(card);
  }
  root.append(list);
  const warning=document.createElement('p');warning.className='warning';warning.textContent='⚠ AI推定値です。分量・調理油・食品ラベル等の根拠を確認してください。空欄の栄養素は0ではありません。';root.append(warning);
  $('aiAccept').disabled=false;$('aiAcceptTop').disabled=false;
 }catch(e){aiPending=null;$('aiAccept').disabled=true;$('aiAcceptTop').disabled=true;$('aiPreview').textContent='取り込み不可：'+e.message}
}
function aiAccept(){
 if(!aiPending){notice('先に取り込み内容を確認してください');return}
 const key=$('aiMealSelect').value,name=C.meals.find(x=>x[0]===key)?.[1]||key,meal=draft.meals[key]||{};
 if((meal.skipped||AI_FIELDS.some(f=>C.nonnegative(meal[f]))||meal.aiItems?.length)&&!confirm(`${current}の${name}の数値と内訳を置き換えます。備考は保持します。よろしいですか？`))return;
 const previous=C.clone(meal);
 draft.meals[key]={...meal,aiItems:C.clone(aiPending),aiSource:'AI推定・要確認'};
 const t=aiSum(draft.meals[key].aiItems);for(const f of AI_FIELDS)draft.meals[key][f]=t[f];draft.meals[key].skipped=false;draft.meals[key].aiStale=false;
 if(!saveOneMeal(key)){draft.meals[key]=previous;notice('保存に失敗したため取り込みを確定していません。JSONは保持しています。');return}
 aiDiscard();$('aiPreview').textContent=name+'に反映して保存しました ✓';renderFood();renderEnergy();renderWeek();
}

function renderFood(){const totals=C.foodTotals(draft);$('foodDate').textContent=current;$('foodInputs').innerHTML='';for(const [key,name] of C.meals){const wrap=document.createElement('div');wrap.className='meal meal-section';const head=document.createElement('div');head.className='meal-head';const heading=document.createElement('h3');heading.textContent=name;head.append(heading);const skip=document.createElement('label');skip.className='check meal-skip';const skipInput=document.createElement('input');skipInput.type='checkbox';skipInput.checked=!!draft.meals?.[key]?.skipped;skipInput.onchange=()=>{draft.meals[key]={...(draft.meals[key]||{}),skipped:skipInput.checked};renderFood();renderEnergy()};skip.append(skipInput,'食べなかった');head.append(skip);const mealSave=button('保存',()=>saveOneMeal(key),'meal-save');head.append(mealSave);wrap.append(head);const mealActions=document.createElement('div');mealActions.className='meal-quick-actions';mealActions.append(button('↩ 前日の食事をコピー',()=>copyPreviousMeal(key),'meal-copy'),button('削除',()=>deleteOneMeal(key),'meal-delete'));wrap.append(mealActions);const grid=document.createElement('div');grid.className='food-grid';if(skipInput.checked)grid.classList.add('meal-disabled');for(const [field,label] of [['kcal','kcal'],['p','P（g）'],['f','F（g）'],['c','C（g）']]){const inp=numberInput(label,draft.meals?.[key]?.[field],v=>{draft.meals[key]={...(draft.meals[key]||{}),[field]:v,aiStale:Array.isArray(draft.meals[key]?.aiItems)&&draft.meals[key].aiItems.length>0?true:draft.meals[key]?.aiStale};renderFoodSummary()});inp.querySelector('input').id=`food_${key}_${field}`;inp.querySelector('input').disabled=skipInput.checked;grid.append(inp)}wrap.append(grid);const noteField=textInput('備考（任意）',draft.meals?.[key]?.note||'',v=>{draft.meals[key]={...(draft.meals[key]||{}),note:v}},true);noteField.classList.add('meal-note');noteField.querySelector('textarea').id=`food_${key}_note`;noteField.querySelector('textarea').placeholder='料理名・量・食事の状況など';wrap.append(noteField);aiItemEditor(key,wrap);$('foodInputs').append(wrap)}$('foodComplete').checked=!!draft.foodComplete;renderFoodSummary()}
function renderFoodSummary(){const t=C.foodTotals(draft),targets=store.foodTargets||{},root=$('foodSummary');root.innerHTML='';for(const [f,label,unit] of [['kcal','摂取カロリー','kcal'],['p','タンパク質 P','g'],['f','脂質 F','g'],['c','炭水化物 C','g']]){const box=document.createElement('div');box.className='food-stat';const target=Number(targets[f]);box.innerHTML=`<span class="label">${label}</span><strong>${t.count[f]?round(t.total[f],1)+' <small>'+unit+'</small>':'未記録'}</strong><progress max="100" value="${target?Math.min(100,t.total[f]/target*100):0}"></progress><small>目標 ${Number.isFinite(target)?round(target,1)+' '+unit:'未設定'}${Number.isFinite(target)?'<br>残り '+round(target-t.total[f],1)+' '+unit:''}</small>`;root.append(box)}}
function dayReport(day,d){
 // An untouched, unsaved draft is not a recorded day. Keep saved records even if empty.
 const hasDraftRecord=!!(d&&(
  C.numeric(d.weight)||String(d.note||'').trim()||d.restDay===true||
  (d.sessions||[]).length>0||d.strengthWorkout&&Object.values(d.strengthWorkout).some(v=>v!==''&&v!==null&&v!==undefined)||
  d.watchEnabled===true||C.nonnegative(d.watchTotalKcal)||d.foodComplete===true||
  Object.values(d.meals||{}).some(m=>m&&(m.skipped===true||String(m.note||'').trim()||['kcal','p','f','c'].some(f=>C.nonnegative(m[f]))))
 ));
 const reportDays={...store.days};
 if(hasDraftRecord||Object.prototype.hasOwnProperty.call(store.days,day))reportDays[day]=d;
 const reportStore={...store,days:reportDays};
 const e=C.energy(reportStore,day,d),g=C.goalAt(reportStore,day),w=C.week(reportStore,day,today()),targets=store.foodTargets||{};
 const required=C.meals.filter(([key])=>key!=='snack');
 const missing=required.filter(([key])=>{const m=d.meals?.[key]||{};return !m.skipped&&!C.nonnegative(m.kcal)}).map(([,name])=>name);
 const elapsedWeekDays=w.dates.filter(date=>date<=today());
 const weekMissing=elapsedWeekDays.filter(date=>!reportStore.days[date]);
 const weekIncomplete=elapsedWeekDays.filter(date=>reportStore.days[date]&&w.values.find(v=>v.date===date)?.balance===null);
 const weekPartial=elapsedWeekDays.filter(date=>reportStore.days[date]&&w.values.find(v=>v.date===date)?.balance!==null&&w.values.find(v=>v.date===date)?.provisional);
 const weekProvisional=weekMissing.length>0||weekIncomplete.length>0||weekPartial.length>0;
 // AI report compares only days with calculable balances; never compare 5 days against a 7-day target.
 const reportWeekTarget=w.fullTarget===null?null:w.fullTarget*w.count/7;
 const reportWeekDiff=reportWeekTarget===null||w.count===0?null:w.sum-reportWeekTarget;
 const weekAllDaysCalculated=w.count===7;
 const weekStatus=`週間記録状況：経過${elapsedWeekDays.length}日中、収支算出${w.count}日（確定${w.complete}日・暫定${weekPartial.length}日）、未記録${weekMissing.length}日、収支未算出${weekIncomplete.length}日。未来日は判定対象外。`;
 const weekMissingDetail=`未記録日：${weekMissing.length?weekMissing.join('、'):'なし'}（収支0 kcalとはみなさず集計対象外）`;
 const weekIncompleteDetail=`記録あり・収支未算出日：${weekIncomplete.length?weekIncomplete.join('、'):'なし'}（集計対象外）`;
 const weekPartialDetail=`暫定収支の日：${weekPartial.length?weekPartial.join('、'):'なし'}（算出済み合計に含むが不完全な記録）`;
 const lines=[
  `【Chapi Fit AI相談用レポート ${day}】`,
  'このテキストはChapi Fitの記録です。食事・運動・体重・目標を踏まえて、健康と継続性を重視して助言してください。未入力を0として扱わず、推定消費や暫定収支には誤差があることを考慮してください。',
  `体重：${C.numeric(d.weight)?d.weight+' kg':'未入力'}${e.base?.w&&(!C.numeric(d.weight)||Number(d.weight)<=0)?'（消費計算の参照体重 '+e.base.w.weight+' kg／'+e.base.w.date+'）':''}`,
  `目標体重：${g?g.target+' kg（開始 '+g.start+'、期限 '+g.end+'）':'未設定'}`,
  `体重目標に基づく参考収支：${g?signed(Math.round(g.daily))+' kcal/日':'未設定'}`,
  `食事の設定目標：${C.numeric(targets.kcal)?round(targets.kcal)+' kcal':'未設定'} / P ${C.numeric(targets.p)?round(targets.p,1)+' g':'未設定'} / F ${C.numeric(targets.f)?round(targets.f,1)+' g':'未設定'} / C ${C.numeric(targets.c)?round(targets.c,1)+' g':'未設定'}`,
  `食事記録：${missing.length?'入力途中（未記録：'+missing.join('・')+'）':'朝昼夕は記録済み'}`,
  `摂取カロリー：${e.food.count.kcal?round(e.food.total.kcal)+' kcal'+(missing.length?'（入力済み分のみ・暫定）':''):'未記録'}`,
  `推定総消費カロリー：${e.total===null?'未算出':round(e.total)+' kcal'}`,
  `消費計算の方式：${e.watch?(e.watchMode==='active'?'Watchアクティブ消費＋推定BMR（運動の二重加算なし）':'Watch総消費をそのまま使用（運動の二重加算なし）'):d.watchEnabled&&d.watchMode==='active'&&C.numeric(d.watchTotalKcal)&&Number(d.watchTotalKcal)>0&&!e.base?(e.total===null?'Watchアクティブ消費を入力済みだがBMR不足のため総消費未算出':'Watchアクティブ消費を入力済みだがBMR不足のため従来推定へ切替'):d.watchEnabled?(e.total===null?'Watch入力は計算に使用できず総消費未算出':'Watch入力は計算に使用できず従来推定へ切替'):'生活活動による推定＋登録済みの正味運動消費（未確認の運動は加算しない）'}`,
  `カロリー収支：${e.balance===null?'未算出':signed(e.balance)+' kcal'}${e.provisional||missing.length?'（暫定）':''}`,
  weekStatus,
  weekMissingDetail,
  weekIncompleteDetail,
  weekPartialDetail,
  `週間収支（${w.start}〜${w.end}）：${w.count?signed(w.sum)+' kcal（'+(weekAllDaysCalculated?'7日間全体'+(weekProvisional?'・暫定値を含む':'・確定'):'算出済み'+w.count+'日分のみ。7日間全体の収支ではない')+'）':'未算出'}${weekProvisional?'（記録不足・暫定）':''}`,
  `週間目標（収支算出${w.count}日分との比較用）：${reportWeekTarget===null?'未設定':signed(Math.round(reportWeekTarget))+' kcal（7日目標を算出日数で按分）'} / 実績−目標：${reportWeekDiff===null?'未算出':signed(Math.round(w.sum)-Math.round(reportWeekTarget))+' kcal（プラスは目標より収支が高い）'}${weekProvisional?'（暫定）':''}`,
  `週間運動目標：${g&&C.numeric(g.exerciseWeeklyKcal)?round(g.exerciseWeeklyKcal)+' kcal':'未設定'}`,
  '飲酒：未記録（飲酒なしとは判定しない）'
 ];
 if(d.watchEnabled)lines.push(`Watch入力：${C.numeric(d.watchTotalKcal)?d.watchTotalKcal+' kcal':'未入力'}（${d.watchMode==='active'?'アクティブ':'総消費'}）`);
 if(d.strengthWorkout){const v=d.strengthWorkout;lines.push('\n💪 筋トレ全体');if(C.numeric(v.minutes))lines.push('合計時間 '+v.minutes+' 分');if(C.numeric(v.kcal))lines.push('入力消費 '+v.kcal+' kcal（'+({net:'正味',gross:'総消費',unknown:'区分未確認'}[v.energyType||'unknown'])+'）')}
 for(const sess of d.sessions||[])for(const i of sess.items||[]){lines.push('\n'+(i.kind==='cardio'?'🏃 ':'💪 ')+displayExerciseName(i));if(i.roundEntries?.length){for(const st of i.roundEntries)lines.push(`${st.kg===''?'重量未入力':st.kg+' kg'} × ${st.rounds||'—'} 周${st.done?' ✓':''}`);lines.push('合計 '+i.roundEntries.reduce((n,st)=>n+(Number(st.rounds)||0),0)+' 周')}else if(i.rounds!==undefined)lines.push('周回数 '+(i.rounds||'未入力')+' 周');for(const [n,st] of (i.sets||[]).entries())lines.push(`${n+1}セット：${st.kg??'—'} kg × ${st.reps||'—'} 回 / RIR ${st.rir??'—'}${st.done?' ✓':''}`);if(i.kind==='cardio'&&C.numeric(i.minutes))lines.push('時間 '+i.minutes+' 分');if(C.numeric(i.km))lines.push('距離 '+i.km+' km');if(i.kind==='cardio'&&C.numeric(i.kcal))lines.push('入力消費 '+i.kcal+' kcal（'+({net:'正味',gross:'総消費',unknown:'区分未確認'}[i.energyType||'unknown'])+'）');if(i.note)lines.push('備考：'+i.note)}
 lines.push('\n🍽️ 食事',foodReport(d));if(C.numeric(d.calories))lines.push('旧活動カロリー（保持・合計対象外）：'+d.calories+' kcal');if(d.restDay)lines.push('🌙 休息日（本人の指定。運動記録もある場合は併記）');if(d.note)lines.push('メモ：'+d.note);return lines.join('\n')
}
function foodReport(d){const p=store.profile||{},tgt=store.foodTargets||{},g=C.goalAt(store,current),w=C.weightAt(store,current,d),age=C.age(p.birth,current);
 const show=v=>v===null||v===undefined||v===''?'未設定':v;
 const lines=[
 '【食事相談の前提】',
 `身長：${show(p.height)} cm／体重：${w?round(w.weight,1)+' kg':'未記録'}／年齢：${age===null?'未設定':age+'歳'}／性別：${p.sex==='male'?'男性':p.sex==='female'?'女性':'未設定'}`,
 `食事目標：${show(tgt.kcal)} kcal／P ${show(tgt.p)} g／F ${show(tgt.f)} g／C ${show(tgt.c)} g`,
 `目標体重：${g?g.target+' kg':'未設定'}／目標期限：${g?g.end:'未設定'}`,
 '未入力は0として扱わず、栄養値の不足・推定誤差に注意して食事を評価してください。',
 '【当日の食事】'
 ];for(const [key,name] of C.meals){const m=d.meals?.[key]||{};if(m.skipped){lines.push(`${name}：食べなかった（0 kcal / P 0 g / F 0 g / C 0 g）`)}else if(['kcal','p','f','c'].some(f=>C.nonnegative(m[f])))lines.push(`${name}：${C.nonnegative(m.kcal)?m.kcal:'未入力'} kcal / P ${C.nonnegative(m.p)?m.p:'未入力'} g / F ${C.nonnegative(m.f)?m.f:'未入力'} g / C ${C.nonnegative(m.c)?m.c:'未入力'} g`);else lines.push(`${name}：未記録`);if(m.note)lines.push(`${name}の備考：${m.note}`);if(Array.isArray(m.aiItems)&&m.aiItems.length){lines.push(`${name}の食品別内訳（AI推定・要確認${m.aiStale?'・合計未同期':''}）：`);for(const it of m.aiItems)lines.push(`・${it.name} ${it.amount||''}：${it.kcal===''?'未入力':it.kcal} kcal / P ${it.p===''?'未入力':it.p} g / F ${it.f===''?'未入力':it.f} g / C ${it.c===''?'未入力':it.c} g（${it.note||'根拠未記載'}）`)}}const t=C.foodTotals(d);lines.push(`入力済み合計：${t.count.kcal?round(t.total.kcal):'未算出'} kcal / P ${t.count.p?round(t.total.p,1):'未算出'} g / F ${t.count.f?round(t.total.f,1):'未算出'} g / C ${t.count.c?round(t.total.c,1):'未算出'} g`);const incomplete=C.meals.filter(([key])=>{const m=d.meals?.[key]||{};return !m.skipped&&C.nonnegative(m.kcal)&&['p','f','c'].some(f=>!C.nonnegative(m[f]))}).map(([,name])=>name);if(incomplete.length)lines.push(`PFC注意：${incomplete.join('・')}のPFCに未入力があります。上記PFCは入力済み分の小計であり、1日全体の合計ではありません。`);return lines.join('\n')}
async function copy(text){try{await navigator.clipboard.writeText(text);notice('コピーしました')}catch(e){const a=document.createElement('textarea');a.value=text;document.body.append(a);a.select();try{if(!document.execCommand('copy'))throw Error();notice('コピーしました')}catch(e){prompt('コピーする内容',text)}a.remove()}}
function renderWeek(){const w=C.week(store,current,today());$('weekHeading').textContent=(C.weekStart(current)===C.weekStart(today())?'今週':'選択した週')+'のカロリー収支目標';$('weekDates').textContent=w.start+' 〜 '+w.end+'（日〜土・保存済み記録）';$('weekTarget').textContent=w.target===null?'体重目標を設定してください':signed(Math.round(w.target))+' kcal（集計対象 '+(7-w.excludedPast)+'/7日）';$('weekSummary').innerHTML=`<p>記録済み累計 <b class="${color(w.sum)}">${w.count?signed(w.sum)+' kcal':'未算出'}</b>（${w.count}/7日）</p>${w.target!==null?'<p>実績−目標 '+signed(Math.round(w.sum)-Math.round(w.target))+' kcal（プラスは目標より収支が高い）'+(w.rate===null?' ／ 維持目標のため達成率は表示しません':' ／ 達成率 '+round(w.rate,1)+'%')+'</p>':''}`;renderWeekBars(w);$('weekDaily').textContent=(w.excludedPast?`過去の未記録 ${w.excludedPast}日分を週間目標から除外。今日と未来の日は未入力でも目標に含みます。 `:'')+(w.perDay===null?'':`残り${w.remaining}日（当日を含む）の参考収支：${signed(Math.round(w.perDay))} kcal / 日。今日の記録も入力途中なら暫定です。`);const g=C.goalAt(store,current),base=C.baseEnergy(store,current),plan=g&&base?C.exercisePlan(g,base.life):null;
const allowance=$('weekIntakeAllowance');
if(allowance){
 const eligible=w.perDay!==null&&w.remaining>0&&base&&Number.isFinite(base.life);
 if(!eligible){allowance.textContent='残りの日の摂取目安：算出に必要な記録・プロフィール・体重目標を確認してください。'}
 else{
  const plannedExercise=Number(g?.exerciseWeeklyKcal)||0;
  const exerciseCredit=plannedExercise>0?plannedExercise/7*.7:0;
  const estimate=Math.round(base.life+exerciseCredit+w.perDay);
  allowance.textContent=estimate<1500?'残りの日の摂取目安：計算上 '+round(estimate)+' kcal/日。ただし低すぎる可能性があるため、この値を食事目標として推奨しません。目標期間を見直してください。':'残りの日の摂取目安：約 '+round(estimate)+' kcal/日（生活消費＋計画運動の70%＋必要な収支の概算。今日の入力途中の値を含む場合は暫定）';
 }
}

$('weekExercisePlan').innerHTML=plan?`<b>今週の運動・食事プラン</b><p>週間運動消費目標：${round(plan.exerciseWeekly)} kcal / 週 <small>（1日平均 ${round(plan.exerciseDaily)} kcal）</small><br>食事で確保するカロリー収支の目安：${signed(plan.foodWeekly)} kcal / 週 <small>（1日平均 ${signed(plan.foodDaily)} kcal）</small><br>運動計画を70％反映した摂取カロリー参考値：${round(plan.intakeDaily)} kcal / 日</p><p class="hint">計画値は実際のカロリー収支には加算しません。食事目標へ反映する場合は設定から手動で適用してください。</p>`:'<p class="hint">運動計画を確認するには体重目標とプロフィールを設定してください。</p>';
const weekExercise=w.dates.filter(day=>day<=today()&&store.days[day]).reduce((sum,day)=>{const v=C.energy(store,day);return sum+v.exercise.net},0);const exerciseGoal=Number(g?.exerciseWeeklyKcal)||0;$('weeklyExerciseSummary').innerHTML=`<b>🏃 今週の運動：${round(weekExercise)} / ${round(exerciseGoal)} kcal</b><progress max="100" value="${exerciseGoal?Math.min(100,weekExercise/exerciseGoal*100):0}"></progress><small>${exerciseGoal?'目標達成率 '+round(weekExercise/exerciseGoal*100,1)+'%':'運動目標は設定から登録できます'} ／ 保存済みの記録のみ集計</small>`;$('weekWarning').textContent=(w.complete<7?'入力不足があるため実績・進捗は暫定です。未記録日は0としていません。 ':'')+(w.perDay!==null&&Math.abs(w.perDay)>750?'日割り値が大きいため、無理な帳尻合わせはせず期間を見直してください。':'収支の符号だけで健康上の良否は判断できません。')}
function renderWeekBars(w){
 const root=$('weekBars'),days=['日','月','火','水','木','金','土'];
 const max=Math.max(500,...w.values.filter(v=>v.balance!==null).map(v=>Math.abs(v.balance)));
 root.innerHTML=w.values.map((v,i)=>{
  const missing=v.balance===null,amount=missing?0:Math.abs(v.balance),pct=Math.min(100,amount/max*100);
  const bar=missing?'':v.balance<0?`<span class="week-bar negative" style="width:${pct}%"></span>`:v.balance>0?`<span class="week-bar positive" style="width:${pct}%"></span>`:'<span class="week-zero"></span>';
  return `<div class="week-row"><span class="week-day">${days[i]}</span><div class="week-axis"><div class="week-half left">${v.balance<0?bar:''}</div><div class="week-half right">${v.balance>=0&&!missing?bar:''}</div></div><span class="week-amount ${missing?'muted':color(v.balance)}">${missing?'未入力':signed(Math.round(v.balance))+' kcal'}</span></div>`
 }).join('');
}
function marks(d){const items=(d?.sessions||[]).flatMap(s=>s.items||[]);const strength=items.some(i=>i.kind!=='cardio'&&(i.done||Number(i.rounds)>0||(i.roundEntries||[]).some(s=>s.done||Number(s.rounds)>0)||(i.sets||[]).some(s=>s.done||C.numeric(s.reps)))),cardio=items.some(i=>i.kind==='cardio'&&(Number(i.minutes)>0||Number(i.km)>0||Number(i.steps)>0||Number(i.kcal)>0));return (strength?'💪':'')+(cardio?'🏃‍♀️':'')+(d?.restDay?'🌙':'')+(C.foodTotals(d||{}).hasMark?'🍽️':'')}
function renderCalendar(){const root=$('calendarGrid');root.innerHTML='';const dt=C.date(month),year=dt.getFullYear(),m=dt.getMonth();$('calendarMonth').textContent=`${year}年${m+1}月`;for(const day of ['日','月','火','水','木','金','土']){const e=document.createElement('div');e.className='weekday';e.textContent=day;root.append(e)}for(let n=0;n<dt.getDay();n++)root.append(document.createElement('div'));const len=new Date(year,m+1,0).getDate();for(let n=1;n<=len;n++){const day=C.iso(new Date(year,m,n)),d=store.days[day],e=d?C.energy(store,day):null,b=button('',()=>{selectedDetail=day;renderCalendarDetail(day);renderCalendarSelection()},'');b.dataset.day=day;b.setAttribute('aria-label',day+' '+(e?.balance!=null?'カロリー収支 '+signed(e.balance)+' kcal':'収支未算出'));b.innerHTML=`<span class="day-num">${n}</span><span class="marks">${marks(d)||'　'}</span><span class="day-energy ${color(e?.balance??null)}">${e?.balance!=null?signed(e.balance)+(e.provisional?'*':''):'—'}</span><span class="unit">${e?.balance!=null?'kcal':''}</span>`;if(day===today())b.classList.add('today');root.append(b)}renderCalendarSelection();renderCalendarDetail(selectedDetail);renderMonthlyBalance()}
function renderMonthlyBalance(){
 const root=$('monthlyBalanceSummary'),ym=month.slice(0,7),now=today();
 const days=Object.keys(store.days).filter(d=>d.startsWith(ym)&&d<=now).sort();
 let sum=0,valid=0,negative=0,positive=0,neutral=0,provisional=0;
 for(const day of days){const e=C.energy(store,day);if(e.balance===null)continue;sum+=e.balance;valid++;if(e.balance<0)negative++;else if(e.balance>0)positive++;else neutral++;if(e.provisional)provisional++}
 const elapsed=ym>now.slice(0,7)?0:ym===now.slice(0,7)?Number(now.slice(8)):new Date(Number(ym.slice(0,4)),Number(ym.slice(5)),0).getDate();
 root.innerHTML=`<div class="monthly-balance-number ${valid?color(sum):''}">${valid?signed(Math.round(sum)):'—'} <small>kcal</small></div><p>収支算出済み <b>${valid}/${elapsed}日</b>（経過日数基準）</p><p>マイナス ${negative}日 ／ プラス ${positive}日 ／ ±0 ${neutral}日</p><p class="hint">${provisional?provisional+'日は入力途中の暫定値を含みます。 ':''}未記録・未算出の日は合計に含めていません。</p>`;
}
function renderCalendarSelection(){document.querySelectorAll('[data-day]').forEach(b=>b.classList.toggle('selected',b.dataset.day===selectedDetail))}
function renderCalendarDetail(day){const box=$('calendarDetail'),d=store.days[day],e=d?C.energy(store,day):null;box.innerHTML='<h2>'+esc(day)+' の記録</h2>';if(!d)box.innerHTML+='<p class="hint">記録がありません。</p>';else box.innerHTML+=`<p>摂取カロリー：${e.food.count.kcal?round(e.food.total.kcal)+' kcal':'未記録'}<br>推定総消費カロリー：${e.total===null?'未算出':round(e.total)+' kcal'}<br>カロリー収支：<b class="${color(e.balance)}">${e.balance===null?'未算出':signed(e.balance)+' kcal'}</b>${e.provisional?'（暫定）':''}<br>体重：${C.numeric(d.weight)?esc(d.weight)+' kg':'未入力'}</p><p class="hint">${esc((d.sessions||[]).flatMap(s=>s.items.map(i=>(i.kind==='cardio'?'🏃 ':'💪 ')+displayExerciseName(i))).join(' / ')||'運動登録なし')}</p>`;box.append(button('この日を編集',()=>{if(changeDate(day))switchTab('record')}))}
function renderHistory(){const root=$('historyList');root.innerHTML='';const dates=Object.keys(store.days).sort().reverse();if(!dates.length){root.innerHTML='<p class="hint">まだ記録がありません。</p>';return}let monthGroup=null,lastMonth='';for(const day of dates){const ym=day.slice(0,7);if(ym!==lastMonth){lastMonth=ym;monthGroup=document.createElement('details');monthGroup.className='history-month';monthGroup.open=ym===dates[0].slice(0,7);const heading=document.createElement('summary');heading.textContent=ym.slice(0,4)+'年'+Number(ym.slice(5))+'月（'+dates.filter(d=>d.startsWith(ym)).length+'日分）';monthGroup.append(heading);root.append(monthGroup)}const d=store.days[day],e=C.energy(store,day),box=document.createElement('details');box.className='history-entry';const summary=document.createElement('summary');summary.innerHTML=`<span><b>${esc(day)}</b> ${marks(d)}${d.restDay?' 🌙':''}</span><span class="history-meta">体重 ${C.numeric(d.weight)?esc(d.weight)+' kg':'未入力'} <b class="${color(e.balance)}">${e.balance===null?'収支未算出':signed(e.balance)+' kcal'}</b></span>`;box.append(summary);const detail=document.createElement('div');detail.className='history-detail';const foods=e.food;detail.innerHTML=`<h3>🍽️ 食事</h3><p>摂取カロリー：<b>${foods.count.kcal?round(foods.total.kcal)+' kcal':'未記録'}</b></p><div class="history-macros">${[['p','P たんぱく質'],['f','F 脂質'],['c','C 炭水化物']].map(([k,label])=>`<div><small>${label}</small><b>${foods.count[k]?round(foods.total[k],1)+' g':'未記録'}</b></div>`).join('')}</div><h3>💪 運動</h3><p>${d.restDay?'🌙 休息日<br>':''}${esc((d.sessions||[]).flatMap(s=>(s.items||[]).map(i=>displayExerciseName(i))).join('、')||'運動登録なし')}</p><p>記録された正味消費：${round(e.exercise.net)} kcal${e.exercise.unresolved?'（未確認の運動あり）':''}</p><p class="hint">${e.provisional?'入力途中のため暫定値です。':''}</p>`;const actions=document.createElement('div');actions.className='actions';actions.append(button('この日を編集',()=>{if(changeDate(day))switchTab('record')}),button('報告コピー',()=>copy(dayReport(day,d))),button('削除',()=>{if(!confirm(day+' の記録を削除しますか？ 削除前コピーを端末内に保存します。'))return;try{localStorage.setItem('chapi-training-before-delete',JSON.stringify(store))}catch(e){notice('削除前コピーを保存できないため中止しました');return}const next=C.clone(store);delete next.days[day];if(persist(next)){if(current===day)chooseDate(day);renderHistory();notice('削除しました。直前コピーはバックアップ書き出しから復旧できます。')}},'danger'));detail.append(actions);box.append(detail);monthGroup.append(box)}}

function templateCategory(t){const cardio=t.items.filter(i=>i.kind==='cardio').length;return cardio===t.items.length&&cardio>0?'cardio':'strength'}
function renderTemplates(){const root=$('templateList');root.innerHTML='';for(const [kind,title] of [['strength','筋力トレーニング'],['cardio','有酸素運動']]){const section=document.createElement('details');section.className='template-group';const matching=store.templates.filter(t=>templateCategory(t)===kind);const summary=document.createElement('summary');summary.textContent=title+'（'+matching.length+'件）';section.append(summary);for(const t of matching){const box=document.createElement('div');box.className='template-card';const active=activeTemplateItems(t);const hiddenCount=t.items.length-active.length;box.innerHTML='<h3>'+esc(t.name)+'</h3><p class="hint">'+active.length+'種目'+(hiddenCount?' · アーカイブ中 '+hiddenCount+'種目':'')+' · '+esc(active.slice(0,2).map(i=>i.name).join(' / '))+(active.length>2?' ほか'+(active.length-2)+'種目':'')+'</p>';for(const i of t.items){if(i.annotation&&!archivedIds().has(i.id)){const hint=document.createElement('p');hint.className='annotation';hint.textContent=i.name+'：'+i.annotation;box.append(hint)}}const actions=document.createElement('div');actions.className='actions';actions.append(button('編集',()=>startEditor(t)),button('複製',()=>{const next=C.clone(store),x=C.clone(t);x.id=uid();x.name+='（コピー）';next.templates.push(x);if(persist(next)){renderTemplates();refreshPickers()}}),button('削除',()=>{if(!confirm('「'+t.name+'」を削除しますか？ 過去の記録は残ります。'))return;const next=C.clone(store);next.templates=next.templates.filter(x=>x.id!==t.id);if(persist(next)){renderTemplates();refreshPickers()}},'danger'));box.append(actions);section.append(box)}root.append(section)}}
function startEditor(t){editing=t?C.clone(t):{id:uid(),name:'',items:[]};$('templateName').value=editing.name;$('templateEditor').classList.remove('hidden');renderEditor();$('templateEditor').scrollIntoView({behavior:'smooth',block:'start'})}
function renderEditor(){const root=$('templateItems');root.innerHTML='';editing.items.forEach((it,i)=>{const box=document.createElement('div');box.className='template-item';const row=document.createElement('div');row.className='row';const title=document.createElement('h3');title.textContent=`${i+1}．${it.kind==='cardio'?'有酸素運動':'筋力トレーニング'}`;row.append(title);const controls=document.createElement('div');controls.className='actions';const up=button('↑',()=>{[editing.items[i-1],editing.items[i]]=[editing.items[i],editing.items[i-1]];renderEditor()});up.disabled=i===0;up.setAttribute('aria-label','種目を上へ');const down=button('↓',()=>{[editing.items[i+1],editing.items[i]]=[editing.items[i],editing.items[i+1]];renderEditor()});down.disabled=i===editing.items.length-1;down.setAttribute('aria-label','種目を下へ');controls.append(up,down,button('削除',()=>{editing.items.splice(i,1);renderEditor()},'danger'));controls.append(button('種目を選択',()=>pickLibraryExercise(i)));row.append(controls);if(archivedIds().has(it.id)){const archivedNote=document.createElement('p');archivedNote.className='hint';archivedNote.textContent='アーカイブ中：通常の記録には表示されません。ライブラリから復元すると再表示されます。';box.append(archivedNote)}box.append(row,textInput('種目名（表記修正のみ）',it.name,v=>it.name=v),textInput('補足説明（任意・記録画面にも表示）',it.annotation,v=>it.annotation=v,true));if(it.kind!=='cardio'){box.append(selectInput('種目タイプ',it.strengthType||'normal',[['normal','通常の筋トレ'],['bodyweight','自重トレーニング']],v=>{it.strengthType=v;renderEditor()}));box.append(selectInput('記録方式',it.tracking||'sets',[['sets','セット・重量・回数'],['rounds','周回数（サーキット）']],v=>{it.tracking=v;renderEditor()}));if(it.tracking==='rounds')box.append(numberInput('目安の周回数（周）',it.rounds||2,v=>it.rounds=v,{min:'1',step:'1'}));else{box.append(numberInput('初期セット数',it.sets,v=>it.sets=v,{step:'1',min:'1',max:'30'}))}}else{const l=document.createElement('label');l.className='check';const ck=document.createElement('input');ck.type='checkbox';ck.checked=!!it.noDistance;ck.onchange=()=>it.noDistance=ck.checked;l.append(ck,'距離・歩数欄を表示しない（ステッパー等）');box.append(l)}root.append(box)})}
function saveTemplate(){editing.name=$('templateName').value.trim();if(!editing.name||editing.items.some(i=>!i.name.trim())){notice('メニュー名・種目名を入力してください');return}if(!editing.items.length){notice('プリセットには種目を1つ以上登録してください');return}if(new Set(editing.items.map(i=>i.id)).size!==editing.items.length){notice('同じ種目が重複しています。1つのプリセット内では種目を1回ずつ登録してください');return}for(const i of editing.items){if(i.kind!=='cardio'&&i.tracking!=='rounds'){if(!Number.isInteger(Number(i.sets))||i.sets<1||i.sets>30){notice('初期セット数（1〜30）を確認してください');return}i.sets=Number(i.sets)}if(i.tracking==='rounds'&&(!Number.isInteger(Number(i.rounds))||i.rounds<1||i.rounds>100)){notice('周回数の目安は1〜100周にしてください');return}}const lib=libraryView();const ambiguous=new Set(lib.audit.collisions.map(x=>x.id));
 for(const i of editing.items){const original=lib.items.find(x=>x.id===i.id);if(original&&original.kind!==i.kind){notice('種目の種類が異なります。別の種目を選んでください');return}if(original&&original.name!==i.name&&!ambiguous.has(i.id)){notice('種目名の修正は種目ライブラリから行ってください。別の運動は「種目を選択」で切り替えてください');return}if(original&&original.name!==i.name&&ambiguous.has(i.id)){notice('IDが衝突している種目は名称変更できません。新しい種目として登録してください');return}}
 const next=C.clone(store),idx=next.templates.findIndex(x=>x.id===editing.id);if(idx>=0)next.templates[idx]=C.clone(editing);else next.templates.push(C.clone(editing));if(persist(next)){editing=null;$('templateEditor').classList.add('hidden');renderTemplates();refreshPickers();notice('メニューを保存しました')}}
const activityOptions=[['1.2','座り仕事中心／休日は休息','机での仕事が中心。運動を除き3,000歩未満、立つ・歩く時間は1日30分未満が多い。'],['1.375','立ち仕事や移動が多い','接客や軽い工場内移動。運動を除き3,000〜6,000歩、立つ・歩く時間は1日30〜90分程度。'],['1.55','日常的に身体を動かす','配送・巡回・家事などでよく動く。運動を除き6,000〜10,000歩、1日1.5〜3時間程度の移動や作業。'],['1.725','肉体労働中心','運搬・建設など負荷のある作業が多い。運動を除き10,000歩以上や1日3時間以上の身体作業が目安。']];
function renderSettings(){const p=store.profile||{};$('profileHeight').value=p.height??'';$('profileBirth').value=p.birth??'';$('profileSex').value=p.sex??'';$('specialCondition').checked=!!p.special;$('activityChoices').innerHTML='';for(const [value,title,hint] of activityOptions){const label=document.createElement('label');label.className='activity-option';label.innerHTML=`<input type="radio" name="activity" value="${value}" ${Number(p.lifeActivity)===Number(value)?'checked':''}><b>${title}（×${value}）</b><span>${hint}</span>`;$('activityChoices').append(label)}$('activityMigration').classList.toggle('hidden',p.lifeActivity!==null);targetsDraft={kcal:2000,p:130,f:60,c:235,...C.clone(store.foodTargets||{})};targetsDraft.locks={p:false,f:false,c:false,...(targetsDraft.locks||{})};targetsDraft.mode=targetsDraft.mode||'g';$('purpose').value=targetsDraft.purpose||'custom';$('macroMode').value=targetsDraft.mode;$('targetKcal').value=targetsDraft.kcal;renderMacros();const g=C.goalAt(store,today()),latest=C.weightAt(store,today());$('goalCurrent').value=latest?.weight??g?.current??'';$('goalTarget').value=g?.target??'';$('goalMonths').value=g?.months??12;$('goalMonthsRange').value=$('goalMonths').value;$('goalExerciseWeekly').value=g?.exerciseWeeklyKcal??0;$('goalExerciseRange').value=Math.min(5000,Number($('goalExerciseWeekly').value)||0);renderGoalPreview();$('suggestionBox').classList.add('hidden')}
function saveProfile(){const height=$('profileHeight').value,birth=$('profileBirth').value,sex=$('profileSex').value,activity=document.querySelector('input[name=activity]:checked')?.value;if(!C.numeric(height)||height<80||height>250||C.age(birth,today())===null||!['male','female'].includes(sex)||!activity){notice('身長・生年月日・性別・生活活動を確認してください');return}const next=C.clone(store);next.profile={...(next.profile||{}),height,birth,sex,lifeActivity:Number(activity),special:$('specialCondition').checked};if(persist(next)){cleanSection('profile');$('activityMigration').classList.add('hidden');renderGoalPreview();notice('プロフィールを保存しました')}}
function macroMessage(s){$('macroMessage').textContent=s;$('macroMessage').classList.toggle('hidden',!s)}
function renderMacros(){const root=$('macroControls');root.innerHTML='';$('targetKcal').value=roundPlain(targetsDraft.kcal);for(const [f,name] of [['p','タンパク質 P'],['f','脂質 F'],['c','炭水化物 C']]){const value=targetsDraft.mode==='percent'?Number(targetsDraft[f])*C.factors[f]/targetsDraft.kcal*100:Number(targetsDraft[f]),max=targetsDraft.mode==='percent'?100:targetsDraft.kcal/C.factors[f],box=document.createElement('div');box.className='macro';box.innerHTML=`<div class="row"><b>${name}</b><button id="lock_${f}" class="outline" aria-pressed="${!!targetsDraft.locks[f]}" aria-label="${name}を${targetsDraft.locks[f]?'解除':'ロック'}">${targetsDraft.locks[f]?'🔒 固定':'🔓 調整可'}</button></div>`;const label=document.createElement('label');label.className='row';label.innerHTML=`<input id="macro_${f}" class="macro-number" type="number" min="0" max="${max}" step="0.1" inputmode="decimal" value="${roundPlain(value)}" ${targetsDraft.locks[f]?'disabled':''} aria-label="${name} ${targetsDraft.mode==='percent'?'%':'g'}"><span>${targetsDraft.mode==='percent'?'%':'g'} <small>（${round(targetsDraft[f],1)} g / ${round(Number(targetsDraft[f])*C.factors[f]/targetsDraft.kcal*100,1)}%）</small></span>`;box.append(label);const slider=document.createElement('input');slider.type='range';slider.id='range_'+f;slider.min='0';slider.max=max;slider.step='0.1';slider.value=value;slider.disabled=!!targetsDraft.locks[f];slider.setAttribute('aria-label',name+' スライダー');slider.oninput=()=>commitMacro(f,slider.value,true);box.append(slider);root.append(box);$('lock_'+f).onclick=()=>{targetsDraft.locks[f]=!targetsDraft.locks[f];markDirty('targets');renderMacros();macroMessage('')};$('macro_'+f).onchange=e=>commitMacro(f,e.target.value)}const total=C.keys.reduce((a,k)=>a+Number(targetsDraft[k])*C.factors[k],0);$('macroSummary').textContent=`配分合計 ${round(total,2)} kcal ／ 目標 ${round(targetsDraft.kcal,2)} kcal。鍵はg値を固定します。`+(Math.abs(total-targetsDraft.kcal)>.01?' 既存目標は不一致のまま保持しています。いずれかの値を変更して配分を調整してください。':'')}
function roundPlain(n){return Math.round(Number(n)*100)/100}
function commitMacro(f,text,slider=false){if(text===''||!Number.isFinite(Number(text))){macroMessage('入力を確定するときは0以上の数値を入れてください。');return false}const value=f==='kcal'?Number(text):targetsDraft.mode==='percent'?Number(text)*targetsDraft.kcal/100/C.factors[f]:Number(text),result=C.allocate(targetsDraft,f,value);if(result.error){macroMessage(result.error);if(slider)refreshMacroNumbers();return false}targetsDraft=result.value;targetsDraft.purpose='custom';$('purpose').value='custom';markDirty('targets');macroMessage('');if(slider)refreshMacroNumbers();else renderMacros();return true}
function commitTargetInputs(){// change events normally fire on blur; explicitly validate visible fields before saving.
if($('targetKcal').value===''||!C.nonnegative($('targetKcal').value)||Number($('targetKcal').value)<=0){macroMessage('摂取カロリー目標を入力してください。');return false}if(Math.abs(Number($('targetKcal').value)-targetsDraft.kcal)>.005&&!commitMacro('kcal',$('targetKcal').value))return false;for(const k of C.keys){const inp=$('macro_'+k);if(inp.value===''||!C.nonnegative(inp.value)){macroMessage('PFCの空欄を確定してください。');return false}const shown=targetsDraft.mode==='percent'?targetsDraft[k]*C.factors[k]/targetsDraft.kcal*100:targetsDraft[k];if(Math.abs(Number(inp.value)-shown)>.011&&!commitMacro(k,inp.value))return false}return true}
function saveTargets(){if(!commitTargetInputs())return;const sum=C.keys.reduce((a,k)=>a+targetsDraft[k]*C.factors[k],0);if(Math.abs(sum-targetsDraft.kcal)>.01){macroMessage('目標カロリーとPFC配分を一致させてから保存してください。既存値は保持されています。');return}if(targetsDraft.kcal<1000||targetsDraft.kcal>10000){macroMessage('このアプリでは目標を1,000〜10,000 kcalの範囲で保存してください。極端な目標は個別に相談してください。');return}if(targetsDraft.kcal<1500&&!confirm('1,500 kcal未満の設定です。自動提案の範囲外です。個別に確認した値として保存しますか？'))return;const next=C.clone(store);next.foodTargets={...(next.foodTargets||{}),...C.clone(targetsDraft)};next.foodTargetHistory=[...(next.foodTargetHistory||[]),{date:today(),createdAt:new Date().toISOString(),targets:C.clone(targetsDraft)}];if(persist(next)){cleanSection('targets');notice('食事目標と鍵・表示単位を保存しました')}}
function showSuggestion(){const type=$('purpose').value,result=C.suggestion(store,today(),type,goalDraft),box=$('suggestionBox');box.classList.remove('hidden');if(result.error){box.textContent=result.error;return}const v=result.value;box.innerHTML=`<b>初期提案：${round(v.kcal)} kcal / 日</b><p>P ${round(v.p,1)} g ／ F ${round(v.f,1)} g ／ C ${round(v.c,1)} g</p><p class="hint">${esc(result.note)}</p>`;box.append(button('この提案を編集欄に適用',()=>{if(C.keys.some(k=>targetsDraft.locks[k])){macroMessage('ロック中の値を守るため提案の一括適用は止めました。必要な鍵を自分で解除してください。');return}targetsDraft={...targetsDraft,...v};markDirty('targets');renderMacros();macroMessage('提案を適用しました。自由に調整してから保存してください。')}))}
function goalWarning(g){if(!g)return '開始体重・目標体重・期間を入力してください。';
const weekly=Number($('goalExerciseWeekly').value);if(!Number.isFinite(weekly)||weekly<0||weekly>10000)return '週間運動目標は0〜10,000 kcalで入力してください。';
const lossPerWeek=(g.current-g.target)/C.daysBetween(g.end,g.start)*7,base=C.baseEnergy(store,today()),height=Number(store.profile?.height),bmi=height?g.target/(height/100)**2:null;
if(bmi&&bmi<18.5&&g.target<g.current)return '目標体重がBMI 18.5未満です。減量の自動提案は行いません。目標を見直してください。';
if(Math.abs(g.daily)>750||lossPerWeek>g.current*.01){const minMonths=Math.max(Math.ceil(Math.abs(g.target-g.current)*7700/(500*30.44)),1);return `期間が短く変化が大きい目標です。少なくとも約${minMonths}か月など、期間延長を検討してください。食事目標への自動反映は停止します。`}
const plan=base?C.exercisePlan(g,base.life,weekly):null;
if(plan&&plan.intakeDaily<1500)return '運動計画を考慮した参考摂取量が1,500 kcal未満になるため、食事目標へ反映しません。期間・運動目標を見直してください。';
if(weekly>5000)return '運動目標が高めです。継続できる範囲か確認してください。自動反映は停止します。';
return ''}
function renderGoalPreview(){
const weekly=Number($('goalExerciseWeekly').value);goalDraft=C.goal(today(),$('goalCurrent').value,$('goalTarget').value,Number($('goalMonths').value));
const g=goalDraft,warning=goalWarning(g),base=C.baseEnergy(store,today()),plan=g&&base?C.exercisePlan(g,base.life,weekly):null;
$('goalPreview').innerHTML=g?`<p>達成予定日 <b>${g.end}</b><br>月間の体重変化 ${signedDecimal(g.monthly)} kg / 月<br>週間カロリー収支の参考目標 <b>${signed(g.weekly)} kcal / 週</b></p>`+
`<p>週間運動消費目標 <b>${round(weekly)} kcal / 週</b> <small>（1日平均 ${round(weekly/7)} kcal）</small></p>`+
(plan?`<p>運動計画の食事反映（70％）：${round(plan.creditedWeekly)} kcal / 週<br>食事で確保する週間収支の目安：${signed(plan.foodWeekly)} kcal / 週 <small>（1日平均 ${signed(plan.foodDaily)} kcal）</small><br><b>提案する摂取カロリー目標：${round(plan.intakeDaily)} kcal / 日</b></p>`:'<p class="hint">摂取カロリーの提案にはプロフィール・体重の設定が必要です。</p>')+
(warning?'<p class="warning">'+esc(warning)+'</p>':''):'<p class="hint">'+esc(warning)+'</p>';
$('useGoalCalories').disabled=!plan||!!warning;
}
function signedDecimal(n){return (n>0?'+':n===0?'±':'')+round(n,2)}
function saveGoal(){renderGoalPreview();if(!goalDraft){notice('体重と期間を確認してください');return}const warning=goalWarning(goalDraft);if(warning&&!confirm(warning+'\nこの参考目標を保存しますか？ 食事目標は変更しません。'))return;const next=C.clone(store);next.goalHistory.push({...C.clone(goalDraft),exerciseWeeklyKcal:Number($('goalExerciseWeekly').value),exerciseCreditRate:.7,createdAt:new Date().toISOString()});if(persist(next)){cleanSection('goal');notice('体重目標を保存しました。食事目標は別途適用してください')}}
function applyGoalCalories(){renderGoalPreview();const base=C.baseEnergy(store,today());if(!goalDraft||goalWarning(goalDraft)||!base){notice('プロフィール・体重目標を確認してください');return}const plan=C.exercisePlan(goalDraft,base.life,Number($('goalExerciseWeekly').value));if(!plan){notice('運動目標を確認してください');return}const v=plan.intakeDaily;if(!confirm('参考値 '+round(v)+' kcalを食事目標の編集欄に適用しますか？ ロック中のPFCは維持します。'))return;commitMacro('kcal',v)}
function renderGraphs(){const isWeight=graphMode==='weight';$('weightGraphTab').classList.toggle('active',isWeight);$('balanceGraphTab').classList.toggle('active',!isWeight);$('weightGraphControls').classList.toggle('hidden',!isWeight);$('balanceGraphControls').classList.toggle('hidden',isWeight);$('graphDetail').textContent='点や棒をタップすると詳細が表示されます。';if(isWeight)renderWeightGraph();else renderBalanceGraph();renderMonthlyGoals();renderCumulativeGraph()}
const SVGNS='http://www.w3.org/2000/svg';function svgEl(tag,attrs={},text){const e=document.createElementNS(SVGNS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e}
function chartBase(label){const svg=svgEl('svg',{viewBox:'0 0 640 300',role:'img','aria-label':label});$('graph').replaceChildren(svg);return svg}
function tapMark(e,text){e.classList.add('hit');e.setAttribute('tabindex','0');e.setAttribute('role','button');e.setAttribute('aria-label',text);const title=svgEl('title',{},text);e.append(title);e.onclick=()=>$('graphDetail').textContent=text;e.onkeydown=evt=>{if(evt.key==='Enter'||evt.key===' '){evt.preventDefault();$('graphDetail').textContent=text}}}
function renderWeightGraph(){const all=Object.entries(store.days).filter(([d,v])=>C.numeric(v.weight)&&Number(v.weight)>0&&d<=today()).map(([d,v])=>({date:d,weight:Number(v.weight)})).sort((a,b)=>a.date.localeCompare(b.date)),period=$('graphPeriod').value,end=today(),start=period==='all'?(all[0]?.date||C.plusMonths(end,-1)):(period==='week'?C.plusDays(end,-6):C.plusMonths(end,-Number(period))),points=all.filter(x=>x.date>=start),svg=chartBase('体重推移。実測、7日移動平均、目標体重。');const goalPoints=[];for(let d=start;d<=end;d=C.plusDays(d,1)){const g=C.goalAt(store,d),v=C.targetWeight(g,d);if(v!==null)goalPoints.push({date:d,weight:v,goal:g.start+(g.createdAt||'')})}const values=[...points,...goalPoints].map(x=>x.weight);if(!points.length){$('cumulativeMilestone').classList.add('hidden');svg.append(svgEl('text',{x:320,y:140,'text-anchor':'middle'},'この期間の体重記録はありません'));$('graphNote').textContent='体重を保存すると実測の点を表示します。';return}let min=Math.min(...values),max=Math.max(...values),pad=Math.max(.5,(max-min)*.15);min-=pad;max+=pad;const x=d=>52+C.daysBetween(d,start)/Math.max(1,C.daysBetween(end,start))*570,y=v=>245-(v-min)/(max-min)*205;for(let i=0;i<5;i++){const v=min+(max-min)*i/4;svg.append(svgEl('line',{x1:52,x2:622,y1:y(v),y2:y(v),stroke:'#dce4d6'}),svgEl('text',{x:44,y:y(v)+4,'text-anchor':'end'},round(v,1)))}svg.append(svgEl('text',{x:12,y:18},'kg'));for(let i=0;i<=3;i++){const d=C.plusDays(start,Math.round(C.daysBetween(end,start)*i/3));svg.append(svgEl('text',{x:x(d),y:274,'text-anchor':i===0?'start':i===3?'end':'middle'},d.slice(2)))}const line=(arr,color,dash)=>{if(!arr.length)return;svg.append(svgEl('polyline',{points:arr.map(p=>x(p.date)+','+y(p.weight)).join(' '),fill:'none',stroke:color,'stroke-width':2.5,...(dash?{'stroke-dasharray':dash}:{})}))};const groups=[];for(const p of goalPoints){if(!groups.length||groups.at(-1)[0].goal!==p.goal)groups.push([]);groups.at(-1).push(p)}groups.forEach(g=>line(g,'#b17787','5 4'));if($('showAverage').checked)line(points.map(p=>({...p,weight:C.movingAverage(all,p.date)})),'#9aa574','3 3');line(points,'#355B47');const labelPoints=period==='week'?points:points.filter((p,i)=>i===0||i===points.length-1||i%Math.max(1,Math.ceil(points.length/8))===0);for(const p of labelPoints){svg.append(svgEl('text',{x:x(p.date),y:y(p.weight)-12,'text-anchor':'middle','font-size':16,fill:'#284B65'},round(p.weight,1)))}for(const p of points){const hit=svgEl('circle',{cx:x(p.date),cy:y(p.weight),r:9,fill:'#355B47','fill-opacity':.12});tapMark(hit,p.date+'：実測 '+p.weight+' kg ／ 7日間の記録平均 '+round(C.movingAverage(all,p.date),2)+' kg');svg.append(hit,svgEl('circle',{cx:x(p.date),cy:y(p.weight),r:3,fill:'#355B47','pointer-events':'none'}))}svg.onclick=evt=>{const pos=(evt.clientX-svg.getBoundingClientRect().left)/svg.getBoundingClientRect().width*640;const p=points.reduce((a,b)=>Math.abs(x(a.date)-pos)<Math.abs(x(b.date)-pos)?a:b);$('graphDetail').textContent=p.date+'：実測 '+p.weight+' kg ／ 7日間の記録平均 '+round(C.movingAverage(all,p.date),2)+' kg'};$('graphNote').textContent='緑実線：実測 ／ ピンク点線：当時の目標 ／ オリーブ点線：7日移動平均（未記録日は除外）。'+(points.length===1?'記録は1点です。傾向を見るには追加の記録が必要です。':'')}
function renderBalanceGraph(){
 const period=$('balancePeriod').value,days=period==='week'?7:Number(period),end=graphWeek,start=C.plusDays(end,1-days),now=today();
 const dates=Array.from({length:days},(_,i)=>C.plusDays(start,i));
 const values=dates.map(date=>{if(date>now||!store.days[date])return {date,balance:null};const e=C.energy(store,date);return {date,balance:e.balance,provisional:e.provisional}});
 const svg=chartBase(days+'日間のカロリー収支。マイナスは青、プラスは赤。未記録日は描画しません。');
 $('graphWeekLabel').textContent=start.slice(5)+'〜'+end.slice(5);
 const nums=values.filter(p=>p.balance!==null).map(p=>p.balance),peak=Math.max(0,...nums.map(Math.abs)),max=Math.max(500,Math.ceil((peak+100)/100)*100),zero=145,y=v=>zero-v/max*99;
 for(const v of [-max,0,max])svg.append(svgEl('line',{x1:56,x2:630,y1:y(v),y2:y(v),stroke:v===0?'#899b87':'#dde4d5'}),svgEl('text',{x:48,y:y(v)+4,'text-anchor':'end'},round(v)));
 svg.append(svgEl('text',{x:8,y:20},'kcal'));
 const width=560/days,barWidth=Math.max(2,width*(days===7?.7:.78)),left=60;
 values.forEach((p,i)=>{
  const center=left+(i+.5)*width;
  if(days===7||i===0||i===days-1||i%Math.max(1,Math.ceil(days/6))===0)svg.append(svgEl('text',{x:center,y:277,'text-anchor':'middle','font-size':days===7?13:10},days===7?['日','月','火','水','木','金','土'][C.date(p.date).getDay()]:p.date.slice(5)));
  if(p.balance===null){if(days===7)svg.append(svgEl('text',{x:center,y:165,'text-anchor':'middle','font-size':11},'未算出'));return}
  const rect=svgEl('rect',{x:center-barWidth/2,y:Math.min(zero,y(p.balance)),width:barWidth,height:Math.max(3,Math.abs(zero-y(p.balance))),rx:days===7?4:1,fill:p.balance<0?'#2478bf':p.balance>0?'#bc4554':'#889581'});
  tapMark(rect,p.date+'：カロリー収支 '+signed(p.balance)+' kcal'+(p.provisional?'（暫定）':''));svg.append(rect);
  if(days===7)svg.append(svgEl('text',{x:center,y:p.balance<0?Math.min(258,y(p.balance)+17):Math.max(26,y(p.balance)-10),'text-anchor':'middle','font-size':11,'font-weight':'700',fill:p.balance<0?'#2478bf':p.balance>0?'#bc4554':'#596b61'},signed(Math.round(p.balance))));
 });
 svg.onclick=evt=>{if(evt.target.closest('rect.hit'))return;const pos=(evt.clientX-svg.getBoundingClientRect().left)/svg.getBoundingClientRect().width*640;const i=Math.max(0,Math.min(days-1,Math.floor((pos-left)/width))),p=values[i];$('graphDetail').textContent=p.date+'：'+(p.balance===null?'未算出（未記録を含む）':'カロリー収支 '+signed(p.balance)+' kcal'+(p.provisional?'（暫定）':''))};
 const count=nums.length,sum=nums.reduce((a,b)=>a+b,0);
 $('graphNote').textContent=`${days}日間の記録済み累計：${count?signed(Math.round(sum))+' kcal':'未算出'} ／ 算出済み ${count}/${days}日。未記録・未来の日は0としていません。`;
}

function renderCumulativeGraph(){
 const root=$('cumulativeGraph');if(!root)return;
 const entries=Object.keys(store.days).filter(d=>d<=today()).sort();
 const points=[];let total=0,provisional=0;
 for(const date of entries){const e=C.energy(store,date);if(e.balance===null)continue;total+=e.balance;points.push({date,value:total,daily:e.balance,provisional:e.provisional});if(e.provisional)provisional++}
 const svg=svgEl('svg',{viewBox:'0 0 640 320',role:'img','aria-label':'累積カロリー収支。ゼロより下がマイナス、上がプラス。'});root.replaceChildren(svg);
 if(!points.length){svg.append(svgEl('text',{x:320,y:155,'text-anchor':'middle'},'算出可能な収支記録がありません'));$('cumulativeNote').textContent='食事と消費エネルギーが算出できた日を保存すると表示します。';return}
 const min=Math.min(0,...points.map(p=>p.value)),max=Math.max(0,...points.map(p=>p.value));
 const low=Math.floor(min/7200)*7200,high=Math.ceil(max/7200)*7200;
 const bottom=low===high?low-7200:low,top=low===high?high+7200:high;
 const y=v=>270-(v-bottom)/(top-bottom)*230;
 const start=points[0].date,end=points.at(-1).date,span=Math.max(1,C.daysBetween(end,start));
 const x=date=>points.length===1?342.5:70+C.daysBetween(date,start)/span*545;
 for(let v=bottom;v<=top;v+=7200){svg.append(svgEl('line',{x1:70,x2:615,y1:y(v),y2:y(v),stroke:v===0?'#6d8074':'#dce6e2','stroke-width':v===0?2:1,'stroke-dasharray':v===0?'':'4 5'}),svgEl('text',{x:62,y:y(v)+4,'text-anchor':'end','font-size':12},v===0?'0':(v>0?'+':'')+Math.round(v/100)/10+'k'))}
 svg.append(svgEl('text',{x:9,y:18,'font-size':13},'kcal'));
 if(points.length>1)svg.append(svgEl('polyline',{points:points.map(p=>x(p.date)+','+y(p.value)).join(' '),fill:'none',stroke:'#337f78','stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'}));
 const labels=points.length===1?[start]:[start,end];for(let i=0;i<labels.length;i++)svg.append(svgEl('text',{x:x(labels[i]),y:300,'text-anchor':points.length===1?'middle':i?'end':'start','font-size':13},labels[i].slice(5)));
 for(const p of points){const hit=svgEl('circle',{cx:x(p.date),cy:y(p.value),r:Math.max(5,points.length>60?5:7),fill:'#337f78','fill-opacity':.28});tapMark(hit,p.date+'：累積 '+signed(Math.round(p.value))+' kcal ／ 当日 '+signed(Math.round(p.daily))+' kcal'+(p.provisional?'（暫定）':''));svg.append(hit)}
 svg.onclick=evt=>{if(evt.target.closest('circle.hit'))return;const r=svg.getBoundingClientRect(),px=(evt.clientX-r.left)/r.width*640,p=points.reduce((a,b)=>Math.abs(x(a.date)-px)<Math.abs(x(b.date)-px)?a:b);$('cumulativeDetail').textContent=p.date+'：累積 '+signed(Math.round(p.value))+' kcal ／ 当日 '+signed(Math.round(p.daily))+' kcal'+(p.provisional?'（暫定）':'')};
 const milestone=$('cumulativeMilestone');
 const goal=C.goalAt(store,today());
 const direction=goal?(Number(goal.target)<Number(goal.current)?-1:Number(goal.target)>Number(goal.current)?1:0):null;
 // Determine the first crossing in the saved chronology. This is a stable status, not a replaying animation.
 let firstCross=null,previous=0;
 if(direction){for(const p of points){const previousTier=Math.floor(Math.max(0,previous*direction)/7200),tier=Math.floor(Math.max(0,p.value*direction)/7200);if(tier>previousTier){firstCross={date:p.date,tier};break}previous=p.value}}
 milestone.classList.toggle('hidden',!goal);
 if(goal){
  if(direction===0){milestone.textContent='🤖 維持目標：収支を大きく偏らせず、体重の推移も合わせて確認しましょう。累積収支の節目はお祝い対象にしません。'}
  else if(firstCross){milestone.textContent='✨🤖 '+(direction<0?'減量':'増量')+'目標の累積収支が、'+firstCross.date+' に初めて '+(direction<0?'−':'+')+round(firstCross.tier*7200)+' kcal の節目を通過しました！ 数値は推定収支で、実際の体重変化を保証するものではありません。'}
  else{milestone.textContent='🤖 '+(direction<0?'減量':'増量')+'目標に合わせて、累積収支の '+(direction<0?'−':'+')+'7,200 kcal ごとの節目を記録します。無理のないペースを大切に。'}
 }
 $('cumulativeNote').textContent='算出済み '+points.length+'日 ／ 累積 '+signed(Math.round(total))+' kcal'+(provisional?'（うち暫定 '+provisional+'日）':'')+'。未算出の日は加算していません。7,200 kcal目盛りは参考値です。';
}
function renderMonthlyGoals(){const root=$('monthlyGoals'),g=C.goalAt(store,today());if(!g){root.innerHTML='<p class="hint">設定で体重目標と期間を保存してください。</p>';return}let html='<p class="hint">現在の計画 '+g.start+'〜'+g.end+'。月間の実測平均と比較します。過去の計画は保持しています。</p><div class="table-scroll"><table><thead><tr><th>目標日</th><th>目標 kg</th><th>実測平均 kg</th></tr></thead><tbody>';for(let n=1;n<=g.months;n++){const d=C.plusMonths(g.start,n),target=C.targetWeight(g,d),month=d.slice(0,7),weights=Object.entries(store.days).filter(([day,v])=>day.startsWith(month)&&day<=today()&&C.numeric(v.weight)&&Number(v.weight)>0).map(([,v])=>Number(v.weight));html+=`<tr><td>${d}</td><td>${round(target,1)}</td><td>${weights.length?round(weights.reduce((a,b)=>a+b,0)/weights.length,1):'未記録'}</td></tr>`}html+='</tbody></table></div>';root.innerHTML=html;const latest=C.weightAt(store,today()),reached=latest&&(g.current>g.target?latest.weight<=g.target:g.current<g.target?latest.weight>=g.target:Math.abs(latest.weight-g.target)<.5);if(reached){const div=document.createElement('div');div.className='soft';div.textContent='目標付近に到達しています。今後は維持モードへの切り替えを検討できます。';div.append(button('維持目標を設定',()=>{switchTab('settings');$('goalCurrent').value=latest.weight;$('goalTarget').value=latest.weight;renderGoalPreview();$('purpose').value='maintain';markDirty('goal');markDirty('targets')}));root.prepend(div)}}
function exportBackup(){download({app:'chapi-training',version:2,schemaRevision:3,store},'chapi-fit-backup-'+today()+'.json')}
async function importBackup(file){if(!file)return;try{if(file.size>50*1024*1024)throw Error('50 MBを超えるファイルです');const obj=JSON.parse(await file.text());if(obj.app!=='chapi-training')throw Error('Chapi Fitのバックアップではありません');const incoming=C.migrate(obj.store||(obj.data?C.fromV1(obj.data):null));const n=Object.keys(incoming.days).length;if(!confirm(`${n}日分の記録・${incoming.templates.length}件のメニューで、現在の記録と設定を置き換えますか？\n現在の保存データは復元前コピーとして端末内に残します。`))return;if(blocked&&(!recoveryExported||externalConflict)){notice(externalConflict?'別タブの更新を確認するため再読み込みしてください。':'元データを保護中です。まず元データを書き出してから復旧してください。');return}const wasBlocked=blocked;if(wasBlocked){localStorage.setItem('chapi-training-corrupt-original',rawOriginal);blocked=false}else localStorage.setItem(RESTORE,JSON.stringify(store));if(persist(incoming)){chooseDate(current);refreshPickers();renderSettings();dirtySections.clear();settingsDirty=false;$('fatal').classList.add('hidden');notice('バックアップを復元しました')}else if(wasBlocked)blocked=true}catch(e){notice('復元を中止しました：'+e.message)}finally{$('importFile').value=''}}
function rollover(){const now=today();if(now===loadedToday)return;$('rollover').classList.remove('hidden');$('rollover').replaceChildren(document.createTextNode('日付が変わりました。現在の入力は '+current+' のまま保持しています。 '),button('今日の記録へ',()=>{if(changeDate(now)){$('rollover').classList.add('hidden');loadedToday=now;switchTab('record')}}))}

function refreshMacroNumbers(){for(const k of C.keys){const v=targetsDraft.mode==='percent'?targetsDraft[k]*C.factors[k]/targetsDraft.kcal*100:targetsDraft[k];$('macro_'+k).value=roundPlain(v);$('range_'+k).value=v;$('macro_'+k).nextElementSibling.innerHTML=(targetsDraft.mode==='percent'?'%':'g')+' <small>（'+round(targetsDraft[k],1)+' g / '+round(targetsDraft[k]*C.factors[k]/targetsDraft.kcal*100,1)+'%）</small>'}const sum=C.keys.reduce((a,k)=>a+targetsDraft[k]*C.factors[k],0);$('macroSummary').textContent='配分合計 '+round(sum,2)+' kcal ／ 目標 '+round(targetsDraft.kcal,2)+' kcal。鍵はg値を固定します。'}
for(const [id,key,name] of [['exportRestore',RESTORE,'before-restore'],['exportDeleted','chapi-training-before-delete','before-delete']])$(id).onclick=()=>{const raw=localStorage.getItem(key);if(!raw){notice('該当するコピーはありません');return}download({app:'chapi-training',version:2,store:JSON.parse(raw)},'chapi-fit-'+name+'.json')};

// Bind fixed controls.
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));$('openSettings').onclick=()=>switchTab('settings');$('recordDate').onchange=()=>changeDate($('recordDate').value);$('weight').oninput=()=>{draft.weight=$('weight').value;if(confirmedWeightByDay.get(current)!==String(draft.weight))confirmedWeightByDay.delete(current);renderEnergy()};$('daynote').oninput=()=>draft.note=$('daynote').value;$('saveDay').onclick=saveDay;$('saveDayTop').onclick=saveDay;$('saveFood').onclick=saveDay;$('copyDay').onclick=()=>{sync();copy(dayReport(current,draft))};$('copyDayTop').onclick=()=>{sync();copy(dayReport(current,draft))};$('backToTop').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});const updateBackToTop=()=>{$('backToTop').hidden=window.scrollY<280};window.addEventListener('scroll',updateBackToTop,{passive:true});updateBackToTop();$('aiCopyRequest').onclick=aiCopyRequest;$('aiParse').onclick=aiPreview;$('aiAccept').onclick=aiAccept;$('aiAcceptTop').onclick=aiAccept;$('aiClear').onclick=()=>{$('aiResult').value='';aiDiscard();notice('JSONだけを消去しました')};$('aiDiscard').onclick=()=>{if(aiPending&&!confirm('確認中の仮データを破棄しますか？ JSONと食べたものの文章は残ります。'))return;aiDiscard();notice('確認中の仮データを破棄しました')};$('aiResult').oninput=()=>{aiPending=null;$('aiAccept').disabled=true;$('aiAcceptTop').disabled=true;$('aiPreview').textContent=''};$('copyFood').onclick=()=>copy('【Chapi Fit 食事 '+current+'】\n'+foodReport(draft));document.querySelectorAll('.faq-shortcut').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();const faq=$('aiFaq');if(!faq)return;const first=faq.querySelector('details');if(first)first.open=true;faq.scrollIntoView({behavior:'smooth',block:'start'});}));$('restDay').onchange=()=>{draft.restDay=$('restDay').checked;renderEnergy()};$('mascot').onclick=()=>{$('mascotMessage').classList.toggle('hidden')};$('foodComplete').onchange=()=>draft.foodComplete=$('foodComplete').checked;$('strengthTotalMinutes').oninput=e=>updateStrengthTotal('minutes',e.target.value);$('strengthTotalKcal').oninput=e=>updateStrengthTotal('kcal',e.target.value);$('strengthTotalType').onchange=e=>updateStrengthTotal('energyType',e.target.value);$('exerciseCategory').onchange=refreshExerciseOptions;$('addExercise').onclick=addSelectedExercise;$('prevMonth').onclick=()=>{month=C.plusMonths(month,-1);renderCalendar()};$('nextMonth').onclick=()=>{month=C.plusMonths(month,1);renderCalendar()};$('newTemplate').onclick=()=>startEditor();$('newLibraryExercise').onclick=addLibraryExercise;$('showArchivedExercises').onchange=renderLibrary;$('templateName').oninput=()=>{if(editing)editing.name=$('templateName').value};$('newStrengthItem').onclick=()=>{editing.items.push({id:uid(),name:'新しい筋トレ',kind:'strength',strengthType:'normal',kg:0,sets:3,target:'10〜12回'});renderEditor()};$('newCardioItem').onclick=()=>{editing.items.push({id:uid(),name:'新しい有酸素種目',kind:'cardio'});renderEditor()};$('cancelTemplate').onclick=()=>{if(editing&&!confirm('メニュー編集を保存せず閉じますか？'))return;editing=null;$('templateEditor').classList.add('hidden')};$('saveTemplate').onclick=saveTemplate;$('saveProfile').onclick=saveProfile;$('targetKcal').onchange=e=>commitMacro('kcal',e.target.value);$('macroMode').onchange=()=>{targetsDraft.mode=$('macroMode').value;markDirty('targets');renderMacros()};$('unlockAll').onclick=()=>{targetsDraft.locks={p:false,f:false,c:false};markDirty('targets');renderMacros();macroMessage('')};$('saveTargets').onclick=saveTargets;$('suggestTargets').onclick=showSuggestion;
for(const id of ['goalCurrent','goalTarget','goalMonths'])$(id).oninput=()=>{markDirty('goal');if(id==='goalMonths')$('goalMonthsRange').value=$('goalMonths').value;renderGoalPreview()};$('goalMonthsRange').oninput=()=>{$('goalMonths').value=$('goalMonthsRange').value;markDirty('goal');renderGoalPreview()};for(const [id,n] of [['monthsMinus',-1],['monthsPlus',1]])$(id).onclick=()=>{$('goalMonths').value=Math.max(1,Math.min(60,(Number($('goalMonths').value)||1)+n));$('goalMonthsRange').value=$('goalMonths').value;markDirty('goal');renderGoalPreview()};$('goalExerciseWeekly').oninput=()=>{markDirty('goal');$('goalExerciseRange').value=Math.min(5000,Number($('goalExerciseWeekly').value)||0);renderGoalPreview()};$('goalExerciseRange').oninput=()=>{$('goalExerciseWeekly').value=$('goalExerciseRange').value;markDirty('goal');renderGoalPreview()};$('saveGoal').onclick=saveGoal;$('useGoalCalories').onclick=applyGoalCalories;for(const event of ['input','change'])$('settings').addEventListener(event,e=>{const section=e.target.closest('[data-settings]')?.dataset.settings;if(section)markDirty(section)});$('exportBackup').onclick=exportBackup;$('importBackup').onclick=()=>$('importFile').click();$('importFile').onchange=e=>importBackup(e.target.files[0]);$('exportOriginal').onclick=()=>{const original=localStorage.getItem(BACKUP);if(original)download({app:'chapi-training',version:2,store:JSON.parse(original)},'chapi-fit-before-v3.json');else notice('更新前データはありません。通常のバックアップを書き出してください。')};
$('weightGraphTab').onclick=()=>{graphMode='weight';renderGraphs()};$('balanceGraphTab').onclick=()=>{graphMode='balance';renderGraphs()};$('balancePeriod').onchange=()=>{graphWeek=today();renderGraphs()};$('graphPeriod').onchange=renderGraphs;$('showAverage').onchange=renderGraphs;$('prevWeek').onclick=()=>{graphWeek=C.plusDays(graphWeek,-($('balancePeriod').value==='week'?7:Number($('balancePeriod').value)));renderGraphs()};$('nextWeek').onclick=()=>{graphWeek=C.plusDays(graphWeek,($('balancePeriod').value==='week'?7:Number($('balancePeriod').value)));renderGraphs()};window.addEventListener('beforeunload',e=>{if((dayDirty()&&journalError)||settingsDirty||editing){e.preventDefault();e.returnValue=''}});document.addEventListener('visibilitychange',()=>{if(!document.hidden)rollover()});setInterval(rollover,60000);window.addEventListener('storage',e=>{if(e.key===KEY){blocked=true;externalConflict=true;$('fatal').classList.remove('hidden');$('fatal').textContent='別のタブで記録が更新されました。上書きを防ぐため保存を停止しました。必要な入力をコピーして再読み込みしてください。'}});
// The journal writes synchronously on each edit, not on page close.
// Commit only when the field is complete; avoid making a partial number official.
document.addEventListener('input',e=>{
 if(!draft||e.target.closest('#settings')||e.target.closest('#templateEditor')||e.target.closest('#aiResult'))return;
 if(e.target.matches('input,textarea,select')){
  journalDraft();
  if(e.target.type==='checkbox'||e.target.type==='radio')autoCommit();
 }
});
document.addEventListener('change',e=>{
 if(!draft||e.target.closest('#settings')||e.target.closest('#templateEditor')||e.target.id==='recordDate')return;
 journalDraft();autoCommit();
});
document.addEventListener('focusout',e=>{
 if(!draft||e.target.closest('#settings')||e.target.closest('#templateEditor'))return;
 if(e.target.matches('input,textarea,select')){journalDraft();if(e.target.id==='weight')weightApproval(true);autoCommit()}
});
document.addEventListener('click',e=>{
 if(!draft||e.target.closest('#settings')||e.target.closest('#templateEditor'))return;
 if(e.target.closest('#foodInputs,#strengthSessions,#cardioSessions,#addExercise,#exerciseCategory,#exercisePicker,#restDay')){
  journalDraft();autoCommit();
 }
});
refreshPickers();chooseDate(current);autoStatus('保存済み');restoreJournal();if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
// Public read-only diagnostics used by compatibility tests; no personal data is transmitted.
window.ChapiFit={version:VERSION,getStore:()=>C.clone(store),getDraft:()=>C.clone(draft),saveDay,changeDate,importBackup,rollover};
})();
