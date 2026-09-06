#!/usr/bin/env bash
# SHARED — healthcheck for Docker/Render (used by HEALTHCHECK and Render healthCheckPath)
set -eu
PORT=${PORT:-8787}
curl -fsS "http://127.0.0.1:${PORT}/readyz" >/dev/null