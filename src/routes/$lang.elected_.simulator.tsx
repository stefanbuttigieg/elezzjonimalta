import { createFileRoute, ErrorComponent, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, RefreshCw, ExternalLink, Trophy, Sparkles, ArrowRight, AlertTriangle } from "lucide-react";
import { isLocale, type Locale } from "@/i18n/types";
import { useT } from "@/i18n/useT";
import {
  getDoublyElectedCandidates,
  simulateCasualForDistrict,
  type DoublyElectedCandidate,
  type CasualScenario,
  type CasualContender,
} from "@/lib/casualSimulator.functions";

export const Route = createFileRoute("/$lang/elected_/simulator")({
  head: ({ params }) => {
    const isMt = params.lang === "mt";
    const title = isMt
      ? "Simulatur ta' Elezzjonijiet Każwali — Eletti 2026"
      : "Casual Election Simulator — Elected 2026";
    const description = isMt
      ? "Min jista' jiġi elett jekk kandidat li ġie elett f'żewġ distretti jirrelinkwixxi siġġu? Stima bbażata fuq it-trasferimenti tal-voti tal-Kummissjoni Elettorali."
      : "Who is likely to take the seat if a doubly-elected candidate relinquishes one district? Estimate based on vote transfer patterns from the Electoral Commission counts.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  loader: async ({ params }) => {
    const lang: Locale = isLocale(params.lang) ? params.lang : "mt";
    return { lang };
  },
  component: SimulatorPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-3xl p-6">
        <ErrorComponent error={error} />
        <button
          className="mt-4 rounded-md border border-border px-3 py-1.5 text-sm"
          onClick={() => { router.invalidate(); reset(); }}
        >
          Retry
        </button>
      </div>
    );
  },
});

const YEAR = 2026;

