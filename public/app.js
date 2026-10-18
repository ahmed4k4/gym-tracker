'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COLORS=['#2f5bff','#e8590c'];
const MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const DOW=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

firebase.initializeApp(firebaseConfig);
const auth=firebase.auth(), db=firebase.firestore();
// التخزين المحلي: يعمل بدون نت ويرفع التعديلات تلقائياً عند الاتصال
db.enablePersistence({synchronizeTabs:true}).catch(e=>console.warn('persistence',e.code));

const S={me:null,profiles:{},days:{},pending:{},unsubs:{},view:new Date(),sel:iso(new Date())};
S.view.setDate(1);
const uids=()=>Object.keys(S.profiles).sort();
const colorOf=u=>COLORS[Math.max(0,uids().indexOf(u))%2];
const nameOf=u=>S.profiles[u]?.name||'—';
const dayData=(u,d)=>S.days[u]?.[d]||{title:'',exercises:[],meals:[],note:'',done:false};

// ---------- الدخول ----------
$('#loginForm').onsubmit=async e=>{
  e.preventDefault();$('#loginErr').textContent='';
  try{await auth.signInWithEmailAndPassword($('#email').value.trim(),$('#pass').value)}
  catch(err){$('#loginErr').textContent=navigator.onLine?'البريد أو كلمة المرور غير صحيحة.':'لا يوجد اتصال. أول دخول يحتاج إنترنت.'}
};
$('#logout').onclick=()=>auth.signOut();
auth.onAuthStateChanged(async u=>{
  $('#boot').hidden=true;S.me=u;$('#timer').hidden=!u;$('#login').hidden=!!u;$('#app').hidden=!u;
  if(!u){Object.values(S.unsubs).forEach(f=>f());S.unsubs={};S.profiles={};S.days={};return}
  const ref=db.doc('users/'+u.uid);
  ref.get().then(s=>{if(!s.exists||!s.data().name)ref.set({name:u.email.split('@')[0],email:u.email},{merge:true})}).catch(()=>{});
  db.collection('users').onSnapshot({includeMetadataChanges:true},snap=>{
    S.profiles={};snap.forEach(d=>S.profiles[d.id]=d.data());
    uids().forEach(listenDays);render();
  });
});
function listenDays(uid){
  if(S.unsubs[uid])return;
  S.unsubs[uid]=db.collection(`users/${uid}/days`).onSnapshot({includeMetadataChanges:true},snap=>{
    S.days[uid]={};S.pending[uid]=false;
    snap.forEach(d=>{S.days[uid][d.id]=d.data();if(d.metadata.hasPendingWrites)S.pending[uid]=true});
    if(!document.activeElement?.closest('#panel'))render();else renderTop();
    updateNet();
  });
}

// ---------- حالة الاتصال ----------
function updateNet(){
  const on=navigator.onLine,wait=Object.values(S.pending).some(Boolean);
  $('#net').textContent=on?'متصل':'بدون إنترنت';$('#net').className='pill '+(on?'on':'off');
  $('#sync').textContent=wait?'بانتظار المزامنة':'تمت المزامنة';$('#sync').className='pill '+(wait?'wait':'on');
}
addEventListener('online',updateNet);addEventListener('offline',updateNet);

// ---------- الحفظ ----------
function mutate(fn,rerender=true){
  const d=structuredClone(dayData(S.me.uid,S.sel));fn(d);
  (S.days[S.me.uid]??={})[S.sel]=d;
  S.pending[S.me.uid]=true;
  db.doc(`users/${S.me.uid}/days/${S.sel}`).set(d); // بدون await: يُحفظ محلياً فوراً ويُرفع لاحقاً
  updateNet();if(rerender)render();else renderTop();toast(navigator.onLine?'تم الحفظ ✓':'حُفظ على جهازك ✓');navigator.vibrate?.(8);
}

// ---------- الإحصائيات ----------
function monthStats(u){
  const m=iso(S.view).slice(0,7);let w=0,vol=0,kcal=0,meals=0;
  for(const [k,d] of Object.entries(S.days[u]||{})){
    if(!k.startsWith(m))continue;
    if(d.done){w++;vol+=(d.exercises||[]).reduce((a,e)=>a+(+e.s||0)*(+e.r||0)*(+e.w||0),0)}
    (d.meals||[]).forEach(x=>{kcal+=+x.k||0;meals++});
  }
  return {w,vol,kcal};
}
function renderTop(){
  $('#stats').innerHTML=uids().map(u=>{const s=monthStats(u);return `<div class="stat" style="--c:${colorOf(u)}"><b>${esc(nameOf(u))}${u===S.me?.uid?' (أنت)':''}</b>
  <div class="nums"><div><span>${s.w}</span><small>يوم تمرين</small></div><div><span>${Math.round(s.vol).toLocaleString('ar-EG')}</span><small>حجم كغ</small></div><div><span>${s.kcal.toLocaleString('ar-EG')}</span><small>سعرات الشهر</small></div><div><span>${streak(u)}</span><small>أيام متتالية</small></div></div></div>`}).join('');
  $('#legend').innerHTML=uids().map(u=>`<span style="--c:${colorOf(u)}"><i></i>${esc(nameOf(u))}</span>`).join('');
  drawCal();drawView();renderHero();
}
function drawCal(){
  const y=S.view.getFullYear(),m=S.view.getMonth();
  $('#monthTitle').textContent=`${MONTHS[m]} ${y}`;
  let h=DOW.map(d=>`<div class="dow">${d.replace('ال','')}</div>`).join('');
  const start=new Date(y,m,1-new Date(y,m,1).getDay());
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);const k=iso(d);
    const dots=uids().map(u=>{const x=S.days[u]?.[k];return x&&(x.title||x.exercises?.length||x.done)?`<span class="dot${x.done?' done':''}" style="--c:${colorOf(u)}">${esc(x.title||'تمرين')}</span>`:''}).join('');
    h+=`<button class="day${d.getMonth()!==m?' out':''}${k===iso(new Date())?' today':''}${k===S.sel?' sel':''}" data-d="${k}"><span>${d.getDate()}</span><span class="dots">${dots}</span></button>`;
  }
  $('#grid').innerHTML=h;
}

