#!/usr/bin/env bash
set -euo pipefail

# MediaHub Pro — Oracle Linux 8/9 install script.
# Run as root. Installs ffmpeg + yt-dlp + Node 20 and registers a systemd unit.

APP_DIR=${APP_DIR:-/opt/mediahub}
APP_USER=${APP_USER:-mediahub}

echo "==> Enabling EPEL + RPM Fusion (for ffmpeg)"
dnf install -y epel-release
dnf install -y --nogpgcheck https://download1.rpmfusion.org/free/el/rpmfusion-free-release-$(rpm -E %rhel).noarch.rpm || true
dnf install -y ffmpeg ffmpeg-devel python3 python3-pip curl tar gzip

echo "==> Installing yt-dlp"
python3 -m pip install --upgrade yt-dlp

echo "==> Installing Node 20"
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs

echo "==> Creating application user/dir"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$APP_DIR" --shell /bin/bash "$APP_USER"
mkdir -p "$APP_DIR/tmp" "$APP_DIR/bin"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> Installing systemd unit"
cp "$(dirname "$0")/mediahub.service" /etc/systemd/system/mediahub.service
sed -i "s|@APP_DIR@|$APP_DIR|g; s|@APP_USER@|$APP_USER|g" /etc/systemd/system/mediahub.service
systemctl daemon-reload
systemctl enable mediahub
echo "==> Done. Deploy your build to $APP_DIR and run: systemctl start mediahub"