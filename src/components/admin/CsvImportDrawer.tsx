// Multi-step CSV/Excel proposal import drawer.
//
// Step 1: pick file (CSV or .xlsx) + download template + parse
// Step 2: review table — per-row action (create/skip), inline editing, validation errors
// Step 3: apply — bulk insert via supabase client, toast summary, close
import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ReviewStatus } from "@/lib/admin";

interface PartyOption {
  id: string;
  name_en: string;
  short_name: string | null;
}
interface CandidateOption {
  id: string;
  full_name: string;
}

interface ParsedRow {
  title_en: string;
  title_mt: string;
  description_en: string;
  description_mt: string;
  party: string;
  candidate: string;
  status: string;
  source_url: string;
  notes: string;
}

interface RowDraft {
  action: "create" | "skip";
  fields: ParsedRow;
  partyId: string | null;
  candidateId: string | null;
  resolvedStatus: ReviewStatus;
  errors: string[];
}

const FIELD_KEYS: ReadonlyArray<keyof ParsedRow> = [
  "title_en",
  "title_mt",
  "description_en",
  "description_mt",
  "party",
  "candidate",
  "status",
  "source_url",
  "notes",
] as const;

const STATUS_VALUES: ReadonlyArray<ReviewStatus> = [
  "draft",
  "pending_review",
  "published",
  "archived",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parties: PartyOption[];
  candidates: CandidateOption[];
  onApplied?: () => void;
}

