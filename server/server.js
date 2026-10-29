'use strict';
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {randomUUID} = require('node:crypto');
const {canonicalVideo,safeName,validOptions} = require('./utils');
const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(__dirname, '../public');
const WORKER = process.env.LINKMEDIA_WORKER || path.join(__dirname, 'worker.py');
const PYTHON = process.env.PYTHON || 'python3';
const MAX_ACTIVE = Math.max(1, Math.min(8, Number(process.env.MAX_ACTIVE || 2)));
const MAX_PREVIEWS = 3;
const MAX_BYTES = 800*1024*1024;
const TTL = 10*60*1000;
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'};
const jobs=new Map(), previews=new Map(), throttles=new Map();
let active=0,previewActive=0;

function headers(req,res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://i.ytimg.com data:; connect-src 'self' https: http://localhost:*; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  const origin=req.headers.origin;
  const allowed=(process.env.ALLOWED_ORIGIN || '').split(',').map(x=>x.trim()).filter(Boolean);
  if (!origin && !allowed.length) res.setHeader('Access-Control-Allow-Origin','*');
  else if (!allowed.length) res.setHeader('Access-Control-Allow-Origin','*');
  else if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Expose-Headers','Content-Disposition');
}
function json(res,code,obj){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
const fail=(res,code,msg)=>json(res,code,{error:msg});
async function readBody(req){let size=0;const parts=[];for await(const b of req){size+=b.length;if(size>4096)throw new Error('Requisição muito grande');parts.push(b);}return JSON.parse(Buffer.concat(parts).toString('utf8'));}
function rateLimit(req,kind){
  const ip=process.env.TRUST_PROXY==='1' && req.headers['x-forwarded-for']
    ? String(req.headers['x-forwarded-for']).split(',')[0].trim().slice(0,100)
    : (req.socket.remoteAddress || 'unknown');
  const now=Date.now();
  const key=ip+':'+kind, old=throttles.get(key) || [];
  const arr=old.filter(t=>now-t<60000);
  const max=kind==='preview'?18:6;
  if(arr.length>=max){throttles.set(key,arr);return false;}
  arr.push(now);throttles.set(key,arr);return true;
}
function publicJob(j){return {id:j.id,state:j.state,stage:j.stage,percent:j.percent,received:j.received,total:j.total,speed:j.speed,eta:j.eta,fragment:j.fragment,fragments:j.fragments,error:j.error,filename:j.filename,bytes:j.bytes,createdAt:j.createdAt};}
function expire(j){clearTimeout(j.timer);j.timer=setTimeout(()=>{
    if(j.readers){expire(j);return;}
    jobs.delete(j.id);
    if(j.dir)fsp.rm(j.dir,{recursive:true,force:true}).catch(()=>{});
  },TTL);j.timer.unref?.();}
function runWorker(args, dir, timeoutMs, onMessage, shouldCancel){
  return new Promise((resolve,reject)=>{
    const proc=spawn(PYTHON,[WORKER,...args],{cwd:dir,stdio:['ignore','pipe','pipe']});
    let errTail='',lineBuf='',reportedError='';let done=false;
    const timer=setTimeout(()=>proc.kill('SIGKILL'),timeoutMs);timer.unref?.();
    proc.stdout.on('data',c=>{
      lineBuf += c.toString();
      const lines=lineBuf.split('\n');lineBuf=lines.pop().slice(-20000);
      for(const line of lines){if(line.length>10000)continue;try{const m=JSON.parse(line);if(m.type==='error')reportedError=m.error;onMessage(m,proc);}catch{}}
    });
    proc.stderr.on('data',c=>{errTail=(errTail+c.toString()).slice(-1500);});
    proc.on('error',e=>{if(done)return;done=true;clearTimeout(timer);reject(e);});
    proc.on('close',code=>{
      if(done)return;done=true;clearTimeout(timer);
      if(shouldCancel?.())return reject(new Error('Operação cancelada.'));
      if(code!==0)return reject(new Error(reportedError||errTail.trim().slice(-350)||'Não foi possível processar a mídia.'));
      resolve();
    });
    onMessage({type:'spawned'},proc);
  });
}
async function preview(url){
  const cached=previews.get(url);if(cached && cached.expires>Date.now())return cached.data;
  const data={};
  await runWorker(['preview',url,'mp3','best'],process.cwd(),45*1000,(m)=>{if(m.type==='preview')Object.assign(data,m);});
  if(!data.title)throw new Error('Não foi possível identificar esse vídeo.');
  const id=new URL(url).searchParams.get('v');
  const result={title:data.title,creator:data.creator,duration:data.duration,source:data.source,qualities:data.qualities,thumbnail:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,url};
  // Keep the preview cache bounded on a long-running public instance.
  for (const [key,entry] of previews) if(entry.expires<=Date.now())previews.delete(key);
  if(previews.size>=256)previews.delete(previews.keys().next().value);
  previews.set(url,{data:result,expires:Date.now()+5*60*1000});
  return result;
}
async function launch(j){
  active++;j.state='working';j.stage='Preparando';
  try{
    j.dir=await fsp.mkdtemp(path.join(os.tmpdir(),'linkmedia-'));
    if(j.cancelled)throw new Error('Operação cancelada.');
    await runWorker(['download',j.url,j.format,j.quality],j.dir,12*60*1000,(m,proc)=>{
      if(m.type==='spawned'){j.proc=proc;}
      else if(m.type==='download'){
        j.stage='Baixando';
        j.percent=m.percent == null ? null : Math.max(0,Math.min(100,m.percent));
        j.received=m.received;j.total=m.total;j.speed=m.speed;j.eta=m.eta;
        j.fragment=m.fragment;j.fragments=m.fragments;
      }else if(m.type==='transfer_finished'){j.stage='Preparando arquivo';j.percent=100;}
      else if(m.type==='processing'){j.stage='Convertendo';j.processor=m.processor;}
      else if(m.type==='processing_done'){j.stage='Finalizando';}
    },()=>j.cancelled);
    if(j.cancelled)throw new Error('Operação cancelada.');
    const files=(await fsp.readdir(j.dir)).filter(n=>n.toLowerCase().endsWith('.'+j.format));
    if(files.length!==1)throw new Error('Não foi encontrado um arquivo válido após a conversão.');
    j.file=path.join(j.dir,files[0]);
    const st=await fsp.stat(j.file);
    if(st.size>MAX_BYTES || !st.size)throw new Error('O tamanho do arquivo ultrapassou o limite permitido.');
    j.bytes=st.size;
    j.filename=safeName(path.parse(files[0]).name)+'.'+j.format;
    j.stage='Concluído';j.state='ready';j.percent=100;
  }catch(e){j.error=j.cancelled?'Conversão cancelada.':String(e.message||e).slice(0,400);j.state=j.cancelled?'cancelled':'error';j.stage='Não concluído';}
  finally{j.proc=null;active--;expire(j);}
}
const server=http.createServer(async(req,res)=>{
  headers(req,res);
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  let u;try{u=new URL(req.url,'http://localhost');}catch{return fail(res,400,'Endereço inválido.');}
  if(req.method==='GET'&&u.pathname==='/api/health')return json(res,200,{ok:true,active,capacity:MAX_ACTIVE,previewActive,version:'3.0.0'});
  if(req.method==='POST'&&u.pathname==='/api/preview'){
    if(!rateLimit(req,'preview'))return fail(res,429,'Muitas consultas. Aguarde um minuto.');
    if(previewActive>=MAX_PREVIEWS)return fail(res,429,'A prévia está ocupada. Tente novamente.');
    let d;try{d=await readBody(req);}catch{return fail(res,400,'Dados inválidos.');}
    const url=canonicalVideo(d?.url);if(!url)return fail(res,400,'Insira o link de um vídeo do YouTube.');
    previewActive++;
    try{return json(res,200,await preview(url));}catch(e){return fail(res,422,String(e.message||e).slice(0,350));}
    finally{previewActive--;}
  }
  if(req.method==='POST'&&u.pathname==='/api/jobs'){
    if(!rateLimit(req,'job'))return fail(res,429,'Limite de conversões por minuto.');
    if(active>=MAX_ACTIVE)return fail(res,429,'Servidor ocupado. Aguarde um pouco.');
    let d;try{d=await readBody(req);}catch{return fail(res,400,'Dados inválidos.');}
    const url=canonicalVideo(d?.url);
    if(!url)return fail(res,400,'Link inválido. Use um vídeo do YouTube.');
    if(!validOptions(d))return fail(res,400,'Formato ou qualidade inválidos.');
    const j={id:randomUUID(),createdAt:new Date().toISOString(),url,format:d.format,quality:d.quality,state:'queued',stage:'Na fila',percent:null,received:0,total:null,speed:null,eta:null,fragment:null,fragments:null,error:null,filename:null,bytes:0,dir:null,file:null,proc:null,cancelled:false,readers:0,timer:null};
    jobs.set(j.id,j);launch(j);return json(res,202,publicJob(j));
  }
  const match=u.pathname.match(/^\/api\/jobs\/([a-f0-9-]{36})(?:\/(download))?$/);
  if(match){
    const j=jobs.get(match[1]);if(!j)return fail(res,404,'Tarefa expirada ou não encontrada.');
    if(req.method==='GET'&&!match[2])return json(res,200,publicJob(j));
    if(req.method==='DELETE'&&!match[2]){
      if(j.state==='working'||j.state==='queued'){j.cancelled=true;j.proc?.kill('SIGTERM');j.stage='Cancelando';}
      else if(j.state==='ready'){j.state='cancelled';j.stage='Cancelado';expire(j);}
      return json(res,200,{ok:true,state:j.state});
    }
    if(req.method==='GET'&&match[2]){
      if(j.state!=='ready'||!j.file)return fail(res,409,'O arquivo ainda não está pronto.');
      j.readers++;clearTimeout(j.timer);
      res.writeHead(200,{'Content-Type':j.format==='mp3'?'audio/mpeg':'video/mp4','Content-Length':j.bytes,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(j.filename),'Cache-Control':'no-store'});
      const stream=fs.createReadStream(j.file);
      let closed=false;const finish=()=>{if(!closed){closed=true;j.readers--;expire(j);}};
      stream.on('error',()=>res.destroy());res.on('close',finish);stream.pipe(res);return;
    }
    return fail(res,405,'Método não permitido.');
  }
  if(req.method!=='GET')return fail(res,405,'Método não permitido.');
  let decoded;try{decoded=decodeURIComponent(u.pathname);}catch{return fail(res,400,'Caminho inválido.');}
  const filename=decoded==='/'?'index.html':decoded.slice(1);
  const fp=path.resolve(ROOT,filename);
  if(fp!==path.join(ROOT,'index.html') && !fp.startsWith(ROOT+path.sep))return fail(res,403,'Acesso negado.');
  try{const stat=await fsp.stat(fp);if(!stat.isFile())throw Error();res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream','Cache-Control':'public, max-age=180','X-Content-Type-Options':'nosniff'});fs.createReadStream(fp).pipe(res);}
  catch{return fail(res,404,'Arquivo não encontrado.');}
});
server.requestTimeout=14*60*1000;
if(require.main===module)server.listen(PORT,'0.0.0.0',()=>console.log(`LinkMedia v3 em http://localhost:${PORT}`));
module.exports={server};
