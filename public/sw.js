const C='gym-v12';
const SHELL=['./','index.html','style.css','app.js','firebase-config.js','manifest.json',
'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>{})))));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||/googleapis\.com$/.test(u.host)&&!/fonts/.test(u.host)||/firestore|identitytoolkit|securetoken/.test(u.host))return;
  e.respondWith(caches.match(e.request).then(hit=>{
    const net=fetch(e.request).then(r=>{if(r.ok||r.type==='opaque')caches.open(C).then(c=>c.put(e.request,r.clone()));return r}).catch(()=>hit);
    return hit||net;
  }));
});

let L=0;
self.addEventListener('message',e=>{const d=e.data||{};
  if(d.cancel){L=0;return}
  if(d.rest){L=d.id;e.waitUntil(new Promise(r=>setTimeout(()=>{if(L===d.id)self.registration.showNotification('انتهت الراحة 💪',{body:'ابدأ المجموعة التالية',tag:'rest',renotify:true,vibrate:[300,100,300]}).catch(()=>{});r()},d.rest)))}});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window'}).then(c=>c[0]?c[0].focus():clients.openWindow('./')))});