export function CsvImportDrawer({ open, onOpenChange, parties, candidates, onApplied }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<RowDraft[]>([]);
  const [applying, setApplying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setFile(null);
      setParsing(false);
      setParseError(null);
      setDrafts([]);
      setApplying(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  const partyLookup = useMemo(
    () => buildLookup(parties, (p) => [p.name_en, p.short_name]),
    [parties],
  );
  const candidateLookup = useMemo(
    () => buildLookup(candidates, (c) => [c.full_name]),
    [candidates],
  );

  const step: 1 | 2 = drafts.length === 0 ? 1 : 2;

  const counts = useMemo(() => {
    return drafts.reduce(
      (acc, d) => {
        if (d.errors.length > 0 && d.action === "create") acc.invalid++;
        else acc[d.action]++;
        return acc;
      },
      { create: 0, skip: 0, invalid: 0 },
    );
  }, [drafts]);

  const validCount = counts.create;

  async function handleFileChosen(f: File) {
    setFile(f);
    setParsing(true);
    setParseError(null);
    try {
      const rows = await parseFile(f);
      if (rows.length === 0) {
        setParseError("The file is empty or has no readable rows.");
        setParsing(false);
        return;
      }
      const built = rows.map((r) => buildDraft(r, partyLookup, candidateLookup));
      setDrafts(built);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
    }
  }

  function updateDraft(idx: number, patch: Partial<RowDraft>) {
    setDrafts((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      next[idx].errors = validateDraft(next[idx]);
      return next;
    });
  }

  function updateField(idx: number, field: keyof ParsedRow, value: string) {
    setDrafts((prev) => {
      const next = [...prev];
      const draft = { ...next[idx], fields: { ...next[idx].fields, [field]: value } };
      // Re-resolve party/candidate/status if the underlying text changed
      if (field === "party") {
        draft.partyId = partyLookup.get(normaliseKey(value)) ?? null;
      } else if (field === "candidate") {
        draft.candidateId = candidateLookup.get(normaliseKey(value)) ?? null;
      } else if (field === "status") {
        draft.resolvedStatus = resolveStatus(value);
      }
      draft.errors = validateDraft(draft);
      next[idx] = draft;
      return next;
    });
  }

  async function handleApply() {
    const toCreate = drafts.filter((d) => d.action === "create" && d.errors.length === 0);
    if (toCreate.length === 0) {
      toast.error("No valid rows to import.");
      return;
    }
    setApplying(true);
    try {
      const payload = toCreate.map((d) => ({
        title_en: d.fields.title_en.trim(),
        title_mt: d.fields.title_mt.trim() || null,
        description_en: d.fields.description_en.trim() || null,
        description_mt: d.fields.description_mt.trim() || null,
        party_id: d.partyId,
        candidate_id: d.candidateId,
        status: d.resolvedStatus,
        source_url: d.fields.source_url.trim() || null,
        notes: d.fields.notes.trim() || null,
      }));
      const { error } = await supabase.from("proposals").insert(payload as never);
      if (error) throw error;
      const skipped = drafts.length - toCreate.length;
      toast.success(
        `Created ${toCreate.length} proposal${toCreate.length === 1 ? "" : "s"}` +
          (skipped > 0 ? ` · skipped ${skipped}` : ""),
      );
      onApplied?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setApplying(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
        className="flex-1 bg-foreground/30 backdrop-blur-sm"
      />
      <div className="flex h-full w-full max-w-5xl flex-col bg-background shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="font-serif text-xl font-bold">Import proposals from CSV / Excel</h2>
            <p className="text-xs text-muted-foreground">Step {step} of 2</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md p-2 hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step === 1 && (
            <div className="mx-auto max-w-2xl space-y-5">
              <div className="rounded-md border border-border bg-surface p-4 text-sm">
                <h3 className="mb-2 font-semibold">File format</h3>
                <p className="text-muted-foreground">
                  Upload a CSV or Excel (<code>.xlsx</code>) file with one proposal per row. The
                  first row must contain column headers. Recognised columns (any order, others
                  ignored):
                </p>
                <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <li>
                    <code>title_en</code> <span className="text-destructive">*</span>
                  </li>
                  <li>
                    <code>title_mt</code>
                  </li>
                  <li>
                    <code>description_en</code>
                  </li>
                  <li>
                    <code>description_mt</code>
                  </li>
                  <li>
                    <code>party</code>{" "}
                    <span className="text-muted-foreground">(name or short name)</span>
                  </li>
                  <li>
                    <code>candidate</code>{" "}
                    <span className="text-muted-foreground">(full name)</span>
                  </li>
                  <li>
                    <code>status</code>{" "}
                    <span className="text-muted-foreground">
                      (draft / pending_review / published / archived)
                    </span>
                  </li>
                  <li>
                    <code>source_url</code>
                  </li>
                  <li className="col-span-2">
                    <code>notes</code>
                  </li>
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  <span className="text-destructive">*</span> required. Each proposal must also be
                  linked to a <code>party</code> or a <code>candidate</code> (or both).
                </p>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  <Download className="h-3.5 w-3.5" /> Download CSV template
                </button>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border bg-surface px-4 py-8 text-sm hover:bg-accent">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1">
                  {parsing ? "Parsing…" : file ? file.name : "Click to choose a CSV or .xlsx file…"}
                </span>
                {parsing && <Loader2 className="h-4 w-4 animate-spin" />}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  disabled={parsing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFileChosen(f);
                  }}
                />
              </label>

              {parseError && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <ReviewTable
              drafts={drafts}
              parties={parties}
              candidates={candidates}
              onUpdateDraft={updateDraft}
              onUpdateField={updateField}
            />
          )}
        </div>

        {step === 2 && (
          <footer className="flex items-center justify-between border-t border-border bg-surface px-6 py-3">
            <div className="text-xs text-muted-foreground">
              <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
              {validCount} ready to create
              {counts.invalid > 0 && (
                <span className="ml-2 text-destructive">· {counts.invalid} with errors</span>
              )}
              {counts.skip > 0 && <span className="ml-2">· {counts.skip} skipped</span>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setDrafts([]);
                  setFile(null);
                  setParseError(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                Choose another file
              </button>
              <button
                onClick={handleApply}
                disabled={applying || validCount === 0}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {applying && <Loader2 className="h-4 w-4 animate-spin" />}
                Create {validCount} proposal{validCount === 1 ? "" : "s"}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

function ReviewTable({
  drafts,
  parties,
  candidates,
  onUpdateDraft,
  onUpdateField,
}: {
  drafts: RowDraft[];
  parties: PartyOption[];
  candidates: CandidateOption[];
  onUpdateDraft: (idx: number, patch: Partial<RowDraft>) => void;
  onUpdateField: (idx: number, field: keyof ParsedRow, value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">
          {drafts.length} row{drafts.length === 1 ? "" : "s"} parsed
        </span>
        <button
          onClick={() => drafts.forEach((_, i) => onUpdateDraft(i, { action: "skip" }))}
          className="rounded-md border border-border px-2 py-1 hover:bg-accent"
        >
          Skip all
        </button>
        <button
          onClick={() => drafts.forEach((_, i) => onUpdateDraft(i, { action: "create" }))}
          className="rounded-md border border-border px-2 py-1 hover:bg-accent"
        >
          Create all
        </button>
      </div>

      {drafts.map((d, idx) => {
        const hasErrors = d.errors.length > 0 && d.action === "create";
        return (
          <div
            key={idx}
            className={`rounded-md border bg-surface p-3 ${
              hasErrors
                ? "border-destructive/40"
                : d.action === "skip"
                  ? "border-border opacity-60"
                  : "border-border"
            }`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono text-muted-foreground">#{idx + 1}</span>
              <select
                value={d.action}
                onChange={(e) =>
                  onUpdateDraft(idx, { action: e.target.value as RowDraft["action"] })
                }
                className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                  d.action === "create"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100"
                    : "border-border bg-muted text-muted-foreground"
                }`}
              >
                <option value="create">Create</option>
                <option value="skip">Skip</option>
              </select>
              {hasErrors && (
                <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  {d.errors.length} issue{d.errors.length === 1 ? "" : "s"}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Title (EN) <span className="text-destructive">*</span>
                </span>
                <input
                  value={d.fields.title_en}
                  onChange={(e) => onUpdateField(idx, "title_en", e.target.value)}
                  className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-sm font-semibold"
                />
              </label>
              <label className="col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Title (MT)
                </span>
                <input
                  value={d.fields.title_mt}
                  onChange={(e) => onUpdateField(idx, "title_mt", e.target.value)}
                  className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
              <label className="col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Description (EN)
                </span>
                <textarea
                  value={d.fields.description_en}
                  onChange={(e) => onUpdateField(idx, "description_en", e.target.value)}
                  rows={2}
                  className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                />
              </label>
              <label className="col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Description (MT)
                </span>
                <textarea
                  value={d.fields.description_mt}
                  onChange={(e) => onUpdateField(idx, "description_mt", e.target.value)}
                  rows={2}
                  className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                />
              </label>
              <label>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Party
                </span>
                <select
                  value={d.partyId ?? ""}
                  onChange={(e) => onUpdateDraft(idx, { partyId: e.target.value || null })}
                  className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">— None —</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name_en}
                    </option>
                  ))}
                </select>
                {d.fields.party && !d.partyId && (
                  <p className="mt-0.5 text-[10px] text-destructive">
                    No match for “{d.fields.party}”
                  </p>
                )}
              </label>
              <label>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Candidate
                </span>
                <select
                  value={d.candidateId ?? ""}
                  onChange={(e) => onUpdateDraft(idx, { candidateId: e.target.value || null })}
                  className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">— None —</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
                {d.fields.candidate && !d.candidateId && (
                  <p className="mt-0.5 text-[10px] text-destructive">
                    No match for “{d.fields.candidate}”
                  </p>
                )}
              </label>
              <label>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </span>
                <select
                  value={d.resolvedStatus}
                  onChange={(e) =>
                    onUpdateDraft(idx, { resolvedStatus: e.target.value as ReviewStatus })
                  }
                  className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  {STATUS_VALUES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Source URL
                </span>
                <input
                  value={d.fields.source_url}
                  onChange={(e) => onUpdateField(idx, "source_url", e.target.value)}
                  className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                />
              </label>
              <label className="col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Notes
                </span>
                <input
                  value={d.fields.notes}
                  onChange={(e) => onUpdateField(idx, "notes", e.target.value)}
                  className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                />
              </label>
            </div>

            {hasErrors && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[11px] text-destructive">
                {d.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- helpers ----------

async function parseFile(file: File): Promise<ParsedRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("Workbook contains no sheets.");
    const sheet = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    return json.map(normaliseRow);
  }
  // CSV
  const text = await file.text();
  const res = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => normaliseHeader(h),
  });
  if (res.errors.length > 0) {
    const first = res.errors[0];
    throw new Error(`CSV parse error: ${first.message} (row ${first.row ?? "?"})`);
  }
  return res.data.map(normaliseRow);
}

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function normaliseRow(raw: Record<string, unknown>): ParsedRow {
  const lookup: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    lookup[normaliseHeader(k)] = v == null ? "" : String(v);
  }
  const out = {} as ParsedRow;
  for (const key of FIELD_KEYS) {
    out[key] = lookup[key] ?? "";
  }
  return out;
}

function buildLookup<T extends { id: string }>(
  items: T[],
  keysOf: (item: T) => Array<string | null | undefined>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const item of items) {
    for (const k of keysOf(item)) {
      const norm = normaliseKey(k ?? "");
      if (norm && !m.has(norm)) m.set(norm, item.id);
    }
  }
  return m;
}

function normaliseKey(s: string): string {
  return s.trim().toLowerCase();
}

function resolveStatus(raw: string): ReviewStatus {
  const norm = raw.trim().toLowerCase().replace(/[\s-]/g, "_");
  if ((STATUS_VALUES as ReadonlyArray<string>).includes(norm)) {
    return norm as ReviewStatus;
  }
  return "pending_review";
}

function buildDraft(
  parsed: ParsedRow,
  partyLookup: Map<string, string>,
  candidateLookup: Map<string, string>,
): RowDraft {
  const partyId = parsed.party ? (partyLookup.get(normaliseKey(parsed.party)) ?? null) : null;
  const candidateId = parsed.candidate
    ? (candidateLookup.get(normaliseKey(parsed.candidate)) ?? null)
    : null;
  const draft: RowDraft = {
    action: "create",
    fields: parsed,
    partyId,
    candidateId,
    resolvedStatus: resolveStatus(parsed.status),
    errors: [],
  };
  draft.errors = validateDraft(draft);
  return draft;
}

function validateDraft(draft: RowDraft): string[] {
  const errs: string[] = [];
  if (!draft.fields.title_en.trim()) errs.push("English title is required.");
  if (!draft.partyId && !draft.candidateId) {
    errs.push("Link to a party or a candidate is required.");
  }
  if (draft.fields.source_url.trim() && !isLikelyUrl(draft.fields.source_url.trim())) {
    errs.push("Source URL is not a valid URL.");
  }
  return errs;
}

function isLikelyUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function downloadTemplate() {
  const headers = FIELD_KEYS.join(",");
  const example = [
    "Free public transport",
    "Trasport pubbliku b'xejn",
    "Make all buses free for residents.",
    "Il-karozzi tal-linja kollha bla ħlas għal residenti.",
    "Labour Party",
    "",
    "pending_review",
    "https://example.com/manifesto#transport",
    "",
  ]
    .map(csvEscape)
    .join(",");
  const blob = new Blob([headers + "\n" + example + "\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "proposals-import-template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
