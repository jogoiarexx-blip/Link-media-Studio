#!/usr/bin/env python3
"""Isolated yt-dlp bridge. Protocol: newline-delimited JSON over stdout."""
import json
import os
import sys


def emit(kind, **values):
    print(json.dumps({'type': kind, **values}, ensure_ascii=False), flush=True)


def number(v):
    try:
        if v is None:
            return None
        f = float(v)
        return f if f >= 0 and f < 1e15 else None
    except (ValueError, TypeError):
        return None


class Logger:
    def debug(self, _):
        pass
    def info(self, _):
        pass
    def warning(self, _):
        pass
    def error(self, msg):
        print(str(msg)[:500], file=sys.stderr, flush=True)


def main():
    if len(sys.argv) != 5:
        raise ValueError('Argumentos inválidos')
    mode, url, fmt, quality = sys.argv[1:]
    import yt_dlp

    opts = {
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'skip_download': mode == 'preview',
        'ignoreerrors': False,
        'socket_timeout': 20,
        'retries': 2,
        'fragment_retries': 2,
        'logger': Logger(),
        'max_filesize': 800 * 1024 * 1024,
        'restrictfilenames': True,
        'outtmpl': '%(title).95s-%(id)s.%(ext)s',
    }
    if mode == 'preview':
        with yt_dlp.YoutubeDL(opts) as dl:
            info = dl.extract_info(url, download=False)
            if not info or info.get('is_live') or info.get('live_status') == 'is_live':
                raise ValueError('Transmissões ao vivo não são suportadas.')
            duration = number(info.get('duration'))
            if duration is not None and duration > 5400:
                raise ValueError('O limite é de 90 minutos por vídeo.')
            heights = sorted({int(f['height']) for f in (info.get('formats') or [])
                              if isinstance(f.get('height'), int) and f.get('vcodec') not in (None, 'none')}, reverse=True)
            options = [r for r in [1080, 720, 480, 360] if any(r - 25 <= h <= r for h in heights)]
            emit('preview', title=str(info.get('title') or 'Vídeo sem título')[:180],
                 creator=str(info.get('uploader') or info.get('channel') or 'Canal não informado')[:120],
                 duration=int(duration) if duration is not None else None,
                 id=str(info.get('id') or '')[:20],
                 qualities=options,
                 source='YouTube')
        return

    if mode != 'download' or fmt not in ('mp3', 'mp4'):
        raise ValueError('Operação inválida')

    def on_progress(d):
        status = d.get('status')
        if status == 'downloading':
            total = number(d.get('total_bytes')) or number(d.get('total_bytes_estimate'))
            received = number(d.get('downloaded_bytes'))
            fraction = round(received / total * 100, 1) if received is not None and total else None
            emit('download', percent=min(100, fraction) if fraction is not None else None,
                 received=received, total=total, speed=number(d.get('speed')),
                 eta=number(d.get('eta')), fragment=d.get('fragment_index'),
                 fragments=d.get('fragment_count'))
        elif status == 'finished':
            emit('transfer_finished')

    def on_processing(d):
        status = d.get('status')
        if status in ('started', 'processing'):
            emit('processing', processor=str(d.get('postprocessor') or 'FFmpeg')[:80])
        elif status == 'finished':
            emit('processing_done', processor=str(d.get('postprocessor') or 'FFmpeg')[:80])

    opts['progress_hooks'] = [on_progress]
    opts['postprocessor_hooks'] = [on_processing]
    if fmt == 'mp3':
        opts['format'] = 'bestaudio/best'
        opts['postprocessors'] = [{
            'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3',
            'preferredquality': ('0' if quality == 'best' else quality),
        }]
    else:
        constraint = '' if quality == 'best' else f'[height<={int(quality)}]'
        opts['format'] = (f'bestvideo{constraint}[vcodec^=avc]+bestaudio[acodec^=mp4a]/'
                          f'best{constraint}[ext=mp4]/bestvideo{constraint}+bestaudio/'
                          f'best{constraint}' + ('/best' if quality == 'best' else ''))
        opts['merge_output_format'] = 'mp4'
        opts['postprocessors'] = [{'key': 'FFmpegVideoConvertor', 'preferedformat': 'mp4'}]
    opts['match_filter'] = yt_dlp.utils.match_filter_func('duration <= 5400 | duration = NA')
    with yt_dlp.YoutubeDL(opts) as dl:
        ret = dl.download([url])
    if ret != 0:
        raise RuntimeError('O download não foi concluído.')
    emit('finished')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        emit('error', error=str(e)[:400] or 'Falha ao processar vídeo')
        sys.exit(1)