// ---------- لوحة اليوم ----------
function card(u){
  const mine=u===S.me?.uid,d=dayData(u,S.sel),ro=mine?'':'readonly disabled';
  const tot=(d.exercises||[]).reduce((a,e)=>a+(+e.s||0)*(+e.r||0)*(+e.w||0),0);
  const kc=(d.meals||[]).reduce((a,x)=>a+(+x.k||0),0),pr=(d.meals||[]).reduce((a,x)=>a+(+x.p||0),0);
  const ex=(d.exercises||[]).map((e,i)=>mine?`<div class="row" data-i="${i}"><input data-k="n" list="exl" value="${esc(e.n)}" placeholder="التمرين"><label data-l="مجموعات"><input data-k="s" type="number" inputmode="decimal" min="0" value="${esc(e.s)}" placeholder="مجموعات"></label><label data-l="عدّات"><input data-k="r" type="number" inputmode="decimal" min="0" value="${esc(e.r)}" placeholder="عدّات"></label><label data-l="وزن"><input data-k="w" type="number" inputmode="decimal" min="0" step="0.5" value="${esc(e.w)}" placeholder="${lastW(u,e.n)||'وزن'}"></label><span class="acts"><button data-a="info" aria-label="تفاصيل التمرين">ⓘ</button><button data-a="up" aria-label="أعلى">▲</button><button data-a="dn" aria-label="أسفل">▼</button><button data-a="rm" aria-label="حذف">✕</button></span><input data-k="t" class="note" value="${esc(e.t)}" placeholder="ملاحظة على التمرين (الأداء، الإحساس، ضبط الجهاز…)"></div>`
    :`<div class="row" data-i="${i}"><button class="n lk" data-a="info">${i+1}. ${esc(e.n)}</button><span>${esc(e.s)}</span><span>${esc(e.r)}</span><span>${esc(e.w)}</span><span></span>${e.t?`<small class="note">${esc(e.t)}</small>`:''}</div>`).join('')||'<div class="empty">لا توجد تمارين لهذا اليوم.</div>';
  const ml=(d.meals||[]).map((x,i)=>mine?`<div class="row meal" data-i="${i}"><input data-m="n" value="${esc(x.n)}" placeholder="الوجبة"><label data-l="سعرات"><input data-m="k" type="number" inputmode="decimal" min="0" value="${esc(x.k)}" placeholder="سعرات"></label><label data-l="بروتين"><input data-m="p" type="number" inputmode="decimal" min="0" value="${esc(x.p)}" placeholder="بروتين"></label><span class="acts"><button data-a="mrm" aria-label="حذف">✕</button></span></div>`
    :`<div class="row meal"><span class="n">${esc(x.n)}</span><span>${esc(x.k)}</span><span>${esc(x.p)}</span><span></span></div>`).join('')||'<div class="empty">لا توجد وجبات مسجلة.</div>';
  return `<article class="pcard${mine?'':' ro'}" style="--c:${colorOf(u)}" data-u="${u}">
  <h3>${esc(nameOf(u))}${mine?' (أنت)':''}<label class="check"><input type="checkbox" data-a="done" ${d.done?'checked':''} ${mine?'':'disabled'}>تم التمرين</label></h3>
  ${mine?`<input data-a="title" value="${esc(d.title)}" placeholder="اسم اليوم (مثال: صدر وترايسبس)">`:`<h4>${esc(d.title||'بدون عنوان')}</h4>`}
  ${mine?`<div class="row" style="grid-template-columns:1fr auto"><label>وزن الجسم (كغ) <input data-a="bw" type="number" inputmode="decimal" step="0.1" value="${esc(d.bw)}" style="width:90px"></label><button class="btn sm" data-a="copy">نسخ آخر تمرين</button></div>`:(d.bw?`<div class="sum">وزن الجسم: ${esc(d.bw)} كغ</div>`:'')}
  <div class="row hdr"><span>التمرين</span><span>مجموعات</span><span>عدّات</span><span>وزن كغ</span><span></span></div>${ex}
  ${mine?'<button class="btn sm" data-a="add">+ تمرين</button>':''}
  <div class="sum" data-sv>حجم اليوم: ${tot.toLocaleString('ar-EG')} كغ${prs(u,d)?` · 🏆 ${prs(u,d)} رقم قياسي`:''}</div>
  <div class="row hdr meal"><span>الأكل</span><span>سعرات</span><span>بروتين</span><span></span></div>${ml}
  ${mine?'<button class="btn sm" data-a="madd">+ وجبة</button>':''}
  <div class="sum" data-sk>الإجمالي: ${kc.toLocaleString('ar-EG')} سعرة · ${pr} جم بروتين</div>
  ${mine?`<textarea data-a="note" rows="2" placeholder="ملاحظات (نوم، إصابات، إحساس التمرين...)">${esc(d.note)}</textarea>`:(d.note?`<div class="sum">ملاحظات: ${esc(d.note)}</div>`:'')}
  </article>`;
}
function renderPanel(){
  const dt=new Date(S.sel+'T00:00');
  const us=uids().sort((a,b)=>(a===S.me?.uid?-1:0)-(b===S.me?.uid?-1:0));
  $('#panel').innerHTML=`<datalist id="exl">${[...new Set(Object.values(S.days[S.me?.uid]||{}).flatMap(d=>(d.exercises||[]).map(e=>e.n)).filter(Boolean))].map(n=>`<option value="${esc(n)}">`).join('')}</datalist><div class="dh"><button class="btn" data-nav="-1" aria-label="اليوم السابق">›</button><h2>${DOW[dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]}${S.sel===iso(new Date())?' · اليوم':''}</h2><button class="btn" data-nav="1" aria-label="اليوم التالي">‹</button></div>`+us.map(card).join('');
}
function render(){renderTop();renderPanel();updateNet()}

