import { createFileRoute, ErrorComponent, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, RefreshCw, ExternalLink, Trophy, Sparkles, AlertTriangle, Users } from "lucide-react";
import { isLocale, type Locale } from "@/i18n/types";
import { useT } from "@/i18n/useT";
import {
  getDoublyElectedCandidates,
  simulateCasualForDistrict,
  getAllElectedForYear,
  type DoublyElectedCandidate,
  type CasualScenario,
  type CasualContender,
  type ElectedSeat,
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
  const fetchAllElected = useServerFn(getAllElectedForYear);

  const [allElected, setAllElected] = useState<ElectedSeat[] | null>(null);

  const [candidates, setCandidates] = useState<DoublyElectedCandidate[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<DoublyElectedCandidate | null>(null);
  const [scenarios, setScenarios] = useState<CasualScenario[] | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simErr, setSimErr] = useState<string | null>(null);
  /** Map from normalized predicted-winner name -> list of relinquishers (and the district they'd win). */
  const [conflictMap, setConflictMap] = useState<Map<string, Array<{ relinquisher: string; district: number }>>>(new Map());
  /** For each relinquisher, the set of contender names already claimed by OTHER relinquishers' top picks. */
  const [forbiddenByRelinquisher, setForbiddenByRelinquisher] = useState<Map<string, Set<string>>>(new Map());
  /** All scenarios keyed by `${candidateId}::${districtNumber}` for composition computation. */
  const [allScenarios, setAllScenarios] = useState<Map<string, CasualScenario>>(new Map());
  /** Which district each doubly-elected candidate relinquishes (candidateId -> districtNumber). */
  const [relinquishChoices, setRelinquishChoices] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    fetchList({ data: { year: YEAR } })
      .then((rows) => {
        setCandidates(rows);
        if (rows.length > 0) setSelected(rows[0]);
      })
      .catch((e: unknown) => setListErr(e instanceof Error ? e.message : String(e)));
  }, [fetchList]);

  useEffect(() => {
    fetchAllElected({ data: { year: YEAR } })
      .then(setAllElected)
      .catch(() => setAllElected([]));
  }, [fetchAllElected]);


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
            .then((s) => ({ candidate: c, scenario: s }))
            .catch(() => null),
        ),
      ),
    ).then((results) => {
      if (cancelled) return;
      const map = new Map<string, Array<{ relinquisher: string; district: number }>>();
      const predictedByRelinquisher = new Map<string, Set<string>>();
      const all = new Map<string, CasualScenario>();
      for (const r of results) {
        if (!r) continue;
        all.set(`${r.candidate.candidateId}::${r.scenario.districtNumber}`, r.scenario);
        if (!r.scenario.ok || !r.scenario.predicted) continue;
        const key = normalizeContenderName(r.scenario.predicted.name);
        const arr = map.get(key) ?? [];
        arr.push({ relinquisher: r.candidate.fullName, district: r.scenario.districtNumber });
        map.set(key, arr);
        const s = predictedByRelinquisher.get(r.candidate.fullName) ?? new Set<string>();
        s.add(key);
        predictedByRelinquisher.set(r.candidate.fullName, s);
      }
      const forbidden = new Map<string, Set<string>>();
      const allRelinquishers = Array.from(predictedByRelinquisher.keys());
      for (const r of allRelinquishers) {
        const f = new Set<string>();
        for (const other of allRelinquishers) {
          if (other === r) continue;
          for (const n of predictedByRelinquisher.get(other) ?? []) f.add(n);
        }
        forbidden.set(r, f);
      }
      setConflictMap(map);
      setForbiddenByRelinquisher(forbidden);
      setAllScenarios(all);
      // Default: each candidate relinquishes their first (lower-numbered) district.
      setRelinquishChoices((prev) => {
        if (prev.size > 0) return prev;
        const next = new Map<string, number>();
        for (const c of candidates) next.set(c.candidateId, c.districts[0]);
        return next;
      });
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
                    forbiddenNames={
                      selected ? forbiddenByRelinquisher.get(selected.fullName) ?? new Set() : new Set()
                    }
                  />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {candidates && candidates.length > 0 && allScenarios.size > 0 ? (
          <CompositionExplorer
            candidates={candidates}
            allScenarios={allScenarios}
            choices={relinquishChoices}
            setChoices={setRelinquishChoices}
            allElected={allElected ?? []}
            isMt={isMt}
          />
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
  forbiddenNames,
}: {
  scenario: CasualScenario;
  relinquishedFrom: number;
  keptIn: number;
  isMt: boolean;
  conflictMap: Map<string, Array<{ relinquisher: string; district: number }>>;
  currentRelinquisher: string;
  forbiddenNames: Set<string>;
}) {
  const top = scenario.predicted;
  const topConflicts = top
    ? (conflictMap.get(normalizeContenderName(top.name)) ?? []).filter(
        (e) => e.relinquisher !== currentRelinquisher || e.district !== relinquishedFrom,
      )
    : [];
  // Conflict-free pick: first contender whose name isn't claimed by another relinquisher's top pick.
  const conflictFree =
    topConflicts.length > 0
      ? scenario.contenders.find((c) => !forbiddenNames.has(normalizeContenderName(c.name))) ?? null
      : null;
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

          {conflictFree && top && normalizeContenderName(conflictFree.name) !== normalizeContenderName(top.name) ? (
            <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                {isMt ? "Imiss fil-fila" : "Next in line"}
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <p className="text-base font-bold text-foreground">{conflictFree.name}</p>
                <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300">{pct(conflictFree.probability)}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {conflictFree.party} · {isMt ? "Sehem trasferit" : "Transfer share"} {pct(conflictFree.transferShare)}
                {conflictFree.shortOfQuota != null ? (
                  <> · {isMt ? "Bin-nuqqas ta'" : "Short of quota by"} {fmt(conflictFree.shortOfQuota)}</>
                ) : null}
              </p>
              <p className="mt-2 text-[11px] italic text-muted-foreground">
                {isMt
                  ? "L-aqwa kandidat li mhux mbassar bħala rebbieħ ta' siġġu każwali ieħor."
                  : "Highest-ranked contender not already claimed by another relinquisher's prediction."}
              </p>
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
  transferredTotal,
}: {
  contender: CasualContender;
  rank: number;
  isMt: boolean;
  hasConflict?: boolean;
  quota: number | null;
  transferredTotal: number | null;
}) {
  const proximity =
    contender.shortOfQuota != null && quota != null && quota > 0
      ? Math.max(0, 1 - contender.shortOfQuota / quota)
      : 0;
  const transferContribution = contender.transferShare * 0.78;
  const proximityContribution = proximity * 0.22;
  // Reconstruct from share when not present (older cached scenarios).
  const transferredVotes =
    contender.transferredVotes ??
    (transferredTotal != null ? Math.round(contender.transferShare * transferredTotal) : null);
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
            <span>
              {isMt ? "Sehem trasferit" : "Transfer share"}
              {transferredVotes != null && transferredTotal != null && transferredTotal > 0 ? (
                <span className="ml-1 opacity-70">
                  ({fmt(transferredVotes)}/{fmt(transferredTotal)})
                </span>
              ) : null}
            </span>
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

type ResolvedSeat = {
  candidate: DoublyElectedCandidate;
  relinquishedDistrict: number;
  keptDistrict: number;
  winner: CasualContender | null;
  fallback: boolean;
  reason?: string;
};

/** Greedy resolution: process relinquishers in alphabetical order, claim the
 *  highest-ranked still-available contender for each. */
function resolveComposition(
  candidates: DoublyElectedCandidate[],
  choices: Map<string, number>,
  allScenarios: Map<string, CasualScenario>,
): { seats: ResolvedSeat[]; tally: Map<string, number> } {
  const claimed = new Set<string>();
  const seats: ResolvedSeat[] = [];
  const tally = new Map<string, number>();
  const ordered = [...candidates].sort((a, b) => a.fullName.localeCompare(b.fullName));
  for (const cand of ordered) {
    const relinquished = choices.get(cand.candidateId) ?? cand.districts[0];
    const kept = cand.districts.find((d) => d !== relinquished) ?? cand.districts[1];
    const scn = allScenarios.get(`${cand.candidateId}::${relinquished}`);
    if (!scn || !scn.ok || scn.contenders.length === 0) {
      seats.push({
        candidate: cand,
        relinquishedDistrict: relinquished,
        keptDistrict: kept,
        winner: null,
        fallback: false,
        reason: scn?.error ?? "No data",
      });
      continue;
    }
    let chosen: CasualContender | null = null;
    let rank = 0;
    for (const c of scn.contenders) {
      rank++;
      const key = normalizeContenderName(c.name);
      if (!claimed.has(key)) {
        chosen = c;
        claimed.add(key);
        break;
      }
    }
    seats.push({
      candidate: cand,
      relinquishedDistrict: relinquished,
      keptDistrict: kept,
      winner: chosen,
      fallback: chosen != null && rank > 1,
    });
    if (chosen) {
      const party = chosen.party || "—";
      tally.set(party, (tally.get(party) ?? 0) + 1);
    }
  }
  return { seats, tally };
}

function CompositionExplorer({
  candidates,
  allScenarios,
  choices,
  setChoices,
  allElected,
  isMt,
}: {
  candidates: DoublyElectedCandidate[];
  allScenarios: Map<string, CasualScenario>;
  choices: Map<string, number>;
  setChoices: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  allElected: ElectedSeat[];
  isMt: boolean;
}) {
  const resolved = useMemo(
    () => resolveComposition(candidates, choices, allScenarios),
    [candidates, choices, allScenarios],
  );

  const allOutcomes = useMemo(() => {
    const N = candidates.length;
    if (N === 0 || N > 12) return null;
    type Outcome = { tally: Map<string, number>; count: number; example: Map<string, number> };
    const byKey = new Map<string, Outcome>();
    const total = 1 << N;
    for (let mask = 0; mask < total; mask++) {
      const c = new Map<string, number>();
      for (let i = 0; i < N; i++) {
        const cand = candidates[i];
        const bit = (mask >> i) & 1;
        c.set(cand.candidateId, cand.districts[bit]);
      }
      const { tally } = resolveComposition(candidates, c, allScenarios);
      const key = [...tally.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([p, n]) => `${p}:${n}`).join("|");
      const existing = byKey.get(key);
      if (existing) existing.count++;
      else byKey.set(key, { tally, count: 1, example: c });
    }
    return { total, outcomes: [...byKey.values()].sort((a, b) => b.count - a.count) };
  }, [candidates, allScenarios]);

  const totalCasualSeats = resolved.seats.filter((s) => s.winner).length;

  return (
    <section className="mt-10 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            {isMt ? "Kompożizzjoni tal-Parlament" : "Parliament composition"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isMt
              ? "Għażel liema distrett kull kandidat doppjament elett jirrelinkwixxi, u ara min jimla s-siġġijiet każwali u kif jaqsmu skont il-partit."
              : "Pick which district each doubly-elected candidate relinquishes. The casual winners and party split update accordingly (conflicts resolved by walking down the ranking)."}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[...candidates].sort((a, b) => a.fullName.localeCompare(b.fullName)).map((c) => {
          const current = choices.get(c.candidateId) ?? c.districts[0];
          return (
            <div
              key={c.candidateId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{c.fullName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {c.partyShort ?? "—"} · {isMt ? "Eletti f'" : "Elected in"} {c.districts.join(" + ")}
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 p-0.5 text-xs font-semibold">
                {c.districts.map((d) => {
                  const active = current === d;
                  return (
                    <button
                      key={d}
                      onClick={() =>
                        setChoices((prev) => {
                          const next = new Map(prev);
                          next.set(c.candidateId, d);
                          return next;
                        })
                      }
                      className={
                        "rounded-full px-2.5 py-1 transition " +
                        (active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground")
                      }
                      title={isMt ? `Jirrelinkwixxi D${d}` : `Relinquish D${d}`}
                    >
                      D{d}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isMt ? "Qsim tas-siġġijiet każwali" : "Casual-seat split by party"} · {totalCasualSeats}{" "}
          {isMt ? "siġġijiet" : "seats"}
        </p>
        <div className="mt-2 space-y-1.5">
          {[...resolved.tally.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([party, n]) => {
              const pctVal = totalCasualSeats > 0 ? n / totalCasualSeats : 0;
              return (
                <div key={party} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 truncate font-semibold text-foreground">{party}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(4, pctVal * 100)}%` }}
                    />
                  </div>
                  <span className="w-20 text-right tabular-nums text-muted-foreground">
                    {n} ({pct(pctVal)})
                  </span>
                </div>
              );
            })}
          {resolved.tally.size === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isMt ? "M'hemmx tbassir disponibbli." : "No predictions available."}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isMt ? "Listi finali tal-elett skont il-partit" : "Final elected lists by party"}
        </p>
        {(() => {
          type Entry =
            | { kind: "single"; name: string; party: string; district: number }
            | { kind: "kept"; name: string; party: string; district: number }
            | { kind: "casual"; name: string; party: string; district: number; fallback: boolean };
          const byParty = new Map<string, Entry[]>();
          const push = (p: string, e: Entry) => {
            const arr = byParty.get(p) ?? [];
            arr.push(e);
            byParty.set(p, arr);
          };

          // Build per-doubly-elected lookup: which district is released.
          const doublyByName = new Map<string, { keptDistrict: number; relinquishedDistrict: number }>();
          for (const s of resolved.seats) {
            doublyByName.set(normalizeContenderName(s.candidate.fullName), {
              keptDistrict: s.keptDistrict,
              relinquishedDistrict: s.relinquishedDistrict,
            });
          }

          // 1. Singly-elected MPs: include as-is. For doubly-elected, only keep
          //    the row matching the kept district.
          const seenSingleKey = new Set<string>();
          for (const seat of allElected) {
            const nameKey = normalizeContinderKey(seat.fullName);
            const doubly = doublyByName.get(nameKey);
            if (doubly) {
              if (seat.districtNumber !== doubly.keptDistrict) continue;
              const key = `${nameKey}::${seat.districtNumber}`;
              if (seenSingleKey.has(key)) continue;
              seenSingleKey.add(key);
              push(seat.partyShort ?? "—", {
                kind: "kept",
                name: seat.fullName,
                party: seat.partyShort ?? "—",
                district: seat.districtNumber,
              });
            } else {
              const key = `${nameKey}::${seat.districtNumber}`;
              if (seenSingleKey.has(key)) continue;
              seenSingleKey.add(key);
              push(seat.partyShort ?? "—", {
                kind: "single",
                name: seat.fullName,
                party: seat.partyShort ?? "—",
                district: seat.districtNumber,
              });
            }
          }

          // 2. Casual winners for relinquished districts.
          for (const s of resolved.seats) {
            if (!s.winner) continue;
            push(s.winner.party || "—", {
              kind: "casual",
              name: s.winner.name,
              party: s.winner.party || "—",
              district: s.relinquishedDistrict,
              fallback: s.fallback,
            });
          }

          const parties = [...byParty.entries()].sort((a, b) => b[1].length - a[1].length);
          if (parties.length === 0) {
            return (
              <p className="mt-2 text-sm text-muted-foreground">
                {isMt ? "M'hemmx tbassir disponibbli." : "No predictions available."}
              </p>
            );
          }
          return (
            <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
              {parties.map(([party, entries]) => {
                const sorted = [...entries].sort(
                  (a, b) => a.district - b.district || a.name.localeCompare(b.name),
                );
                return (
                  <div
                    key={party}
                    className="rounded-lg border border-border bg-background p-3"
                  >
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold text-foreground">{party}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {entries.length} {isMt ? "siġġijiet" : "seats"}
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {sorted.map((e, i) => (
                        <li
                          key={`${e.kind}-${e.name}-${e.district}-${i}`}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span className="w-9 shrink-0 rounded bg-muted px-1.5 py-0.5 text-center text-[10px] font-bold uppercase tabular-nums text-muted-foreground">
                            D{e.district}
                          </span>
                          <span className="flex-1 truncate text-foreground">{e.name}</span>
                          {e.kind === "kept" ? (
                            <span
                              className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground"
                              title={isMt ? "Doppjament elett — żamm dan id-distrett" : "Doubly elected — kept this district"}
                            >
                              {isMt ? "Żamm" : "Kept"}
                            </span>
                          ) : null}
                          {e.kind === "casual" ? (
                            <span
                              className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary"
                              title={isMt ? "Rebbieħ ta' elezzjoni każwali" : "Casual election winner"}
                            >
                              {isMt ? "Każwali" : "Casual"}
                            </span>
                          ) : null}
                          {e.kind === "casual" && e.fallback ? (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300"
                              title={
                                isMt
                                  ? "L-ewwel għażla diġà ttieħdet minn relinkwit ieħor"
                                  : "Top pick was claimed by another relinquisher; used next ranked"
                              }
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />
                              {isMt ? "Fallback" : "Fallback"}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          );
        })()}
        <p className="mt-2 text-[11px] italic text-muted-foreground">
          {isMt
            ? "Lista sħiħa tal-elett: kandidati eletti darba, distretti miżmuma mid-doppjament elett, u r-rebbieħa każwali skont l-għażliet hawn fuq."
            : "Full elected roster: singly-elected MPs, districts kept by doubly-elected candidates, and casual winners based on the choices above."}
        </p>
      </div>



      {allOutcomes ? (
        <details className="mt-6 rounded-lg border border-border bg-muted/30 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            {isMt
              ? `Kollox: ${allOutcomes.outcomes.length} riżultati uniċi minn ${allOutcomes.total} kombinazzjonijiet`
              : `All scenarios: ${allOutcomes.outcomes.length} unique party splits across ${allOutcomes.total} combinations`}
          </summary>
          <ul className="mt-3 space-y-1.5">
            {allOutcomes.outcomes.map((o, i) => {
              const label = [...o.tally.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([p, n]) => `${p} ${n}`)
                .join(" · ");
              const isCurrent = [...o.example.entries()].every(
                ([k, v]) => (choices.get(k) ?? 0) === v,
              );
              return (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <button
                    onClick={() => setChoices(new Map(o.example))}
                    className={
                      "flex-1 truncate text-left font-medium hover:underline " +
                      (isCurrent ? "text-primary" : "text-foreground")
                    }
                    title={isMt ? "Applika din il-kombinazzjoni" : "Apply this combination"}
                  >
                    {label || (isMt ? "(vojt)" : "(empty)")}
                    {isCurrent ? " ←" : ""}
                  </button>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {o.count}/{allOutcomes.total} {isMt ? "kombi" : "combos"}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] italic text-muted-foreground">
            {isMt
              ? "Konflitti jissolvew billi jingħata l-aqwa kandidat disponibbli; ir-relinkwiti jiġu pproċessati f'ordni alfabetika, allura l-ordni jista' jaffettwa l-fallbacks."
              : "Conflicts are resolved by walking the ranking; relinquishers are processed alphabetically, so order can affect fallbacks."}
          </p>
        </details>
      ) : null}
    </section>
  );
}


