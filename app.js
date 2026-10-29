/* LinkMedia Studio v5 - 100% static / GitHub Pages */
(() => {
  'use strict';
  const MAX_BYTES = 250 * 1024 * 1024;
  const el = (id) => document.getElementById(id);
  const ui = {
    tabFile: el('tabFile'), tabLink: el('tabLink'), filePanel: el('filePanel'), linkPanel: el('linkPanel'),
    dropzone: el('dropzone'), fileInput: el('fileInput'), mediaUrl: el('mediaUrl'), pasteButton: el('pasteButton'),
    fetchButton: el('fetchButton'), linkInfo: el('linkInfo'), filePreview: el('filePreview'),
    videoPreview: el('videoPreview'), audioPreview: el('audioPreview'), audioPlaceholder: el('audioPlaceholder'),
    fileName: el('fileName'), fileSize: el('fileSize'), fileDuration: el('fileDuration'), clearFile: el('clearFile'),
    mp3Option: el('mp3Option'), mp4Option: el('mp4Option'), qualitySelect: el('qualitySelect'),
    qualityHelp: el('qualityHelp'), convertButton: el('convertButton'), statusPanel: el('statusPanel'),
    stageTitle: el('stageTitle'), progressPct: el('progressPct'), progressBar: el('progressBar'),
    indeterminate: el('indeterminate'), statusDetail: el('statusDetail'), cancelButton: el('cancelButton'),
    resultPanel: el('resultPanel'), resultInfo: el('resultInfo'), downloadButton: el('downloadButton'),
    alertPanel: el('alertPanel')
  };
  const state = { file: null, originURL: null, downloadURL: null, worker: null, controller: null, busy: false, jobId: 0, origin: 'file' };
  const socialSites = [
    ['YouTube', ['youtube.com', 'youtu.be']], ['TikTok', ['tiktok.com']], ['Instagram', ['instagram.com']],
    ['Facebook', ['facebook.com', 'fb.watch']], ['X / Twitter', ['x.com', 'twitter.com']],
    ['Vimeo', ['vimeo.com']], ['Reddit', ['reddit.com']], ['SoundCloud', ['soundcloud.com']],
    ['Twitch', ['twitch.tv']], ['Dailymotion', ['dailymotion.com']], ['Pinterest', ['pinterest.com']],
    ['Bandcamp', ['bandcamp.com']], ['Bilibili', ['bilibili.com']], ['Rumble', ['rumble.com']]
  ];
  const mediaExt = /\.(mp4|mp3|webm|mov|m4v|m4a|aac|ogg|opus|wav|flac|mkv|avi|flv)(?:$|[?#])/i;
  const fmtSize = (bytes) => !Number.isFinite(bytes) ? '—' : bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
  const fmtDuration = (sec) => { if (!Number.isFinite(sec) || sec < 0) return 'Duração indisponível'; const s = Math.round(sec); return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const safeName = (name) => name.replace(/\.[^/.]+$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 100) || 'linkmedia';
  const suffix = (name) => { const match = /\.([a-zA-Z0-9]{1,6})$/.exec(name); return match ? match[1].toLowerCase() : 'bin'; };
  const isAudioFile = (f) => f.type.startsWith('audio/') || /\.(mp3|wav|flac|aac|m4a|opus|ogg)$/i.test(f.name);
  const matchDomain = (hostname, domain) => hostname === domain || hostname.endsWith(`.${domain}`);
  const getSocialSite = (host) => socialSites.find(([, domains]) => domains.some((d) => matchDomain(host, d)))?.[0] || null;
  const setText = (node, text) => { node.textContent = text; };

  function setAlert(message) { ui.alertPanel.hidden = !message; setText(ui.alertPanel, message || ''); }
  function setLinkInfo(message) { ui.linkInfo.hidden = !message; setText(ui.linkInfo, message || ''); }
  function clearResult() { if (state.downloadURL) URL.revokeObjectURL(state.downloadURL); state.downloadURL = null; ui.resultPanel.hidden = true; ui.downloadButton.removeAttribute('href'); }
  function setBusy(busy) { state.busy = busy; ui.convertButton.disabled = busy || !state.file; ui.fetchButton.disabled = busy; ui.tabFile.disabled = busy; ui.tabLink.disabled = busy; ui.clearFile.disabled = busy; ui.fileInput.disabled = busy; updateButton(); }
  function updateButton() { const label = ui.convertButton.querySelector('span'); setText(label, state.busy ? 'Processando seu arquivo...' : state.file ? `Converter para ${getFormat().toUpperCase()}` : 'Selecione um arquivo para converter'); }
  const getFormat = () => document.querySelector('input[name="format"]:checked').value;
  function updateFormat() {
    const mp3 = getFormat() === 'mp3';
    ui.mp3Option.classList.toggle('chosen', mp3); ui.mp4Option.classList.toggle('chosen', !mp3);
    ui.qualitySelect.replaceChildren();
    const entries = mp3 ? [['192', '192 kbps · Equilibrado'], ['128', '128 kbps · Arquivo menor'], ['320', '320 kbps · Alta qualidade']] : [['fast', 'Rápido · Arquivo menor'], ['balanced', 'Equilibrado · Recomendado'], ['high', 'Qualidade alta · Mais lento']];
    for (const [value, label] of entries) { const option = document.createElement('option'); option.value = value; option.textContent = label; ui.qualitySelect.appendChild(option); }
    setText(ui.qualityHelp, mp3 ? 'Qualidade do áudio' : 'Qualidade do vídeo convertido');
    updateButton(); clearResult();
  }
  function updateFileView() {
    const file = state.file;
    ui.filePreview.hidden = !file;
    if (!file) { ui.convertButton.disabled = true; updateButton(); return; }
    ui.convertButton.disabled = state.busy;
    setText(ui.fileName, file.name); setText(ui.fileSize, fmtSize(file.size)); setText(ui.fileDuration, 'Verificando duração...');
    if (state.originURL) URL.revokeObjectURL(state.originURL);
    state.originURL = URL.createObjectURL(file);
    for (const media of [ui.videoPreview, ui.audioPreview]) { media.pause(); media.hidden = true; media.removeAttribute('src'); media.load(); }
    ui.audioPlaceholder.hidden = true;
    const audio = isAudioFile(file);
    const media = audio ? ui.audioPreview : ui.videoPreview;
    media.hidden = false;
    if (audio) ui.audioPlaceholder.hidden = true;
    media.onloadedmetadata = () => setText(ui.fileDuration, `Duração: ${fmtDuration(media.duration)}`);
    media.onerror = () => { setText(ui.fileDuration, 'Prévia indisponível (a conversão ainda pode funcionar)'); media.hidden = true; ui.audioPlaceholder.hidden = false; };
    media.src = state.originURL;
    clearResult(); setAlert(''); updateButton();
  }
  function setFile(file) {
    if (!file) return;
    if (state.busy) return;
    if (!file.size) { setAlert('Este arquivo está vazio. Escolha outro.'); return; }
    if (file.size > MAX_BYTES) { setAlert('Arquivo muito grande para a conversão local. O limite desta versão é 250 MB.'); return; }
    if (!file.type.startsWith('video/') && !file.type.startsWith('audio/') && !/\.(mkv|flv|avi|mov|m4a|opus|ogg|webm|mp3|wav|mp4|flac|aac|m4v)$/i.test(file.name)) { setAlert('Selecione um arquivo de áudio ou vídeo compatível.'); return; }
    state.file = file; ui.statusPanel.hidden = true; updateFileView();
  }
  function resetFile() {
    if (state.busy) return;
    state.file = null; ui.fileInput.value = ''; ui.filePreview.hidden = true;
    for (const media of [ui.videoPreview, ui.audioPreview]) { media.pause(); media.onloadedmetadata = null; media.onerror = null; media.removeAttribute('src'); media.load(); }
    if (state.originURL) URL.revokeObjectURL(state.originURL); state.originURL = null;
    ui.statusPanel.hidden = true; clearResult(); setAlert(''); updateButton(); ui.convertButton.disabled = true;
  }
  function switchMode(mode) {
    if (state.busy) return;
    state.origin = mode;
    const isFile = mode === 'file';
    ui.tabFile.classList.toggle('active', isFile); ui.tabLink.classList.toggle('active', !isFile);
    ui.tabFile.setAttribute('aria-selected', String(isFile)); ui.tabLink.setAttribute('aria-selected', String(!isFile));
    ui.filePanel.hidden = !isFile; ui.linkPanel.hidden = isFile; setAlert(''); setLinkInfo('');
  }
  function classifyUrl(raw) {
    let url;
    try { url = new URL(raw.trim()); } catch { return { ok: false, message: 'Cole uma URL HTTPS válida.' }; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return { ok: false, message: 'Use um link HTTPS público sem credenciais ou porta personalizada.' };
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':') || !host.includes('.')) return { ok: false, message: 'Endereço não permitido neste conversor.' };
    const platform = getSocialSite(host);
    if (platform && !mediaExt.test(url.pathname)) return { ok: false, message: `Link de página identificado: ${platform}. O GitHub Pages não consegue extrair esse vídeo sem servidor. Use um arquivo salvo no dispositivo ou uma URL direta do arquivo, com acesso CORS permitido.` };
    return { ok: true, url, platform };
  }
  function deriveFilename(url, type) {
    let name = 'midia';
    try { name = decodeURIComponent(url.pathname.split('/').pop() || 'midia'); } catch { name = url.pathname.split('/').pop() || 'midia'; }
    name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 100);
    if (!/\.[a-zA-Z0-9]{2,6}$/.test(name)) { const ext = type.includes('audio') ? 'mp3' : type.includes('webm') ? 'webm' : 'mp4'; name = `${name}.${ext}`; }
    return name;
  }
  function setProgress(title, detail, value) {
    ui.statusPanel.hidden = false;
    setText(ui.stageTitle, title); setText(ui.statusDetail, detail);
    const known = Number.isFinite(value) && value >= 0 && value <= 100;
    ui.indeterminate.hidden = known;
    ui.progressBar.style.width = known ? `${value}%` : '0%';
    setText(ui.progressPct, known ? `${Math.round(value)}%` : '—');
  }
  async function fetchDirect() {
    if (state.busy) return;
    const validation = classifyUrl(ui.mediaUrl.value);
    if (!validation.ok) { setLinkInfo(validation.message); return; }
    setLinkInfo(''); setAlert(''); resetFile(); setBusy(true);
    const controller = new AbortController(); state.controller = controller;
    const id = ++state.jobId; const start = performance.now();
    try {
      setProgress('Carregando arquivo direto', 'Verificando acesso ao arquivo...', null);
      const response = await fetch(validation.url.href, { signal: controller.signal, mode: 'cors', credentials: 'omit', redirect: 'follow' });
      if (!response.ok) throw new Error(`O servidor respondeu com HTTP ${response.status}.`);
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (/text\/html|application\/json|text\/plain|application\/xml/.test(contentType)) throw new Error('Esse endereço devolveu uma página, não um arquivo de mídia. Cole o link direto para o áudio ou vídeo.');
      if (!(/^(audio|video)\//.test(contentType) || mediaExt.test(validation.url.pathname))) throw new Error('O servidor não identificou um arquivo de áudio/vídeo nesse link.');
      const declaredSize = Number(response.headers.get('content-length'));
      if (declaredSize > MAX_BYTES) throw new Error('Arquivo remoto maior que o limite de 250 MB.');
      if (!response.body) throw new Error('O navegador não permitiu ler a transferência deste arquivo.');
      const reader = response.body.getReader(); const chunks = []; let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (id !== state.jobId || controller.signal.aborted) throw new DOMException('Cancelado', 'AbortError');
        total += value.byteLength;
        if (total > MAX_BYTES) { await reader.cancel(); throw new Error('Download interrompido: arquivo maior que 250 MB.'); }
        chunks.push(value);
        const seconds = Math.max(.1, (performance.now() - start) / 1000);
        const speed = total / seconds;
        setProgress('Baixando mídia', `${fmtSize(total)} recebidos · ${fmtSize(speed)}/s${declaredSize ? ` · total ${fmtSize(declaredSize)}` : ''}`, declaredSize > 0 ? Math.min(100, total / declaredSize * 100) : null);
      }
      if (!total) throw new Error('A URL retornou um arquivo vazio.');
      const name = deriveFilename(validation.url, contentType);
      const file = new File(chunks, name, { type: contentType.split(';')[0] || 'application/octet-stream' });
      if (id === state.jobId) { state.file = file; updateFileView(); setLinkInfo('Arquivo recebido diretamente no navegador. Escolha MP3 ou MP4 e inicie a conversão.'); }
    } catch (e) {
      if (e?.name !== 'AbortError') setLinkInfo(e instanceof TypeError ? 'O download foi bloqueado pelo navegador ou pela política CORS da origem. O GitHub Pages não consegue contornar essa restrição. Use um arquivo local ou um link direto com CORS liberado.' : e.message || 'Não foi possível carregar o arquivo.');
    } finally {
      if (state.controller === controller) state.controller = null;
      ui.statusPanel.hidden = true;
      setBusy(false);
    }
  }
  function createWorker() {
    const worker = new Worker('./converter-worker.js');
    state.worker = worker;
    return worker;
  }
  async function convert() {
    if (!state.file || state.busy) return;
    if (isAudioFile(state.file) && getFormat() === 'mp4') { setAlert('Este arquivo contém apenas áudio. Escolha MP3. Para criar vídeo MP4, selecione um arquivo de vídeo.'); return; }
    clearResult(); setAlert(''); setBusy(true); const jobId = ++state.jobId;
    const input = state.file;
    const format = getFormat(); const quality = ui.qualitySelect.value;
    const outName = `${safeName(input.name)}.${format}`;
    const worker = createWorker();
    let completed = false;
    worker.onmessage = (evt) => {
      if (jobId !== state.jobId) return;
      const message = evt.data;
      switch (message.type) {
        case 'loading': setProgress('Preparando conversor', message.detail || 'Baixando mecanismo de conversão...', null); break;
        case 'ready': setProgress('Iniciando conversão', 'Mecanismo de conversão carregado.', null); break;
        case 'progress': {
          const p = Number.isFinite(message.progress) && message.progress >= 0 && message.progress <= 1 ? message.progress * 100 : null;
          setProgress('Convertendo arquivo', 'Processando áudio/vídeo no seu dispositivo · percentual aproximado', p);
          break;
        }
        case 'done': {
          completed = true;
          state.downloadURL = URL.createObjectURL(new Blob([message.data], { type: format === 'mp3' ? 'audio/mpeg' : 'video/mp4' }));
          ui.downloadButton.href = state.downloadURL;
          ui.downloadButton.download = outName;
          setText(ui.resultInfo, `${outName} · ${fmtSize(message.data.byteLength)}`);
          ui.resultPanel.hidden = false;
          setProgress('Conversão concluída', 'Arquivo pronto para baixar.', 100);
          setBusy(false); cleanupWorker();
          break;
        }
        case 'error': { completed = true; setAlert(message.error || 'Falha durante a conversão.'); ui.statusPanel.hidden = true; setBusy(false); cleanupWorker(); break; }
      }
    };
    worker.onerror = (evt) => { if (jobId !== state.jobId || completed) return; setAlert('Falha ao iniciar o mecanismo WebAssembly. Confira sua conexão e tente novamente.'); ui.statusPanel.hidden = true; setBusy(false); cleanupWorker(); evt.preventDefault(); };
    try {
      setProgress('Preparando arquivo', `Lendo ${fmtSize(input.size)} do dispositivo...`, null);
      const data = await input.arrayBuffer();
      if (jobId !== state.jobId) return;
      worker.postMessage({ type: 'convert', data, filename: input.name, format, quality }, [data]);
    } catch (e) {
      setAlert(`Não foi possível ler o arquivo: ${e.message}`); ui.statusPanel.hidden = true; setBusy(false); cleanupWorker();
    }
  }
  function cleanupWorker() { if (state.worker) state.worker.terminate(); state.worker = null; }
  function cancel() {
    state.jobId += 1;
    if (state.controller) state.controller.abort(); state.controller = null;
    cleanupWorker(); ui.statusPanel.hidden = true; setBusy(false);
    setAlert('Operação cancelada. Você pode iniciar novamente.');
  }
  ui.tabFile.addEventListener('click', () => switchMode('file'));
  ui.tabLink.addEventListener('click', () => switchMode('link'));
  ui.dropzone.addEventListener('click', () => ui.fileInput.click());
  ui.dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ui.fileInput.click(); } });
  ui.fileInput.addEventListener('change', () => setFile(ui.fileInput.files?.[0]));
  for (const type of ['dragenter', 'dragover']) ui.dropzone.addEventListener(type, (e) => { e.preventDefault(); ui.dropzone.classList.add('dragover'); });
  for (const type of ['dragleave', 'drop']) ui.dropzone.addEventListener(type, (e) => { e.preventDefault(); ui.dropzone.classList.remove('dragover'); });
  ui.dropzone.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) setFile(e.dataTransfer.files[0]); });
  ui.clearFile.addEventListener('click', resetFile);
  document.querySelectorAll('input[name="format"]').forEach((input) => input.addEventListener('change', updateFormat));
  ui.convertButton.addEventListener('click', convert); ui.cancelButton.addEventListener('click', cancel);
  ui.fetchButton.addEventListener('click', fetchDirect);
  ui.mediaUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchDirect(); });
  ui.mediaUrl.addEventListener('input', () => { const raw = ui.mediaUrl.value.trim(); const result = raw ? classifyUrl(raw) : null; setLinkInfo(result && !result.ok ? result.message : ''); });
  ui.pasteButton.addEventListener('click', async () => { try { ui.mediaUrl.value = await navigator.clipboard.readText(); ui.mediaUrl.dispatchEvent(new Event('input')); } catch { setLinkInfo('Cole o link manualmente: o navegador não liberou acesso à área de transferência.'); } });
  ui.downloadButton.addEventListener('click', () => { /* O atributo download aciona o arquivo já convertido */ });
  window.addEventListener('beforeunload', () => { if (state.originURL) URL.revokeObjectURL(state.originURL); if (state.downloadURL) URL.revokeObjectURL(state.downloadURL); cleanupWorker(); });
  updateFormat();
})();