// ---------- الأحداث ----------
$('#grid').onclick=e=>{const b=e.target.closest('.day');if(b){S.sel=b.dataset.d;render();fx($('#panel'))}};
$('#prev').onclick=()=>{S.view.setMonth(S.view.getMonth()-1);renderTop()};
$('#next').onclick=()=>{S.view.setMonth(S.view.getMonth()+1);renderTop()};
$('#today').onclick=()=>{S.view=new Date();S.view.setDate(1);S.sel=iso(new Date());render()};
$('#panel').onclick=async e=>{
  const nv=e.target.closest('[data-nav]');if(nv)return goDay(+nv.dataset.nav);
  const b=e.target.closest('button[data-a]');if(!b)return;
  const a=b.dataset.a,i=+b.closest('.row')?.dataset.i;
  if((a==='rm'||a==='mrm')&&!await ask('حذف','هل تريد حذف هذا العنصر؟ لا يمكن التراجع.','حذف'))return;
  if(a==='info')return exInfo(b.closest('.pcard').dataset.u,i);
  if(a==='add')return addExDlg();
  if(a==='madd')return addMealDlg();
  mutate(d=>{
    if(a==='copy'){const D=S.days[S.me.uid]||{},p=Object.keys(D).filter(k=>k<S.sel&&D[k].exercises?.length).sort().pop();if(p){d.title=d.title||D[p].title;d.exercises=structuredClone(D[p].exercises)}else show('<h3>لا يوجد تمرين سابق</h3><p>سجّل تمارين في يوم سابق أولاً ثم انسخها.</p><form method="dialog" class="dact"><button class="btn main">حسناً</button></form>')}
    if(a==='add')d.exercises.push({n:'',s:3,r:10,w:0});
    if(a==='madd')d.meals.push({n:'',k:'',p:''});
    if(a==='rm')d.exercises.splice(i,1);
    if(a==='mrm')d.meals.splice(i,1);
    if(a==='up'&&i>0)[d.exercises[i-1],d.exercises[i]]=[d.exercises[i],d.exercises[i-1]];
    if(a==='dn'&&i<d.exercises.length-1)[d.exercises[i+1],d.exercises[i]]=[d.exercises[i],d.exercises[i+1]];
  });
};
$('#panel').onchange=e=>{
  const t=e.target,a=t.dataset.a,row=t.closest('.row'),i=+row?.dataset.i;
  if(t.dataset.k||t.dataset.m)return mutate(d=>{if(t.dataset.k)d.exercises[i][t.dataset.k]=t.type==='number'?+t.value:t.value;else d.meals[i][t.dataset.m]=t.type==='number'?+t.value:t.value},false)||updateSums();
  if(a==='bw')return mutate(d=>d.bw=+t.value||'',false);
  if(a==='done'){mutate(d=>d.done=t.checked);if(t.checked)confetti()}
  if(a==='title')mutate(d=>d.title=t.value.trim());
  if(a==='note')mutate(d=>d.note=t.value);
};

