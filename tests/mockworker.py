import sys,json,time,os
mode,url,fmt,quality=sys.argv[1:5]
def emit(x):
    print(json.dumps(x),flush=True)
if mode=='preview':
    emit({'type':'preview','title':'Vídeo de teste','creator':'Canal de testes','duration':125,'id':'dQw4w9WgXcQ','qualities':[720,480,360],'source':'YouTube'})
else:
    for p in [10,35,70,100]:
        emit({'type':'download','percent':p,'received':p*100,'total':10000,'speed':1000,'eta':1})
        time.sleep(.08)
    emit({'type':'transfer_finished'})
    emit({'type':'processing','processor':'FFmpegExtractAudio'})
    time.sleep(.08)
    with open('arquivo-teste.'+fmt,'wb') as f: f.write(b'linkmedia-mock-content')
    emit({'type':'processing_done'})
    emit({'type':'finished'})
