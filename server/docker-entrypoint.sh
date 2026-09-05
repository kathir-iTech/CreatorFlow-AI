#!/bin/sh
# Render entrypoint: boot the PO-token sidecar first, then the API.
# The sidecar is best-effort — the Express app ALWAYS boots so a sidecar
# failure is loud (WARN + /system canary) instead of a dead container.

BGUTIL_MAIN="/opt/bgutil/server/build/main.js"
BGUTIL_PORT="${BGUTIL_PORT:-4416}"

if [ -f "$BGUTIL_MAIN" ]; then
  echo "[entrypoint] starting bgutil PO-token sidecar on 127.0.0.1:${BGUTIL_PORT}"
  node "$BGUTIL_MAIN" --host 127.0.0.1 --port "$BGUTIL_PORT" > /tmp/bgutil.log 2>&1 &
  BGUTIL_PID=$!
  READY=0
  for i in $(seq 1 30); do
    if node -e "fetch('http://127.0.0.1:${BGUTIL_PORT}/ping').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
      echo "[entrypoint] bgutil sidecar ready (pid ${BGUTIL_PID})"
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

exec node dist/server.js
