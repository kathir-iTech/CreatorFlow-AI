{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.ffmpeg-full
    pkgs.yt-dlp
    pkgs.python311
  ];
}