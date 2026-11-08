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
const dayData=(u,d)=>S.days[u]?.[d]||routineDay(u,d)||{title:'',exercises:[],meals:[],note:'',done:false};

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
  const d=structuredClone(dayData(S.me.uid,S.sel));fn(d);delete d.fromRoutine;
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
    if(d.done){w++;vol+=(d.exercises||[]).reduce((a,e)=>a+evol(e),0)}
    (d.meals||[]).forEach(x=>{kcal+=+x.k||0;meals++});
  }
  return {w,vol,kcal};
}
function renderTop(){
  $('#stats').innerHTML=uids().map(u=>{const s=monthStats(u);return `<div class="stat" style="--c:${colorOf(u)}"><b>${esc(nameOf(u))}${u===S.me?.uid?' (أنت)':''}</b>
  <div class="nums"><div><span>${s.w}</span><small>يوم تمرين</small></div><div><span>${Math.round(s.vol).toLocaleString('ar-EG')}</span><small>حجم كغ</small></div><div><span>${s.kcal.toLocaleString('ar-EG')}</span><small>سعرات الشهر</small></div><div><span>${streak(u)}</span><small>أيام متتالية</small></div></div></div>`}).join('');
  $('#legend').innerHTML=uids().map(u=>`<span style="--c:${colorOf(u)}"><i></i>${esc(nameOf(u))}</span>`).join('');
  drawCal();drawView();renderHero();renderTimer();
}
function drawCal(){
  const y=S.view.getFullYear(),m=S.view.getMonth();
  $('#monthTitle').textContent=`${MONTHS[m]} ${y}`;
  let h=DOW.map(d=>`<div class="dow">${d.replace('ال','')}</div>`).join('');
  const start=new Date(y,m,1-new Date(y,m,1).getDay());
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);const k=iso(d);
    const dots=uids().map(u=>{const x=S.days[u]?.[k]||routineDay(u,k);return x&&(x.title||x.exercises?.length||x.done)?`<span class="dot${x.done?' done':''}${x.fromRoutine?' plan':''}" style="--c:${colorOf(u)}">${esc(x.title||'تمرين')}</span>`:''}).join('');
    h+=`<button class="day${d.getMonth()!==m?' out':''}${k===iso(new Date())?' today':''}${k===S.sel?' sel':''}" data-d="${k}"><span>${d.getDate()}</span><span class="dots">${dots}</span></button>`;
  }
  $('#grid').innerHTML=h;
}