function SimulatorPage() {
  const { lang } = Route.useLoaderData();
  const t = useT();
  const isMt = lang === "mt";

  const fetchList = useServerFn(getDoublyElectedCandidates);
  const fetchSimDistrict = useServerFn(simulateCasualForDistrict);

  const [candidates, setCandidates] = useState<DoublyElectedCandidate[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<DoublyElectedCandidate | null>(null);
  const [scenarios, setScenarios] = useState<CasualScenario[] | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simErr, setSimErr] = useState<string | null>(null);
  /** Map from normalized predicted-winner name -> list of relinquishers (and the district they'd win). */
  const [conflictMap, setConflictMap] = useState<Map<string, Array<{ relinquisher: string; district: number }>>>(new Map());

  useEffect(() => {
    fetchList({ data: { year: YEAR } })
      .then((rows) => {
        setCandidates(rows);
        if (rows.length > 0) setSelected(rows[0]);
      })
      .catch((e: unknown) => setListErr(e instanceof Error ? e.message : String(e)));
  }, [fetchList]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setSimLoading(true);
    setSimErr(null);
    setScenarios(null);
    Promise.all(
      [selected.districts[0], selected.districts[1]].map((districtNumber) =>
        fetchSimDistrict({
          data: {
            year: YEAR,
            fullName: selected.fullName,
            partyShort: selected.partyShort,
            districtNumber,
          },
        }),
      ),
    )
      .then((results) => {
        if (!cancelled) setScenarios(results);
      })
      .catch((e: unknown) => {
        if (!cancelled) setSimErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setSimLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, fetchSimDistrict]);

  // Precompute cross-candidate conflicts: a person predicted to win the casual
  // seat for more than one doubly-elected candidate can only fill one of them.
  useEffect(() => {
    if (!candidates || candidates.length === 0) return;
    let cancelled = false;
    Promise.all(
      candidates.flatMap((c) =>
        c.districts.slice(0, 2).map((districtNumber) =>
          fetchSimDistrict({
            data: { year: YEAR, fullName: c.fullName, partyShort: c.partyShort, districtNumber },
          })
            .then((s) => ({ relinquisher: c.fullName, scenario: s }))
            .catch(() => null),
        ),
      ),
    ).then((results) => {
      if (cancelled) return;
      const map = new Map<string, Array<{ relinquisher: string; district: number }>>();
      for (const r of results) {
        if (!r || !r.scenario.ok || !r.scenario.predicted) continue;
        const key = normalizeContenderName(r.scenario.predicted.name);
        const arr = map.get(key) ?? [];
        arr.push({ relinquisher: r.relinquisher, district: r.scenario.districtNumber });
        map.set(key, arr);
      }
      setConflictMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [candidates, fetchSimDistrict]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          to="/$lang/elected"
          params={{ lang }}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {isMt ? "Lura għall-eletti" : "Back to elected"}
        </Link>

        <header className="mt-6">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            <Sparkles className="h-3 w-3" />
            {isMt ? "Sperimentali" : "Experimental"}
          </div>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            {isMt ? "Simulatur ta' Elezzjoni Każwali" : "Casual Election Simulator"}
          </h1>
          <p className="mt-3 max-w-3xl text-base text-muted-foreground">
            {isMt
              ? "Ħafna kandidati jiġu eletti f'żewġ distretti, imma jistgħu jżommu siġġu wieħed biss. Min hu probabbli li jiġi elett fl-elezzjoni każwali skont id-distrett li jiġi relinkwit? It-tbassir hu bbażat fuq kif kienu qed jitqassmu l-voti fl-għodd tal-Kummissjoni Elettorali."
              : "Many candidates get elected in two districts but can only keep one seat. Who is likely to win the casual election depending on which district they relinquish? The prediction is based on how votes were transferring at the count where the candidate was elected, per the Electoral Commission data."}
          </p>
          <details className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <summary className="cursor-pointer font-semibold text-foreground">
              {isMt ? "Kif jaħdem l-algoritmu?" : "How does the algorithm work?"}
            </summary>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5">
              <li>
                {isMt
                  ? "Ngħoddu l-għadd minn fejn il-kandidat irrelinkwit qabeż il-kwota."
                  : "Identify the count at which the relinquishing candidate first met or exceeded the quota."}
              </li>
              <li>
                {isMt
                  ? "Inħarsu lejn it-trasferiment tas-surplus tagħhom fl-għodd ta' wara — fejn marru l-voti."
                  : "Look at the surplus transfer in the next count — where their votes flowed."}
              </li>
              <li>
                {isMt
                  ? "Inqisu biss kandidati tal-istess partit fl-istess distrett, u neskludu lil min diġà ġie elett f'distrett ieħor (peress li ma jistax jokkupa żewġ siġġijiet)."
                  : "Consider only same-party contenders in that district, and exclude anyone already elected in another district (since they cannot hold two seats)."}
              </li>
              <li>
                {isMt
                  ? "Inkalkulaw is-sehem trasferit lil kull kandidat eliġibbli, ippeżat 70%, flimkien ma' 20% prossimità għall-kwota u 10% mill-voti tal-bidu."
                  : "Compute each eligible contender's share of that transfer (weighted 70%), plus 20% proximity to quota and 10% from first-count strength."}
              </li>
              <li>
                {isMt
                  ? "Il-kandidat bl-ogħla punteġġ huwa l-aktar probabbli li jirbaħ is-siġġu rilinkwit."
                  : "The eligible contender with the highest score is the most likely casual-election winner."}
              </li>
            </ol>

            <p className="mt-3 text-xs">
              {isMt
                ? "⚠️ Dan hu mudell statistiku approssimat. L-elezzjoni każwali fil-fatt tuża l-voti kollha tal-kandidat (mhux is-surplus biss), iżda l-pattern tal-preferenzi ġenerali jibqa' simili."
                : "⚠️ This is an approximation. The official casual election redistributes all the candidate's ballots (not just the surplus), but the underlying preference pattern is the same."}
            </p>
          </details>
        </header>

        {/* Candidate selector */}
        <section className="mt-8 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isMt ? "Kandidati eletti f'żewġ distretti — 2026" : "Doubly-elected candidates — 2026"}
          </h2>
          {listErr ? (
            <p className="mt-3 text-sm text-destructive">{listErr}</p>
          ) : !candidates ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" /> {isMt ? "Qed nieħu lista…" : "Loading list…"}
            </div>
          ) : candidates.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {isMt ? "Ebda kandidat doppjament elett għal-2026." : "No doubly-elected candidates for 2026 yet."}
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {candidates.map((c) => {
                const active = selected?.candidateId === c.candidateId;
                return (
                  <button
                    key={c.candidateId}
                    onClick={() => setSelected(c)}
                    className={
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition " +
                      (active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background text-foreground hover:bg-muted")
                    }
                  >
                    <span className="font-semibold">{c.fullName}</span>
                    {c.partyShort ? (
                      <span className="rounded-full bg-accent/40 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                        {c.partyShort}
                      </span>
                    ) : null}
                    <span className="text-xs opacity-80">{c.districts.join(" + ")}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Scenario */}
        {selected ? (
          <section className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-2xl font-bold text-foreground">
                {isMt ? "Jekk " : "If "}
                <span className="text-primary">{selected.fullName}</span>
                {isMt ? " jirrelinkwixxi…" : " relinquishes…"}
              </h2>
              <a
                href="https://electoral.gov.mt/ElectionResults/General"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                {isMt ? "Sors" : "Source"} electoral.gov.mt <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {simErr ? (
              <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {simErr}
              </p>
            ) : null}

            {simLoading ? (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-12 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                {isMt ? "Qed nikkalkula t-tbassir…" : "Crunching the numbers…"}
              </div>
            ) : scenarios ? (
              <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
                {scenarios.map((s) => (
                  <ScenarioCard
                    key={s.districtNumber}
                    scenario={s}
                    relinquishedFrom={s.districtNumber}
                    keptIn={
                      scenarios.find((o) => o.districtNumber !== s.districtNumber)?.districtNumber ??
                      s.districtNumber
                    }
                    isMt={isMt}
                    conflictMap={conflictMap}
                    currentRelinquisher={selected?.fullName ?? ""}
                  />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <p className="mt-10 text-center text-xs text-muted-foreground">
          {t("elected.casual.short")} · {isMt ? "Tbassir" : "Prediction"} · 2026
        </p>
      </div>
    </div>
  );
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-MT");
}
function normalizeContenderName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ScenarioCard({
  scenario,
  relinquishedFrom,
  keptIn,
  isMt,
  conflictMap,
  currentRelinquisher,
}: {
  scenario: CasualScenario;
  relinquishedFrom: number;
  keptIn: number;
  isMt: boolean;
  conflictMap: Map<string, Array<{ relinquisher: string; district: number }>>;
  currentRelinquisher: string;
}) {
  const top = scenario.predicted;
  const topConflicts = top
    ? (conflictMap.get(normalizeContenderName(top.name)) ?? []).filter(
        (e) => e.relinquisher !== currentRelinquisher || e.district !== relinquishedFrom,
      )
    : [];
  return (
    <article className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isMt ? "Jirrelinkwixxi" : "Relinquishes"}
          </p>
          <h3 className="text-xl font-bold text-foreground">
            {isMt ? "Distrett" : "District"} {relinquishedFrom}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isMt ? "Iżomm" : "Keeps"} <span className="font-semibold text-foreground">{isMt ? "Distrett" : "District"} {keptIn}</span>
          </p>
        </div>
        {scenario.quota != null ? (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground">
            {isMt ? "Kwota" : "Quota"} {fmt(scenario.quota)}
          </span>
        ) : null}
      </header>

      {!scenario.ok ? (
        <p className="mt-4 rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {scenario.error || (isMt ? "M'hemmx biżżejjed data." : "Not enough data.")}
        </p>
      ) : (
        <>
          {top ? (
            <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                <Trophy className="h-3.5 w-3.5" />
                {isMt ? "Tbassir: l-aktar probabbli" : "Predicted casual winner"}
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <p className="text-lg font-bold text-foreground">{top.name}</p>
                <p className="text-2xl font-extrabold text-primary">{pct(top.probability)}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {top.party} ·{" "}
                {isMt ? "Sehem trasferit" : "Transfer share"} {pct(top.transferShare)}
                {top.shortOfQuota != null ? (
                  <> · {isMt ? "Bin-nuqqas ta'" : "Short of quota by"} {fmt(top.shortOfQuota)}</>
                ) : null}
              </p>
              {topConflicts.length > 0 ? (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <div>
                    <p className="font-bold uppercase tracking-wider">
                      {isMt ? "Kunflitt ta' tbassir" : "Prediction conflict"}
                    </p>
                    <p className="mt-0.5 opacity-90">
                      {isMt
                        ? "Mbassar ukoll bħala rebbieħ każwali għal: "
                        : "Also predicted as the casual winner for: "}
                      {topConflicts
                        .map((e) => `${e.relinquisher} (${isMt ? "D" : "D"}${e.district})`)
                        .join(", ")}
                      . {isMt ? "Jistgħu jokkupaw siġġu wieħed biss." : "They can only fill one seat."}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {isMt ? "Klassifika kompluta" : "Full ranking"}
            </p>
            <ol className="space-y-1.5">
              {scenario.contenders.map((c, i) => {
                const cConflicts = (conflictMap.get(normalizeContenderName(c.name)) ?? []).filter(
                  (e) => e.relinquisher !== currentRelinquisher || e.district !== relinquishedFrom,
                );
                return (
                  <ContenderRow
                    key={c.name}
                    contender={c}
                    rank={i + 1}
                    isMt={isMt}
                    hasConflict={cConflicts.length > 0}
                    quota={scenario.quota}
                    transferredTotal={scenario.transferredTotal}
                  />
                );
              })}
            </ol>
          </div>

          <footer className="mt-4 text-[11px] text-muted-foreground">
            {isMt ? "Trasferiment osservat fl-għodd " : "Transfer observed at count "}
            {scenario.transferCount} · {isMt ? "kandidat elett fl-għodd " : "candidate elected at count "}
            {scenario.electedAtCount}
            {scenario.transferredTotal ? (
              <> · {fmt(scenario.transferredTotal)} {isMt ? "voti trasferiti" : "votes transferred"}</>
            ) : null}
          </footer>
        </>
      )}
    </article>
  );
}

function ContenderRow({
  contender,
  rank,
  isMt,
  hasConflict,
  quota,
}: {
  contender: CasualContender;
  rank: number;
  isMt: boolean;
  hasConflict?: boolean;
  quota: number | null;
}) {
  const proximity =
    contender.shortOfQuota != null && quota != null && quota > 0
      ? Math.max(0, 1 - contender.shortOfQuota / quota)
      : 0;
  const transferContribution = contender.transferShare * 0.78;
  const proximityContribution = proximity * 0.22;
  return (
    <li className="rounded-md border border-border bg-background px-3 py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="w-5 text-right font-bold text-muted-foreground">{rank}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">
            {contender.name}
            {contender.sameParty ? (
              <span className="ml-2 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
                {isMt ? "Istess partit" : "Same party"}
              </span>
            ) : null}
            {hasConflict ? (
              <span
                className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700 dark:text-amber-300"
                title={isMt ? "Mbassar ukoll f'distrett ieħor" : "Also predicted in another district"}
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                {isMt ? "Kunflitt" : "Conflict"}
              </span>
            ) : null}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {contender.party} · {isMt ? "trasf." : "transfer"} {pct(contender.transferShare)}
            {contender.finalVotes != null ? <> · {fmt(contender.finalVotes)} {isMt ? "voti" : "votes"}</> : null}
          </p>
        </div>
        <div className="text-right">
          <div className="text-base font-bold text-foreground tabular-nums">{pct(contender.probability)}</div>
          <ProbBar value={contender.probability} />
        </div>
      </div>
      <details className="mt-2 pl-8">
        <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
          {isMt ? "Uri l-kalkolu" : "Show calculation"}
        </summary>
        <div className="mt-2 space-y-1.5 rounded-md bg-muted/40 p-2.5 font-mono text-[11px] text-muted-foreground">
          <div className="flex justify-between gap-3">
            <span>{isMt ? "Sehem trasferit" : "Transfer share"}</span>
            <span className="text-foreground">{pct(contender.transferShare)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>
              {isMt ? "Prossimità għall-kwota" : "Proximity to quota"}
              {contender.shortOfQuota != null && quota != null ? (
                <span className="ml-1 opacity-70">
                  (1 − {fmt(contender.shortOfQuota)}/{fmt(quota)})
                </span>
              ) : null}
            </span>
            <span className="text-foreground">{pct(proximity)}</span>
          </div>
          <div className="mt-1 border-t border-border/60 pt-1.5">
            <div className="flex justify-between gap-3">
              <span>{pct(contender.transferShare)} × 0.78</span>
              <span className="text-foreground">{pct(transferContribution)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>+ {pct(proximity)} × 0.22</span>
              <span className="text-foreground">{pct(proximityContribution)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3 border-t border-border/60 pt-1 font-bold text-foreground">
              <span>= {isMt ? "punteġġ" : "score"}</span>
              <span>{contender.score.toFixed(4)}</span>
            </div>
          </div>
          <div className="flex justify-between gap-3 pt-1 text-[10px] italic opacity-80">
            <span>{isMt ? "Probabbiltà = punteġġ ÷ somma tal-punteġġi" : "Probability = score ÷ sum of scores"}</span>
            <span className="text-foreground not-italic">{pct(contender.probability)}</span>
          </div>
        </div>
      </details>
    </li>
  );
}

function ProbBar({ value }: { value: number }) {
  const width = Math.max(2, Math.round(value * 100));
  return (
    <div className="mt-0.5 h-1 w-20 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
    </div>
  );
}

// Suppress unused import warning for ArrowRight (kept for future linking)
void ArrowRight;
