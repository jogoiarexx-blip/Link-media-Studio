FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/yt && /opt/yt/bin/pip install --no-cache-dir -U 'yt-dlp[default]'
ENV PATH="/opt/yt/bin:$PATH" PORT=3000 NODE_ENV=production
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node public ./public
COPY --chown=node:node server ./server
USER node
EXPOSE 3000
CMD ["node", "server/server.js"]
