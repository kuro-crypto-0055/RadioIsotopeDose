const CACHE='ri-note-public-v3.0.1-r1-'+self.registration.scope;
const ASSETS=['./','./index.html','./styles.css','./app.js','./model.js','./storage.js','./sync-model.js','./sheets-sync.js','./sync-ui.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);if(!url.href.startsWith(self.registration.scope))return;
 event.respondWith(caches.open(CACHE).then(async c=>(await c.match(event.request))||fetch(event.request)));
});
self.addEventListener('message',event=>{if(event.data?.type!=='PREPARE')return;event.waitUntil((async()=>{try{const cache=await caches.open(CACHE),missing=[];for(const url of ASSETS)if(!await cache.match(url))missing.push(url);if(missing.length)await cache.addAll(missing.map(url=>new Request(url,{cache:'reload'})));event.ports[0].postMessage({ok:true});}catch(e){event.ports[0].postMessage({ok:false,error:e.message});}})());});
