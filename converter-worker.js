/* FFmpeg WebAssembly single-thread. Executes inside the browser; GitHub Pages needs no backend.
   Core from official @ffmpeg/core 0.12.10 CDN, loaded on first conversion.
   FFmpeg source: https://github.com/ffmpegwasm/ffmpeg.wasm
*/
'use strict';
const CORE_JS = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js';
const CORE_WASM = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm';
let engine = null;
let lastProgress = 0;
let lastEmit = 0;
const emit = (type, extra = {}) => self.postMessage({ type, ...extra });
function reportProgress(event) {
  const now = Date.now();
  if (now - lastEmit < 120) return;
  lastEmit = now;
  const value = Number(event?.progress);
  if (Number.isFinite(value) && value >= 0 && value <= 1) {
    lastProgress = Math.max(lastProgress, value);
    emit('progress', { progress: lastProgress });
  } else emit('progress', { progress: null });
}
async function loadCore() {
  if (engine) return engine;
  emit('loading', { detail: 'Baixando o FFmpeg WebAssembly da CDN. A primeira vez pode demorar.' });
  try {
    importScripts(CORE_JS);
    if (typeof self.createFFmpegCore !== 'function') throw new Error('A biblioteca de conversão não foi carregada.');
    // This locateFile URL convention is the same one used by the official ffmpeg.wasm worker.
    const entry = `${CORE_JS}#${btoa(JSON.stringify({ wasmURL: CORE_WASM, workerURL: '' }))}`;
    engine = await self.createFFmpegCore({ mainScriptUrlOrBlob: entry });
    engine.setProgress(reportProgress);
    engine.setLogger(() => {});
    emit('ready');
    return engine;
  } catch (err) {
    throw new Error(`Não foi possível carregar o FFmpeg WebAssembly. Verifique a rede e se a CDN está acessível. ${err.message || err}`);
  }
}
function run(args) {
  engine.exec(...args);
  const result = engine.ret;
  engine.reset();
  return result;
}
async function convert(data) {
  const { format, quality, filename } = data;
  if (!['mp3', 'mp4'].includes(format)) throw new Error('Formato inválido.');
  if (!(data.data instanceof ArrayBuffer)) throw new Error('Arquivo não reconhecido.');
  const file = new Uint8Array(data.data);
  if (!file.byteLength || file.byteLength > 250 * 1024 * 1024) throw new Error('Arquivo vazio ou maior que 250 MB.');
  const ext = (/\.([a-z0-9]{1,6})$/i.exec(filename || '')?.[1] || 'bin').toLowerCase();
  const input = `entrada.${ext}`;
  const output = `saida.${format}`;
  await loadCore();
  lastProgress = 0;
  try {
    engine.FS.writeFile(input, file);
    let args;
    if (format === 'mp3') {
      const bitrate = ['128', '192', '320'].includes(quality) ? quality : '192';
      args = ['-hide_banner', '-loglevel', 'error', '-i', input, '-map', '0:a:0?', '-vn', '-c:a', 'libmp3lame', '-b:a', `${bitrate}k`, output];
    } else {
      const opts = {
        fast: { preset: 'ultrafast', crf: '32', audio: '96k' },
        balanced: { preset: 'ultrafast', crf: '27', audio: '128k' },
        high: { preset: 'veryfast', crf: '22', audio: '192k' }
      };
      const chosen = opts[quality] || opts.fast;
      args = ['-hide_banner', '-loglevel', 'error', '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', chosen.preset, '-crf', chosen.crf, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', chosen.audio, '-movflags', '+faststart', output];
    }
    const code = run(args);
    if (code !== 0) throw new Error('O FFmpeg não conseguiu converter este arquivo. Verifique se o formato de entrada é suportado e se o vídeo/áudio não está danificado.');
    const bytes = engine.FS.readFile(output);
    if (!bytes?.byteLength) throw new Error('O conversor não gerou dados de saída.');
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    self.postMessage({ type: 'done', data: buffer }, [buffer]);
  } finally {
    try { engine.FS.unlink(input); } catch {}
    try { engine.FS.unlink(output); } catch {}
  }
}
self.onmessage = async (e) => {
  if (e.data?.type !== 'convert') return;
  try { await convert(e.data); }
  catch (e) { emit('error', { error: e?.message || String(e) }); }
};
