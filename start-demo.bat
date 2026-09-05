@echo off
REM CreatorFlow AI — one-command local demo (Windows).
REM Why local? Render's shared egress IPs are hard-blocked by YouTube's
REM anti-bot system (full diagnosis in ARCHITECTURE.md). The exact same
REM container works fine from a residential IP, so the demo runs here.
setlocal EnableDelayedExpansion

cd /d "%~dp0"

echo === CreatorFlow AI local demo ===
echo.

REM --- 1. Docker daemon ------------------------------------------------
docker info >nul 2>&1
if errorlevel 1 (
  echo [1/4] Docker daemon is down - starting Docker Desktop, please wait...
  start "" "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe"
  set TRIES=0
  :waitdocker
  timeout /t 10 /nobreak >nul
  docker info >nul 2>&1
  if not errorlevel 1 goto dockerup
  set /a TRIES+=1
  if !TRIES! GEQ 18 (
    echo ERROR: Docker Desktop did not start within 3 minutes. Start it manually and re-run.
    pause & exit /b 1
  )
  goto waitdocker
)
:dockerup
echo [1/4] Docker daemon is up.

REM --- 2. Backend image -------------------------------------------------
docker image inspect creatorflow-ai:demo >nul 2>&1
if errorlevel 1 (
  echo [2/4] Building backend image (one-time, ~8 min: yt-dlp + ffmpeg + PO-token sidecar)...
  docker build -t creatorflow-ai:demo ./server
  if errorlevel 1 (
    echo ERROR: backend image build failed. See output above.
    pause & exit /b 1
  )
) else (
  echo [2/4] Backend image present.
)

REM --- 3. Backend container ---------------------------------------------
docker rm -f cf-demo >nul 2>&1
if not exist ".env" (
  echo WARNING: root .env not found - GROQ_API_KEY will be missing, so SEO and
  echo   AI-transcription will fail gracefully. Create .env with GROQ_API_KEY=...
  echo   for the full pipeline.
  set ENVFILE=
) else (
  findstr /r "^GROQ_API_KEY=.." .env >nul 2>&1
  if errorlevel 1 (
    echo WARNING: GROQ_API_KEY not set in .env - SEO and AI-transcription will
    echo   fail gracefully. Add it for the full pipeline.
  )
  set ENVFILE=--env-file .env
)
echo [3/4] Starting backend on http://localhost:8787 ...
start "CreatorFlow backend" docker run --rm --name cf-demo -p 8787:8787 -e PORT=8787 %ENVFILE% creatorflow-ai:demo

REM --- 4. Frontend -------------------------------------------------------
echo [4/4] Starting frontend...
echo.
echo   App:     http://localhost:5173
echo   Backend: http://localhost:8787 ^(health: /healthz, version: /version^)
echo   Status:  http://localhost:5173/status
echo.
echo   Public-URL option for judging: cloudflared tunnel --url http://localhost:8787
echo   Then set VITE_API_BASE_URL to the tunnel URL and restart the frontend.
echo.
set VITE_API_BASE_URL=http://localhost:8787
start "CreatorFlow frontend" npm run dev
echo Frontend starting in a second window. Leave both windows open; Ctrl+C each to stop.
pause
