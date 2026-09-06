#!/bin/sh
# Render entrypoint: boot the PO-token sidecar first, then the API.
# The sidecar is best-effort — the Express app ALWAYS boots so a sidecar
# failure is loud (WARN + /system canary) instead of a dead container.
#
# Memory audit (Step 2): This sidecar is a permanently-resident Node (~60-90 MB RSS)
# + Deno runtime (~30-50 MB) = ~90-140 MB baseline, ~18-27% of Render free 512 MB,
# even idle. Consider lazy-start (BGUTIL_LAZY=1) to spawn only on first token-needing
# request and idle-kill after 10 min — measured via entrypoint ps + runtime probe.

BGUTIL_MAIN="/opt/bgutil/server/build/main.js"
BGUTIL_PORT="${BGUTIL_PORT:-4416}"

# Lazy mode: if BGUTIL_LAZY=1, don't auto-start sidecar at boot — server.ts
# will spawn it on demand via BgutilManager (idle timeout 15 min). Saves ~100 MB
# when no YouTube request is in flight, at cost of ~2-3s cold-start on first token.
if [ "${BGUTIL_LAZY:-0}" = "1" ]; then
  echo "[entrypoint] BGUTIL_LAZY=1 — sidecar not auto-started, will be spawned lazily on demand"
else
if [ -f "$BGUTIL_MAIN" ]; then
  echo "[entrypoint] starting bgutil PO-token sidecar on 127.0.0.1:${BGUTIL_PORT}"
  node "$BGUTIL_MAIN" --host 127.0.0.1 --port "$BGUTIL_PORT" > /tmp/bgutil.log 2>&1 &
  BGUTIL_PID=$!
  READY=0
  for i in $(seq 1 30); do
    if node -e "fetch('http://127.0.0.1:${BGUTIL_PORT}/ping').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
      echo "[entrypoint] bgutil sidecar ready (pid ${BGUTIL_PID})"
      # Memory audit: report sidecar RSS right after ready
      if command -v ps >/dev/null 2>&1; then
        ps -o pid,rss,comm -p "$BGUTIL_PID" 2>/dev/null || true
      fi
      READY=1
      break
    fi
    sleep 1
  done
  if [ "$READY" != "1" ]; then
    echo "[entrypoint] WARNING: bgutil sidecar did not answer /ping within 30s (pid ${BGUTIL_PID}) — API boots degraded, see /tmp/bgutil.log"
  fi
else
  echo "[entrypoint] WARNING: ${BGUTIL_MAIN} missing — PO-token sidecar unavailable, YouTube extraction will likely fail"
fi
fi

exec node dist/server.js
