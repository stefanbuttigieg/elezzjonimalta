// Admin-friendly error panel for failed imports.
// Surfaces the failure message, stack trace, the failing source (URL or
// archived file path), and the chronological log so admins can debug quickly
// without leaving the drawer.
import { useState } from "react";
import { AlertTriangle, Copy, ChevronDown, ChevronRight, ExternalLink, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface ImportErrorDetailsProps {
  message: string | null;
  stack?: string | null;
  stage?: string | null;
  sourceUrl?: string | null;
  filePath?: string | null;
  sourceKind?: string | null;
  logs?: { at: string; pct: number; stage: string }[];
  pollError?: string | null;
  onRetry?: () => Promise<void> | void;
  retrying?: boolean;
}

export function ImportErrorDetails({
  message,
  stack,
  stage,
  sourceUrl,
  filePath,
  sourceKind,
  logs,
  pollError,
  onRetry,
  retrying,
}: ImportErrorDetailsProps) {
  const [showStack, setShowStack] = useState(false);
  const [showLogs, setShowLogs] = useState(true);

  const last = logs && logs.length > 0 ? logs[logs.length - 1] : null;
  const errorText = message || pollError || "Unknown error";

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  };

  const fullDump = [
    `Error: ${errorText}`,
    stage ? `Stage at failure: ${stage}` : "",
    sourceKind ? `Source kind: ${sourceKind}` : "",
    sourceUrl ? `Source URL: ${sourceUrl}` : "",
    filePath ? `File path: ${filePath}` : "",
    stack ? `\nStack:\n${stack}` : "",
    logs && logs.length > 0
      ? `\nLogs:\n${logs.map((l) => `[${l.at}] ${l.pct >= 0 ? l.pct + "%" : "ERR"} — ${l.stage}`).join("\n")}`
      : "",
  ].filter(Boolean).join("\n");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 py-6 text-left">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <h3 className="font-serif text-base font-bold text-destructive">Import failed</h3>
            <p className="mt-1 break-words text-sm text-foreground">{errorText}</p>
            {stage && (
              <p className="mt-1 text-xs text-muted-foreground">
                Failed at stage: <span className="font-mono">{stage}</span>
                {last && last.pct >= 0 ? ` (${last.pct}%)` : ""}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            {onRetry && (
              <button
                onClick={() => void onRetry()}
                disabled={retrying}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                title="Re-run this import using the same source"
              >
                {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {retrying ? "Retrying…" : "Retry"}
              </button>
            )}
            <button
              onClick={() => copy(fullDump, "Full report")}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-accent"
              title="Copy full diagnostic report"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
          </div>
        </div>
      </div>

      {(sourceUrl || filePath) && (
        <div className="rounded-md border border-border bg-card p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Failing source
          </h4>
          <dl className="space-y-1.5 text-xs">
            {sourceKind && (
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">Kind</dt>
                <dd className="font-mono">{sourceKind}</dd>
              </div>
            )}
            {sourceUrl && (
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">URL</dt>
                <dd className="min-w-0 flex-1 break-all">
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {sourceUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </dd>
              </div>
            )}
            {filePath && (
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">File</dt>
                <dd className="min-w-0 flex-1 break-all font-mono">{filePath}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {logs && logs.length > 0 && (
        <div className="rounded-md border border-border bg-card">
          <button
            onClick={() => setShowLogs((s) => !s)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent"
          >
            <span className="inline-flex items-center gap-1">
              {showLogs ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Step log ({logs.length})
            </span>
            <span className="text-[10px] normal-case">
              Last: {last?.stage ?? "—"}
            </span>
          </button>
          {showLogs && (
            <ol className="max-h-64 space-y-1 overflow-y-auto border-t border-border px-3 py-2 font-mono text-[11px]">
              {logs.map((l, i) => (
                <li key={i} className={l.pct < 0 ? "text-destructive" : ""}>
                  <span className="text-muted-foreground">{new Date(l.at).toLocaleTimeString()}</span>{" "}
                  <span className="tabular-nums text-muted-foreground">
                    {l.pct >= 0 ? `${l.pct.toString().padStart(3)}%` : "ERR "}
                  </span>{" "}
                  {l.stage}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {stack && (
        <div className="rounded-md border border-border bg-card">
          <button
            onClick={() => setShowStack((s) => !s)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent"
          >
            <span className="inline-flex items-center gap-1">
              {showStack ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Stack trace
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); copy(stack, "Stack trace"); }}
              className="rounded p-1 hover:bg-background"
              title="Copy stack"
            >
              <Copy className="h-3 w-3" />
            </button>
          </button>
          {showStack && (
            <pre className="max-h-64 overflow-auto border-t border-border px-3 py-2 font-mono text-[11px] leading-snug text-muted-foreground whitespace-pre-wrap break-all">
              {stack}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
