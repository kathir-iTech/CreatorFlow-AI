import type { Metadata } from "./api";

export function providerLabel(id?: string): string {
  switch (id) {
    case "youtube":
      return "YouTube";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    default:
      return id ?? "Unknown";
  }
}

export function providerAccent(id?: string): string {
  switch (id) {
    case "youtube":
      return "from-red-500/80 to-rose-500/80";
    case "instagram":
      return "from-fuchsia-500/80 to-amber-500/80";
    case "facebook":
      return "from-sky-500/80 to-blue-600/80";
    default:
      return "from-violet-500/80 to-cyan-500/80";
  }
}

export type QualityOption = {
  key: string;
  label: string;
  kind: "video" | "audio";
  maxHeight?: number;
  audioFormat?: "mp3" | "m4a";
  description?: string;
};

export function buildQualityOptions(md: Metadata): QualityOption[] {
  const heights = new Set<number>();
  (md.formats ?? []).forEach((f) => {
    if (f.height && f.vcodec && f.vcodec !== "none") heights.add(f.height);
  });
  const maxAvail = heights.size ? Math.max(...heights) : 1080;
  // Canonical ladder per product spec.
  const buckets: { h: number; label: string }[] = [
    { h: 2160, label: "4K" },
    { h: 1440, label: "1440p" },
    { h: 1080, label: "1080p" },
    { h: 720, label: "720p" },
    { h: 480, label: "480p" },
    { h: 360, label: "360p" },
    { h: 144, label: "144p" },
  ];
  // Show every bucket <= what the source actually offers (+30px tolerance);
  // yt-dlp will pick the next-lower available rendition automatically.
  const final = buckets.filter((b) => b.h <= maxAvail + 30);
  const list = final.length
    ? final
    : [
        { h: 720, label: "720p" },
        { h: 480, label: "480p" },
      ];

  const videoOptions: QualityOption[] = list.map(({ h, label }) => ({
    key: `v-${h}`,
    label,
    kind: "video" as const,
    maxHeight: h,
    description: h >= 1080 ? "Crisp MP4" : h >= 480 ? "Smaller MP4" : "Tiny MP4",
  }));

  videoOptions.unshift({
    key: "v-best",
    label: "Best",
    kind: "video" as const,
    description: "Highest available MP4",
  });

  const audioSupported = md.providerId !== "facebook";
  const audioOptions: QualityOption[] = audioSupported
    ? [
        {
          key: "a-mp3",
          label: "MP3",
          kind: "audio" as const,
          audioFormat: "mp3",
          description: "Audio only — 192 kbps",
        },
      ]
    : [];

  return [...videoOptions, ...audioOptions];
}