// ---------- لوحة اليوم ----------
function card(u){
  const mine=u===S.me?.uid,d=dayData(u,S.sel),can=mine&&!d.done;
  const tot=(d.exercises||[]).reduce((a,e)=>a+evol(e),0);
  const kc=(d.meals||[]).reduce((a,x)=>a+(+x.k||0),0),pr=(d.meals||[]).reduce((a,x)=>a+(+x.p||0),0);
  const ex=(d.exercises||[]).map((e,i)=>exHTML(e,i,can,u)).join('')||'<div class="empty">لا توجد تمارين لهذا اليوم.</div>';
  const ml=(d.meals||[]).map((x,i)=>can?`<div class="row meal" data-i="${i}"><input data-m="n" value="${esc(x.n)}" placeholder="الوجبة"><label data-l="سعرات"><input data-m="k" type="number" inputmode="decimal" min="0" value="${esc(x.k)}" placeholder="سعرات"></label><label data-l="بروتين"><input data-m="p" type="number" inputmode="decimal" min="0" value="${esc(x.p)}" placeholder="بروتين"></label><span class="acts"><button data-a="mrm" aria-label="حذف">✕</button></span></div>`
    :`<div class="row meal"><span class="n">${esc(x.n)}</span><span>${esc(x.k)}</span><span>${esc(x.p)}</span><span></span></div>`).join('')||'<div class="empty">لا توجد وجبات مسجلة.</div>';
  return `<article class="pcard${can?'':' ro'}" style="--c:${colorOf(u)}" data-u="${u}">
  <h3>${esc(nameOf(u))}${mine?' (أنت)':''}<label class="check"><input type="checkbox" data-a="done" ${d.done?'checked':''} ${mine?'':'disabled'}>تم التمرين</label></h3>${mine&&d.done?'<div class="lock">🔒 اليوم مكتمل ولا يمكن تعديله. ألغِ «تم التمرين» لإعادة فتحه.</div>':''}
  ${can?`<input data-a="title" value="${esc(d.title)}" placeholder="اسم اليوم">`:`<h4>${esc(d.title||'بدون عنوان')}</h4>`}
  ${can?`<div class="row" style="grid-template-columns:1fr auto"><label>وزن الجسم (كغ) <input data-a="bw" type="number" inputmode="decimal" step="0.1" value="${esc(d.bw)}" style="width:90px"></label><span class="acts2"><button class="btn sm" data-a="copy">نسخ آخر تمرين</button><button class="btn sm" data-a="cpday">نسخ من يوم سابق</button><button class="btn sm" data-a="tplin">إدراج قالب يوم</button><button class="btn sm" data-a="tplsave">حفظ كقالب</button></span></div>`:(d.bw?`<div class="sum">وزن الجسم: ${esc(d.bw)} كغ</div>`:'')}
  ${ex}
  ${can?'<button class="btn sm" data-a="add">+ تمرين</button>':''}
  <div class="sum" data-sv>حجم اليوم: ${tot.toLocaleString('ar-EG')} كغ${prs(u,d)?` · 🏆 ${prs(u,d)} رقم قياسي`:''}</div>
  <div class="row hdr meal"><span>الأكل</span><span>سعرات</span><span>بروتين</span><span></span></div>${ml}
  ${can?'<button class="btn sm" data-a="madd">+ وجبة</button>':''}
  <div class="sum" data-sk>الإجمالي: ${kc.toLocaleString('ar-EG')} سعرة · ${pr} جم بروتين</div>
  ${can?`<div class="dnotes">${(notesArr(d).length?notesArr(d):['']).map((n,k)=>`<div class="exf"><input data-a="dnote" data-ni="${k}" class="note" value="${esc(n)}" placeholder="ملاحظة اليوم"><button data-a="nrm" data-ni="${k}" class="x" aria-label="حذف">✕</button></div>`).join('')}<button class="btn sm" data-a="nadd">+ ملاحظة</button></div>`:notesArr(d).map(n=>`<div class="sum">📝 ${esc(n)}</div>`).join('')}
  </article>`;
}
function renderPanel(){
  const dt=new Date(S.sel+'T00:00');
  const us=uids().sort((a,b)=>(a===S.me?.uid?-1:0)-(b===S.me?.uid?-1:0));
  $('#panel').innerHTML=`<datalist id="rl">${(prof().timer||[120,180,240]).map(x=>`<option value="${x}">`).join('')}</datalist><datalist id="exl">${[...new Set(Object.values(S.days[S.me?.uid]||{}).flatMap(d=>(d.exercises||[]).map(e=>e.n)).concat(libL().map(([,o])=>o.n)).filter(Boolean))].map(n=>`<option value="${esc(n)}">`).join('')}</datalist><div class="dh"><button class="btn" data-nav="-1" aria-label="اليوم السابق">›</button><h2>${DOW[dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]}${S.sel===iso(new Date())?' · اليوم':''}</h2><button class="btn" data-nav="1" aria-label="اليوم التالي">‹</button></div>`+us.map(card).join('');
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
  const a=b.dataset.a,i=+b.closest('[data-i]')?.dataset.i,j=+b.closest('[data-j]')?.dataset.j;
  if((a==='rm'||a==='mrm')&&!await ask('حذف','هل تريد حذف هذا العنصر؟ لا يمكن التراجع.','حذف'))return;
  if(a==='info')return exInfo(b.closest('.pcard').dataset.u,i);
  if(a==='add')return pickEx();
  if(a==='cpday')return copyFrom();
  if(a==='tplin')return useTpl();
  if(a==='tplsave')return saveTpl();
  if(a==='libsave')return saveLibEx(i);
  if(a==='madd')return addMealDlg();
  mutate(d=>{
    if(a==='copy'){const D=S.days[S.me.uid]||{},p=Object.keys(D).filter(k=>k<S.sel&&D[k].exercises?.length).sort().pop();if(p){d.title=d.title||D[p].title;d.exercises=structuredClone(D[p].exercises);d.exercises.forEach(e=>ensure(e).sets.forEach(x=>x.x=false))}else show('<h3>لا يوجد تمرين سابق</h3><p>سجّل تمارين في يوم سابق أولاً ثم انسخها.</p><form method="dialog" class="dact"><button class="btn main">حسناً</button></form>')}
    if(a==='sadd'){const e=ensure(d.exercises[i]),l=e.sets[e.sets.length-1]||{r:10,w:0};e.sets.push({r:l.r,w:l.w,x:false})}
    if(a==='sn'){const st=ensure(d.exercises[i]).sets[j];if(st.n==null)st.n='';else if(!st.n)delete st.n}
    if(a==='nadd'){d.notes=[...notesArr(d),''];delete d.note}
    if(a==='nrm'){const n=notesArr(d);n.splice(+b.dataset.ni,1);d.notes=n;delete d.note}
    if(a==='srm')ensure(d.exercises[i]).sets.splice(j,1);
    if(a==='add')d.exercises.push({n:'',s:3,r:10,w:0});
    if(a==='madd')d.meals.push({n:'',k:'',p:''});
    if(a==='rm')d.exercises.splice(i,1);
    if(a==='mrm')d.meals.splice(i,1);
    if(a==='up'&&i>0)[d.exercises[i-1],d.exercises[i]]=[d.exercises[i],d.exercises[i-1]];
    if(a==='dn'&&i<d.exercises.length-1)[d.exercises[i+1],d.exercises[i]]=[d.exercises[i],d.exercises[i+1]];
  });
};
$('#panel').onchange=async e=>{
  const t=e.target,a=t.dataset.a,row=t.closest('[data-i]'),i=+row?.dataset.i;
  if(t.dataset.s){const j=+t.closest('[data-j]').dataset.j,k=t.dataset.s;mutate(d=>{const st=ensure(d.exercises[i]).sets[j];if(k==='x')st.x=t.checked;else st[k]=k==='n'?t.value:+t.value},k==='x');if(k!=='x')updateSums();if(k==='x'&&t.checked){const r=+(S.days[S.me.uid]?.[S.sel]?.exercises||[])[i]?.rest||0;if(r>0)startTimer(r);else if(prof().auto!==false)startTimer((prof().timer||[120,180,240])[0])}return}
  if(t.dataset.k||t.dataset.m)return mutate(d=>{if(t.dataset.k)d.exercises[i][t.dataset.k]=t.type==='number'?+t.value:t.value;else d.meals[i][t.dataset.m]=t.type==='number'?+t.value:t.value},false)||updateSums();
  if(a==='bw')return mutate(d=>d.bw=+t.value||'',false);
  if(a==='done'){if(!t.checked&&!await ask('فتح اليوم للتعديل','اليوم مكتمل. هل تريد إعادة فتحه للتعديل؟','فتح')){t.checked=true;return}mutate(d=>d.done=t.checked);if(t.checked)confetti()}
  if(a==='title')mutate(d=>d.title=t.value.trim());
  if(a==='dnote'){const ni=+t.dataset.ni;mutate(d=>{const n=notesArr(d);n[ni]=t.value;d.notes=n.filter((x,k)=>(x||'').trim()||k===ni);delete d.note},false);return}
};

// ---------- مميزات إضافية ----------
function updateSums(){
  const d=dayData(S.me.uid,S.sel),c=document.querySelector(`.pcard[data-u="${S.me.uid}"]`);if(!c)return;
  const tot=(d.exercises||[]).reduce((a,e)=>a+evol(e),0),kc=(d.meals||[]).reduce((a,x)=>a+(+x.k||0),0),pr=(d.meals||[]).reduce((a,x)=>a+(+x.p||0),0),n=prs(S.me.uid,d);
  c.querySelector('[data-sv]').textContent=`حجم اليوم: ${tot.toLocaleString('ar-EG')} كغ${n?` · 🏆 ${n} رقم قياسي`:''}`;
  c.querySelector('[data-sk]').textContent=`الإجمالي: ${kc.toLocaleString('ar-EG')} سعرة · ${pr} جم بروتين`;
}
$('#nm').onclick=async()=>{const v=await show(`<h3>اسمك الظاهر</h3><form method="dialog" class="dform"><input id="dn" value="${esc(nameOf(S.me.uid))}" maxlength="20" autofocus><div class="dact"><button class="btn main" value="ok">حفظ</button><button class="btn" value="">إلغاء</button></div></form>`);const n=$('#dn').value.trim();if(v==='ok'&&n)db.doc('users/'+S.me.uid).set({name:n},{merge:true})};
function hist(u,n){return Object.entries(S.days[u]||{}).filter(([k,d])=>k<S.sel&&(d.exercises||[]).some(e=>e.n===n)).sort().map(([k,d])=>Math.max(...d.exercises.filter(e=>e.n===n).map(emax)))}
function lastW(u,n){const h=n?hist(u,n):[];return h.length?h[h.length-1]:''}
function prs(u,d){return d.done?(d.exercises||[]).filter(e=>e.n&&emax(e)>0&&emax(e)>Math.max(0,...hist(u,e.n))&&hist(u,e.n).length).length:0}
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

