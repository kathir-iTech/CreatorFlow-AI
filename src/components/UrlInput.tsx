import { useState, type FormEvent } from "react";
import { ClipboardPaste, Link as LinkIcon, Loader2, Search } from "lucide-react";
import { checkMediaUrl, urlCheckMessage } from "@/lib/mediaUrl";

type Props = {
  value: string;
  onValueChange: (url: string) => void;
  onSubmit: (url: string) => void;
  loading?: boolean;
};

export function UrlInput({ value, onValueChange, onSubmit, loading }: Props) {
  // Inline validation (Part 7/8 rows 4-5): bad input is rejected HERE with a
  // specific message — no network request is ever attempted for it.
  const [error, setError] = useState<string | null>(null);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const check = checkMediaUrl(value);
    if (!check.ok) {
      setError(urlCheckMessage(check));
      return;
    }
    setError(null);
    onSubmit(value.trim());
  };

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) {
        onValueChange(t.trim());
        setError(null);
      }
    } catch {
      /* user rejected */
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <form
        onSubmit={submit}
        role="search"
        aria-label="Media URL"
        noValidate
        className="glass-strong group flex w-full items-center gap-2 rounded-2xl p-2 shadow-2xl shadow-violet-900/20 transition focus-within:ring-2 focus-within:ring-violet-400/40"
      >
        <label htmlFor="media-url" className="sr-only">
          Media URL
        </label>
        <div
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-foreground/5 text-muted-foreground"
        >
          <LinkIcon className="h-4 w-4" />
        </div>
        <input
          id="media-url"
          value={value}
          onChange={(e) => {
            onValueChange(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Paste a YouTube, Instagram, or Facebook link…"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          enterKeyHint="go"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "media-url-error" : undefined}
          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
          style={{ fontSize: "16px" }}
        />
        <button
          type="button"
          onClick={paste}
          aria-label="Paste from clipboard"
          className="hidden h-10 items-center gap-1.5 rounded-xl px-3 text-sm text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground sm:inline-flex"
        >
          <ClipboardPaste className="h-4 w-4" />
          Paste
        </button>
        <button
          type="submit"
          disabled={loading}
          aria-label={loading ? "Fetching" : "Fetch media info"}
          className="inline-flex h-11 min-w-11 items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 text-sm font-medium text-white shadow-lg shadow-violet-500/30 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="hidden sm:inline">{loading ? "Fetching…" : "Fetch"}</span>
        </button>
      </form>
      {error && (
        <p id="media-url-error" role="alert" className="mt-2 text-center text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
