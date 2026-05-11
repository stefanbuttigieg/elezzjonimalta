import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, ExternalLink, LinkIcon, Sparkles, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { slugify } from "@/lib/admin";

export const Route = createFileRoute("/admin/candidates_/confirm-ec")({
  component: ConfirmFromEcPage,
});

type Party = { id: string; short_name: string | null; name_en: string };

type District = { id: string; number: number; name_en: string };
type CandRow = {
  id: string;
  full_name: string;
  commission_confirmed: boolean;
  party_short: string | null;
};

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string) {
  return new Set(normalize(s).split(" ").filter((t) => t.length > 1));
}

function score(a: string, b: string) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.max(ta.size, tb.size);
}

function parsePastedNames(raw: string): string[] {
  return raw
    .split(/\r?\n|;|,(?=[^,]{0,30}$)/g)
    .flatMap((l) => l.split("\t"))
    .map((l) =>
      l
        // strip leading numbering / bullets
        .replace(/^\s*(\d+[.)]?|[-•*])\s*/, "")
        // strip party tags in parens
        .replace(/\([^)]*\)/g, "")
        .trim(),
    )
    .filter((l) => l.length >= 3 && /[a-zA-Z]/.test(l));
}

type Match = {
  rawName: string;
  candidate: CandRow | null;
  scoreVal: number;
  alternatives: { c: CandRow; s: number }[];
  externalSuggestions: { c: CandRow; s: number }[];
};

