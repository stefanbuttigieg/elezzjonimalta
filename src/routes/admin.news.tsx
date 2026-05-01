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
  scanUrlNow,
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
  base_url: string;
  sitemap_url: string | null;
}

type SourceDraft = {
  id?: string;
  slug: string;
  name: string;
  base_url: string;
  sitemap_url: string;
  enabled: boolean;
};

const EMPTY_SOURCE: SourceDraft = {
  slug: "",
  name: "",
  base_url: "",
  sitemap_url: "",
  enabled: true,
};

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
  const [sourceDraft, setSourceDraft] = useState<SourceDraft | null>(null);
  const [showSourceManager, setShowSourceManager] = useState(false);

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

  const saveSource = async () => {
    if (!sourceDraft) return;
    const slug = sourceDraft.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/(^-|-$)+/g, "");
    if (!slug || !sourceDraft.name.trim() || !sourceDraft.base_url.trim()) {
      toast.error("Slug, name, and base URL are required");
      return;
    }
    try {
      new URL(sourceDraft.base_url);
      if (sourceDraft.sitemap_url.trim()) new URL(sourceDraft.sitemap_url);
    } catch {
      toast.error("Invalid URL");
      return;
    }
    const payload = {
      slug,
      name: sourceDraft.name.trim(),
      base_url: sourceDraft.base_url.trim(),
      sitemap_url: sourceDraft.sitemap_url.trim() || null,
      enabled: sourceDraft.enabled,
    };
    const res = sourceDraft.id
      ? await supabase.from("news_sources").update(payload).eq("id", sourceDraft.id)
      : await supabase.from("news_sources").insert(payload);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    toast.success(sourceDraft.id ? "Source updated" : "Source added");
    setSourceDraft(null);
    await load();
  };

  const toggleSourceEnabled = async (s: Source) => {
    const { error } = await supabase
      .from("news_sources")
      .update({ enabled: !s.enabled })
      .eq("id", s.id);
    if (error) toast.error(error.message);
    else await load();
  };

  const deleteSource = async (s: Source) => {
    if (!confirm(`Delete source "${s.name}"? Articles and findings already collected from it will remain but become orphaned.`)) return;
    const { error } = await supabase.from("news_sources").delete().eq("id", s.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Source deleted");
      await load();
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

      <details className="mt-4 rounded-xl border border-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-foreground">
          How the sync works
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Discover.</span> For each enabled source we ask
            Firecrawl Search (Google-backed, restricted with <code>site:</code>) for election-related
            articles published in the last 7 days. This avoids pulling whatever the sitemap returns first,
            which is what was causing very old articles to keep showing up.
          </li>
          <li>
            <span className="font-medium text-foreground">Dedupe by URL.</span> Any URL we have ever seen
            (in any state — classified, dismissed, scrape-failed, even skipped-as-old) is filtered out
            before scraping, so the same article never goes through the AI twice.
          </li>
          <li>
            <span className="font-medium text-foreground">Scrape.</span> Firecrawl extracts the article
            body as clean markdown (main content only, capped at ~6,000 characters).
          </li>
          <li>
            <span className="font-medium text-foreground">Freshness gate.</span> If the scraped article
            has a <code>published</code> date older than 21 days, we record the URL as
            <code> skipped_old</code> and stop — no AI cost, and we won't see it again.
          </li>
          <li>
            <span className="font-medium text-foreground">Classify.</span> Lovable AI (Gemini 2.5 Flash)
            reads the article and returns a strict JSON verdict:{" "}
            <code>proposal</code> / <code>new_candidate</code> / <code>election_development</code> /{" "}
            <code>not_relevant</code>, plus a confidence score, summaries, and entity hints (candidate
            name, party, district).
          </li>
          <li>
            <span className="font-medium text-foreground">Queue for review.</span> Anything not flagged
            as <code>not_relevant</code> with confidence ≥ 45% lands in <em>Pending</em> for staff
            review. Reviewing, dismissing, or converting it never causes it to be re-detected — the
            originating URL is permanently in the dedup table.
          </li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          Per-run caps: max <strong>5</strong> new articles per source, <strong>20</strong> total.
          Manual runs and the 4× daily cron use the same pipeline.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          <strong>Re-process</strong> on a finding sends it back to <em>Pending</em> with the alert
          unread; it does not re-run the AI on the article.
        </p>
      </details>


      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sources</p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSourceManager((v) => !v)}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent"
            >
              {showSourceManager ? "Hide manager" : "Manage sources"}
            </button>
            <button
              onClick={() => { setShowSourceManager(true); setSourceDraft({ ...EMPTY_SOURCE }); }}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              + Add source
            </button>
          </div>
        </div>
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
                {!s.enabled ? <span className="text-[10px] text-amber-700">· disabled</span> : null}
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

        {showSourceManager ? (
          <div className="mt-4 rounded-lg border border-border bg-background p-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-1.5 pr-2">Name</th>
                  <th className="py-1.5 pr-2">Slug</th>
                  <th className="py-1.5 pr-2">Base URL</th>
                  <th className="py-1.5 pr-2">Enabled</th>
                  <th className="py-1.5 pr-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sources.length === 0 ? (
                  <tr><td colSpan={5} className="py-3 text-center text-muted-foreground">No sources configured.</td></tr>
                ) : sources.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-1.5 pr-2 font-medium">{s.name}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground"><code>{s.slug}</code></td>
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      <a href={s.base_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {s.base_url}
                      </a>
                    </td>
                    <td className="py-1.5 pr-2">
                      <button
                        onClick={() => toggleSourceEnabled(s)}
                        className={
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                          (s.enabled
                            ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
                            : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300")
                        }
                      >
                        {s.enabled ? "Enabled" : "Disabled"}
                      </button>
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      <button
                        onClick={() => setSourceDraft({
                          id: s.id,
                          slug: s.slug,
                          name: s.name,
                          base_url: s.base_url,
                          sitemap_url: s.sitemap_url ?? "",
                          enabled: s.enabled,
                        })}
                        className="mr-2 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteSource(s)}
                        className="rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {sourceDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSourceDraft(null)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold">{sourceDraft.id ? "Edit source" : "Add source"}</h2>
              <button onClick={() => setSourceDraft(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Name</span>
                <input
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5"
                  value={sourceDraft.name}
                  onChange={(e) => setSourceDraft({ ...sourceDraft, name: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Slug (lowercase, hyphens)</span>
                <input
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono"
                  value={sourceDraft.slug}
                  onChange={(e) => setSourceDraft({ ...sourceDraft, slug: e.target.value })}
                  placeholder="times-of-malta"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Base URL</span>
                <input
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5"
                  value={sourceDraft.base_url}
                  onChange={(e) => setSourceDraft({ ...sourceDraft, base_url: e.target.value })}
                  placeholder="https://timesofmalta.com"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Used to scope Firecrawl Search with <code>site:domain</code>.
                </span>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Sitemap URL (optional)</span>
                <input
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5"
                  value={sourceDraft.sitemap_url}
                  onChange={(e) => setSourceDraft({ ...sourceDraft, sitemap_url: e.target.value })}
                  placeholder="https://timesofmalta.com/sitemap.xml"
                />
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sourceDraft.enabled}
                  onChange={(e) => setSourceDraft({ ...sourceDraft, enabled: e.target.checked })}
                />
                <span className="text-sm">Enabled (included in scheduled scans)</span>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setSourceDraft(null)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={saveSource}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {sourceDraft.id ? "Save changes" : "Add source"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                  {f.article?.published_at ? (
                    <span className="text-[11px] text-muted-foreground">
                      Published {new Date(f.article.published_at).toLocaleDateString()}
                    </span>
                  ) : null}
                  <span className="text-[11px] text-muted-foreground">
                    Detected {formatDistanceToNow(new Date(f.created_at))} ago
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
                <button
                  onClick={() => setConvertFor(f)}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Wand2 className="h-3.5 w-3.5" /> Convert to action
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

      {convertFor ? (
        <ConvertDialog
          finding={convertFor}
          parties={parties}
          districts={districts}
          candidates={candidates}
          onClose={() => setConvertFor(null)}
          onSubmit={async (target, payload) => {
            const result = await convertFn({ data: { findingId: convertFor.id, target, payload } });
            if (result.ok) {
              toast.success(`Created ${result.entity?.type ?? "entity"}`);
              setConvertFor(null);
              await load();
            } else {
              toast.error(result.error);
            }
          }}
        />
      ) : null}
    </div>
  );
}

interface ConvertDialogProps {
  finding: Finding;
  parties: PartyOpt[];
  districts: DistrictOpt[];
  candidates: CandidateOpt[];
  onClose: () => void;
  onSubmit: (target: ConvertTarget, payload: Record<string, string>) => Promise<void>;
}

function ConvertDialog({ finding, parties, districts, candidates, onClose, onSubmit }: ConvertDialogProps) {
  const ex = finding.extracted ?? {};
  const defaultTarget: ConvertTarget =
    finding.kind === "new_candidate"
      ? "new_candidate"
      : finding.kind === "proposal"
        ? "new_proposal"
        : "new_proposal";
  const [target, setTarget] = useState<ConvertTarget>(defaultTarget);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    full_name: ex.candidate_name ?? "",
    title_en: finding.title ?? "",
    description_en: finding.summary_en ?? "",
    name_en: ex.party_hint ?? "",
    bio_en: finding.summary_en ?? "",
    notes: finding.summary_en ?? "",
  });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(target, form);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-serif text-lg font-bold text-foreground">Convert to action</h2>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{finding.title ?? finding.summary_en}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(
            [
              ["new_candidate", "New candidate"],
              ["update_candidate", "Update candidate"],
              ["new_proposal", "New proposal"],
              ["new_party", "New party"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTarget(v)}
              className={
                "rounded-md border px-3 py-2 text-xs font-medium " +
                (target === v
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent")
              }
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          {target === "new_candidate" ? (
            <>
              <Field label="Full name *" value={form.full_name ?? ""} onChange={(v) => set("full_name", v)} />
              <SelectField label="Party" value={form.party_id ?? ""} onChange={(v) => set("party_id", v)}
                options={[{ value: "", label: "— none —" }, ...parties.map((p) => ({ value: p.id, label: p.name_en }))]} />
              <SelectField label="Primary district" value={form.primary_district_id ?? ""} onChange={(v) => set("primary_district_id", v)}
                options={[{ value: "", label: "— none —" }, ...districts.map((d) => ({ value: d.id, label: `${d.number} · ${d.name_en}` }))]} />
              <TextArea label="Bio (EN)" value={form.bio_en ?? ""} onChange={(v) => set("bio_en", v)} />
            </>
          ) : null}

          {target === "update_candidate" ? (
            <>
              <SelectField label="Candidate *" value={form.candidate_id ?? ""} onChange={(v) => set("candidate_id", v)}
                options={[{ value: "", label: "— select —" }, ...candidates.map((c) => ({ value: c.id, label: c.full_name }))]} />
              <SelectField label="Set party" value={form.party_id ?? ""} onChange={(v) => set("party_id", v)}
                options={[{ value: "", label: "— unchanged —" }, ...parties.map((p) => ({ value: p.id, label: p.name_en }))]} />
              <SelectField label="Set district" value={form.primary_district_id ?? ""} onChange={(v) => set("primary_district_id", v)}
                options={[{ value: "", label: "— unchanged —" }, ...districts.map((d) => ({ value: d.id, label: `${d.number} · ${d.name_en}` }))]} />
              <TextArea label="Append to notes" value={form.notes ?? ""} onChange={(v) => set("notes", v)} />
              <TextArea label="Replace bio (EN)" value={form.bio_en ?? ""} onChange={(v) => set("bio_en", v)} />
            </>
          ) : null}

          {target === "new_proposal" ? (
            <>
              <Field label="Title *" value={form.title_en ?? ""} onChange={(v) => set("title_en", v)} />
              <TextArea label="Description (EN)" value={form.description_en ?? ""} onChange={(v) => set("description_en", v)} />
              <Field label="Category" value={form.category ?? ""} onChange={(v) => set("category", v)} placeholder="e.g. Health, Transport" />
              <SelectField label="Party" value={form.party_id ?? ""} onChange={(v) => set("party_id", v)}
                options={[{ value: "", label: "— none —" }, ...parties.map((p) => ({ value: p.id, label: p.name_en }))]} />
              <SelectField label="Candidate" value={form.candidate_id ?? ""} onChange={(v) => set("candidate_id", v)}
                options={[{ value: "", label: "— none —" }, ...candidates.map((c) => ({ value: c.id, label: c.full_name }))]} />
            </>
          ) : null}

          {target === "new_party" ? (
            <>
              <Field label="Name (EN) *" value={form.name_en ?? ""} onChange={(v) => set("name_en", v)} />
              <Field label="Short name" value={form.short_name ?? ""} onChange={(v) => set("short_name", v)} />
              <Field label="Color (hex)" value={form.color ?? ""} onChange={(v) => set("color", v)} placeholder="#1f6feb" />
              <Field label="Website" value={form.website ?? ""} onChange={(v) => set("website", v)} />
              <TextArea label="Description (EN)" value={form.description_en ?? ""} onChange={(v) => set("description_en", v)} />
            </>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
      />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        value={value}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

void Newspaper;
void useMemo;
