import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  triggerNewsScan,
  updateFindingStatus,
  ackFindingAlerts,
  reprocessFinding,
  convertFinding,
} from "@/server/newsScan.functions";
import { toast } from "sonner";
import {
  Newspaper,
  PlayCircle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Wand2,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/admin/news")({
  component: NewsMonitor,
});

type Kind = "proposal" | "new_candidate" | "election_development" | "not_relevant";
type Status = "pending" | "accepted" | "dismissed" | "reviewed";

interface Source {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  last_scanned_at: string | null;
}

interface PartyOpt { id: string; name_en: string; short_name: string | null }
interface DistrictOpt { id: string; number: number; name_en: string }
interface CandidateOpt { id: string; full_name: string; party_id: string | null }

type ConvertTarget = "new_candidate" | "update_candidate" | "new_proposal" | "new_party";

interface Finding {
  id: string;
  kind: Kind;
  confidence: number;
  title: string | null;
  summary_en: string | null;
  summary_mt: string | null;
  status: Status;
  alert_seen_at: string | null;
  created_at: string;
  extracted: Record<string, string> | null;
  source: { name: string; slug: string } | null;
  article: { url: string; title: string | null; published_at: string | null } | null;
}

interface Run {
  id: string;
  trigger: "cron" | "manual";
  started_at: string;
  finished_at: string | null;
  articles_discovered: number;
  articles_scanned: number;
  findings_created: number;
  error: string | null;
}

const KIND_LABELS: Record<Kind, string> = {
  proposal: "Proposal",
  new_candidate: "New candidate",
  election_development: "Election development",
  not_relevant: "Not relevant",
};
const KIND_COLORS: Record<Kind, string> = {
  proposal: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  new_candidate: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  election_development: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  not_relevant: "bg-muted text-muted-foreground",
};
const STATUS_COLORS: Record<Status, string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  accepted: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  dismissed: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  reviewed: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
};

