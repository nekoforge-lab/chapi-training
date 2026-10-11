/* Chapi Fit v3.5 guide: UI-only, independent of health records */
(()=>{'use strict';
const pages={
 food:[
 ['食事内容を入力','食べたものと分かる範囲の量を入力します。分からない量は空欄でも構いません。','例：ご飯197g、ちくわ50g。実測値がある場合は書いておくと正確です。','✍️'],
 ['AIへの依頼文をコピー','「AI計算の依頼文をコピー」を押して、お手持ちのAIアプリに貼り付けます。','Chapi Fitから写真は自動送信されません。','📋'],
 ['写真をAIに添付','料理写真に加えて、商品パッケージや栄養成分表示の写真もAIアプリ側で添付しましょう。','栄養表示は「100g当たり」などの単位が読めるように撮影し、実際に食べた量も伝えます。','📷'],
 ['AIと内容を確認・訂正','AIはまず日本語で食品・量・kcal・PFCを説明します。間違いがあれば会話で訂正しましょう。','例：「味噌汁は卵ではなくキャベツとしいたけ」「メインは油込みで340kcal」。納得したら「OK、JSONを出して」と伝えます。','🤖'],
 ['確定JSONを取り込む','AIが最後に出したJSONをコピーし、Chapi Fitの「AIから返されたJSON」に貼り付けて「取り込み内容を確認」を押します。','合計と食品別カードを確認。詳しい根拠は「推定根拠・不明点を見る」で開けます。確認後「確認した内訳を食事欄に反映」を押してください。','📥'],
 ['修正して保存','必要なら食品別内訳の数値や根拠を修正し、「内訳から合計を再計算」して「この日を保存」を押します。','商品ラベルや実測値を優先。数値を編集したら説明文も確認しましょう。','✅']
 ],
 record:[['記録タブの使い方','日付を選び、体重や運動を入力して「記録を保存」を押します。','入力途中の内容は、日付を切り替える前に保存してください。','📝']],
 calendar:[['カレンダーの使い方','日付を選ぶと、その日の記録を確認できます。','未記録と0 kcalは別の意味です。','📅']],
 progress:[['進捗の使い方','体重や摂取・消費の推移をグラフで確認できます。','推定消費とカロリー収支には誤差があります。','📈']],
 history:[['日々の記録の使い方','記録した日を選んで、食事・運動・PFCの詳細を確認します。','過去の記録を確認するときに使いましょう。','📚']],
 templates:[['運動メニューの使い方','よく使う筋トレ・有酸素運動のメニューを登録できます。','登録したメニューは記録タブで利用できます。','💪']],
 settings:[['設定の使い方','プロフィール・体重目標・食事目標を設定できます。','変更後は各設定の保存ボタンを押してください。','⚙️']]
};
let current='food',index=0,focusBefore=null;
const modal=document.createElement('div');modal.id='guideOverlay';modal.className='guide-overlay hidden';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','使い方ガイド');
modal.innerHTML=`<div class="guide-panel"><div class="guide-top"><strong id="guideCategory">食事の使い方</strong><button id="guideClose" class="guide-close" type="button" aria-label="ガイドを閉じる">× 閉じる</button></div><div class="guide-progress"><span id="guideCount"></span><div id="guideDots" class="guide-dots"></div></div><div id="guideSlide" class="guide-slide" aria-live="polite"></div><div class="guide-controls"><button id="guidePrev" class="outline" type="button">‹ 戻る</button><button id="guideNext" type="button">次へ ›</button></div></div>`;
document.body.appendChild(modal);
const $=id=>document.getElementById(id);
const labels={record:'記録',food:'食事',calendar:'カレンダー',progress:'進捗',history:'日々の記録',templates:'運動メニュー',settings:'設定'};
function draw(){const list=pages[current],p=list[index];$('guideCategory').textContent=labels[current]+'の使い方';$('guideCount').textContent=`STEP ${index+1} / ${list.length}`;$('guideDots').innerHTML=list.map((_,i)=>`<span class="${i===index?'active':''}"></span>`).join('');const slide=$('guideSlide');slide.replaceChildren();const icon=document.createElement('div');icon.className='guide-illustration';icon.textContent=p[3];const title=document.createElement('h2');title.textContent=p[0];const desc=document.createElement('p');desc.textContent=p[1];const hint=document.createElement('p');hint.className='guide-hint';hint.textContent=p[2];slide.append(icon,title,desc,hint);$('guidePrev').disabled=index===0;$('guideNext').textContent=index===list.length-1?'完了 ✓':'次へ ›';}
function open(name){if(!pages[name])return;focusBefore=document.activeElement;current=name;index=0;draw();modal.classList.remove('hidden');document.body.classList.add('guide-open');$('guideClose').focus();}
function close(){modal.classList.add('hidden');document.body.classList.remove('guide-open');if(focusBefore&&document.contains(focusBefore))focusBefore.focus();}
function next(){if(index<pages[current].length-1){index++;draw();}else close();}
function prev(){if(index>0){index--;draw();}}
$('guideClose').addEventListener('click',close);$('guideNext').addEventListener('click',next);$('guidePrev').addEventListener('click',prev);
modal.addEventListener('click',e=>{if(e.target===modal)close();});
document.addEventListener('keydown',e=>{if(modal.classList.contains('hidden'))return;if(e.key==='Escape')close();if(e.key==='ArrowLeft')next();if(e.key==='ArrowRight')prev();if(e.key==='Tab'){const buttons=[...modal.querySelectorAll('button:not(:disabled)')];if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons[buttons.length-1].focus();}else if(!e.shiftKey&&document.activeElement===buttons[buttons.length-1]){e.preventDefault();buttons[0].focus();}}});
let touchStart=null;const slide=$('guideSlide');slide.addEventListener('touchstart',e=>{if(e.touches.length===1)touchStart={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});slide.addEventListener('touchend',e=>{if(!touchStart||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-touchStart.x,dy=e.changedTouches[0].clientY-touchStart.y;touchStart=null;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.3){if(dx<0)next();else prev();}},{passive:true});
Object.keys(pages).forEach(name=>{const section=document.getElementById(name);if(!section)return;const row=document.createElement('div');row.className='guide-launch-row';const btn=document.createElement('button');btn.type='button';btn.className='outline guide-launch';btn.textContent='？ 使い方';btn.setAttribute('aria-label',labels[name]+'の使い方を開く');btn.addEventListener('click',()=>open(name));row.appendChild(btn);section.insertBefore(row,section.firstChild);});
// Show the food tutorial only on the first visit to the food tab. Never touch health-record storage.
document.querySelectorAll('[data-tab="food"]').forEach(btn=>btn.addEventListener('click',()=>{if(document.getElementById('food')?.classList.contains('hidden'))return;const key='chapi-v35-guide-food-seen-v1';try{if(localStorage.getItem(key))return;localStorage.setItem(key,'1');}catch(e){}open('food');}));
})();
