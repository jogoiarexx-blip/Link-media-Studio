'use strict';
function canonicalVideo(input) {
  if (typeof input !== 'string' || input.length > 2048) return null;
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    let id = null;
    if (host === 'youtu.be') id = url.pathname.split('/')[1];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(host)) {
      const p = url.pathname.split('/').filter(Boolean);
      if (p[0] === 'watch' && (host === 'youtube.com' || host.endsWith('.youtube.com'))) id = url.searchParams.get('v');
      else if (['shorts','live','embed'].includes(p[0])) id = p[1];
    }
    return /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? `https://www.youtube.com/watch?v=${id}` : null;
  } catch { return null; }
}
function safeName(s) {return String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '_').slice(0, 140);}
function validOptions(d) {
  if (!d || !['mp3','mp4'].includes(d.format)) return false;
  const allowed = d.format === 'mp3' ? ['best','192','128'] : ['best','1080','720','480','360'];
  return allowed.includes(d.quality);
}
module.exports = {canonicalVideo, safeName, validOptions};
