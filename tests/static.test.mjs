import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const here = path.dirname(fileURLToPath(import.meta.url));
const source = (filename) => readFileSync(path.join(here, '..', filename), 'utf8');
test('site inclui arquivos locais sem dependência de backend', () => {
  const html = source('index.html');
  assert.match(html, /\.\/app\.js/);
  assert.match(html, /\/styles\.css/);
  assert.doesNotMatch(html, /\/api\/jobs|\/api\/preview/);
  assert.match(source('app.js'), /new Worker\('\.\/converter-worker\.js'\)/);
});
test('worker testa parâmetros MP3, entrega buffer e limpa arquivos', async () => {
  const sent = []; const fs = new Map(); let recorded = null;
  const ffmpeg = {
    ret: 0,
    FS: { writeFile: (f, b) => fs.set(f, b), readFile: (f) => new Uint8Array([1, 2, 3]), unlink: (f) => fs.delete(f) },
    setProgress: () => {}, setLogger: () => {}, reset: () => {},
    exec: (...args) => { recorded = args; }
  };
  const self = {
    postMessage: (p) => sent.push(p),
    createFFmpegCore: async () => ffmpeg
  };
  const context = vm.createContext({ self, importScripts: () => {}, Uint8Array, ArrayBuffer, btoa, Date, JSON, Error, Number });
  vm.runInContext(source('converter-worker.js'), context);
  const buffer = new Uint8Array([9, 8, 7]).buffer;
  await self.onmessage({ data: { type: 'convert', data: buffer, filename: 'musica.wav', format: 'mp3', quality: '320' } });
  assert.ok(recorded.includes('libmp3lame'));
  assert.ok(recorded.includes('320k'));
  assert.equal(sent.at(-1).type, 'done');
  assert.equal(sent.at(-1).data.byteLength, 3);
  assert.equal(fs.size, 0);
});
test('worker testa parâmetros MP4 e reage a formato inválido', async () => {
  const sent = []; let recorded = null;
  const ffmpeg = { ret: 0, FS: { writeFile: () => {}, readFile: () => new Uint8Array([1]), unlink: () => {} }, setProgress: () => {}, setLogger: () => {}, reset: () => {}, exec: (...args) => { recorded = args; } };
  const self = { postMessage: (data) => sent.push(data), createFFmpegCore: async () => ffmpeg };
  const context = vm.createContext({ self, importScripts: () => {}, Uint8Array, ArrayBuffer, btoa, Date, JSON, Error, Number });
  vm.runInContext(source('converter-worker.js'), context);
  await self.onmessage({ data: { type: 'convert', data: new Uint8Array([3, 2]).buffer, filename: 'movie.webm', format: 'mp4', quality: 'balanced' } });
  assert.ok(recorded.includes('libx264'));
  assert.ok(recorded.includes('aac'));
  assert.equal(sent.at(-1).type, 'done');
  await self.onmessage({ data: { type: 'convert', data: new ArrayBuffer(2), filename: 'x', format: 'exe', quality: 'best' } });
  assert.equal(sent.at(-1).type, 'error');
});