$('#exp').onclick=()=>{const b=new Blob([JSON.stringify({user:S.me.email,days:S.days[S.me.uid]||{}},null,1)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='gym-backup-'+iso(new Date())+'.json';a.click()};
document.documentElement.dataset.t=localStorage.t||'';
$('#theme').onclick=()=>{const d=(document.documentElement.dataset.t||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'))==='dark'?'light':'dark';document.documentElement.dataset.t=d;localStorage.t=d};

// ---------- مؤقت الراحة (دقيق وفي الخلفية) ----------
const TK='gymTimer',notesArr=d=>d.notes?[...d.notes]:d.note?[d.note]:[];
let tick,wl,actx;
function beep(){try{actx.resume?.();[0,.4,.8].forEach(t=>{const o=actx.createOscillator(),g=actx.createGain(),n=actx.currentTime+t;o.frequency.value=880;o.connect(g);g.connect(actx.destination);g.gain.setValueAtTime(.5,n);g.gain.exponentialRampToValueAtTime(.001,n+.32);o.start(n);o.stop(n+.32)})}catch{}}
function keepAwake(){navigator.wakeLock?.request('screen').then(l=>wl=l).catch(()=>{})}
function startTimer(sec){
  try{actx??=new(window.AudioContext||window.webkitAudioContext)();actx.resume?.()}catch{}
  const end=Date.now()+sec*1000;localStorage[TK]=end;
  if('Notification' in window&&Notification.permission==='default')Notification.requestPermission();
  keepAwake();navigator.serviceWorker?.controller?.postMessage({rest:sec*1000,id:end});runTimer();
}
function runTimer(){
  clearInterval(tick);const v=$('#tv');
  const f=()=>{const e=+localStorage[TK]||0;if(!e){v.textContent='راحة';return}
    const r=Math.ceil((e-Date.now())/1000);if(r>0){v.textContent=mmss(r);return}
    clearInterval(tick);localStorage.removeItem(TK);v.textContent='انتهت الراحة';wl?.release?.();
    if(Date.now()-e<10000&&prof().sound!==false){beep();navigator.vibrate?.([400,150,400,150,400]);
      if('Notification' in window&&Notification.permission==='granted')navigator.serviceWorker?.ready.then(r=>r.showNotification('انتهت الراحة 💪',{body:'ابدأ المجموعة التالية',tag:'rest',renotify:true,vibrate:[300,100,300]})).catch(()=>{})}};
  f();tick=setInterval(f,250);
}
$('#timer').onclick=e=>{
  if(e.target.id==='tx'){clearInterval(tick);localStorage.removeItem(TK);$('#tv').textContent='راحة';wl?.release?.();navigator.serviceWorker?.controller?.postMessage({cancel:1});return}
  const sec=+e.target.dataset.s;if(sec)startTimer(sec)};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&localStorage[TK]){runTimer();keepAwake()}});
if(localStorage[TK])runTimer();

// ---------- نسخ واختيار التمارين ----------
const msg=(h,p)=>show(`<h3>${h}</h3><p>${p}</p><form method="dialog" class="dact"><button class="btn main">حسناً</button></form>`);
const dstr=n=>{const x=new Date();x.setDate(x.getDate()+n);return iso(x)};
const clean=ex=>structuredClone(ex).map(e=>{ensure(e).sets.forEach(x=>{x.x=false;delete x.n});return e});
async function pickDate(t,p){const v=await show(`<h3>${t}</h3><p>${p}</p><form method="dialog" class="dform"><input id="cd" type="date" value="${dstr(1)}" class="big"><div class="dact"><button class="btn main" value="ok">نسخ</button><button class="btn" value="">إلغاء</button></div></form>`);return v==='ok'&&$('#cd').value?$('#cd').value:null}
const put=(k,o)=>{delete o.fromRoutine;db.doc(`users/${S.me.uid}/days/${k}`).set(o);toast('تم النسخ إلى '+fd(k)+' ✓')};
async function copyFrom(){
  const D0=S.days[S.me.uid]||{},ks=Object.keys(D0).filter(k=>k!==S.sel&&(D0[k].exercises||[]).length).sort().reverse().slice(0,60);
  if(!ks.length)return msg('لا توجد أيام سابقة','سجّل تمارين في يوم آخر أولاً ثم انسخها هنا.');
  const v=await show(`<h3>نسخ إلى ${fd(S.sel)}</h3><p>اختر يوماً كاملاً، أو افتح اليوم وعلّم التمارين التي تريد إضافتها.</p><form method="dialog" class="dform"><div class="plist">${ks.map(k=>{const d=D0[k];return `<details class="pd"><summary><b>${fd(k)}</b> ${esc(d.title||'')} <small>${d.exercises.length} تمارين${d.done?' ✓':''}</small></summary>${d.exercises.map((e,i)=>`<label class="pe"><input type="checkbox" data-pe="${k}|${i}"><span><b>${esc(e.n||'—')}</b><small>${SS(e).map(y=>(+y.r||0)+'×'+(+y.w||0)).join(' · ')}</small></span></label>`).join('')}<button class="btn sm" value="day:${k}">نسخ اليوم كله</button></details>`}).join('')}</div><div class="dact"><button class="btn main" value="add">إضافة المحدد</button><button class="btn" value="">إلغاء</button></div></form>`);
  if(!v)return;
  const cur=dayData(S.me.uid,S.sel);if(cur.done)return;
  if(v==='add'){
    const ex=[...D.querySelectorAll('input[data-pe]:checked')].flatMap(c=>{const [k,i]=c.dataset.pe.split('|');return clean([D0[k].exercises[+i]])});
    if(!ex.length)return toast('لم تحدد أي تمرين');
    return mutate(d=>d.exercises.push(...ex));
  }
  const src=D0[v.slice(4)];if(!src)return;
  let m='add';
  if((cur.exercises||[]).length)m=await show(`<h3>اليوم الحالي فيه تمارين</h3><p>ماذا تريد؟</p><form method="dialog" class="dact"><button class="btn main" value="add">إضافة للموجود</button><button class="btn" value="rep">استبدال</button><button class="btn" value="">إلغاء</button></form>`);
  if(!m)return;
  mutate(d=>{const ex=clean(src.exercises),ml=structuredClone(src.meals||[]);
    if(m==='rep'){d.exercises=ex;d.meals=ml}else{d.exercises.push(...ex);d.meals.push(...ml)}
    if(!d.title||m==='rep')d.title=src.title||d.title||''});
}
async function copyDay(){
  const k=await pickDate('نسخ اليوم','اختر اليوم الذي سيُنسخ إليه (التمارين والعنوان والأكل).');if(!k||k===S.sel)return;
  const t=structuredClone(dayData(S.me.uid,k)),d=dayData(S.me.uid,S.sel);
  if(t.done)return msg('اليوم مكتمل','لا يمكن النسخ إلى يوم مكتمل.');
  if((S.days[S.me.uid]?.[k]?.exercises||[]).length&&!await ask('استبدال','اليوم المختار فيه تمارين. هل تريد استبدالها؟','استبدال'))return;
  put(k,{...t,title:d.title||'',exercises:clean(d.exercises||[]),meals:structuredClone(d.meals||[]),done:false});
}
async function copyEx(i){
  const e=dayData(S.me.uid,S.sel).exercises[i];if(!e)return;
  const k=await pickDate('نسخ التمرين «'+esc(e.n||'')+'»','اختر اليوم الذي سيُضاف إليه التمرين بمجموعاته.');if(!k)return;
  const t=structuredClone(dayData(S.me.uid,k));if(t.done)return msg('اليوم مكتمل','لا يمكن النسخ إلى يوم مكتمل.');
  put(k,{...t,exercises:[...(t.exercises||[]),...clean([e])]});
}
const libL=()=>Object.entries(prof().lib||{}).sort((a,b)=>(a[1].n||'').localeCompare(b[1].n||'','ar'));
const tplL=()=>Object.entries(prof().tpl||{}).sort((a,b)=>(a[1].title||'').localeCompare(b[1].title||'','ar'));
const uid36=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const setsTxt=a=>SS({sets:a}).map(y=>(+y.r||0)+'×'+(+y.w||0)).join(' · ');
const fmtSets=a=>SS({sets:a}).map(x=>(+x.r||0)+'x'+(+x.w||0)).join(', ');
const parseSets=t=>t.split(/[,،]/).map(z=>z.trim()).filter(Boolean).map(z=>{const [a,b]=z.split(/x|×|\*/i);return{r:+a||0,w:+b||0}});
const putP=(path,val)=>db.doc('users/'+S.me.uid).update({[path]:val});
const DEL=()=>firebase.firestore.FieldValue.delete();
const fromLib=o=>({n:o.n,t:o.t||'',rest:+o.rest||0,sets:(o.sets&&o.sets.length?o.sets:[{r:'',w:''}]).map(x=>({r:x.r,w:x.w,x:false}))});
const tplEx=e=>({n:e.n||'',t:e.t||'',rest:+e.rest||0,sets:SS(e).map(x=>({r:x.r,w:x.w}))});
async function pickEx(){
  const M=exData(S.me.uid),LB=libL(),inLib=new Set(LB.map(([,o])=>o.n)),hist=Object.keys(M).filter(n=>!inLib.has(n)).sort((a,b)=>M[b].at(-1).k.localeCompare(M[a].at(-1).k));
  const p=show(`<h3>اختيار تمرين</h3><form method="dialog" class="dform"><input id="pq" type="search" class="big" placeholder="ابحث باسم التمرين أو اكتب اسماً جديداً" autocomplete="off" autofocus><div id="pl" class="plist"></div><button class="btn" value="">إغلاق</button></form>`);
  const draw=()=>{const q=$('#pq').value.trim(),
    a=LB.filter(([,o])=>(o.n||'').includes(q)).map(([id,o])=>`<button class="pi" value="L:${id}"><b>${esc(o.n)}</b><small>${o.rest?'راحة '+o.rest+' ث · ':''}${(o.sets||[]).length?setsTxt(o.sets):'بدون مجموعات محفوظة'}</small></button>`),
    b=hist.filter(n=>n.includes(q)).map(n=>{const l=M[n].at(-1);return `<button class="pi" value="H:${esc(n)}"><b>${esc(n)}</b><small>من سجلّك · آخر مرة ${fd(l.k)} · ${setsTxt(l.ss)}</small></button>`}),
    nw=q&&!inLib.has(q)&&!M[q]?[`<button class="pi new" value="N:${esc(q)}"><b>➕ إنشاء «${esc(q)}» وحفظه في المكتبة</b></button>`]:[];
    $('#pl').innerHTML=[...nw,...a,...b].join('')||'<div class="empty">لا توجد تمارين محفوظة بعد. اكتب اسم التمرين لإنشائه.</div>'};
  $('#pq').oninput=draw;draw();
  const v=await p;if(!v)return;const [k,...r]=v.split(':'),val=r.join(':');let ex;
  if(k==='L')ex=fromLib(prof().lib[val]);
  else if(k==='H'){const l=M[val].at(-1);ex={n:val,t:'',rest:l.rest||0,sets:l.ss.map(y=>({r:y.r,w:y.w,x:false}))}}
  else{ex={n:val,t:'',rest:0,sets:[{r:'',w:'',x:false}]};putP('lib.'+uid36(),{n:val,rest:0,sets:[],t:''})}
  mutate(d=>d.exercises.push(ex));
}
async function editLibEx(id){
  const o=prof().lib?.[id]||{};
  const v=await show(`<h3>${id?'تعديل التمرين':'تمرين جديد'}</h3><form method="dialog" class="dform"><label class="fl">اسم التمرين<input id="ln" class="big" value="${esc(o.n||'')}" autofocus></label><label class="fl">وقت الراحة بين المجموعات (ثانية)<input id="lr" type="number" inputmode="numeric" min="0" value="${o.rest||''}"></label><label class="fl">المجموعات الافتراضية: تكرارات x وزن، مفصولة بفاصلة<input id="ls" value="${esc(o.sets?fmtSets(o.sets):'')}" placeholder="تكرارات x وزن، …"></label><label class="fl">ملاحظة<input id="lt" value="${esc(o.t||'')}"></label><div class="dact"><button class="btn main" value="ok">حفظ</button><button class="btn" value="">إلغاء</button></div></form>`);
  const n=$('#ln').value.trim();if(v!=='ok'||!n)return;
  putP('lib.'+(id||uid36()),{n,rest:+$('#lr').value||0,sets:parseSets($('#ls').value),t:$('#lt').value.trim()});toast('تم الحفظ ✓');
}
async function editTpl(id){
  const o=prof().tpl?.[id]||{},LB=libL();
  if(!LB.length)return msg('المكتبة فارغة','أضف تمارين إلى المكتبة أولاً ثم كوّن منها قالب اليوم.');
  const pos=n=>{const i=(o.exercises||[]).findIndex(e=>e.n===n);return i<0?'':i+1};
  const v=await show(`<h3>${id?'تعديل قالب اليوم':'قالب يوم جديد'}</h3><form method="dialog" class="dform"><label class="fl">اسم اليوم<input id="tn" class="big" value="${esc(o.title||'')}" placeholder="اسم اليوم" autofocus></label><p class="sum">اكتب رقم الترتيب بجانب كل تمرين تريده في هذا اليوم (1 ثم 2 ثم 3…). اترك الخانة فارغة لاستبعاده.</p><div class="plist">${LB.map(([k,e])=>`<label class="pe"><input type="number" min="1" class="ord" data-lo="${k}" value="${pos(e.n)}" placeholder="#"><span><b>${esc(e.n)}</b><small>${e.rest?'راحة '+e.rest+' ث · ':''}${(e.sets||[]).length?setsTxt(e.sets):''}</small></span></label>`).join('')}</div><div class="dact"><button class="btn main" value="ok">حفظ</button><button class="btn" value="">إلغاء</button></div></form>`);
  if(v!=='ok')return;
  const ch=[...D.querySelectorAll('input[data-lo]')].filter(i=>+i.value>0).sort((a,b)=>+a.value-+b.value).map(i=>tplEx(fromLib(prof().lib[i.dataset.lo])));
  const title=$('#tn').value.trim();if(!ch.length&&!title)return;
  putP('tpl.'+(id||uid36()),{title,exercises:ch,meals:o.meals||[]});toast('تم حفظ القالب ✓');
}
async function saveTpl(){
  const d=dayData(S.me.uid,S.sel);if(!(d.exercises||[]).length)return msg('لا توجد تمارين','أضف تمارين لليوم أولاً ثم احفظه كقالب.');
  const v=await show(`<h3>حفظ اليوم كقالب</h3><form method="dialog" class="dform"><label class="fl">اسم القالب<input id="tn" class="big" value="${esc(d.title||'')}" autofocus></label><div class="dact"><button class="btn main" value="ok">حفظ</button><button class="btn" value="">إلغاء</button></div></form>`);
  const t=$('#tn').value.trim();if(v!=='ok'||!t)return;
  const have=new Set(libL().map(([,o])=>o.n));
  d.exercises.forEach(e=>{const n=(e.n||'').trim();if(n&&!have.has(n)){have.add(n);putP('lib.'+uid36(),{n,rest:+e.rest||0,sets:SS(e).map(x=>({r:x.r,w:x.w})),t:e.t||''})}});
  putP('tpl.'+uid36(),{title:t,exercises:d.exercises.map(tplEx),meals:structuredClone(d.meals||[])});toast('تم حفظ القالب ✓');
}
async function saveLibEx(i){
  const e=dayData(S.me.uid,S.sel).exercises[i],n=(e?.n||'').trim();if(!n)return msg('بدون اسم','اكتب اسم التمرين أولاً.');
  const id=libL().find(([,o])=>o.n===n)?.[0]||uid36();
  putP('lib.'+id,{n,rest:+e.rest||0,sets:SS(e).map(x=>({r:x.r,w:x.w})),t:e.t||''});toast('تم حفظه في المكتبة ✓');
}
async function useTpl(id){
  if(!id){const T=tplL();if(!T.length)return msg('لا توجد قوالب','أنشئ قالب يوم من صفحة المكتبة أو احفظ اليوم الحالي كقالب.');
    id=await show(`<h3>إدراج قالب يوم</h3><form method="dialog" class="dform"><div class="plist">${T.map(([k,t])=>`<button class="pi" value="${k}"><b>${esc(t.title||'بدون اسم')}</b><small>${(t.exercises||[]).map(e=>esc(e.n)).join('، ')}</small></button>`).join('')}</div><button class="btn" value="">إلغاء</button></form>`);if(!id)return}
  const t=prof().tpl?.[id];if(!t)return;const cur=dayData(S.me.uid,S.sel);
  if(cur.done)return msg('اليوم مكتمل','لا يمكن التعديل على يوم مكتمل.');
  let m='add';
  if((cur.exercises||[]).length)m=await show(`<h3>اليوم الحالي فيه تمارين</h3><p>ماذا تريد؟</p><form method="dialog" class="dact"><button class="btn main" value="add">إضافة للموجود</button><button class="btn" value="rep">استبدال</button><button class="btn" value="">إلغاء</button></form>`);
  if(!m)return;
  mutate(d=>{const ex=(t.exercises||[]).map(fromLib),ml=structuredClone(t.meals||[]);
    if(m==='rep'){d.exercises=ex;d.meals=ml}else{d.exercises.push(...ex);d.meals.push(...ml)}
    if(m==='rep'||!d.title)d.title=t.title||d.title||''});
}
function renderLibPage(){
  const LB=libL(),T=tplL();
  $('#vLib').innerHTML=`<div class="sbox"><h3>مكتبة التمارين</h3><p class="sum">تمارينك المحفوظة بالاسم ووقت الراحة والمجموعات الافتراضية.</p>${LB.map(([id,o])=>`<div class="lib"><div><b>${esc(o.n)}</b><small>${o.rest?'راحة '+o.rest+' ث':'بدون وقت راحة'} · ${(o.sets||[]).length?setsTxt(o.sets):'بدون مجموعات'}${o.t?' · '+esc(o.t):''}</small></div><span class="acts2"><button class="btn sm" data-le="${id}">تعديل</button><button class="btn sm" data-ld="${id}">حذف</button></span></div>`).join('')||'<div class="empty">لا توجد تمارين بعد.</div>'}<button class="btn main sm" data-le="">+ تمرين جديد</button></div>
  <div class="sbox"><h3>قوالب الأيام</h3><p class="sum">يوم تمرين كامل تحفظه وتدرجه في أي يوم.</p>${T.map(([id,t])=>`<div class="lib"><div><b>${esc(t.title||'بدون اسم')}</b><small>${(t.exercises||[]).map(e=>esc(e.n)).join('، ')||'بدون تمارين'}</small></div><span class="acts2"><button class="btn sm" data-tu="${id}">استخدام في اليوم المحدد</button><button class="btn sm" data-te="${id}">تعديل</button><button class="btn sm" data-td="${id}">حذف</button></span></div>`).join('')||'<div class="empty">لا توجد قوالب بعد.</div>'}<button class="btn main sm" data-te="">+ قالب يوم جديد</button></div>`;
}
$('#vLib').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if('le' in d)return editLibEx(d.le);
  if('te' in d)return editTpl(d.te);
  if('ld' in d){if(await ask('حذف التمرين','سيُحذف من المكتبة فقط، ولن يتأثر سجلّك.','حذف'))putP('lib.'+d.ld,DEL());return}
  if('td' in d){if(await ask('حذف القالب','هل تريد حذف هذا القالب؟','حذف'))putP('tpl.'+d.td,DEL());return}
  if('tu' in d){await useTpl(d.tu);setTab('day')}};
