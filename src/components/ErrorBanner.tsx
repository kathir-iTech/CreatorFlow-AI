import { AlertTriangle, X } from "lucide-react";

type Props = {
  title: string;
  message: string;
  onDismiss?: () => void;
};

export function ErrorBanner({ title, message, onDismiss }: Props) {
  return (
    <div className="glass mx-auto flex w-full max-w-3xl items-start gap-3 rounded-2xl border-rose-500/30 p-4 text-sm">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-500/20 text-rose-300">
        <AlertTriangle className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground">{title}</div>
        <div className="mt-0.5 text-muted-foreground">{message}</div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="rounded-lg p-1 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
