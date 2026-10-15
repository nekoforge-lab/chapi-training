/* Shared strength set / circuit round record operations. No storage side effects. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ChapiWorkoutRecords=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const isCircuit=item=>item?.tracking==='rounds'&&!Array.isArray(item.sets);
const rows=item=>isCircuit(item)?item.roundEntries:item.sets;
function ensure(item){if(isCircuit(item)&&!Array.isArray(item.roundEntries))item.roundEntries=[{kg:'',rounds:item.rounds??'',done:!!item.done}];if(!isCircuit(item)&&!Array.isArray(item.sets))item.sets=[];return rows(item)}
function totals(item){const list=ensure(item);if(isCircuit(item))return {total:list.reduce((a,x)=>a+(Number(x.rounds)||0),0),completed:list.reduce((a,x)=>a+(x.done?(Number(x.rounds)||0):0),0),unit:'周'};return {total:list.length,completed:list.filter(x=>x.done).length,unit:'セット'}}
function add(item){const list=ensure(item),last=list.at(-1);list.push(isCircuit(item)?{kg:last?.kg??'',rounds:'',done:false}:{kg:item.strengthType==='bodyweight'?'':(last?.kg??''),reps:'',rir:'',done:false});return list.length}
function remove(item,index){const list=ensure(item);if(list.length<=1||index<0||index>=list.length)return false;list.splice(index,1);return true}
function setDone(item,index,done){const list=ensure(item);if(!list[index])return false;list[index].done=!!done;return true}
function setValue(item,index,field,value){const list=ensure(item),allowed=isCircuit(item)?['kg','rounds']:['kg','reps','rir'];if(!list[index]||!allowed.includes(field))return false;list[index][field]=value;return true}
function hasInput(item,index){const x=ensure(item)[index];return !!x&&(!!x.done||(isCircuit(item)?x.kg!==''&&x.kg!=null||x.rounds!==''&&x.rounds!=null:x.reps!==''&&x.reps!=null||x.kg!==''&&x.kg!=null||x.rir!==''&&x.rir!=null))}
return {isCircuit,ensure,totals,add,remove,setDone,setValue,hasInput};
});