// ---------- مجموعات، روتين، إعدادات ----------
const SS=e=>e.sets||Array.from({length:+e.s||0},()=>({r:+e.r||0,w:+e.w||0}));
const evol=e=>SS(e).reduce((a,x)=>a+(+x.r||0)*(+x.w||0),0);
const emax=e=>Math.max(0,...SS(e).map(x=>+x.w||0));
const ensure=e=>{if(!e.sets)e.sets=SS(e).map(x=>({...x}));return e};
const mmss=r=>Math.floor(r/60)+':'+String(r%60).padStart(2,'0');
function routineDay(u,k){if(k<iso(new Date()))return null;const r=S.profiles[u]?.routine?.[new Date(k+'T00:00').getDay()];
  return r?{title:r.title||'',exercises:(r.exercises||[]).map(e=>({n:e.n,t:e.t||'',rest:e.rest||0,sets:SS(e).map(x=>({r:x.r,w:x.w,x:false}))})),meals:structuredClone(r.meals||[]),note:'',done:false,fromRoutine:true}:null}
function renderTimer(){const a=S.profiles[S.me?.uid]?.timer||[120,180,240];$('#tb').innerHTML=a.map(x=>`<button data-s="${x}">${x}</button>`).join('')}
function exHTML(e,i,can,u){
  const ss=SS(e),all=ss.length&&ss.every(x=>x.x),cl=`ex${all?' dn':''}`;
  if(!can)return `<div class="${cl}" data-i="${i}"><div class="exh"><button class="lk exn" data-a="info">${i+1}. ${esc(e.n||'—')}</button></div>${ss.map((x,j)=>`<div class="set${x.x?' dn':''}"><span class="sn">${j+1}</span><span>${+x.r||0} عدّة</span><span>${nf(+x.w||0)} كغ</span><span>${x.x?'✓':''}</span>${x.n?`<small class="note">${esc(x.n)}</small>`:''}</div>`).join('')}${e.t?`<small class="note">${esc(e.t)}</small>`:''}${e.rest?`<small class="note">⏱ راحة ${e.rest} ث</small>`:''}</div>`;
  const lw=lastW(u,e.n)||'';
  return `<div class="${cl}" data-i="${i}"><div class="exh"><input data-k="n" list="exl" class="exn" value="${esc(e.n)}" placeholder="اسم التمرين"><span class="acts"><button data-a="info" aria-label="تفاصيل">ⓘ</button><button data-a="libsave" aria-label="حفظ في المكتبة" title="حفظ في المكتبة">💾</button><button data-a="up" aria-label="أعلى">▲</button><button data-a="dn" aria-label="أسفل">▼</button><button data-a="rm" aria-label="حذف التمرين">✕</button></span></div><div class="set hd"><span>#</span><span>عدّات</span><span>وزن كغ</span><span>تم</span><span></span><span></span></div>`+
  ss.map((x,j)=>`<div class="set${x.x?' dn':''}" data-j="${j}"><span class="sn">${j+1}</span><input data-s="r" type="number" inputmode="decimal" value="${esc(x.r)}" placeholder="عدّات"><input data-s="w" type="number" inputmode="decimal" step="any" value="${esc(x.w)}" placeholder="${lw||'وزن'}"><input data-s="x" type="checkbox" class="ck" ${x.x?'checked':''} aria-label="تم"><button data-a="sn" class="x" aria-label="ملاحظة المجموعة">📝</button><button data-a="srm" class="x" aria-label="حذف المجموعة">✕</button>${x.n!=null?`<input data-s="n" class="snote" value="${esc(x.n)}" placeholder="ملاحظة هذه المجموعة…">`:''}</div>`).join('')+
  `<div class="exf"><button class="btn sm" data-a="sadd">+ مجموعة</button><label class="rest" title="وقت الراحة بين المجموعات لهذا التمرين">⏱<input data-k="rest" list="rl" type="number" inputmode="numeric" min="0" max="3600" value="${e.rest||''}" placeholder="راحة ث"></label><input data-k="t" class="note" value="${esc(e.t)}" placeholder="ملاحظة على التمرين…"></div></div>`;
}
const prof=()=>S.profiles[S.me?.uid]||{};
const saveP=o=>{db.doc('users/'+S.me.uid).set(o,{merge:true});toast('تم الحفظ ✓')};
const fmtEx=a=>(a||[]).map(e=>e.n+': '+SS(e).map(x=>(+x.r||0)+'x'+(+x.w||0)).join(', ')+(e.rest?' | '+e.rest:'')).join('\n');
const parseEx=t=>t.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{const [main,rs]=l.split('|'),[n,...r]=main.split(':'),sets=r.join(':').split(/[,،]/).map(z=>z.trim()).filter(Boolean).map(z=>{const [a,b]=z.split(/x|×|\*/i);return{r:+a||0,w:+b||0}});return{n:n.trim(),t:'',rest:+rs||0,sets:sets.length?sets:[{r:10,w:0}]}});
function renderSet(){
  const p=prof(),rt=p.routine||{};
  $('#vSet').innerHTML=`<div class="sbox"><h3>الحساب</h3><label class="fl">الاسم الظاهر<input id="sn" value="${esc(p.name||'')}" maxlength="20"></label><div class="sum">${esc(S.me.email)}</div><button class="btn" id="slo">تسجيل الخروج</button></div>
  <div class="sbox"><h3>المظهر</h3><label class="fl">الوضع<select id="sth"><option value="">تلقائي (حسب الجهاز)</option><option value="light">نهاري</option><option value="dark">ليلي</option></select></label></div>
  <div class="sbox"><h3>التدريب</h3><label class="fl">الهدف الأسبوعي (عدد الأيام)<input id="sg" type="number" min="1" max="7" value="${+p.goal||4}"></label><label class="fl">أزمنة مؤقت الراحة بالثواني (افصل بفاصلة)<input id="st" value="${(p.timer||[120,180,240]).join(', ')}"></label><label class="check"><input type="checkbox" id="sa" ${p.auto===false?'':'checked'}>بدء مؤقت الراحة تلقائياً عند تعليم مجموعة</label><label class="check"><input type="checkbox" id="ss" ${p.sound===false?'':'checked'}>صوت واهتزاز وإشعار عند انتهاء الراحة</label></div>
  <div class="sbox"><h3>الروتين الأسبوعي</h3><p class="sum">تمارين ثابتة تظهر تلقائياً في اليوم المحدد (من اليوم فصاعداً) وتقدر تعدّل عليها.</p>${DOW.map((n,i)=>`<div class="rr"><b>${n}</b><span>${rt[i]?esc(rt[i].title||'روتين')+' · '+(rt[i].exercises||[]).length+' تمارين':'راحة'}</span><button class="btn sm" data-r="${i}">تعديل</button>${rt[i]?`<button class="btn sm" data-rc="${i}">مسح</button>`:''}</div>`).join('')}</div>
  <div class="sbox"><h3>البيانات</h3><div class="hbtn"><button class="btn" id="sex">تصدير نسخة احتياطية</button><label class="btn">استيراد نسخة<input id="sim" type="file" accept="application/json" hidden></label></div></div>`;
  $('#sth').value=localStorage.t||'';
}
async function editRoutine(i){
  const r=prof().routine?.[i]||{};
  const pr=show(`<h3>روتين ${DOW[i]}</h3><form method="dialog" class="dform">${tplL().length?`<label class="fl">تعبئة من قالب محفوظ<select id="rtp"><option value="">—</option>${tplL().map(([k,t])=>`<option value="${k}">${esc(t.title||'بدون اسم')}</option>`).join('')}</select></label>`:''}<label class="fl">اسم اليوم<input id="rt" value="${esc(r.title||'')}" placeholder="الاسم"></label><label class="fl">التمارين: سطر لكل تمرين بالصيغة  الاسم: تكرارات x وزن، … | ثواني الراحة (اختياري)<textarea id="rx" rows="7" placeholder="الاسم: تكرارات x وزن، … | ثواني الراحة">${esc(fmtEx(r.exercises))}</textarea></label><div class="dact"><button class="btn main" value="ok">حفظ</button><button class="btn" value="">إلغاء</button></div></form>`);
  const sl=$('#rtp');if(sl)sl.onchange=()=>{const t=prof().tpl?.[sl.value];if(t){$('#rt').value=t.title||'';$('#rx').value=fmtEx(t.exercises)}};const v=await pr;
  if(v==='ok'){const ex=parseEx($('#rx').value),t=$('#rt').value.trim();if(!ex.length&&!t)return;db.doc('users/'+S.me.uid).update({['routine.'+i]:{title:t,exercises:ex}});toast('تم حفظ الروتين ✓')}
}
async function importData(f){
  try{const ds=JSON.parse(await f.text()).days||{},ks=Object.keys(ds);
    if(!ks.length||!await ask('استيراد نسخة','سيتم دمج '+ks.length+' يوم مع بياناتك (الأيام المتطابقة تُستبدل).','استيراد'))return;
    for(let i=0;i<ks.length;i+=400){const b=db.batch();ks.slice(i,i+400).forEach(k=>b.set(db.doc(`users/${S.me.uid}/days/${k}`),ds[k]));b.commit()}toast('جارٍ الاستيراد…')}
  catch{show('<h3>ملف غير صالح</h3><p>اختر ملف نسخة احتياطية صحيح.</p><form method="dialog" class="dact"><button class="btn main">حسناً</button></form>')}
}
$('#vSet').onchange=e=>{const t=e.target;
  if(t.id==='sn'&&t.value.trim())saveP({name:t.value.trim()});
  if(t.id==='sg')saveP({goal:Math.min(7,Math.max(1,+t.value||4))});
  if(t.id==='st'){const a=t.value.split(/[,،\s]+/).map(Number).filter(x=>x>0&&x<=3600).slice(0,5);saveP({timer:a.length?a:[120,180,240]})}
  if(t.id==='sa')saveP({auto:t.checked});
  if(t.id==='ss')saveP({sound:t.checked});
  if(t.id==='sth'){document.documentElement.dataset.t=t.value;localStorage.t=t.value}
  if(t.id==='sim'&&t.files[0])importData(t.files[0])};