function NewsMonitor() {
  const [tab, setTab] = useState<Status | "all">("pending");
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [findings, setFindings] = useState<Finding[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [parties, setParties] = useState<PartyOpt[]>([]);
  const [districts, setDistricts] = useState<DistrictOpt[]>([]);
  const [candidates, setCandidates] = useState<CandidateOpt[]>([]);
  const [convertFor, setConvertFor] = useState<Finding | null>(null);

  const triggerFn = useServerFn(triggerNewsScan);
  const updateFn = useServerFn(updateFindingStatus);
  const ackFn = useServerFn(ackFindingAlerts);
  const reprocessFn = useServerFn(reprocessFinding);
  const convertFn = useServerFn(convertFinding);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("news_findings")
      .select(
        "id, kind, confidence, title, summary_en, summary_mt, status, alert_seen_at, created_at, extracted, source:news_sources(name, slug), article:news_articles(url, title, published_at)"
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (tab !== "all") q = q.eq("status", tab);
    const [findingsRes, sourcesRes, runsRes, partiesRes, districtsRes, candidatesRes] = await Promise.all([
      q,
      supabase.from("news_sources").select("*").order("name"),
      supabase.from("news_scan_runs").select("*").order("started_at", { ascending: false }).limit(15),
      supabase.from("parties").select("id, name_en, short_name").order("name_en"),
      supabase.from("districts").select("id, number, name_en").order("number"),
      supabase.from("candidates").select("id, full_name, party_id").order("full_name").limit(2000),
    ]);
    if (findingsRes.error) toast.error(findingsRes.error.message);
    setFindings((findingsRes.data ?? []) as unknown as Finding[]);
    setSources((sourcesRes.data ?? []) as Source[]);
    setRuns((runsRes.data ?? []) as Run[]);
    setParties((partiesRes.data ?? []) as PartyOpt[]);
    setDistricts((districtsRes.data ?? []) as DistrictOpt[]);
    setCandidates((candidatesRes.data ?? []) as CandidateOpt[]);
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab !== "pending" || findings.length === 0) return;
    const unseen = findings.filter((f) => !f.alert_seen_at).map((f) => f.id);
    if (unseen.length === 0) return;
    void ackFn({ data: { findingIds: unseen } });
  }, [tab, findings, ackFn]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const ids = selectedSources.size > 0 ? Array.from(selectedSources) : undefined;
      const result = await triggerFn({ data: { sourceIds: ids } });
      if (result.ok) {
        toast.success(`Scan finished — ${result.findingsCreated} new findings from ${result.articlesScanned} articles`);
      } else {
        toast.error(`Scan failed: ${result.error}`);
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const act = async (findingId: string, action: "dismiss" | "mark_reviewed" | "reopen") => {
    try {
      await updateFn({ data: { findingId, action } });
      toast.success("Updated");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const reprocess = async (findingId: string) => {
    try {
      await reprocessFn({ data: { findingId } });
      toast.success("Marked for re-processing");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const lastRun = runs[0];

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">News monitor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scans Times of Malta, The Malta Independent, MaltaToday, Lovin Malta, and Newsbook for proposals,
            new candidates, and election developments. Runs automatically 4× daily.
          </p>
          {lastRun ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Last run {formatDistanceToNow(new Date(lastRun.started_at))} ago ·{" "}
              {lastRun.findings_created} findings · {lastRun.articles_scanned} articles
              {lastRun.error ? <span className="ml-2 text-destructive">· had errors</span> : null}
            </p>
          ) : null}
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {scanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          {scanning ? "Scanning…" : "Run scan now"}
        </button>
      </header>

      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sources</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {sources.map((s) => {
            const checked = selectedSources.has(s.id);
            return (
              <label
                key={s.id}
                className={
                  "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs " +
                  (checked ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground")
                }
              >
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={checked}
                  onChange={(e) => {
                    setSelectedSources((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(s.id);
                      else next.delete(s.id);
                      return next;
                    });
                  }}
                />
                {s.name}
                {s.last_scanned_at ? (
                  <span className="text-[10px] text-muted-foreground">
                    · {formatDistanceToNow(new Date(s.last_scanned_at))} ago
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Leave all unchecked to scan every enabled source.
        </p>
      </section>

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-border">
        {(["pending", "reviewed", "dismissed", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "border-b-2 px-3 py-2 text-sm font-medium capitalize " +
              (tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {t}
          </button>
        ))}
      </nav>

      <section className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : findings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No findings.
          </p>
        ) : (
          findings.map((f) => (
            <article key={f.id} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={"inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold " + KIND_COLORS[f.kind]}>
                      {KIND_LABELS[f.kind]}
                    </span>
                    <span className={"inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold " + STATUS_COLORS[f.status]}>
                      {f.status}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {Math.round(Number(f.confidence) * 100)}% confidence
                    </span>
                    {f.source ? (
                      <span className="text-[11px] font-medium text-muted-foreground">· {f.source.name}</span>
                    ) : null}
                    {!f.alert_seen_at && f.status === "pending" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                        <AlertCircle className="h-3 w-3" /> New
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-2 font-serif text-base font-semibold text-foreground">
                    {f.title ?? f.article?.title ?? "(no title)"}
                  </h3>
                  {f.summary_en ? (
                    <p className="mt-1 text-sm text-foreground/80">{f.summary_en}</p>
                  ) : null}
                  {f.extracted && (f.extracted.candidate_name || f.extracted.party_hint || f.extracted.district_hint) ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {f.extracted.candidate_name ? <>Candidate: <span className="font-medium text-foreground">{f.extracted.candidate_name}</span> · </> : null}
                      {f.extracted.party_hint ? <>Party: <span className="font-medium text-foreground">{f.extracted.party_hint}</span> · </> : null}
                      {f.extracted.district_hint ? <>District: <span className="font-medium text-foreground">{f.extracted.district_hint}</span></> : null}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {f.article?.url ? (
                    <a
                      href={f.article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Source <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                  <span className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(f.created_at))} ago
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {f.status === "pending" ? (
                  <>
                    <button
                      onClick={() => act(f.id, "mark_reviewed")}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark reviewed
                    </button>
                    <button
                      onClick={() => act(f.id, "dismiss")}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Dismiss
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => act(f.id, "reopen")}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                  >
                    Reopen
                  </button>
                )}
                <button
                  onClick={() => reprocess(f.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Re-process
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-lg font-semibold text-foreground">Recent runs</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Trigger</th>
                <th className="px-3 py-2">Articles</th>
                <th className="px-3 py-2">Findings</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 text-muted-foreground">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="px-3 py-2 capitalize">{r.trigger}</td>
                  <td className="px-3 py-2">{r.articles_scanned}/{r.articles_discovered}</td>
                  <td className="px-3 py-2 font-semibold">{r.findings_created}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.error ? <span className="text-destructive">error</span> : r.finished_at ? "done" : "running"}
                  </td>
                </tr>
              ))}
              {runs.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No runs yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

void Newspaper;
void useMemo;
