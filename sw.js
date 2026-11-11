const CACHE='streak-v4';
const CORE=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png'];
const AUDIO=Array.from({length:10},(_,i)=>'./sos'+(i+1)+'.m4a');

self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    await c.addAll(CORE);
    await Promise.all(AUDIO.map(a=>c.add(a).catch(()=>{})));
  })());
  self.skipWaiting();
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));
  self.clients.claim();
});

async function audioResponse(req){
  const c=await caches.open(CACHE);
  const cached=await c.match(req.url,{ignoreSearch:true});
  if(!cached){
    try{
      const full=await fetch(req.url);
      if(!full.ok)return full;
      await c.put(req.url,full.clone());
      const again=await c.match(req.url,{ignoreSearch:true});
      if(!again)return full;
      return audioFrom(again,req);
    }catch(e){return Response.error()}
  }
  return audioFrom(cached,req);
}
async function audioFrom(cached,req){
  const buf=await cached.arrayBuffer();
  const type=cached.headers.get('Content-Type')||'audio/mp4';
  const m=/bytes=(\d*)-(\d*)/.exec(req.headers.get('range')||'');
  if(!m)return new Response(buf,{status:200,headers:{'Content-Type':type,'Content-Length':buf.byteLength,'Accept-Ranges':'bytes'}});
  const start=m[1]?+m[1]:0;
  const end=m[2]?Math.min(+m[2],buf.byteLength-1):buf.byteLength-1;
  return new Response(buf.slice(start,end+1),{status:206,headers:{'Content-Type':type,'Content-Range':'bytes '+start+'-'+end+'/'+buf.byteLength,'Content-Length':end-start+1,'Accept-Ranges':'bytes'}});
}

self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(u.origin!==location.origin)return;
  if(u.pathname.endsWith('.m4a')||u.pathname.endsWith('.mp4')){
    e.respondWith(audioResponse(r));
    return;
  }
  e.respondWith((async()=>{
    const c=await caches.open(CACHE);
    const m=await c.match(r,{ignoreSearch:true});
    const net=fetch(r).then(res=>{if(res&&res.ok)c.put(r,res.clone());return res}).catch(()=>null);
    if(m){e.waitUntil(net);return m}
    return (await net)||(await c.match('./index.html'))||Response.error();
  })());
});