$('#vSet').onclick=async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.id==='slo')return auth.signOut();if(b.id==='sex')return $('#exp').click();
  if('rc' in b.dataset&&await ask('مسح الروتين','هل تريد مسح روتين هذا اليوم؟','مسح')){await db.doc('users/'+S.me.uid).update({['routine.'+b.dataset.rc]:firebase.firestore.FieldValue.delete()});renderSet()}
  if('r' in b.dataset)editRoutine(+b.dataset.r)};

// ---------- حيوية وتجربة استخدام ----------
function goDay(n){const x=new Date(S.sel+'T00:00');x.setDate(x.getDate()+n);S.sel=iso(x);S.view=new Date(x);S.view.setDate(1);render();fx($('#panel'))}
let tx=0;
$('#panel').addEventListener('touchstart',e=>{tx=e.touches[0].clientX},{passive:true});
$('#panel').addEventListener('touchend',e=>{const d=e.changedTouches[0].clientX-tx;if(Math.abs(d)>100&&!e.target.closest('input,textarea,label'))goDay(d>0?-1:1)},{passive:true});
let tm;const T=document.createElement('div');T.id='toast';document.body.append(T);
function toast(t){T.textContent=t;T.classList.add('on');clearTimeout(tm);tm=setTimeout(()=>T.classList.remove('on'),1400)}
function confetti(){for(let i=0;i<30;i++){const c=document.createElement('i');c.className='cf';c.style.cssText=`left:${42+Math.random()*16}%;--x:${(Math.random()-.5)*380}px;--y:${-140-Math.random()*280}px;--r:${Math.random()*720}deg;background:${['#2f5bff','#e8590c','#1f9d55','#f5b301','#7c3aed'][i%5]}`;document.body.append(c);setTimeout(()=>c.remove(),1400)}}
$('#fab').onclick=()=>pickEx();
$('#menu').onclick=async()=>{
  const v=await show(`<h3>القائمة</h3><p>${esc(S.me.email)}</p><form method="dialog" class="menu">${[['nm','✏️','تغيير اسمي'],['theme','🌓','تبديل الوضع الليلي / النهاري'],['exp','💾','نسخة احتياطية لبياناتي'],['logout','🚪','تسجيل الخروج']].map(([i,ic,t])=>`<button class="btn" value="${i}"><span>${ic}</span>${t}</button>`).join('')}<button class="btn" value="">إغلاق</button></form>`);
  if(v)$('#'+v).click();
};

