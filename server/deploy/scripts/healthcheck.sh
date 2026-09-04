#!/usr/bin/env bash
set -eu
PORT=${PORT:-8787}
curl -fsS "http://127.0.0.1:${PORT}/readyz" >/dev/null