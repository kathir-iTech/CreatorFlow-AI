import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Check, Loader2, AlertCircle, Sparkles, RefreshCw, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { api, friendlyError } from "@/lib/api";
import { useSlowHint } from "@/lib/useSlowHint";
import { toast } from "sonner";

export type SeoResult = {
  titles: string[];
  description: string;
  tags: string[];
  chapters: { time: string; label: string }[];
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 1500);
  }, [text]);
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

export function SeoTab({ transcript, videoTitle }: { transcript: string; videoTitle?: string }) {
  const [result, setResult] = useState<SeoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState(0);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const slow = useSlowHint(loading);
  // New transcript = new video: drop the old result so nothing lingers
  // (Part 7/8 row 15 — no state leakage between videos).
  const seenTranscript = useRef("");

  const generate = useCallback(async () => {
    if (!transcript.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.seo(transcript, videoTitle);
      // Ignore the response if the transcript changed mid-flight (race guard).
      if (seenTranscript.current !== transcript) return;
      setResult(data);
      setSelectedTitle(0);
      setDescription(data.description);
      setTags(data.tags);
    } catch (e) {
      if (seenTranscript.current !== transcript) return;
      const err = friendlyError(e);
      setError(err.message);
    } finally {
      if (seenTranscript.current === transcript) setLoading(false);
    }
  }, [transcript, videoTitle]);

  // Auto-generate when the transcript first arrives AND whenever a NEW
  // transcript replaces it (previously only the first video ever generated).
  useEffect(() => {
    if (!transcript.trim()) {
      // Pipeline reset (new URL submitted, captions not back yet) — clear stale output.
      if (seenTranscript.current !== "") {
        seenTranscript.current = "";
        setResult(null);
        setError(null);
      }
      return;
    }
    if (seenTranscript.current !== transcript) {
      seenTranscript.current = transcript;
      setResult(null);
      generate();
    }
  }, [transcript, generate]);

  const removeTag = (idx: number) => {
    setTags((prev) => prev.filter((_, i) => i !== idx));
  };

  if (!transcript.trim()) {
    return (
      <Card className="glass">
        <CardContent className="p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Generate captions first — the SEO tab reuses that transcript automatically.
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
          <Sparkles className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-medium">AI SEO Generator</span>
          {result && (
            <Badge variant="secondary" className="text-[10px]">
              Groq / gpt-oss-120b
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={generate}
          disabled={loading || !transcript.trim()}
          className="gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {result ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {/* Loading */}
      {loading && !result && (
        <Card className="glass">
          <CardContent className="p-8 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-violet-400" />
            <p className="mt-2 text-sm text-muted-foreground">Generating SEO metadata...</p>
            {slow && (
              <p className="mt-1 text-xs text-muted-foreground">
                Still working — the server may be waking up (up to a minute on the free
                tier).
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

      {/* Results */}
      {result && (
        <>
          {/* Titles */}
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-sm">
                Title Options
                <CopyButton text={result.titles[selectedTitle] ?? ""} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {result.titles.map((title, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedTitle(i)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    i === selectedTitle
                      ? "border-violet-500/50 bg-violet-500/10 text-foreground"
                      : "border-white/5 bg-white/[0.02] text-muted-foreground hover:bg-white/5"
                  }`}
                >
                  <span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span>
                  {title}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Description */}
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-sm">
                Description
                <CopyButton text={description} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <label htmlFor="seo-description" className="sr-only">
                Generated video description (editable)
              </label>
              <Textarea
                id="seo-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[120px] border-white/5 bg-white/[0.02] text-sm leading-relaxed"
              />
            </CardContent>
          </Card>

          {/* Tags */}
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-sm">
                Tags
                <Badge variant="secondary" className="text-[10px]">
                  {tags.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag, i) => (
                  <button
                    key={i}
                    onClick={() => removeTag(i)}
                    className="group inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                    title="Click to remove"
                  >
                    {tag}
                    <span className="hidden text-[10px] group-hover:inline">&times;</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Chapters */}
          {result.chapters.length > 0 && (
            <Card className="glass">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Chapters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {result.chapters.map((ch, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                      {ch.time}
                    </Badge>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{ch.label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