// ---------- الواجهة الرئيسية والنوافذ ----------
const numF=(l,id,v='')=>`<label data-l="${l}"><input id="${id}" type="number" inputmode="decimal" step="any" min="0" value="${v}"></label>`;
async function addExDlg(){
  const p=show(`<h3>إضافة تمرين</h3><form method="dialog" class="dform"><label class="fl">اسم التمرين<input id="xn" list="exl" class="big" placeholder="الاسم" autocomplete="off" autofocus></label><div class="g3">${numF('مجموعات','xs',3)}${numF('عدّات','xr',10)}${numF('وزن كغ','xw')}</div><label class="fl">ملاحظة<input id="xt" placeholder="اختياري"></label><div class="dact"><button class="btn main" value="ok">إضافة</button><button class="btn" value="">إلغاء</button></div></form>`);
  $('#xw').oninput=()=>$('#xw').dataset.t=1;
  $('#xn').oninput=()=>{const w=lastW(S.me.uid,$('#xn').value.trim());if(w&&!$('#xw').dataset.t)$('#xw').value=w};
  const v=await p,n=$('#xn').value.trim();
  if(v==='ok'&&n)mutate(d=>d.exercises.push({n,t:$('#xt').value.trim(),sets:Array.from({length:Math.min(12,+$('#xs').value||3)},()=>({r:+$('#xr').value||10,w:+$('#xw').value||0,x:false}))}));
}
async function addMealDlg(){
  const v=await show(`<h3>إضافة وجبة</h3><form method="dialog" class="dform"><label class="fl">الوجبة<input id="mn" class="big" placeholder="الاسم" autocomplete="off" autofocus></label><div class="g3">${numF('سعرات','mk')}${numF('بروتين جم','mp')}</div><div class="dact"><button class="btn main" value="ok">إضافة</button><button class="btn" value="">إلغاء</button></div></form>`),n=$('#mn').value.trim();
  if(v==='ok'&&n)mutate(d=>d.meals.push({n,k:+$('#mk').value||0,p:+$('#mp').value||0}));
}
function exInfo(u,i){
  const n=(dayData(u,S.sel).exercises?.[i]?.n||'').trim();if(!n)return;
  const L=exData(u)[n]||[],mx=a=>Math.max(0,...a),ser=uids().map(x=>({u:x,p:(exData(x)[n]||[]).map(y=>[y.k,y.w]).filter(a=>a[1]>0)}));
  show(`<h3>${esc(n)}</h3><p>${esc(nameOf(u))} · ${L.length} مرة</p>${kpis([['أعلى وزن',nf(mx(L.map(x=>x.w)))],['أفضل 1RM',nf(mx(L.map(x=>x.rm)))],['إجمالي الحجم',nf(L.reduce((a,x)=>a+x.v,0))]])}${chart('تطور الوزن',ser,'كغ')}<h4>آخر المرات</h4>${L.slice(-5).reverse().map(x=>`<div class="dl"><b>${fd(x.k)}</b><span>${x.ss.map(y=>(+y.r||0)+'×'+(+y.w||0)).join(' · ')}</span>${x.t?`<small class="note">${esc(x.t)}</small>`:''}</div>`).join('')}<form method="dialog" class="dact"><button class="btn main">إغلاق</button></form>`);
}
function renderHero(){
  if(!S.me)return;
  const u=S.me.uid,Dd=S.days[u]||{},td=dayData(u,iso(new Date())),g=+S.profiles[u]?.goal||4,x=new Date();x.setDate(x.getDate()-x.getDay());
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
  const ex=(d.exercises||[]).map((e,i)=>`<div class="dl"><b>${i+1}. ${esc(e.n||'—')}</b><span>${SS(e).map(y=>(+y.r||0)+'×'+(+y.w||0)).join(' · ')} · ${nf(evol(e))} حجم</span>${e.t?`<small class="note">${esc(e.t)}</small>`:''}</div>`).join('')||'<div class="empty">لا توجد تمارين.</div>';
  const ml=(d.meals||[]).map(m=>`<div class="dl"><b>${esc(m.n||'—')}</b><span>${nf(+m.k||0)} سعرة · ${nf(+m.p||0)} جم بروتين</span></div>`).join('')||'<div class="empty">لا توجد وجبات.</div>';
  const v=await show(`<h3>${fd(k)} · ${esc(nameOf(u))}</h3><p>${esc(d.title||'بدون عنوان')} ${d.done?'· ✓ تم التمرين':''}</p>${kpis([['الحجم (كغ)',nf(vol(d))],['السعرات',nf(kcal(d))],['وزن الجسم',d.bw?nf(+d.bw):'—']])}<h4>التمارين</h4>${ex}<h4>الأكل</h4>${ml}${notesArr(d).length?`<h4>ملاحظات</h4>${notesArr(d).map(n=>`<p>${esc(n)}</p>`).join('')}`:''}<form method="dialog" class="dact"><button class="btn main" value="open">${mine?'فتح اليوم للتعديل':'عرض في التقويم'}</button><button class="btn" value="">إغلاق</button></form>`);
  if(v==='open'){S.sel=k;S.view=new Date(k+'T00:00');S.view.setDate(1);setTab('day');render()}
}
const avgLine=(s,Y)=>{if(s.p.length<2)return '';const a=s.p.reduce((x,y)=>x+y[1],0)/s.p.length;return `<line x1="50" x2="610" y1="${Y(a)}" y2="${Y(a)}" stroke="${colorOf(s.u)}" stroke-opacity=".5" stroke-dasharray="5 4"/><text x="610" y="${Y(a)-4}" text-anchor="end" style="fill:${colorOf(s.u)}">المعدل ${nf(a)}</text>`};
function weekly(u,f,title,unit){
  const m={};Object.entries(S.days[u]||{}).forEach(([k,d])=>{const x=new Date(k+'T00:00');x.setDate(x.getDate()-x.getDay());const w=iso(x);m[w]=(m[w]||0)+f(d)});
  const ks=Object.keys(m).sort().slice(-8);if(!ks.length)return '';const mx=Math.max(...ks.map(k=>m[k]))||1,av=ks.reduce((a,k)=>a+m[k],0)/ks.length;
  return `<div class="cbox"><h4>${title} <small>${unit} · المعدل ${nf(av)}</small></h4><div class="bars">${ks.map(k=>`<div><span style="height:${Math.max(3,m[k]/mx*100)}%;background:${colorOf(u)}"></span><small>${nf(m[k])}</small><em>${new Date(k+'T00:00').toLocaleDateString('ar-EG',{day:'numeric',month:'short'})}</em></div>`).join('')}</div></div>`}