function ConfirmFromEcPage() {
  const [districts, setDistricts] = useState<District[]>([]);
  const [districtId, setDistrictId] = useState<string>("");
  const [candidates, setCandidates] = useState<CandRow[]>([]);
  // All candidates across districts — used to suggest existing people we can link to this district.
  const [allCandidates, setAllCandidates] = useState<CandRow[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [pasted, setPasted] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [loadingCands, setLoadingCands] = useState(false);
  // Per-unmatched-row draft for quick creation: name + party + busy flag.
  const [drafts, setDrafts] = useState<Record<number, { name: string; partyId: string; busy: boolean }>>({});

  useEffect(() => {
    void (async () => {
      const [{ data: dRows }, { data: pRows }] = await Promise.all([
        supabase.from("districts").select("id, number, name_en").order("number"),
        supabase
          .from("parties")
          .select("id, short_name, name_en")
          .order("short_name", { ascending: true, nullsFirst: false }),
      ]);
      setDistricts((dRows ?? []) as District[]);
      setParties((pRows ?? []) as Party[]);
    })();
  }, []);

  useEffect(() => {
    if (!districtId) {
      setCandidates([]);
      return;
    }
    setLoadingCands(true);
    void (async () => {
      // Candidates via primary_district_id OR candidate_districts link.
      const [{ data: primary }, { data: linked }] = await Promise.all([
        supabase
          .from("candidates")
          .select("id, full_name, commission_confirmed, party:parties(short_name)")
          .eq("primary_district_id", districtId),
        supabase
          .from("candidate_districts")
          .select("candidate:candidates(id, full_name, commission_confirmed, party:parties(short_name))")
          .eq("district_id", districtId),
      ]);
      const map = new Map<string, CandRow>();
      const add = (r: { id: string; full_name: string; commission_confirmed: boolean; party: { short_name: string | null } | null }) => {
        if (!r) return;
        map.set(r.id, {
          id: r.id,
          full_name: r.full_name,
          commission_confirmed: r.commission_confirmed,
          party_short: r.party?.short_name ?? null,
        });
      };
      (primary ?? []).forEach((r) => add(r as never));
      (linked ?? []).forEach((r) => {
        const c = (r as { candidate: typeof primary extends Array<infer U> ? U : never }).candidate;
        if (c) add(c as never);
      });
      setCandidates(Array.from(map.values()).sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setLoadingCands(false);
    })();
  }, [districtId]);

  const selectedDistrict = districts.find((d) => d.id === districtId);

  const runMatch = () => {
    const names = parsePastedNames(pasted);
    if (names.length === 0) {
      toast.error("Paste at least one name from the EC page.");
      return;
    }
    if (candidates.length === 0) {
      toast.error("No candidates found for this district.");
      return;
    }
    const result: Match[] = names.map((rawName) => {
      const ranked = candidates
        .map((c) => ({ c, s: score(rawName, c.full_name) }))
        .sort((a, b) => b.s - a.s);
      const top = ranked[0];
      return {
        rawName,
        candidate: top && top.s >= 0.5 ? top.c : null,
        scoreVal: top?.s ?? 0,
        alternatives: ranked.slice(0, 5),
      };
    });
    setMatches(result);
    const next: Record<string, boolean> = {};
    const nextDrafts: Record<number, { name: string; partyId: string; busy: boolean }> = {};
    result.forEach((m, idx) => {
      if (m.candidate && !m.candidate.commission_confirmed) next[m.candidate.id] = true;
      if (!m.candidate) nextDrafts[idx] = { name: m.rawName, partyId: "", busy: false };
    });
    setSelected(next);
    setDrafts(nextDrafts);
  };

  const createNewCandidate = async (idx: number) => {
    const draft = drafts[idx];
    if (!draft) return;
    const fullName = draft.name.trim();
    if (fullName.length < 3) {
      toast.error("Enter a name (at least 3 characters).");
      return;
    }
    if (!districtId) return;
    setDrafts((d) => ({ ...d, [idx]: { ...draft, busy: true } }));
    // Build a unique slug, retrying with a numeric suffix on collision.
    const baseSlug = slugify(fullName) || `candidate-${Date.now()}`;
    let slug = baseSlug;
    let inserted: { id: string; full_name: string } | null = null;
    let lastErr: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase
        .from("candidates")
        .insert({
          full_name: fullName,
          slug,
          primary_district_id: districtId,
          party_id: draft.partyId || null,
          status: "pending_review",
          commission_confirmed: true,
          commission_confirmed_at: new Date().toISOString(),
          imported_from: "electoral-commission",
        })
        .select("id, full_name")
        .single();
      if (!error && data) {
        inserted = data;
        break;
      }
      lastErr = error?.message ?? null;
      if (error?.code === "23505") {
        slug = `${baseSlug}-${attempt + 2}`;
        continue;
      }
      break;
    }
    if (!inserted) {
      setDrafts((d) => ({ ...d, [idx]: { ...draft, busy: false } }));
      toast.error(lastErr ?? "Could not create candidate.");
      return;
    }
    // Link to the district for the 2026 election (mirrors existing pattern).
    await supabase
      .from("candidate_districts")
      .insert({
        candidate_id: inserted.id,
        district_id: districtId,
        election_year: 2026,
        elected: false,
      });

    const partyShort = parties.find((p) => p.id === draft.partyId)?.short_name ?? null;
    const newRow: CandRow = {
      id: inserted.id,
      full_name: inserted.full_name,
      commission_confirmed: true,
      party_short: partyShort,
    };
    setCandidates((cs) =>
      [...cs, newRow].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    );
    setMatches((all) =>
      all.map((m, i) => (i === idx ? { ...m, candidate: newRow, scoreVal: 1 } : m)),
    );
    setDrafts((d) => {
      const copy = { ...d };
      delete copy[idx];
      return copy;
    });
    toast.success(`Created ${fullName} and marked as confirmed.`);
  };

  const toConfirmIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );

  const confirm = async () => {
    if (toConfirmIds.length === 0) {
      toast.error("Nothing to confirm.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("candidates")
      .update({ commission_confirmed: true, commission_confirmed_at: new Date().toISOString() })
      .in("id", toConfirmIds);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Marked ${toConfirmIds.length} candidate(s) as confirmed by Electoral Commission.`);
    // Refresh candidates
    setCandidates((cs) =>
      cs.map((c) => (toConfirmIds.includes(c.id) ? { ...c, commission_confirmed: true } : c)),
    );
    setSelected({});
  };

  const unmatched = matches.filter((m) => !m.candidate);
  const matched = matches.filter((m) => m.candidate);
  const ecUrl = "https://electoral.gov.mt/NominationsDashboard/ElectionList/ShowNominations/271";

  return (
    <div className="space-y-6">
      <header>
        <Link
          to="/admin/candidates"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to candidates
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-bold text-foreground">
          Confirm from Electoral Commission
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Pick a district, open the live EC nominations page, copy the names, paste them
          here, and the matcher will tick the right candidates and set
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">commission_confirmed</code>
          in bulk.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              District
            </Label>
            <Select value={districtId} onValueChange={setDistrictId}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Select district…" />
              </SelectTrigger>
              <SelectContent>
                {districts.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.number} · {d.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedDistrict ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {loadingCands
                  ? "Loading candidates…"
                  : `${candidates.length} candidate(s) on file. ${candidates.filter((c) => c.commission_confirmed).length} already confirmed.`}
              </p>
            ) : null}
            <a
              href={ecUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Open EC nominations dashboard
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Paste names from the EC page
            </Label>
            <Textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={10}
              placeholder={"One name per line. e.g.\nAbela Robert\nGrech Bernard\n…"}
              className="mt-1.5 font-mono text-sm"
            />
            <div className="mt-2 flex items-center gap-2">
              <Button onClick={runMatch} disabled={!districtId || !pasted.trim()}>
                <Sparkles className="mr-1.5 h-4 w-4" /> Match
              </Button>
              {matches.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {matched.length} matched · {unmatched.length} unmatched
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {matches.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-lg font-bold">Review matches</h2>
            <Button onClick={() => void confirm()} disabled={saving || toConfirmIds.length === 0}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Confirm {toConfirmIds.length} candidate(s)
            </Button>
          </div>

          <ul className="mt-4 divide-y divide-border">
            {matches.map((m, i) => (
              <li key={i} className="py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-[200px] flex-1">
                    <div className="font-mono text-sm text-foreground">{m.rawName}</div>
                    {m.candidate ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        →{" "}
                        <span className="font-medium text-foreground">
                          {m.candidate.full_name}
                        </span>
                        {m.candidate.party_short ? (
                          <span className="ml-1">({m.candidate.party_short})</span>
                        ) : null}
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          {(m.scoreVal * 100).toFixed(0)}%
                        </span>
                        {m.candidate.commission_confirmed ? (
                          <span className="ml-2 text-emerald-700 dark:text-emerald-400">
                            already confirmed
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-1 space-y-2">
                        <div className="text-xs text-amber-700 dark:text-amber-400">
                          No confident match. Top guesses:{" "}
                          {m.alternatives
                            .filter((a) => a.s > 0)
                            .slice(0, 3)
                            .map((a) => `${a.c.full_name} (${(a.s * 100).toFixed(0)}%)`)
                            .join(", ") || "none"}
                        </div>
                        {drafts[i] ? (
                          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-background/50 p-2">
                            <Input
                              value={drafts[i].name}
                              onChange={(e) =>
                                setDrafts((d) => ({
                                  ...d,
                                  [i]: { ...d[i], name: e.target.value },
                                }))
                              }
                              placeholder="Full name"
                              className="h-8 max-w-[220px] text-xs"
                            />
                            <select
                              value={drafts[i].partyId}
                              onChange={(e) =>
                                setDrafts((d) => ({
                                  ...d,
                                  [i]: { ...d[i], partyId: e.target.value },
                                }))
                              }
                              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                            >
                              <option value="">— party (optional) —</option>
                              {parties.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.short_name ?? p.name_en}
                                </option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={drafts[i].busy}
                              onClick={() => void createNewCandidate(i)}
                            >
                              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                              {drafts[i].busy ? "Creating…" : "Create new candidate"}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={m.candidate?.id ?? ""}
                      onChange={(e) => {
                        const id = e.target.value;
                        const c = candidates.find((x) => x.id === id) ?? null;
                        setMatches((all) =>
                          all.map((x, idx) => (idx === i ? { ...x, candidate: c, scoreVal: 1 } : x)),
                        );
                        setSelected((s) => {
                          const next = { ...s };
                          if (m.candidate) delete next[m.candidate.id];
                          if (c && !c.commission_confirmed) next[c.id] = true;
                          return next;
                        });
                      }}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                    >
                      <option value="">— pick candidate —</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                          {c.commission_confirmed ? " ✓" : ""}
                        </option>
                      ))}
                    </select>
                    {m.candidate && !m.candidate.commission_confirmed ? (
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={!!selected[m.candidate.id]}
                          onChange={(e) =>
                            setSelected((s) => ({ ...s, [m.candidate!.id]: e.target.checked }))
                          }
                        />
                        Confirm
                      </label>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {districtId && candidates.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <h2 className="font-serif text-lg font-bold">
            Candidates currently on file for this district
          </h2>
          <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span>
                  {c.full_name}
                  {c.party_short ? (
                    <span className="ml-1 text-xs text-muted-foreground">({c.party_short})</span>
                  ) : null}
                </span>
                {c.commission_confirmed ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <span className="text-xs text-muted-foreground">unconfirmed</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