// ---------- مميزات إضافية ----------
function updateSums(){
  const d=dayData(S.me.uid,S.sel),c=document.querySelector(`.pcard[data-u="${S.me.uid}"]`);if(!c)return;
  const tot=(d.exercises||[]).reduce((a,e)=>a+(+e.s||0)*(+e.r||0)*(+e.w||0),0),kc=(d.meals||[]).reduce((a,x)=>a+(+x.k||0),0),pr=(d.meals||[]).reduce((a,x)=>a+(+x.p||0),0),n=prs(S.me.uid,d);
  c.querySelector('[data-sv]').textContent=`حجم اليوم: ${tot.toLocaleString('ar-EG')} كغ${n?` · 🏆 ${n} رقم قياسي`:''}`;
  c.querySelector('[data-sk]').textContent=`الإجمالي: ${kc.toLocaleString('ar-EG')} سعرة · ${pr} جم بروتين`;
}
$('#nm').onclick=async()=>{const v=await show(`<h3>اسمك الظاهر</h3><form method="dialog" class="dform"><input id="dn" value="${esc(nameOf(S.me.uid))}" maxlength="20" autofocus><div class="dact"><button class="btn main" value="ok">حفظ</button><button class="btn" value="">إلغاء</button></div></form>`);const n=$('#dn').value.trim();if(v==='ok'&&n)db.doc('users/'+S.me.uid).set({name:n},{merge:true})};
function hist(u,n){return Object.entries(S.days[u]||{}).filter(([k,d])=>k<S.sel&&(d.exercises||[]).some(e=>e.n===n)).sort().map(([k,d])=>Math.max(...d.exercises.filter(e=>e.n===n).map(e=>+e.w||0)))}
function lastW(u,n){const h=n?hist(u,n):[];return h.length?h[h.length-1]:''}
function prs(u,d){return d.done?(d.exercises||[]).filter(e=>e.n&&+e.w>0&&+e.w>Math.max(0,...hist(u,e.n))&&hist(u,e.n).length).length:0}
function streak(u){const D=S.days[u]||{};let n=0,x=new Date();if(!D[iso(x)]?.done)x.setDate(x.getDate()-1);while(D[iso(x)]?.done){n++;x.setDate(x.getDate()-1)}return n}
function drawChart(){
  const names=new Set(['__bw']);uids().forEach(u=>Object.values(S.days[u]||{}).forEach(d=>(d.exercises||[]).forEach(e=>e.n&&names.add(e.n))));
  S.metric=names.has(S.metric)?S.metric:'__bw';
  $('#metric').innerHTML=[...names].map(n=>`<option value="${esc(n)}"${n===S.metric?' selected':''}>${n==='__bw'?'وزن الجسم':esc(n)+' (أعلى وزن)'}</option>`).join('');
  const ser=uids().map(u=>({u,p:Object.entries(S.days[u]||{}).sort().map(([k,d])=>[+new Date(k),S.metric==='__bw'?+d.bw:Math.max(0,...(d.exercises||[]).filter(e=>e.n===S.metric).map(e=>+e.w||0))]).filter(x=>x[1]>0)}));
  const all=ser.flatMap(s=>s.p);
  if(!all.length){$('#chart').innerHTML='<div class="empty">سجّل أوزانك لتظهر منحنيات التقدم هنا.</div>';return}
  const xs=all.map(a=>a[0]),vs=all.map(a=>a[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...vs)*.95,y1=Math.max(...vs)*1.05;
  const X=t=>x1===x0?330:50+(t-x0)/(x1-x0)*560,Y=v=>170-(v-y0)/((y1-y0)||1)*150,f=t=>new Date(t).toLocaleDateString('ar-EG',{day:'numeric',month:'short'});
  $('#chart').innerHTML=`<svg viewBox="0 0 620 195" role="img" aria-label="منحنى التقدم"><text x="4" y="24">${y1.toFixed(1)}</text><text x="4" y="172">${y0.toFixed(1)}</text><text x="50" y="190">${f(x0)}</text><text x="560" y="190">${f(x1)}</text>`+
   ser.map(s=>`<polyline pathLength="1" fill="none" stroke="${colorOf(s.u)}" stroke-width="2.5" points="${s.p.map(a=>X(a[0])+','+Y(a[1])).join(' ')}"/>`+s.p.map(a=>`<circle cx="${X(a[0])}" cy="${Y(a[1])}" r="4" fill="${colorOf(s.u)}"><title>${esc(nameOf(s.u))}: ${a[1]} (${f(a[0])})</title></circle>`).join('')).join('')+'</svg>';
}
let tt;$('#timer').onclick=e=>{const s=+e.target.dataset.s;if(!s)return;clearInterval(tt);let r=s;const v=$('#tv');v.textContent=r;
  tt=setInterval(()=>{r--;v.textContent=r>0?r:'انتهت الراحة';if(r<=0){clearInterval(tt);navigator.vibrate?.([300,100,300]);try{const c=new AudioContext(),o=c.createOscillator();o.connect(c.destination);o.start();o.stop(c.currentTime+.4)}catch{}}},1000)};
$('#exp').onclick=()=>{const b=new Blob([JSON.stringify({user:S.me.email,days:S.days[S.me.uid]||{}},null,1)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='gym-backup-'+iso(new Date())+'.json';a.click()};
document.documentElement.dataset.t=localStorage.t||'';
$('#theme').onclick=()=>{const d=(document.documentElement.dataset.t||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'))==='dark'?'light':'dark';document.documentElement.dataset.t=d;localStorage.t=d};

// ---------- حيوية وتجربة استخدام ----------
function goDay(n){const x=new Date(S.sel+'T00:00');x.setDate(x.getDate()+n);S.sel=iso(x);S.view=new Date(x);S.view.setDate(1);render();fx($('#panel'))}
let tx=0;
$('#panel').addEventListener('touchstart',e=>{tx=e.touches[0].clientX},{passive:true});
$('#panel').addEventListener('touchend',e=>{const d=e.changedTouches[0].clientX-tx;if(Math.abs(d)>100&&!e.target.closest('input,textarea,label'))goDay(d>0?-1:1)},{passive:true});
let tm;const T=document.createElement('div');T.id='toast';document.body.append(T);
function toast(t){T.textContent=t;T.classList.add('on');clearTimeout(tm);tm=setTimeout(()=>T.classList.remove('on'),1400)}
function confetti(){for(let i=0;i<30;i++){const c=document.createElement('i');c.className='cf';c.style.cssText=`left:${42+Math.random()*16}%;--x:${(Math.random()-.5)*380}px;--y:${-140-Math.random()*280}px;--r:${Math.random()*720}deg;background:${['#2f5bff','#e8590c','#1f9d55','#f5b301','#7c3aed'][i%5]}`;document.body.append(c);setTimeout(()=>c.remove(),1400)}}
$('#fab').onclick=()=>addExDlg();
$('#menu').onclick=async()=>{
  const v=await show(`<h3>القائمة</h3><p>${esc(S.me.email)}</p><form method="dialog" class="menu">${[['nm','✏️','تغيير اسمي'],['theme','🌓','تبديل الوضع الليلي / النهاري'],['exp','💾','نسخة احتياطية لبياناتي'],['logout','🚪','تسجيل الخروج']].map(([i,ic,t])=>`<button class="btn" value="${i}"><span>${ic}</span>${t}</button>`).join('')}<button class="btn" value="">إغلاق</button></form>`);
  if(v)$('#'+v).click();
};

// ---------- الواجهة الرئيسية والنوافذ ----------
const numF=(l,id,v='')=>`<label data-l="${l}"><input id="${id}" type="number" inputmode="decimal" step="any" min="0" value="${v}"></label>`;
async function addExDlg(){
  const p=show(`<h3>إضافة تمرين</h3><form method="dialog" class="dform"><label class="fl">اسم التمرين<input id="xn" list="exl" class="big" placeholder="مثال: بنش بريس" autocomplete="off" autofocus></label><div class="g3">${numF('مجموعات','xs',3)}${numF('عدّات','xr',10)}${numF('وزن كغ','xw')}</div><label class="fl">ملاحظة<input id="xt" placeholder="اختياري: الأداء، الإحساس، الجهاز…"></label><div class="dact"><button class="btn main" value="ok">إضافة</button><button class="btn" value="">إلغاء</button></div></form>`);
  $('#xw').oninput=()=>$('#xw').dataset.t=1;
  $('#xn').oninput=()=>{const w=lastW(S.me.uid,$('#xn').value.trim());if(w&&!$('#xw').dataset.t)$('#xw').value=w};
  const v=await p,n=$('#xn').value.trim();
  if(v==='ok'&&n)mutate(d=>d.exercises.push({n,s:+$('#xs').value||0,r:+$('#xr').value||0,w:+$('#xw').value||0,t:$('#xt').value.trim()}));
}
async function addMealDlg(){
  const v=await show(`<h3>إضافة وجبة</h3><form method="dialog" class="dform"><label class="fl">الوجبة<input id="mn" class="big" placeholder="مثال: رز ودجاج" autocomplete="off" autofocus></label><div class="g3">${numF('سعرات','mk')}${numF('بروتين جم','mp')}</div><div class="dact"><button class="btn main" value="ok">إضافة</button><button class="btn" value="">إلغاء</button></div></form>`),n=$('#mn').value.trim();
  if(v==='ok'&&n)mutate(d=>d.meals.push({n,k:+$('#mk').value||0,p:+$('#mp').value||0}));
}
function exInfo(u,i){
  const n=(dayData(u,S.sel).exercises?.[i]?.n||'').trim();if(!n)return;
  const L=exData(u)[n]||[],mx=a=>Math.max(0,...a),ser=uids().map(x=>({u:x,p:(exData(x)[n]||[]).map(y=>[y.k,y.w]).filter(a=>a[1]>0)}));
  show(`<h3>${esc(n)}</h3><p>${esc(nameOf(u))} · ${L.length} مرة</p>${kpis([['أعلى وزن',nf(mx(L.map(x=>x.w)))],['أفضل 1RM',nf(mx(L.map(x=>x.rm)))],['إجمالي الحجم',nf(L.reduce((a,x)=>a+x.v,0))]])}${chart('تطور الوزن',ser,'كغ')}<h4>آخر المرات</h4>${L.slice(-5).reverse().map(x=>`<div class="dl"><b>${fd(x.k)}</b><span>${x.s}×${x.r} · ${nf(x.w)} كغ</span>${x.t?`<small class="note">${esc(x.t)}</small>`:''}</div>`).join('')}<form method="dialog" class="dact"><button class="btn main">إغلاق</button></form>`);
}
function renderHero(){
  if(!S.me)return;
  const u=S.me.uid,Dd=S.days[u]||{},td=Dd[iso(new Date())],g=+S.profiles[u]?.goal||4,x=new Date();x.setDate(x.getDate()-x.getDay());
  let c=0;for(let i=0;i<7;i++){const y=new Date(x);y.setDate(x.getDate()+i);if(Dd[iso(y)]?.done)c++}
  const h=new Date().getHours(),gr=h<12?'صباح الخير':h<18?'مساء الخير':'مساء النور',n=(td?.exercises||[]).length;
  $('#hero').innerHTML=`<div><small>${gr}</small><h2>${esc(nameOf(u))}</h2><p>${td?.done?'✓ أنهيت تمرين اليوم، أحسنت!':n?'اليوم: '+esc(td.title||'تمرين')+' · '+n+' تمارين':'لا يوجد تمرين مجدول اليوم.'}</p><div class="hbtn"><button class="btn main" data-h="go">${n?'فتح تمرين اليوم':'ابدأ تمرين اليوم'}</button><button class="btn" data-h="goal">الهدف الأسبوعي</button></div></div><div class="ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="none" stroke="#ffffff40" stroke-width="7"/><circle cx="32" cy="32" r="27" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" pathLength="1" stroke-dasharray="${Math.min(1,c/g)} 1" transform="rotate(-90 32 32)"/></svg><b>${c}/${g}</b><small>هذا الأسبوع</small></div>`;
}
$('#hero').onclick=async e=>{
  const b=e.target.closest('[data-h]');if(!b)return;
  if(b.dataset.h==='go'){S.sel=iso(new Date());S.view=new Date();S.view.setDate(1);render();fx($('#panel'));$('#panel').scrollIntoView({behavior:'smooth'})}
  else{const v=await show(`<h3>الهدف الأسبوعي</h3><p>كم يوم تمرين تريد في الأسبوع؟</p><form method="dialog" class="dform"><input id="gv" type="number" inputmode="numeric" min="1" max="7" value="${+S.profiles[S.me.uid]?.goal||4}" class="big"><div class="dact"><button class="btn main" value="ok">حفظ</button><button class="btn" value="">إلغاء</button></div></form>`),n=Math.min(7,Math.max(1,+$('#gv').value||4));
    if(v==='ok')db.doc('users/'+S.me.uid).set({goal:n},{merge:true})}
};

// ---------- نوافذ وحركة ----------
const D=document.createElement('dialog');D.id='dlg';document.body.append(D);
D.onclick=e=>{if(e.target===D)D.close('')};
function show(html){D.innerHTML=`<div class="dbox">${html}</div>`;D.returnValue='';D.showModal();fx(D.firstElementChild);return new Promise(r=>D.addEventListener('close',()=>r(D.returnValue),{once:true}))}
const ask=(t,b,ok)=>show(`<h3>${t}</h3><p>${b}</p><form method="dialog" class="dact"><button class="btn main" value="ok">${ok}</button><button class="btn" value="">إلغاء</button></form>`).then(v=>v==='ok');
function fx(el){el.classList.remove('fx');void el.offsetWidth;el.classList.add('fx');setTimeout(()=>el.classList.remove('fx'),1100)}
async function showDay(u,k){
  const d=dayData(u,k),mine=u===S.me.uid;
  const ex=(d.exercises||[]).map((e,i)=>`<div class="dl"><b>${i+1}. ${esc(e.n||'—')}</b><span>${e.s||0}×${e.r||0} · ${nf(+e.w||0)} كغ · ${nf((+e.s||0)*(+e.r||0)*(+e.w||0))} حجم</span>${e.t?`<small class="note">${esc(e.t)}</small>`:''}</div>`).join('')||'<div class="empty">لا توجد تمارين.</div>';
  const ml=(d.meals||[]).map(m=>`<div class="dl"><b>${esc(m.n||'—')}</b><span>${nf(+m.k||0)} سعرة · ${nf(+m.p||0)} جم بروتين</span></div>`).join('')||'<div class="empty">لا توجد وجبات.</div>';
  const v=await show(`<h3>${fd(k)} · ${esc(nameOf(u))}</h3><p>${esc(d.title||'بدون عنوان')} ${d.done?'· ✓ تم التمرين':''}</p>${kpis([['الحجم (كغ)',nf(vol(d))],['السعرات',nf(kcal(d))],['وزن الجسم',d.bw?nf(+d.bw):'—']])}<h4>التمارين</h4>${ex}<h4>الأكل</h4>${ml}${d.note?`<h4>ملاحظات</h4><p>${esc(d.note)}</p>`:''}<form method="dialog" class="dact"><button class="btn main" value="open">${mine?'فتح اليوم للتعديل':'عرض في التقويم'}</button><button class="btn" value="">إغلاق</button></form>`);
  if(v==='open'){S.sel=k;S.view=new Date(k+'T00:00');S.view.setDate(1);setTab('day');render()}
}
const avgLine=(s,Y)=>{if(s.p.length<2)return '';const a=s.p.reduce((x,y)=>x+y[1],0)/s.p.length;return `<line x1="50" x2="610" y1="${Y(a)}" y2="${Y(a)}" stroke="${colorOf(s.u)}" stroke-opacity=".5" stroke-dasharray="5 4"/><text x="610" y="${Y(a)-4}" text-anchor="end" style="fill:${colorOf(s.u)}">المعدل ${nf(a)}</text>`};
function weekly(u,f,title,unit){
  const m={};Object.entries(S.days[u]||{}).forEach(([k,d])=>{const x=new Date(k+'T00:00');x.setDate(x.getDate()-x.getDay());const w=iso(x);m[w]=(m[w]||0)+f(d)});
  const ks=Object.keys(m).sort().slice(-8);if(!ks.length)return '';const mx=Math.max(...ks.map(k=>m[k]))||1,av=ks.reduce((a,k)=>a+m[k],0)/ks.length;
  return `<div class="cbox"><h4>${title} <small>${unit} · المعدل ${nf(av)}</small></h4><div class="bars">${ks.map(k=>`<div><span style="height:${Math.max(3,m[k]/mx*100)}%;background:${colorOf(u)}"></span><small>${nf(m[k])}</small><em>${new Date(k+'T00:00').toLocaleDateString('ar-EG',{day:'numeric',month:'short'})}</em></div>`).join('')}</div></div>`}

// ---------- السجل والتحليلات ----------
const who=()=>uids().includes(S.who)?S.who:S.me.uid;
const vol=d=>(d.exercises||[]).reduce((a,e)=>a+(+e.s||0)*(+e.r||0)*(+e.w||0),0);
const kcal=d=>(d.meals||[]).reduce((a,m)=>a+(+m.k||0),0);
const fd=k=>new Date(k+'T00:00').toLocaleDateString('ar-EG',{weekday:'short',day:'numeric',month:'short'});
const nf=v=>(Math.round(v*10)/10).toLocaleString('ar-EG');
const whoBar=()=>`<div class="seg">${uids().map(u=>`<button data-w="${u}" class="${u===who()?'on':''}" style="--c:${colorOf(u)}">${esc(nameOf(u))}</button>`).join('')}</div>`;
const kpis=a=>`<div class="kpis">${a.map(([l,v])=>`<div><b>${v}</b><small>${l}</small></div>`).join('')}</div>`;
function setTab(t){S.tab=t;document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.v===t));
  document.querySelectorAll('.vd').forEach(e=>e.hidden=t!=='day');$('#fab').hidden=t!=='day';$('#vLog').hidden=t!=='log';$('#vEx').hidden=t!=='ex';drawView();if(t==='day')fx($('#hero'));fx(t==='day'?$('#panel'):t==='log'?$('#vLog'):$('#vEx'))}
$('#tabs').onclick=e=>{const b=e.target.closest('button');if(b)setTab(b.dataset.v)};
function drawView(){if(S.tab==='log')renderLog();else if(S.tab==='ex')renderEx()}
function chart(title,sers,unit){
  const all=sers.flatMap(s=>s.p);
  if(!all.length)return `<div class="cbox"><h4>${title}</h4><div class="empty">لا توجد بيانات بعد.</div></div>`;
  const T=a=>+new Date(a+'T00:00'),xs=all.map(a=>T(a[0])),vs=all.map(a=>a[1]),x0=Math.min(...xs),x1=Math.max(...xs),lo=Math.min(...vs),hi=Math.max(...vs),pad=(hi-lo)*.1||1,y0=lo-pad,y1=hi+pad;
  const X=t=>x1===x0?330:50+(t-x0)/(x1-x0)*550,Y=v=>165-(v-y0)/(y1-y0)*140,f=t=>new Date(t).toLocaleDateString('ar-EG',{day:'numeric',month:'short'});
  return `<div class="cbox"><h4>${title} <small>${unit}</small></h4><svg viewBox="0 0 620 195" style="direction:ltr" role="img" aria-label="${title}"><line x1="50" x2="610" y1="165" y2="165" stroke="var(--line)"/><line x1="50" x2="610" y1="25" y2="25" stroke="var(--line)" stroke-dasharray="3"/><text x="44" y="29" text-anchor="end">${nf(y1)}</text><text x="44" y="169" text-anchor="end">${nf(y0)}</text><text x="50" y="188">${f(x0)}</text><text x="610" y="188" text-anchor="end">${f(x1)}</text>`+
  sers.map(s=>avgLine(s,Y)+`<polyline pathLength="1" fill="none" stroke="${colorOf(s.u)}" stroke-width="2.5" stroke-linejoin="round" points="${s.p.map(a=>X(T(a[0]))+','+Y(a[1])).join(' ')}"/>`+s.p.map(a=>`<circle cx="${X(T(a[0]))}" cy="${Y(a[1])}" r="4" fill="${colorOf(s.u)}"><title>${esc(nameOf(s.u))}: ${nf(a[1])} (${f(T(a[0]))})</title></circle>`).join('')).join('')+'</svg></div>';
}
function renderLog(){
  const u=who(),D=S.days[u]||{},q=($('#q')?.value||'').trim(),had=document.activeElement?.id==='q';
  const ks=Object.keys(D).filter(k=>{const d=D[k];return(d.exercises?.length||d.meals?.length||d.done||d.title)&&(!q||(d.title||'').includes(q)||(d.exercises||[]).some(e=>(e.n||'').includes(q)))}).sort().reverse();
  const dn=ks.filter(k=>D[k].done),tv=dn.reduce((a,k)=>a+vol(D[k]),0),mk=ks.filter(k=>D[k].meals?.length),ak=mk.length?mk.reduce((a,k)=>a+kcal(D[k]),0)/mk.length:0;
  const ser=f=>uids().map(x=>({u:x,p:Object.keys(S.days[x]||{}).sort().map(k=>[k,f(S.days[x][k])]).filter(a=>a[1]>0)}));
  $('#vLog').innerHTML=`<div class="tool">${whoBar()}<input id="q" type="search" placeholder="بحث باسم اليوم أو التمرين" value="${esc(q)}"></div>`+
  kpis([['أيام تمرين',dn.length],['إجمالي الحجم (كغ)',nf(tv)],['متوسط الحجم/جلسة',nf(dn.length?tv/dn.length:0)],['متوسط السعرات',nf(ak)]])+
  `<div class="charts">${weekly(u,d=>d.done?1:0,'جلسات التمرين أسبوعياً','جلسة')}${weekly(u,d=>d.done?vol(d):0,'حجم التمرين أسبوعياً','كغ')}${chart('حجم التمرين لكل يوم',ser(d=>d.done?vol(d):0),'كغ')}${chart('وزن الجسم',ser(d=>+d.bw),'كغ')}${chart('السعرات اليومية',ser(kcal),'سعرة')}</div>`+
  `<div class="loglist">${ks.map(k=>{const d=D[k];return `<button class="lg" data-d="${k}"><i class="${d.done?'ok':''}">${d.done?'✓':'○'}</i><span><b>${fd(k)}</b> ${esc(d.title||'')}</span><small>${(d.exercises||[]).length} تمارين · ${nf(vol(d))} كغ · ${nf(kcal(d))} سعرة${d.bw?' · '+d.bw+' كغ':''}</small><small>${esc((d.exercises||[]).map(e=>e.n).filter(Boolean).slice(0,5).join('، '))}</small></button>`}).join('')||'<div class="empty">لا توجد سجلات مطابقة.</div>'}</div>`;
  if(had){const i=$('#q');i.focus();i.setSelectionRange(q.length,q.length)}
}
function exData(u){const m={};Object.keys(S.days[u]||{}).sort().forEach(k=>(S.days[u][k].exercises||[]).forEach(e=>{const n=(e.n||'').trim();if(!n)return;const s=+e.s||0,r=+e.r||0,w=+e.w||0;(m[n]??=[]).push({k,s,r,w,t:e.t||'',v:s*r*w,rm:w*(1+r/30)})}));return m}
function renderEx(){
  const u=who(),M=exData(u),names=Object.keys(M).sort((a,b)=>M[b].length-M[a].length);
  if(!names.includes(S.exn))S.exn=names[0];
  const n=S.exn,L=M[n]||[],av=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0,mx=a=>Math.max(0,...a);
  let body='<div class="empty">سجّل تمارينك في تبويب «اليوم» لتظهر تحليلاتها هنا.</div>';
  if(L.length){
    const wk=Math.max(1,(new Date(L[L.length-1].k)-new Date(L[0].k))/6048e5),ch=L[0].w?(L[L.length-1].w-L[0].w)/L[0].w*100:0;
    const ser=f=>uids().map(x=>({u:x,p:(exData(x)[n]||[]).map(y=>[y.k,f(y)]).filter(a=>a[1]>0)}));
    body=kpis([['مرات التمرين',L.length],['أعلى وزن (كغ)',nf(mx(L.map(x=>x.w)))],['أفضل 1RM تقديري',nf(mx(L.map(x=>x.rm)))],['متوسط الوزن',nf(av(L.map(x=>x.w)))],['متوسط التكرارات',nf(av(L.map(x=>x.r)))],['متوسط المجموعات',nf(av(L.map(x=>x.s)))],['إجمالي الحجم',nf(L.reduce((a,x)=>a+x.v,0))],['مرات/أسبوع',nf(L.length/wk)],['التغيّر في الوزن',(ch>0?'+':'')+nf(ch)+'%']])+
    `<div class="charts">${chart('الوزن',ser(y=>y.w),'كغ')}${chart('حجم الجلسة',ser(y=>y.v),'كغ')}${chart('1RM تقديري',ser(y=>y.rm),'كغ')}${chart('التكرارات',ser(y=>y.r),'عدّة')}</div>`+
    `<div class="loglist"><h4>سجل «${esc(n)}»</h4>${[...L].reverse().map(x=>`<div class="hrow"><b>${fd(x.k)}</b><span>${x.s}×${x.r}</span><span>${nf(x.w)} كغ</span><span>${nf(x.v)} حجم</span>${x.t?`<small class="note">${esc(x.t)}</small>`:''}</div>`).join('')}</div>`;
  }
  $('#vEx').innerHTML=`<div class="tool">${whoBar()}</div><div class="chips">${names.map(x=>`<button data-n="${esc(x)}" class="${x===n?'on':''}">${esc(x)} <small>${M[x].length}</small></button>`).join('')}</div>`+body;
}
$('#vLog').onclick=e=>{const w=e.target.closest('[data-w]'),l=e.target.closest('.lg');
  if(w){S.who=w.dataset.w;renderLog()}
  if(l)showDay(who(),l.dataset.d)};
$('#vLog').oninput=e=>{if(e.target.id==='q')renderLog()};
$('#vEx').onclick=e=>{const w=e.target.closest('[data-w]'),c=e.target.closest('[data-n]');
  if(w){S.who=w.dataset.w;renderEx()}if(c){S.exn=c.dataset.n;renderEx()}};
$('#panel').onfocusin=e=>{if(e.target.type==='number')e.target.select()};

if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js'));