// ---------- السجل والتحليلات ----------
const who=()=>uids().includes(S.who)?S.who:S.me.uid;
const vol=d=>(d.exercises||[]).reduce((a,e)=>a+evol(e),0);
const kcal=d=>(d.meals||[]).reduce((a,m)=>a+(+m.k||0),0);
const fd=k=>new Date(k+'T00:00').toLocaleDateString('ar-EG',{weekday:'short',day:'numeric',month:'short'});
const nf=v=>(Math.round(v*10)/10).toLocaleString('ar-EG');
const whoBar=()=>`<div class="seg">${uids().map(u=>`<button data-w="${u}" class="${u===who()?'on':''}" style="--c:${colorOf(u)}">${esc(nameOf(u))}</button>`).join('')}</div>`;
const kpis=a=>`<div class="kpis">${a.map(([l,v])=>`<div><b>${v}</b><small>${l}</small></div>`).join('')}</div>`;
function setTab(t){S.tab=t;document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.v===t));
  document.querySelectorAll('.vd').forEach(e=>e.hidden=t!=='day');$('#fab').hidden=t!=='day';$('#vLog').hidden=t!=='log';$('#vEx').hidden=t!=='ex';$('#vSet').hidden=t!=='set';$('#vLib').hidden=t!=='lib';drawView();if(t==='day')fx($('#hero'));fx(t==='day'?$('#panel'):t==='log'?$('#vLog'):t==='set'?$('#vSet'):t==='lib'?$('#vLib'):$('#vEx'))}
