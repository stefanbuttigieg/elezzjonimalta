// Multi-step Manifesto Import drawer.
//
// Step 1: pick party + URL or file upload + language
// Step 2: streamed extraction progress (polled)
// Step 3: review table — per-row action (create/update/skip), inline editable fields
// Step 4: apply — bulk save, toast summary, close
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Upload, X, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  applyManifestoImport,
  createManifestoUploadUrl,
  getManifestoPdfUrl,
  startManifestoImport,
} from "@/server/manifestoImport.functions";
import { useManifestoImport, type ManifestoImportRow } from "@/hooks/useManifestoImport";

interface PartyOption {
  id: string;
  name_en: string;
}

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
  parties: PartyOption[];
  onApplied?: () => void;
}

export function ManifestoImportDrawer({ open, onOpenChange, parties, onApplied }: Props) {
  const startFn = useServerFn(startManifestoImport);
  const applyFn = useServerFn(applyManifestoImport);
  const uploadUrlFn = useServerFn(createManifestoUploadUrl);
  const pdfUrlFn = useServerFn(getManifestoPdfUrl);

  const [partyId, setPartyId] = useState<string>("");
  const [sourceMode, setSourceMode] = useState<"url" | "upload">("url");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceKind, setSourceKind] = useState<"pdf" | "html">("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<"en" | "mt" | "both">("en");
  const [submitting, setSubmitting] = useState(false);

  const [importId, setImportId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<RowDecision[]>([]);
  const [applying, setApplying] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const { row, error: pollError } = useManifestoImport(importId);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setPartyId("");
      setSourceMode("url");
      setSourceUrl("");
      setSourceKind("pdf");
      setFile(null);
      setLanguage("en");
      setImportId(null);
      setDecisions([]);
      setPdfUrl(null);
      setPdfError(null);
      setSelectedIdx(null);
    }
  }, [open]);

  // Hydrate decisions when extraction lands
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

  // Fetch a signed URL for the archived PDF once extraction is ready.
  useEffect(() => {
    if (row?.status !== "ready" || !importId || pdfUrl || pdfError) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await pdfUrlFn({ data: { importId } });
        if (cancelled) return;
        if (res.ok) setPdfUrl(res.signedUrl);
        else setPdfError(res.error);
      } catch (err) {
        if (!cancelled) setPdfError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row?.status, importId, pdfUrl, pdfError, pdfUrlFn]);

  const counts = useMemo(() => {
    return decisions.reduce(
      (acc, d) => {
        acc[d.action]++;
        return acc;
      },
      { create: 0, update: 0, skip: 0 } as Record<string, number>,
    );
  }, [decisions]);

  const step: 1 | 2 | 3 = !importId ? 1 : row?.status === "ready" ? 3 : 2;

  async function handleStart() {
    if (!partyId) {
      toast.error("Pick a party first");
      return;
    }
    setSubmitting(true);
    try {
      let uploadedFilePath: string | null = null;
      let kind: "pdf" | "html" | "upload" = sourceKind;
      let url: string | null = sourceUrl.trim() || null;

      if (sourceMode === "upload") {
        if (!file) {
          toast.error("Choose a PDF file");
          setSubmitting(false);
          return;
        }
        const signed = await uploadUrlFn({
          data: { partyId, filename: file.name },
        });
        if (!signed.ok) {
          toast.error(signed.error);
          setSubmitting(false);
          return;
        }
        const upload = await supabase.storage
          .from("manifestos")
          .uploadToSignedUrl(signed.path, signed.token, file, { contentType: "application/pdf" });
        if (upload.error) {
          toast.error(`Upload failed: ${upload.error.message}`);
          setSubmitting(false);
          return;
        }
        uploadedFilePath = signed.path;
        kind = "upload";
        url = null;
      }

      const res = await startFn({
        data: {
          partyId,
          sourceUrl: url,
          uploadedFilePath,
          sourceKind: kind,
          language,
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        setSubmitting(false);
        return;
      }
      setImportId(res.importId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApply() {
    if (!importId) return;
    const toApply = decisions
      .map((d, idx) => ({ idx, d }))
      .filter(({ d }) => d.action !== "skip" || true) // include skips so server records them
      .map(({ idx, d }) => ({
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
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
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
      <div
        className={`flex h-full w-full flex-col bg-background shadow-2xl ${step === 3 ? "max-w-[110rem]" : "max-w-5xl"}`}
      >
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="font-serif text-xl font-bold">Import manifesto</h2>
            <p className="text-xs text-muted-foreground">Step {step} of 3</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md p-2 hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div
          className={`flex-1 ${step === 3 ? "min-h-0 overflow-hidden" : "overflow-y-auto px-6 py-6"}`}
        >
          {step === 1 && (
            <div className="mx-auto max-w-2xl space-y-5">
              <div>
                <label className="mb-1 block text-sm font-medium">Party</label>
                <select
                  value={partyId}
                  onChange={(e) => setPartyId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a party…</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name_en}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Source</label>
                <div className="mb-2 flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSourceMode("url")}
                    className={`rounded-md border px-3 py-1.5 ${sourceMode === "url" ? "border-primary bg-primary/10" : "border-border"}`}
                  >
                    URL
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceMode("upload")}
                    className={`rounded-md border px-3 py-1.5 ${sourceMode === "upload" ? "border-primary bg-primary/10" : "border-border"}`}
                  >
                    Upload PDF
                  </button>
                </div>

                {sourceMode === "url" ? (
                  <div className="space-y-2">
                    <input
                      type="url"
                      placeholder="https://party.mt/manifesto.pdf"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setSourceKind("pdf")}
                        className={`rounded-md border px-3 py-1 ${sourceKind === "pdf" ? "border-primary bg-primary/10" : "border-border"}`}
                      >
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => setSourceKind("html")}
                        className={`rounded-md border px-3 py-1 ${sourceKind === "html" ? "border-primary bg-primary/10" : "border-border"}`}
                      >
                        HTML page
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border bg-surface px-4 py-6 text-sm hover:bg-accent">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <span className="flex-1">{file ? file.name : "Click to choose PDF…"}</span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "en" | "mt" | "both")}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="en">English</option>
                  <option value="mt">Maltese</option>
                  <option value="both">Bilingual (EN + MT)</option>
                </select>
              </div>

              <button
                onClick={handleStart}
                disabled={submitting || !partyId}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Extract proposals
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-16 text-center">
              {row?.status === "failed" ? (
                <>
                  <AlertTriangle className="h-10 w-10 text-destructive" />
                  <h3 className="font-serif text-lg font-bold">Extraction failed</h3>
                  <p className="text-sm text-muted-foreground">{row.error || pollError}</p>
                </>
              ) : (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <h3 className="font-serif text-lg font-bold">{row?.stage ?? "Starting…"}</h3>
                  <p className="text-sm text-muted-foreground">
                    Long manifestos can take 1–2 minutes. You can leave this open.
                  </p>
                </>
              )}
            </div>
          )}

          {step === 3 && row && (
            <ReviewTable
              rows={decisions}
              onChange={setDecisions}
              pageCount={row.page_count}
              sourceUrl={row.source_url}
            />
          )}
        </div>

        {step === 3 && (
          <footer className="flex items-center justify-between border-t border-border bg-surface px-6 py-3">
            <div className="text-xs text-muted-foreground">
              <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
              Will create <strong>{counts.create}</strong>, update{" "}
              <strong>{counts.update}</strong>, skip <strong>{counts.skip}</strong>
            </div>
            <button
              onClick={handleApply}
              disabled={applying || decisions.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Apply {counts.create + counts.update} changes
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function ReviewTable({
  rows,
  onChange,
  pageCount,
  sourceUrl,
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
        <button
          onClick={() => onChange(rows.map((r) => ({ ...r, action: "skip" })))}
          className="rounded-md border border-border px-2 py-1 hover:bg-accent"
        >
          Skip all
        </button>
        <button
          onClick={() =>
            onChange(
              rows.map((r) => ({
                ...r,
                action: r.fields.suggested_action,
                targetId: r.fields.suggested_target_id,
              })),
            )
          }
          className="rounded-md border border-border px-2 py-1 hover:bg-accent"
        >
          Reset to suggestions
        </button>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-primary hover:underline"
          >
            View source ↗
          </a>
        )}
      </div>

      <div className="space-y-2">
        {rows.map((r, idx) => (
          <div key={idx} className="rounded-md border border-border bg-surface p-3">
            <div className="flex flex-wrap items-start gap-3">
              <select
                value={r.action}
                onChange={(e) => update(idx, { action: e.target.value as RowDecision["action"] })}
                className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                  r.action === "create"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100"
                    : r.action === "update"
                      ? "border-blue-300 bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100"
                      : "border-border bg-muted text-muted-foreground"
                }`}
              >
                <option value="create">Create new</option>
                <option value="update">Update existing</option>
                <option value="skip">Skip</option>
              </select>
              {r.fields.page_number != null && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  p. {r.fields.page_number}
                </span>
              )}
              {r.fields.category && (
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {r.fields.category}
                </span>
              )}
            </div>

            <input
              value={r.fields.title_en}
              onChange={(e) => updateField(idx, { title_en: e.target.value })}
              className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1 text-sm font-semibold"
            />
            <textarea
              value={r.fields.description_en ?? ""}
              onChange={(e) => updateField(idx, { description_en: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
            />

            {r.action === "update" && r.fields.matches.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Update target
                </p>
                {r.fields.matches.map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name={`match-${idx}`}
                      checked={r.targetId === m.id}
                      onChange={() => update(idx, { targetId: m.id })}
                    />
                    <span className="flex-1 truncate">{m.title_en}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {(m.score * 100).toFixed(0)}%
                    </span>
                  </label>
                ))}
              </div>
            )}

            {r.fields.verbatim_quote && (
              <p className="mt-2 border-l-2 border-border pl-2 text-[11px] italic text-muted-foreground">
                “{r.fields.verbatim_quote}”
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
