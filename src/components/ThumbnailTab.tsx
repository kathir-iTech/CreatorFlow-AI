import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle, Image as ImageIcon, Download, Type, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { api, friendlyError } from "@/lib/api";
import { useSlowHint } from "@/lib/useSlowHint";
import { toast } from "sonner";

type ThumbnailFrame = {
  index: number;
  timeSec: number;
  base64: string;
  mime: string;
};

type ThumbnailsResult = {
  videoId: string;
  frames: ThumbnailFrame[];
  capped: boolean;
  durationSec: number;
};

type OverlayStyle = {
  name: string;
  font: string;
  color: string;
  shadow: string;
  bg?: string;
};

const STYLES: OverlayStyle[] = [
  {
    name: "Clean",
    font: "bold 36px sans-serif",
    color: "#ffffff",
    shadow: "0 2px 8px rgba(0,0,0,0.7)",
  },
  {
    name: "Bold Yellow",
    font: "bold 40px Impact, sans-serif",
    color: "#FFD700",
    shadow: "0 3px 10px rgba(0,0,0,0.9)",
    bg: "rgba(0,0,0,0.4)",
  },
  {
    name: "Neon",
    font: "bold 38px monospace",
    color: "#00ff88",
    shadow: "0 0 12px #00ff88, 0 3px 8px rgba(0,0,0,0.8)",
  },
  { name: "Minimal", font: "500 32px sans-serif", color: "#ffffff", shadow: "none" },
];

