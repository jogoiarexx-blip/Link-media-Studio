'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const path=require('node:path');const {canonicalVideo,validOptions}=require('../server/utils');
process.env.LINKMEDIA_WORKER=path.join(__dirname,'mockworker.py');
const {server}=require('../server/server');
let base;
test.before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));});
const post=async(endpoint,data)=>fetch(base+endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
const valid='https://www.youtube.com/watch?v=dQw4w9WgXcQ';
test('URL normalization rejects SSRF, flags and playlist',()=>{
  assert.equal(canonicalVideo('https://youtu.be/dQw4w9WgXcQ?t=30'),valid);
  assert.equal(canonicalVideo('https://m.youtube.com/shorts/dQw4w9WgXcQ'),valid);
  for(const url of ['https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ','http://www.youtube.com/watch?v=dQw4w9WgXcQ','https://www.youtube.com/playlist?list=dQw4w9WgXcQ','https://127.0.0.1/watch?v=dQw4w9WgXcQ','https://www.youtube.com/watch?v=abc','https://www.youtube.com:444/watch?v=dQw4w9WgXcQ'])assert.equal(canonicalVideo(url),null,url);
  assert.equal(validOptions({format:'mp4',quality:'720'}),true);
  assert.equal(validOptions({format:'mp4',quality:'999999'}),false);
});
test('serves HTML and health',async()=>{
  const h=await (await fetch(base+'/api/health')).json();assert.equal(h.version,'3.0.0');
  const page=await(await fetch(base+'/')).text();assert.match(page,/Prévia antes de baixar/);
  assert.equal((await fetch(base+'/../server/server.js')).status,404);
});
test('preview validates URL and returns metadata',async()=>{
  const bad=await post('/api/preview',{url:'https://bad.example/watch?v=dQw4w9WgXcQ'});assert.equal(bad.status,400);
  const ok=await post('/api/preview',{url:valid});assert.equal(ok.status,200);
  const j=await ok.json();assert.equal(j.title,'Vídeo de teste');assert.equal(j.duration,125);assert.match(j.thumbnail,/i.ytimg.com/);assert.deepEqual(j.qualities,[720,480,360]);
});
test('job transitions through progress, download streams correct file',async()=>{
  const bad=await post('/api/jobs',{url:valid,format:'mp4',quality:'2160'});assert.equal(bad.status,400);
  const job=await (await post('/api/jobs',{url:valid,format:'mp3',quality:'192'})).json();assert.match(job.id,/^[a-f0-9-]{36}$/);
  let state;
  for(let i=0;i<50;i++){
    await new Promise(r=>setTimeout(r,80));state=await (await fetch(base+'/api/jobs/'+job.id)).json();
    if(state.state==='ready'||state.state==='error')break;
  }
  assert.equal(state.state,'ready',JSON.stringify(state));assert.equal(state.percent,100);
  const file=await fetch(base+'/api/jobs/'+job.id+'/download');assert.equal(file.status,200);assert.match(file.headers.get('content-disposition'),/\.mp3/);assert.equal(await file.text(),'linkmedia-mock-content');
});
