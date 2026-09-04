# syntax=docker/dockerfile:1.7

# ---- builder ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# yt-dlp + ffmpeg + python (yt-dlp runtime) + bgutil PO-token provider plugin.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
 && python3 -m pip install --break-system-packages -U yt-dlp bgutil-ytdlp-pot-provider \
 && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/tmp /app/bin && chown -R node:node /app
USER node

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||8787) +'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]