export function ThumbnailTab({ url }: { url: string }) {
  const [result, setResult] = useState<ThumbnailsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [text, setText] = useState("");
  const [styleIdx, setStyleIdx] = useState(0);
  const [textPos, setTextPos] = useState({ x: 0.5, y: 0.85 }); // normalized 0-1
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState(false);
  // Race guard (Part 7): a slow first extraction must not overwrite the newer one.
  const requestSeq = useRef(0);
  const lastUrl = useRef("");
  const slow = useSlowHint(loading);

  const extract = useCallback(async () => {
    const u = url.trim();
    if (!u) return;
    const seq = ++requestSeq.current;
    lastUrl.current = u;
    setLoading(true);
    setError(null);
    try {
      const data = await api.thumbnails(u);
      if (requestSeq.current !== seq) return; // stale — a newer request won
      setResult(data);
      setSelected(0);
    } catch (e) {
      if (requestSeq.current !== seq) return; // stale — a newer request won
      setError(friendlyError(e).message);
    } finally {
      if (requestSeq.current === seq) setLoading(false);
    }
  }, [url]);

  // Auto-extract on submit AND on every new URL (previously only the first
  // video ever extracted — stale frames lingered for the second video).
  useEffect(() => {
    const u = url.trim();
    if (u && u !== lastUrl.current) {
      setResult(null);
      extract();
    }
  }, [url, extract]);

  // Draw canvas whenever selection/text/style changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    const frame = result.frames[selected];
    if (!frame) return;

    const img = new window.Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);

      if (text.trim()) {
        const style = STYLES[styleIdx];
        const px = textPos.x * img.width;
        const py = textPos.y * img.height;

        ctx.font = style.font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        if (style.shadow && style.shadow !== "none") {
          ctx.shadowColor = style.shadow.includes(",") ? style.shadow.split(",")[0] : style.shadow;
          ctx.shadowBlur = 10;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 2;
        }

        if (style.bg) {
          const metrics = ctx.measureText(text);
          const pad = 12;
          ctx.fillStyle = style.bg;
          ctx.fillRect(
            px - metrics.width / 2 - pad,
            py - 20 - pad,
            metrics.width + pad * 2,
            40 + pad * 2,
          );
        }

        ctx.fillStyle = style.color;
        ctx.fillText(text, px, py);
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
      }
    };
    img.src = `data:${frame.mime};base64,${frame.base64}`;
  }, [result, selected, text, styleIdx, textPos]);

  // Canvas mouse events for dragging text
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!text.trim()) return;
    setDragging(true);
    updateTextPos(e);
  };
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging) return;
    updateTextPos(e);
  };
  const handleCanvasMouseUp = () => setDragging(false);

  const updateTextPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    // Snap to canvas center within a small threshold (with guides shown).
    const snap = (v: number) => (Math.abs(v - 0.5) < 0.015 ? 0.5 : v);
    setTextPos({
      x: snap(Math.max(0, Math.min(1, ((e.clientX - rect.left) * scaleX) / canvas.width))),
      y: snap(Math.max(0, Math.min(1, ((e.clientY - rect.top) * scaleY) / canvas.height))),
    });
  };

  // Keyboard alternative to drag-and-drop: focus the canvas and nudge with arrows.
  const handleCanvasKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!text.trim()) return;
    const step = e.shiftKey ? 0.05 : 0.01;
    const next = { ...textPos };
    if (e.key === "ArrowLeft") next.x = Math.max(0, next.x - step);
    else if (e.key === "ArrowRight") next.x = Math.min(1, next.x + step);
    else if (e.key === "ArrowUp") next.y = Math.max(0, next.y - step);
    else if (e.key === "ArrowDown") next.y = Math.min(1, next.y + step);
    else return;
    e.preventDefault();
    const snap = (v: number) => (Math.abs(v - 0.5) < 0.015 ? 0.5 : v);
    setTextPos({ x: snap(next.x), y: snap(next.y) });
  };

  const showGuideV = !!text.trim() && Math.abs(textPos.x - 0.5) < 0.02;
  const showGuideH = !!text.trim() && Math.abs(textPos.y - 0.5) < 0.02;

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `thumbnail-${result?.videoId ?? "export"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("Thumbnail exported");
  };

  if (!url.trim()) {
    return (
      <Card className="glass">
        <CardContent className="p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Paste a video URL above to extract thumbnail frames.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" aria-live="polite">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-medium">Thumbnail Extractor</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={extract}
          disabled={loading}
          className="gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImageIcon className="h-3.5 w-3.5" />
          )}
          Re-extract
        </Button>
      </div>

      {/* Long video notice */}
      {result?.capped && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          Video is {Math.round(result.durationSec / 60)}m long — frames extracted from the first 2
          minutes only.
        </div>
      )}

      {/* Loading */}
      {loading && !result && (
        <Card className="glass">
          <CardContent className="p-6 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-cyan-400" />
            <p className="mt-2 text-sm text-muted-foreground">
              Downloading video and extracting keyframes...
            </p>
            {slow && (
              <p className="mt-1 text-xs text-muted-foreground">
                Still working — the server may be waking up (up to a minute on the free tier).
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="glass border-destructive/30">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          {/* Main canvas */}
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-sm">
                Preview
                <Button size="sm" onClick={exportPng} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Export PNG
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* macOS window chrome around the canvas */}
              <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30 shadow-2xl shadow-black/50">
                <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.04] px-3 py-2">
                  <span className="flex gap-1.5" aria-hidden="true">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                  </span>
                  <span className="ml-1 truncate text-[11px] text-muted-foreground">
                    thumbnail-{result.videoId}.png
                  </span>
                </div>
                <div className="relative">
                  <canvas
                    ref={canvasRef}
                    className="aspect-video w-full cursor-crosshair"
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                    tabIndex={text.trim() ? 0 : -1}
                    role="application"
                    aria-label={
                      text.trim()
                        ? "Thumbnail preview. Focus and use arrow keys to move the overlay text."
                        : "Thumbnail preview"
                    }
                    onKeyDown={handleCanvasKeyDown}
                  />
                  {/* snap alignment guides */}
                  {showGuideV && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-cyan-300/80"
                    />
                  )}
                  {showGuideH && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-cyan-300/80"
                    />
                  )}
                  {/* floating glass toolbar: rapid text-style switching */}
                  {text.trim() && (
                    <div
                      className="glass absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full p-1"
                      role="toolbar"
                      aria-label="Overlay text styles"
                    >
                      {STYLES.map((s, i) => (
                        <button
                          key={s.name}
                          onClick={() => setStyleIdx(i)}
                          aria-pressed={i === styleIdx}
                          aria-label={`${s.name} style`}
                          title={s.name}
                          className={`pressable min-h-11 rounded-full px-3 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${
                            i === styleIdx
                              ? "bg-cyan-400/20 text-foreground"
                              : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
                          }`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {text.trim()
                  ? "Click and drag on the canvas to reposition text (or focus it and use arrow keys)"
                  : "Add text below, then drag to position"}
              </p>
            </CardContent>
          </Card>

          {/* Sidebar controls */}
          <div className="space-y-4">
            {/* Frame grid */}
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">Keyframes</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-1.5">
                {result.frames.map((frame, i) => (
                  <button
                    key={i}
                    onClick={() => setSelected(i)}
                    aria-pressed={i === selected}
                    aria-label={`Use frame at ${frame.timeSec.toFixed(0)} seconds`}
                    className={`pressable relative min-h-11 overflow-hidden rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${
                      i === selected
                        ? "border-cyan-400"
                        : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={`data:${frame.mime};base64,${frame.base64}`}
                      alt={`Frame at ${frame.timeSec}s`}
                      className="aspect-video w-full object-cover"
                    />
                    <Badge
                      variant="secondary"
                      className="absolute bottom-0.5 right-0.5 text-[8px] px-1 py-0"
                    >
                      {frame.timeSec.toFixed(0)}s
                    </Badge>
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Text overlay */}
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-xs">
                  <Type className="h-3 w-3" />
                  Text Overlay
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <label htmlFor="thumb-overlay-text" className="sr-only">
                  Thumbnail overlay text
                </label>
                <input
                  id="thumb-overlay-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Enter overlay text..."
                  maxLength={60}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
                />

                {/* Style presets live in the floating toolbar over the canvas;
                    the active style is shown here as a readout. */}
                {text.trim() && (
                  <p className="text-[10px] text-muted-foreground">
                    Style: <span className="text-foreground">{STYLES[styleIdx]?.name}</span> —
                    switch it from the toolbar on the preview.
                  </p>
                )}

                {/* Vertical position */}
                <div className="space-y-1">
                  <span id="thumb-text-y-label" className="text-[10px] text-muted-foreground">
                    Vertical position
                  </span>
                  <Slider
                    value={[textPos.y * 100]}
                    onValueChange={([v]) => setTextPos((p) => ({ ...p, y: v / 100 }))}
                    min={10}
                    max={95}
                    step={1}
                    aria-labelledby="thumb-text-y-label"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
