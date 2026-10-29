'use strict';
const $=id=>document.getElementById(id);
const fields=document.querySelectorAll('input[name="format"]');
let previewTimer=null,previewController=null,preview=null,previewSequence=0,jobId=null,jobGeneration=0,jobRunning=false;
function apiBase(){return (localStorage.getItem('linkmedia_api')||'').replace(/\/+$/,'');}
function canonicalVideo(input){
  try {
    const u=new URL(input.trim());if(u.protocol!=='https:'||u.port||u.username||u.password)return null;
    const h=u.hostname.toLowerCase();let id=null;
    if(h==='youtu.be')id=u.pathname.split('/')[1];
    else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(h)){
      const p=u.pathname.split('/').filter(Boolean);
      if(p[0]==='watch'&&(h==='youtube.com'||h.endsWith('.youtube.com')))id=u.searchParams.get('v');
      else if(['shorts','live','embed'].includes(p[0]))id=p[1];
    }
    return /^[a-zA-Z0-9_-]{11}$/.test(id||'')?`https://www.youtube.com/watch?v=${id}`:null;
  }catch{return null;}
}
function format(){return document.querySelector('input[name="format"]:checked').value;}
function setMessage(text){$('messageBox').textContent=text||'';$('messageBox').hidden=!text;}
function setIndicator(text,ok){$('linkIndicator').textContent=text;$('linkIndicator').classList.toggle('ok',!!ok);}
function resetPreviewView(){preview=null;$('previewArea').hidden=true;$('previewLoading').hidden=true;$('previewCard').hidden=true;$('previewError').hidden=true;setIndicator('Aguardando link',false);setButton();}
function setButton(){if(jobRunning){$('convertBtn').disabled=true;$('convertLabel').textContent='Conversão em andamento';}else if(preview){$('convertBtn').disabled=false;$('convertLabel').textContent='Converter e preparar download';}else{$('convertBtn').disabled=true;$('convertLabel').textContent='Cole um link para continuar';}}
function printDuration(sec){if(sec==null)return 'Duração não informada';const n=Math.max(0,Math.floor(sec));const parts=[Math.floor(n/3600),Math.floor(n%3600/60),n%60];return (parts[0]?[parts[0],String(parts[1]).padStart(2,'0')]:[parts[1]]).concat(String(parts[2]).padStart(2,'0')).join(':');}
function qualityEntries(){
  const isMp3=format()==='mp3';
  if(isMp3)return [['best','Alta (VBR)'],['192','192 kbps'],['128','128 kbps']];
  const base=[['best','Melhor disponível'],['1080','1080p · Full HD'],['720','720p · HD'],['480','480p'],['360','360p']];
  return base.filter(([value])=>value==='best'||!preview||!Array.isArray(preview.qualities)||preview.qualities.includes(Number(value)));
}
function updateFormat(){fields.forEach(el=>$(el.value+'Card').classList.toggle('active',el.checked));const q=$('quality'),last=q.value;q.replaceChildren();for(const [value,title] of qualityEntries()){const opt=document.createElement('option');opt.value=value;opt.textContent=title;q.append(opt);}q.value=Array.from(q.options).some(x=>x.value===last)?last:'best';$('qualityHint').textContent=format()==='mp3'?'Taxa de áudio de saída':'Resolução máxima, se disponível';}
fields.forEach(el=>el.addEventListener('change',updateFormat));
async function request(endpoint,options={}){
  const res=await fetch(apiBase()+endpoint,{cache:'no-store',...options});
  const data=await res.json().catch(()=>({error:'Resposta inesperada do servidor.'}));
  if(!res.ok)throw new Error(data.error||`Erro ${res.status} no servidor`);
  return data;
}
async function fetchPreview(){
  if(jobRunning)return;
  clearTimeout(previewTimer);
  previewController?.abort();
  const wanted=canonicalVideo($('url').value);const seq=++previewSequence;
  resetPreviewView();setMessage('');
  if(!wanted){if($('url').value.trim())setIndicator('Link ainda não válido',false);return;}
  previewController=new AbortController();
  $('previewArea').hidden=false;$('previewLoading').hidden=false;setIndicator('Buscando informações...',false);
  try{
    const data=await request('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:wanted}),signal:previewController.signal});
    if(seq!==previewSequence)return;
    if(wanted!==canonicalVideo($('url').value))return;
    preview=data;$('previewLoading').hidden=true;$('previewCard').hidden=false;
    $('previewImage').src=data.thumbnail;$('previewTitle').textContent=data.title||'Vídeo sem título';
    $('previewCreator').textContent=data.creator||'Canal não informado';$('previewDuration').textContent=printDuration(data.duration);
    setIndicator('Vídeo identificado',true);updateFormat();setButton();
  }catch(err){
    if(seq!==previewSequence||err.name==='AbortError')return;
    $('previewLoading').hidden=true;$('previewError').hidden=false;
    $('previewErrorText').textContent=err.message==='Failed to fetch'?'Servidor indisponível. Confira a configuração da API.':err.message;
    setIndicator('Prévia indisponível',false);
  }
}
$('url').addEventListener('input',()=>{
  if(jobRunning)return;
  clearTimeout(previewTimer);previewController?.abort();previewSequence++;resetPreviewView();
  if(canonicalVideo($('url').value)){setIndicator('Link reconhecido',true);previewTimer=setTimeout(fetchPreview,700);}
  else if($('url').value.trim())setIndicator('Link ainda não válido',false);
});
$('url').addEventListener('paste',()=>{if(!jobRunning){clearTimeout(previewTimer);previewTimer=setTimeout(fetchPreview,850);}});
$('url').addEventListener('blur',()=>{if(!jobRunning&&canonicalVideo($('url').value)&&!preview){clearTimeout(previewTimer);fetchPreview();}});
$('retryPreview').addEventListener('click',fetchPreview);
$('pasteBtn').addEventListener('click',async()=>{
  try{$('url').value=await navigator.clipboard.readText();fetchPreview();}
  catch{setMessage('O navegador não permitiu acessar a área de transferência. Use Ctrl+V no campo de link.');$('url').focus();}
});
function humanBytes(bytes){if(bytes==null||!Number.isFinite(Number(bytes)))return '—';let num=Number(bytes);const units=['B','KB','MB','GB'];let i=0;while(num>=1024&&i<3){num/=1024;i++;}return `${num.toLocaleString('pt-BR',{maximumFractionDigits:i?1:0})} ${units[i]}`;}
function humanEta(seconds){if(seconds==null||!Number.isFinite(Number(seconds)))return 'Calculando';let n=Math.max(0,Math.ceil(Number(seconds)));return n>=3600?`${Math.floor(n/3600)}h ${Math.floor(n%3600/60)}min`:n>=60?`${Math.floor(n/60)}min ${n%60}s`:`${n}s`;}
function setSteps(index,done){for(const [i,id] of ['stepPrepare','stepDownload','stepProcess'].entries()){const el=$(id);el.classList.toggle('active',i===index&&!done);el.classList.toggle('done',i<index||done);}}
function progress(data){
  const state=data.state,stage=data.stage||'Preparando';
  $('stageLabel').textContent=stage;
  const processing=stage==='Convertendo'||stage==='Finalizando'||stage==='Preparando arquivo';
  const ready=state==='ready';
  const idx=ready?2:processing?2:stage==='Baixando'?1:0;
  setSteps(idx,ready);
  $('jobTitle').textContent=ready?'Arquivo pronto para baixar':state==='error'?'Não foi possível concluir':processing?'Finalizando a mídia':idx===1?'Transferindo o conteúdo':'Preparando a mídia';
  $('convertStage').hidden=!(processing&&!ready);
  $('processingLabel').textContent=stage==='Convertendo'?'O FFmpeg está convertendo o arquivo. O percentual dessa etapa não é informado.':'Finalizando o arquivo. A transferência já foi concluída.';
  const n=data.percent==null?null:Math.max(0,Math.min(100,Number(data.percent)));
  $('transferBar').style.width=n==null?'0%':`${n}%`;
  $('progressUnknown').hidden=n!==null||processing||ready;
  $('transferPercent').textContent=n==null?'Calculando':`${n.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`;
  if(ready){$('transferPercent').textContent='100%';$('transferBar').style.width='100%';$('progressUnknown').hidden=true;}
  $('statsBytes').textContent=humanBytes(data.received)+(data.total?` / ${humanBytes(data.total)}`:'');
  $('statsSpeed').textContent=data.speed?`${humanBytes(data.speed)}/s`:'—';
  $('statsEta').textContent=ready?'Concluído':processing?'Convertendo':humanEta(data.eta);
}
function freezeForm(frozen){$('url').disabled=frozen;$('pasteBtn').disabled=frozen;$('quality').disabled=frozen;fields.forEach(f=>f.disabled=frozen);setButton();}
function resetJob(){jobRunning=false;jobId=null;freezeForm(false);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function pollJob(id,token){
  const started=Date.now();
  while(jobGeneration===token && Date.now()-started<13*60*1000){
    await sleep(1200);if(jobGeneration!==token)return;
    let d;
    try{d=await request('/api/jobs/'+id);}catch(err){if(jobGeneration===token)throw err;return;}
    if(jobGeneration!==token)return;
    progress(d);
    if(d.state==='ready'){
      $('cancelBtn').hidden=true;
      const link=apiBase()+'/api/jobs/'+id+'/download';$('downloadBtn').href=link;$('downloadBtn').hidden=false;
      resetJob();$('downloadBtn').click();return;
    }
    if(d.state==='error'||d.state==='cancelled')throw new Error(d.error||'A conversão não foi concluída.');
  }
  throw new Error('A tarefa demorou mais que o limite permitido. Tente novamente.');
}
$('converterForm').addEventListener('submit',async(event)=>{
  event.preventDefault();if(jobRunning||!preview)return;
  const url=canonicalVideo($('url').value);
  if(!url||url!==preview.url){setMessage('Confira a prévia do link antes de converter.');return;}
  setMessage('');jobRunning=true;const token=++jobGeneration;
  $('progressPanel').hidden=false;$('cancelBtn').hidden=false;$('downloadBtn').hidden=true;
  progress({state:'working',stage:'Preparando',percent:null});freezeForm(true);
  try{
    const d=await request('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,format:format(),quality:$('quality').value})});
    if(token!==jobGeneration)return;
    jobId=d.id;progress(d);await pollJob(d.id,token);
  }catch(err){if(token===jobGeneration){setMessage(err.message==='Failed to fetch'?'O servidor não respondeu. Confira o endereço da API.':err.message);resetJob();$('cancelBtn').hidden=true;}}
});
$('cancelBtn').addEventListener('click',async()=>{
  if(!jobRunning)return;const id=jobId;jobGeneration++;
  resetJob();$('cancelBtn').hidden=true;$('stageLabel').textContent='Cancelando';$('jobTitle').textContent='Conversão cancelada';$('convertStage').hidden=true;
  if(id)try{await request('/api/jobs/'+id,{method:'DELETE'});}catch{setMessage('Não foi possível confirmar o cancelamento no servidor.');}
});
$('toggleSettings').addEventListener('click',()=>{const opened=$('settingsContent').hidden;$('settingsContent').hidden=!opened;$('toggleSettings').setAttribute('aria-expanded',String(opened));});
$('serverUrl').value=apiBase();
$('saveServer').addEventListener('click',async()=>{
  const raw=$('serverUrl').value.trim().replace(/\/+$/,'');
  if(raw){try{const u=new URL(raw);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error();if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))throw Error();}catch{$('serverStatus').textContent='Insira a URL HTTPS do servidor, sem caminho adicional.';return;}}
  localStorage.setItem('linkmedia_api',raw);$('serverStatus').textContent='Testando conexão...';
  try{const health=await request('/api/health');$('serverStatus').textContent=health.ok?`Servidor conectado · LinkMedia ${health.version||''}`:'Servidor não respondeu corretamente.';}
  catch{$('serverStatus').textContent='Servidor inacessível. Verifique o endereço, a hospedagem e a configuração CORS.';}
  if(canonicalVideo($('url').value)&&!jobRunning)fetchPreview();
});
updateFormat();
const queryLink=new URLSearchParams(location.search).get('url');if(queryLink&&canonicalVideo(queryLink)){$('url').value=queryLink;fetchPreview();}
