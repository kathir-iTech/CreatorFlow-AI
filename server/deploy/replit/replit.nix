# ALTERNATIVE DEPLOY — Replit (not primary; Render is primary)
{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.ffmpeg-full
    pkgs.yt-dlp
    pkgs.python311
  ];
}