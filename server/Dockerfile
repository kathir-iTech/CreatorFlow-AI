# syntax=docker/dockerfile:1.7
# Render Dockerfile — persistent Node service (not serverless).
# Installs yt-dlp + ffmpeg as normal system packages via apt-get/pip (no static-binary tricks).

# NOTE: node:22 (not 20). The bgutil PO-token sidecar upstream requires
# node>=22, and the Express app runs fine on 22 (engines: node>=20).
# ---- builder ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
# Bust any tsc incremental cache and force a clean compile every build.
RUN rm -rf dist .tsbuildinfo node_modules/.cache \
 && npm run build \
 && test -f dist/server.js \
 && grep -q "BUILD MARKER" dist/server.js \
 && echo "BUILD OK: dist/server.js contains BUILD MARKER"

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Install ffmpeg (provides ffprobe), python3/pip, yt-dlp, and the bgutil
# PO-token provider plugin so YouTube extraction can obtain a PO token via
# the sidecar HTTP server.
# NOTE: yt-dlp tracks the NIGHTLY channel (--pre), not stable. YouTube ships
# extractor-breaking changes near-weekly and nightly carries the hotfixes
# days before stable releases; for a live-breaking extractor issue the
# version delta is usually the cause (diagnosed 2026-09-05: stable 2026.08.19
# was 17 days / 20 commits behind master while all videos failed identically).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates curl unzip \
  && python3 -m pip install --break-system-packages -U --pre yt-dlp bgutil-ytdlp-pot-provider \
  && ffmpeg -version >/dev/null \
  && ffprobe -version >/dev/null \
  && yt-dlp --version >/dev/null \
  && rm -rf /var/lib/apt/lists/*

# Install Deno as the JS runtime yt-dlp uses for YouTube signature / n-sig
# challenge solving. Without it yt-dlp logs "JS runtimes: none" and fails
# with "Signature solving failed" on most videos.
ENV DENO_INSTALL=/usr/local/deno
ENV PATH=$DENO_INSTALL/bin:$PATH
RUN curl -fsSL https://deno.land/install.sh | sh -s -- -y \
 && deno --version

# PO-token sidecar (bgutil-ytdlp-pot-provider HTTP server). Built from source
# rather than the prebuilt image because Render free runs ONE container:
# the sidecar must live in THIS image on 127.0.0.1:4416.
# Freshness beats pinning here (same argument as nightly yt-dlp) — depth-1
# master. If upstream breaks the build, the Docker build fails LOUDLY and the
# previous deploy keeps serving; the entrypoint also boots the API degraded
# if the sidecar file is missing at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && git clone --depth 1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil \
  && cd /opt/bgutil/server \
  && npm ci --no-audit --no-fund \
  && npx tsc \
  && test -f build/main.js \
  && echo "BGUTIL BUILD OK: server/build/main.js present"

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/tmp /app/bin && chown -R node:node /app /opt/bgutil
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh && chown node:node /app/docker-entrypoint.sh
USER node

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||8787) +'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "/app/docker-entrypoint.sh"]