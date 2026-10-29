# LinkMedia Studio v3

Site responsivo para **prévia automática** de vídeos, seleção de MP3/MP4 e acompanhamento dos dados reais de transferência. Destinado a mídias próprias ou expressamente autorizadas; não contorna paywalls ou DRM.

## O que mudou da v2

- Prévia automática após colar URL: título, canal, miniatura e duração (`POST /api/preview`).
- Qualidades de vídeo apresentadas conforme informação da mídia (quando disponível); áudio MP3 VBR / 192 / 128 kbps.
- Progresso verdadeiro do download: porcentagem informada, velocidade, bytes, estimativa de tempo, etapas separadas de preparação/download/FFmpeg.
- Não inventa porcentagem para recodificação FFmpeg (etapa indicada como em processamento).
- Download streaming sem guardar o arquivo inteiro na memória do cliente; link reutilizável por alguns minutos.
- Interface revisada para desktop e celular, teclado, mensagens de erro, cancelamento.
- URLs normalizadas com id de vídeo; impede playlists, hosts malformados e outros endereços; rate limiting básico e limite de paralelismo.
- Nova imagem visual, favicon, API de status, configuração para frontend estático e configuração Render.

## Iniciar em um servidor Linux ou Windows

Requer **Node 20+**, **Python 3**, **ffmpeg** e **yt-dlp Python** instalados e disponíveis ao usuário que executa o servidor.

```sh
python3 -m pip install -U 'yt-dlp[default]'
node server/server.js
```

Abre `http://localhost:3000`. No Windows, se o comando for `python` e não `python3`, configure `PYTHON=python` no ambiente.

## Docker (recomendado)

```sh
docker build -t linkmedia-v3 .
docker run --rm -p 3000:3000 --name linkmedia linkmedia-v3
```

Todos os componentes necessários à conversão são instalados no container.

## Publicação

**Opção mais simples: Render / Railway / VPS:** crie um serviço conectado ao repositório, escolha **Docker**, publique a porta `PORT` exposta pelo serviço. O mesmo servidor entrega o site e a API. Inclui `render.yaml`; ajuste o plano e o domínio. Hospedagem gratuita com pouca memória/CPU pode não suportar conversões longas.

**Se publicar o frontend no GitHub Pages:** envie **somente** o conteúdo da pasta `public/` para o Pages; publique o backend Docker em outro serviço. Em *Configuração avançada* informe a URL HTTPS da API. Configure a variável `ALLOWED_ORIGIN=https://SEU-USUARIO.github.io` no backend. O Pages sozinho **não** consegue executar o ffmpeg/yt-dlp.

Variáveis: `PORT=3000`, `PYTHON=python3`, `MAX_ACTIVE=2`, `ALLOWED_ORIGIN=https://site.exemplo` (aceita lista de origens separadas por vírgula), `TRUST_PROXY=1` somente quando atrás de proxy confiável que controla o cabeçalho X-Forwarded-For. `LINKMEDIA_WORKER` é apenas para testes/integradores confiáveis. **Não** há suporte a autenticação: antes de publicar para grande volume, coloque proteção de acesso, WAF/rate limiting de borda e monitoramento de disco.

## APIs

- `POST /api/preview` → `{url}` → `{title, creator, duration, thumbnail, qualities, url}`.
- `POST /api/jobs` → `{url,format:'mp3'|'mp4',quality:'best'|'192'|'128'|...}` → status e UUID.
- `GET /api/jobs/:id` → `{state,stage,percent,received,total,speed,eta,filename,...}`.
- `DELETE /api/jobs/:id` → cancelar tarefa.
- `GET /api/jobs/:id/download` → arquivo como streaming temporário.
- `GET /api/health` → versão/capacidade.

Duração máxima: 90 minutos; tamanho de mídia limitado a 800MB; jobs expiram após 10 min e prévias ficam em cache por 5 min. A porcentagem informada diz respeito **à transferência**, não à recodificação. Os arquivos são temporários no backend, não em contas de armazenamento do usuário.

## Testar

```sh
npm test
```

Os testes automatizados usam um **worker simulado**: validam HTTP, prévia, validação de URLs, estados de processamento e download, mas **não** demonstram que o YouTube real funcionará na hospedagem. Acessibilidade e navegação visual precisam de teste em navegador. O funcionamento da extração depende de mudanças no site de origem e de suas regras. MP3 192/128 kbps descrevem taxa de *saída*, não melhoram o áudio de origem.
