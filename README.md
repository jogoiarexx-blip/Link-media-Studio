# LinkMedia Studio v5 — GitHub Pages, sem backend

Este projeto é um **site estático de verdade**: `index.html`, `styles.css`, `app.js`, `converter-worker.js`, `favicon.svg` e `.nojekyll`. Não precisa de servidor Node.js, Python, `yt-dlp`, build, Docker, chave de API ou banco de dados. Pode ser publicado diretamente em **GitHub Pages**.

## O que funciona

- Escolher/arrastar arquivo de vídeo ou áudio local; mostra nome, tamanho e, quando o navegador conseguir, prévia com duração.
- Converter **arquivos** para **MP3 (128/192/320 kbps)** e **vídeos** para **MP4 (três perfis)** no navegador, usando **FFmpeg WebAssembly (single-thread)**.
- Acompanhar carregamento do conversor e progresso *estimado* reportado pelo FFmpeg (a API de progresso é experimental e nem todos os arquivos fornecem porcentagem confiável).
- Cancelar uma conversão (encerra o Worker) e baixar o resultado.
- Informar URL HTTPS **direta do arquivo**. O navegador tenta baixá-lo usando `fetch` + CORS; mostra bytes e velocidade quando o servidor permite a leitura, depois permite converter.
- Layout responsivo para celular e computador, sem cadastro e sem upload de arquivos para servidor do LinkMedia.

## O que não funciona sem backend

**Links de páginas comuns do YouTube, TikTok, Instagram, Facebook e similares NÃO podem ser extraídos só com GitHub Pages.** São páginas web, não URLs diretas de mídia, e há restrições de CORS/streaming. O botão de link **não finge** que consegue baixá-las; explica o limite ao usuário.

Também não funciona com links diretos que bloqueiam CORS, URLs que pedem cookies/login, conteúdos privados, DRM, ou formatos que o FFmpeg compilado não tenha decodificadores para processar. Não usa proxies públicos, extensões suspeitas ou contorna proteções.

Se a prioridade absoluta for "colar link do YouTube → obter MP3/MP4", o **frontend pode continuar hospedado no GitHub Pages**, mas o download da plataforma precisa de um **backend externo autorizado**. Não existe solução universal, confiável e apenas estática que forneça esse fluxo em todos os sites.

## Publicar no GitHub Pages (sem instalar nada)

1. Crie um repositório público no GitHub ou abra um repositório existente.
2. Extraia o ZIP e envie **todos os arquivos da pasta** para a **raiz do repositório** (o `index.html` precisa ficar na raiz). Você pode usar **Add file → Upload files**.
3. Abra **Settings → Pages**.
4. Em **Build and deployment → Source**, selecione **Deploy from a branch**.
5. Selecione **main** e **/(root)**, depois **Save**.
6. Acesse `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/` após o GitHub publicar a página.

Não use os arquivos da versão v4 com `server/server.js`; esta versão v5 os substitui integralmente para o modo estático.

## Requisitos técnicos

- Navegador moderno (Chrome/Edge/Firefox recentes), WebAssembly, Web Workers, memória disponível e HTTPS.
- **Na primeira conversão**, o navegador baixa automaticamente os recursos do `@ffmpeg/core@0.12.10` pelo CDN jsDelivr. O arquivo `.wasm` tem dezenas de MB e **precisa de conexão com a internet**. Esta é uma dependência estática, **não um servidor de conversão**.
- Arquivos até 250 MB nesta versão. A conversão usa RAM proporcional ao arquivo e pode falhar antes desse limite em celulares ou aparelhos com pouco armazenamento/memória.
- No GitHub Pages não é possível configurar headers COOP/COEP livremente; portanto foi escolhido o core **single-thread**, que **não precisa de SharedArrayBuffer**.
- MP3 320 kbps é taxa de saída e **não melhora** o áudio da origem.

## Segurança e privacidade

O arquivo selecionado é processado **localmente no navegador**. O mecanismo de conversão é carregado de `cdn.jsdelivr.net` na primeira execução. URLs inseridas pelo usuário são acessadas diretamente pelo navegador ao endereço informado, sem passarem por proxy do LinkMedia. Nenhum dado é enviado a backend deste projeto. O arquivo convertido é disponibilizado como `blob:` e destruído ao fechar a página.

Use apenas arquivos próprios ou que tenha direito de baixar e converter. Projeto independente, sem associação com plataformas de streaming.

## Diagnóstico

- **A conversão não iniciou:** confira internet/CDN, desative temporariamente bloqueio de scripts na página e tente arquivo menor.
- **O link não carregou:** o servidor provavelmente bloqueou CORS ou devolveu HTML; use um arquivo local.
- **MP4 ficou lento:** a codificação H.264 em WebAssembly consome muito processamento; escolha "Rápido" ou um arquivo menor.
- **Prévia não aparece:** o navegador pode não reproduzir MKV/codec da origem; tente converter mesmo assim.

## Desenvolvimento/testes

Os arquivos são estáticos. Para pré-visualizar localmente, é recomendado usar `python -m http.server 8080` dentro da pasta; então acesse `http://localhost:8080`. Não abra com `file://`, pois Workers podem ser bloqueados.

Testes básicos com Node (somente para desenvolvimento, não para publicar):

```bash
node --test tests/*.test.mjs
```

Os testes automatizados exercitam validação estática e Worker com FFmpeg simulado. **Não** confirmam conversão real no navegador; testes reais exigem acesso ao WASM externo e arquivos de mídia autorizados.

## Tecnologias e licenças

Interface: HTML/CSS/JavaScript. Mecanismo: FFmpeg WebAssembly, `@ffmpeg/core@0.12.10` (componente LGPL/GPL conforme a distribuição, bibliotecas vinculadas e opções). Consulte as licenças e avisos no projeto original: https://github.com/ffmpegwasm/ffmpeg.wasm e https://ffmpeg.org/legal.html. Não redistribuímos binários do núcleo FFmpeg neste ZIP; são carregados sob demanda do CDN.
