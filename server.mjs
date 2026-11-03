import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const config=JSON.parse(await readFile(path.join(root,'.chat-config.json'),'utf8'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.gif':'image/gif'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:5199');
  if(url.pathname==='/api/chat'&&req.method==='POST'){
   if(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:5199'&&req.headers.origin!=='http://localhost:5199'){res.writeHead(403).end();return}
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>12000){res.writeHead(413).end();return}}
   let input;try{input=JSON.parse(raw)}catch{res.writeHead(400).end('Invalid JSON');return}
   if(typeof input.query!=='string'||!input.query.trim()||input.query.length>2000){res.writeHead(400).end('Invalid question');return}
   const sessionId=/^[a-zA-Z0-9-]{10,80}$/.test(input.sessionId||'')?input.sessionId:randomUUID();
   const body=JSON.stringify({query:input.query.trim(),userId:'portal-'+sessionId,timeout:30});
   const timestamp=String(Math.floor(Date.now()/1000));
   const signature=createHash('sha512').update(body+config.secret+timestamp).digest('hex');
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),65000);
   res.on('close',()=>controller.abort());
   try{
    const upstream=await fetch(config.url.replace('<session_id>',sessionId),{method:'POST',headers:{'Content-Type':'application/json',key:config.key,timestamp,signature},body,signal:controller.signal});
    if(!upstream.ok||!upstream.headers.get('content-type')?.includes('text/event-stream')){console.error('chat upstream rejected',upstream.status);res.writeHead(502,{'Content-Type':'application/json'}).end(JSON.stringify({error:'曙小香暂时无法回答，请稍后重试。'}));return}
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','X-Accel-Buffering':'no'});res.flushHeaders();
    let buffer='';const decoder=new TextDecoder();let completed=false;
    const emit=(type,data)=>{if(!res.destroyed)res.write('event: '+type+'\ndata: '+JSON.stringify(data)+'\n\n')};
    const frame=text=>{const lines=text.split('\n');const event=lines.find(l=>l.startsWith('event:'))?.slice(6).trim();const payload=lines.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!payload)return;let value;try{value=JSON.parse(payload)}catch{return}if(event==='message'&&value.dialogueDisplayText)emit('delta',{text:value.dialogueDisplayText});if(event==='close'){completed=true;emit('done',{sessionId})}if(event==='error'){throw Error('upstream error')}};
    for await(const chunk of upstream.body){buffer+=decoder.decode(chunk,{stream:true}).replace(/\r\n/g,'\n');let i;while((i=buffer.indexOf('\n\n'))>=0){frame(buffer.slice(0,i));buffer=buffer.slice(i+2)}}if(buffer.trim())frame(buffer);if(!completed)emit('error',{error:'回答中断，请重新发送。'});res.end();console.log('chat completed',sessionId);
   }catch(e){console.error('chat failed',e.name);if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'}).end(JSON.stringify({error:'连接失败，请稍后重试。'}));else if(!res.destroyed)res.end('event: error\ndata: {"error":"连接中断，请重试。"}\n\n')}
   finally{clearTimeout(timer)}return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return}
  const pathname=decodeURIComponent(url.pathname);
  if(!['/','/index.html','/style.css','/app.js','/articles.js'].includes(pathname)&&!/^\/assets\/[\w.-]+$/.test(pathname)){res.writeHead(404).end();return}
  const file=path.join(root,pathname==='/'?'index.html':pathname.slice(1));const info=await stat(file);if(!info.isFile())throw Error('not file');
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:await readFile(file));
 }catch{if(!res.headersSent)res.writeHead(404);res.end()}
});
server.listen(5199,'127.0.0.1',()=>console.log('Portal http://127.0.0.1:5199/ (local server + chat proxy)'));
