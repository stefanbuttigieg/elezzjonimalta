// Multi-step Community Proposals Import drawer.
// Step 1: pick author + URL or file upload + language
// Step 2: streamed extraction progress (polled)
// Step 3: review table — per-row action (create/update/skip)
// Step 4: apply
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Upload, X, FileText, CheckCircle2 } from "lucide-react";
import { ImportErrorDetails } from "./ImportErrorDetails";
import { supabase } from "@/integrations/supabase/client";
import {
  applyCommunityImport,
  createCommunityUploadUrl,
  retryCommunityImport,
  startCommunityImport,
} from "@/server/communityImport.functions";
import { useCommunityImport, type CommunityImportRow } from "@/hooks/useCommunityImport";

interface AuthorOption { id: string; name: string }

interface ExtractedRow {
  title_en: string;
  title_mt?: string;
  description_en: string;
  description_mt?: string;
  category?: string;
  page_number?: number;
  verbatim_quote: string;
  matches: { id: string; title_en: string; score: number; status: string }[];
  suggested_action: "create" | "update" | "skip";
  suggested_target_id: string | null;
}

interface RowDecision {
  action: "create" | "update" | "skip";
  targetId: string | null;
  fields: ExtractedRow;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authors: AuthorOption[];
  defaultAuthorId?: string;
  onApplied?: () => void;
}

