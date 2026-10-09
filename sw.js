const CACHE='chapi-fit-shell-v32-20261009';
const SHELL=['./','./index.html','./styles.css?v=3.2','./core.js?v=3.2','./app.js?v=3.2','./manifest.webmanifest','./apple-touch-icon.png?v=3.2','./favicon-32.png?v=3.2','./icon-192.png','./icon-512.png','./icon-maskable-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)))});
// Activate after old tabs close: do not swap code underneath unsaved input.
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('chapi-fit-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||!u.pathname.startsWith(new URL('./',self.location.href).pathname))return;
if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy))}return r}).catch(()=>caches.match('./index.html')));return}
// App assets are immutable for this version. Publish a new version URL and cache name together.
if(SHELL.some(p=>new URL(p,self.location.href).href===u.href))e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