$('#tabs').onclick=e=>{const b=e.target.closest('button');if(b)setTab(b.dataset.v)};
function drawView(){if(S.tab==='log')renderLog();else if(S.tab==='ex')renderEx();else if(S.tab==='lib')renderLibPage();else if(S.tab==='set'&&!document.activeElement?.closest('#vSet'))renderSet()}
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
function exData(u){const m={};Object.keys(S.days[u]||{}).sort().forEach(k=>(S.days[u][k].exercises||[]).forEach(e=>{const n=(e.n||'').trim();if(!n)return;const ss=SS(e),rp=ss.reduce((a,x)=>a+(+x.r||0),0);(m[n]??=[]).push({k,s:ss.length,r:ss.length?rp/ss.length:0,w:emax(e),t:e.t||'',rest:e.rest||0,v:evol(e),rm:Math.max(0,...ss.map(x=>(+x.w||0)*(1+(+x.r||0)/30))),ss})}));return m}
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
    `<div class="loglist"><h4>سجل «${esc(n)}»</h4>${[...L].reverse().map(x=>`<div class="hrow"><b>${fd(x.k)}</b><span>${x.ss.map(y=>(+y.r||0)+'×'+(+y.w||0)).join(' · ')}</span><span>${nf(x.w)} كغ</span><span>${nf(x.v)} حجم</span>${x.t?`<small class="note">${esc(x.t)}</small>`:''}</div>`).join('')}</div>`;
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