export function CommunityImportDrawer({ open, onOpenChange, authors, defaultAuthorId, onApplied }: Props) {
  const startFn = useServerFn(startCommunityImport);
  const applyFn = useServerFn(applyCommunityImport);
  const uploadUrlFn = useServerFn(createCommunityUploadUrl);
  const retryFn = useServerFn(retryCommunityImport);
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    if (!importId) return;
    setRetrying(true);
    try {
      const res = await retryFn({ data: { importId } });
      if (!res.ok) toast.error(res.error);
      else toast.success("Retrying import…");
    } finally {
      setRetrying(false);
    }
  };

  const [authorId, setAuthorId] = useState<string>("");
  const [sourceMode, setSourceMode] = useState<"url" | "upload">("url");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceKind, setSourceKind] = useState<"pdf" | "html">("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<"en" | "mt" | "both">("en");
  const [submitting, setSubmitting] = useState(false);

  const [importId, setImportId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<RowDecision[]>([]);
  const [applying, setApplying] = useState(false);

  const { row, error: pollError } = useCommunityImport(importId);

  useEffect(() => {
    if (!open) {
      setAuthorId(defaultAuthorId ?? "");
      setSourceMode("url");
      setSourceUrl("");
      setSourceKind("pdf");
      setFile(null);
      setLanguage("en");
      setImportId(null);
      setDecisions([]);
    } else {
      setAuthorId(defaultAuthorId ?? "");
    }
  }, [open, defaultAuthorId]);

  useEffect(() => {
    if (row?.status === "ready" && Array.isArray(row.extracted) && decisions.length === 0) {
      const rows = row.extracted as ExtractedRow[];
      setDecisions(
        rows.map((r) => ({
          action: r.suggested_action,
          targetId: r.suggested_target_id,
          fields: r,
        })),
      );
    }
  }, [row, decisions.length]);

  const counts = useMemo(() => decisions.reduce(
    (acc, d) => { acc[d.action]++; return acc; },
    { create: 0, update: 0, skip: 0 } as Record<string, number>,
  ), [decisions]);

  const step: 1 | 2 | 3 = !importId ? 1 : row?.status === "ready" ? 3 : 2;

  async function handleStart() {
    if (!authorId) { toast.error("Pick an author first"); return; }
    setSubmitting(true);
    try {
      let uploadedFilePath: string | null = null;
      let kind: "pdf" | "html" | "upload" = sourceKind;
      let url: string | null = sourceUrl.trim() || null;

      if (sourceMode === "upload") {
        if (!file) { toast.error("Choose a PDF file"); setSubmitting(false); return; }
        const signed = await uploadUrlFn({ data: { authorId, filename: file.name } });
        if (!signed.ok) { toast.error(signed.error); setSubmitting(false); return; }
        const upload = await supabase.storage
          .from("manifestos")
          .uploadToSignedUrl(signed.path, signed.token, file, { contentType: "application/pdf" });
        if (upload.error) { toast.error(`Upload failed: ${upload.error.message}`); setSubmitting(false); return; }
        uploadedFilePath = signed.path;
        kind = "upload";
        url = null;
      }

      const res = await startFn({
        data: { authorId, sourceUrl: url, uploadedFilePath, sourceKind: kind, language },
      });
      if (!res.ok) { toast.error(res.error); setSubmitting(false); return; }
      setImportId(res.importId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApply() {
    if (!importId) return;
    const toApply = decisions.map((d, idx) => ({
      extractedIndex: idx,
      action: d.action,
      targetId: d.targetId ?? null,
      fields: {
        title_en: d.fields.title_en,
        title_mt: d.fields.title_mt ?? null,
        description_en: d.fields.description_en ?? null,
        description_mt: d.fields.description_mt ?? null,
        category: d.fields.category ?? null,
        page_number: d.fields.page_number ?? null,
      },
    }));
    setApplying(true);
    try {
      const res = await applyFn({ data: { importId, decisions: toApply } });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(
        `Created ${res.created}, updated ${res.updated}, skipped ${res.skipped}` +
          (res.errors.length ? ` (${res.errors.length} errors)` : ""),
      );
      onApplied?.();
      onOpenChange(false);
    } finally {
      setApplying(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="flex h-full w-full max-w-4xl flex-col bg-background shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="font-serif text-xl font-bold">Import community proposals</h2>
            <p className="text-xs text-muted-foreground">Step {step} of 3</p>
          </div>
          <button onClick={() => onOpenChange(false)} className="rounded-md p-2 hover:bg-accent" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className={step === 3 ? "flex-1 min-h-0 overflow-y-auto px-6 py-6" : "flex-1 overflow-y-auto px-6 py-6"}>
          {step === 1 && (
            <div className="mx-auto max-w-2xl space-y-5">
              <div>
                <label className="mb-1 block text-sm font-medium">Author</label>
                <select
                  value={authorId}
                  onChange={(e) => setAuthorId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select an author…</option>
                  {authors.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Source</label>
                <div className="mb-2 flex gap-2 text-xs">
                  <button type="button" onClick={() => setSourceMode("url")}
                    className={`rounded-md border px-3 py-1.5 ${sourceMode === "url" ? "border-primary bg-primary/10" : "border-border"}`}>URL</button>
                  <button type="button" onClick={() => setSourceMode("upload")}
                    className={`rounded-md border px-3 py-1.5 ${sourceMode === "upload" ? "border-primary bg-primary/10" : "border-border"}`}>Upload PDF</button>
                </div>

                {sourceMode === "url" ? (
                  <div className="space-y-2">
                    <input
                      type="url"
                      placeholder="https://ngo.org/wishlist.pdf"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2 text-xs">
                      <button type="button" onClick={() => setSourceKind("pdf")}
                        className={`rounded-md border px-3 py-1 ${sourceKind === "pdf" ? "border-primary bg-primary/10" : "border-border"}`}>PDF</button>
                      <button type="button" onClick={() => setSourceKind("html")}
                        className={`rounded-md border px-3 py-1 ${sourceKind === "html" ? "border-primary bg-primary/10" : "border-border"}`}>HTML page</button>
                    </div>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border bg-surface px-4 py-6 text-sm hover:bg-accent">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <span className="flex-1">{file ? file.name : "Click to choose PDF…"}</span>
                    <input type="file" accept="application/pdf" className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  </label>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Language</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value as "en" | "mt" | "both")}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <option value="en">English</option>
                  <option value="mt">Maltese</option>
                  <option value="both">Bilingual (EN + MT)</option>
                </select>
              </div>

              <button onClick={handleStart} disabled={submitting || !authorId}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Extract proposals
              </button>
            </div>
          )}

          {step === 2 && (
            row?.status === "failed" ? (
              <ImportErrorDetails
                message={row.error}
                stack={row.error_stack}
                stage={row.stage}
                sourceUrl={row.source_url}
                filePath={row.file_path}
                sourceKind={row.source_kind}
                logs={row.logs}
                pollError={pollError}
              />
            ) : (
              <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-16 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <h3 className="font-serif text-lg font-bold">{row?.stage ?? "Starting…"}</h3>
                <div className="w-full max-w-sm space-y-1.5">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                      style={{ width: `${row?.progress ?? 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
                    <span>{row?.progress ?? 0}%</span>
                    <span>You can close this and keep working — it runs in the background.</span>
                  </div>
                </div>
              </div>
            )
          )}

          {step === 3 && row && (
            <ReviewList rows={decisions} onChange={setDecisions} pageCount={row.page_count} sourceUrl={row.source_url} />
          )}
        </div>

        {step === 3 && (
          <footer className="flex items-center justify-between border-t border-border bg-surface px-6 py-3">
            <div className="text-xs text-muted-foreground">
              <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
              Will create <strong>{counts.create}</strong>, update <strong>{counts.update}</strong>, skip <strong>{counts.skip}</strong>
            </div>
            <button onClick={handleApply} disabled={applying || decisions.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Apply {counts.create + counts.update} changes
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function ReviewList({
  rows, onChange, pageCount, sourceUrl,
}: {
  rows: RowDecision[];
  onChange: (rows: RowDecision[]) => void;
  pageCount: number | null;
  sourceUrl: string | null;
}) {
  const update = (idx: number, patch: Partial<RowDecision>) => {
    const next = [...rows];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const updateField = (idx: number, patch: Partial<ExtractedRow>) => {
    const next = [...rows];
    next[idx] = { ...next[idx], fields: { ...next[idx].fields, ...patch } };
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">
          {rows.length} proposals extracted{pageCount ? ` from ${pageCount} pages` : ""}
        </span>
        <button onClick={() => onChange(rows.map((r) => ({ ...r, action: "skip" })))}
          className="rounded-md border border-border px-2 py-1 hover:bg-accent">Skip all</button>
        <button onClick={() => onChange(rows.map((r) => ({ ...r, action: "create", targetId: null })))}
          className="rounded-md border border-border px-2 py-1 hover:bg-accent">Create all</button>
        <button onClick={() => onChange(rows.map((r) => ({
          ...r, action: r.fields.suggested_action, targetId: r.fields.suggested_target_id,
        })))} className="rounded-md border border-border px-2 py-1 hover:bg-accent">
          Reset to suggestions
        </button>
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="ml-auto text-primary hover:underline">
            View source ↗
          </a>
        )}
      </div>

      <div className="space-y-2">
        {rows.map((r, idx) => (
          <div key={idx} className="rounded-md border border-border bg-card p-3">
            <div className="flex items-start gap-3">
              <div className="flex shrink-0 flex-col gap-1 text-xs">
                {(["create", "update", "skip"] as const).map((a) => (
                  <label key={a} className={`flex items-center gap-1 cursor-pointer ${r.action === a ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                    <input type="radio" name={`act-${idx}`} checked={r.action === a}
                      onChange={() => update(idx, { action: a })} className="h-3 w-3" />
                    {a}
                  </label>
                ))}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <input
                  value={r.fields.title_en}
                  onChange={(e) => updateField(idx, { title_en: e.target.value })}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-semibold"
                />
                {r.fields.title_mt != null && (
                  <input
                    value={r.fields.title_mt}
                    onChange={(e) => updateField(idx, { title_mt: e.target.value })}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                    placeholder="Title (MT)"
                  />
                )}
                <textarea
                  value={r.fields.description_en}
                  onChange={(e) => updateField(idx, { description_en: e.target.value })}
                  rows={2}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                />
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <input
                    value={r.fields.category ?? ""}
                    onChange={(e) => updateField(idx, { category: e.target.value })}
                    placeholder="category"
                    className="w-32 rounded border border-border bg-background px-2 py-0.5"
                  />
                  {r.fields.page_number != null && <span>p.{r.fields.page_number}</span>}
                  {r.fields.verbatim_quote && (
                    <span className="italic">“{r.fields.verbatim_quote.slice(0, 120)}{r.fields.verbatim_quote.length > 120 ? "…" : ""}”</span>
                  )}
                </div>
                {r.action === "update" && r.fields.matches.length > 0 && (
                  <select
                    value={r.targetId ?? ""}
                    onChange={(e) => update(idx, { targetId: e.target.value || null })}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">— pick target —</option>
                    {r.fields.matches.map((m) => (
                      <option key={m.id} value={m.id}>
                        {(m.score * 100).toFixed(0)}% — {m.title_en}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
