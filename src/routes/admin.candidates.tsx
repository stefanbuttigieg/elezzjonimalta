import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge, slugify, deleteRow, type ReviewStatus } from "@/lib/admin";
import { Plus, Pencil, Trash2, Search, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { syncCandidateFromParliament } from "@/server/parliamentSync.functions";
import { detectMedia } from "@/lib/media";
import {
  Drawer,
  DrawerActions,
  Field,
  Input,
  StatusSelect,
  Textarea,
} from "./admin.parties";

export const Route = createFileRoute("/admin/candidates")({
  component: CandidatesAdmin,
});

interface Candidate {
  id: string;
  slug: string;
  full_name: string;
  party_id: string | null;
  primary_district_id: string | null;
  is_incumbent: boolean;
  electoral_confirmed: boolean;
  bio_en: string | null;
  bio_mt: string | null;
  photo_url: string | null;
  website: string | null;
  facebook: string | null;
  twitter: string | null;
  instagram: string | null;
  tiktok: string | null;
  linkedin: string | null;
  youtube: string | null;
  parlament_mt_url: string | null;
  parliament_member_id: string | null;
  parliament_synced_at: string | null;
  email: string | null;
  phone: string | null;
  office_address: string | null;
  date_of_birth: string | null;
  birthplace: string | null;
  profession: string | null;
  education: string | null;
  languages: string[] | null;
  status: ReviewStatus;
  source_url: string | null;
  imported_from: string | null;
  notes: string | null;
  not_contesting_2026: boolean;
  not_contesting_source_url: string | null;
  not_contesting_note_en: string | null;
  not_contesting_note_mt: string | null;
}

interface PartyOpt { id: string; name_en: string; }
interface DistrictOpt { id: string; number: number; name_en: string; }

const empty: Candidate = {
  id: "",
  slug: "",
  full_name: "",
  party_id: null,
  primary_district_id: null,
  is_incumbent: false,
  electoral_confirmed: false,
  bio_en: "",
  bio_mt: "",
  photo_url: "",
  website: "",
  facebook: "",
  twitter: "",
  instagram: "",
  tiktok: "",
  linkedin: "",
  youtube: "",
  parlament_mt_url: "",
  parliament_member_id: "",
  parliament_synced_at: null,
  email: "",
  phone: "",
  office_address: "",
  date_of_birth: null,
  birthplace: "",
  profession: "",
  education: "",
  languages: [],
  status: "pending_review",
  source_url: "",
  imported_from: "",
  notes: "",
  not_contesting_2026: false,
  not_contesting_source_url: "",
  not_contesting_note_en: "",
  not_contesting_note_mt: "",
};

function CandidatesAdmin() {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [parties, setParties] = useState<PartyOpt[]>([]);
  const [districts, setDistricts] = useState<DistrictOpt[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "all">("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [c, p, d] = await Promise.all([
      supabase.from("candidates").select("*").order("full_name"),
      supabase.from("parties").select("id, name_en").order("name_en"),
      supabase.from("districts").select("id, number, name_en").order("number"),
    ]);
    if (c.error) toast.error(c.error.message);
    setRows((c.data ?? []) as Candidate[]);
    setParties((p.data ?? []) as PartyOpt[]);
    setDistricts((d.data ?? []) as DistrictOpt[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const partyMap = useMemo(() => Object.fromEntries(parties.map((x) => [x.id, x.name_en])), [parties]);
  const districtMap = useMemo(
    () => Object.fromEntries(districts.map((x) => [x.id, `${x.number} · ${x.name_en}`])),
    [districts]
  );

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (statusFilter !== "all" && r.status !== statusFilter) return false;
        if (!q) return true;
        return r.full_name.toLowerCase().includes(q.toLowerCase());
      }),
    [rows, q, statusFilter]
  );

  return (
    <div>
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Candidates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review imported candidates. Only "Published" appear on the public site.
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...empty })}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New candidate
        </button>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search candidates…"
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ReviewStatus | "all")}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="pending_review">Pending review</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Party</th>
              <th className="px-4 py-3">District</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No candidates match.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-foreground">{r.full_name}</div>
                      {r.is_incumbent ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                          MP
                        </span>
                      ) : null}
                      {r.electoral_confirmed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : null}
                    </div>
                    {r.imported_from ? (
                      <div className="text-xs text-muted-foreground">imported · {r.imported_from}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.party_id ? partyMap[r.party_id] ?? "—" : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.primary_district_id ? districtMap[r.primary_district_id] ?? "—" : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setEditing(r)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete ${r.full_name}?`)) return;
                        try {
                          await deleteRow("candidates", r.id);
                          toast.success("Deleted");
                          void load();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Delete failed");
                        }
                      }}
                      className="ml-2 inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing ? (
        <CandidateEditor
          value={editing}
          parties={parties}
          districts={districts}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

type Tab = "overview" | "contact" | "socials" | "media" | "parliament" | "endorsements" | "sources";

function CandidateEditor({
  value,
  parties,
  districts,
  onClose,
  onSaved,
}: {
  value: Candidate;
  parties: PartyOpt[];
  districts: DistrictOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState<Candidate>(value);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [districtIds, setDistrictIds] = useState<string[]>([]);
  const [initialDistrictIds, setInitialDistrictIds] = useState<string[]>([]);
  const isNew = !v.id;

  useEffect(() => {
    if (!v.id) {
      setDistrictIds([]);
      setInitialDistrictIds([]);
      return;
    }
    void (async () => {
      const { data, error } = await supabase
        .from("candidate_districts")
        .select("district_id")
        .eq("candidate_id", v.id)
        .eq("election_year", 2026);
      if (error) {
        toast.error(error.message);
        return;
      }
      const ids = (data ?? []).map((r: { district_id: string }) => r.district_id);
      setDistrictIds(ids);
      setInitialDistrictIds(ids);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.id]);

  const effectiveDistrictIds = useMemo(() => {
    if (v.primary_district_id && !districtIds.includes(v.primary_district_id)) {
      return [...districtIds, v.primary_district_id];
    }
    return districtIds;
  }, [districtIds, v.primary_district_id]);

  const toggleDistrict = (id: string) => {
    if (id === v.primary_district_id) {
      toast.info("Change the Primary district first to remove this one.");
      return;
    }
    setDistrictIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      if (!v.full_name) throw new Error("Full name is required");
      const primaryDistrict =
        v.primary_district_id ||
        (effectiveDistrictIds.length > 0 ? effectiveDistrictIds[0] : null);
      const payload = {
        slug: v.slug || slugify(v.full_name),
        full_name: v.full_name,
        party_id: v.party_id || null,
        primary_district_id: primaryDistrict,
        is_incumbent: v.is_incumbent,
        electoral_confirmed: v.electoral_confirmed,
        bio_en: v.bio_en || null,
        bio_mt: v.bio_mt || null,
        photo_url: v.photo_url || null,
        website: v.website || null,
        facebook: v.facebook || null,
        twitter: v.twitter || null,
        instagram: v.instagram || null,
        tiktok: v.tiktok || null,
        linkedin: v.linkedin || null,
        youtube: v.youtube || null,
        parlament_mt_url: v.parlament_mt_url || null,
        parliament_member_id: v.parliament_member_id || null,
        email: v.email || null,
        phone: v.phone || null,
        office_address: v.office_address || null,
        date_of_birth: v.date_of_birth || null,
        birthplace: v.birthplace || null,
        profession: v.profession || null,
        education: v.education || null,
        languages: v.languages && v.languages.length > 0 ? v.languages : null,
        status: v.status,
        source_url: v.source_url || null,
        notes: v.notes || null,
        not_contesting_2026: v.not_contesting_2026,
        not_contesting_source_url: v.not_contesting_source_url || null,
        not_contesting_note_en: v.not_contesting_note_en || null,
        not_contesting_note_mt: v.not_contesting_note_mt || null,
      };
      let candidateId = v.id;
      if (isNew) {
        const { data, error } = await supabase
          .from("candidates")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        candidateId = (data as { id: string }).id;
        setV({ ...v, id: candidateId });
      } else {
        const { error } = await supabase
          .from("candidates")
          .update(payload)
          .eq("id", v.id);
        if (error) throw error;
      }

      const finalIds = primaryDistrict && !effectiveDistrictIds.includes(primaryDistrict)
        ? [...effectiveDistrictIds, primaryDistrict]
        : effectiveDistrictIds;
      const toAdd = finalIds.filter((id) => !initialDistrictIds.includes(id));
      const toRemove = initialDistrictIds.filter((id) => !finalIds.includes(id));
      if (toAdd.length > 0) {
        const { error } = await supabase.from("candidate_districts").insert(
          toAdd.map((district_id) => ({
            candidate_id: candidateId,
            district_id,
            election_year: 2026,
          }))
        );
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("candidate_districts")
          .delete()
          .eq("candidate_id", candidateId)
          .eq("election_year", 2026)
          .in("district_id", toRemove);
        if (error) throw error;
      }

      toast.success(isNew ? "Candidate created" : "Candidate updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "contact", label: "Contact & bio" },
    { id: "socials", label: "Socials" },
    { id: "media", label: "Media" },
    { id: "parliament", label: "Parliament" },
    { id: "endorsements", label: "Endorsements" },
    { id: "sources", label: "Sources & status" },
  ];

  return (
    <Drawer title={isNew ? "New candidate" : `Edit: ${v.full_name}`} onClose={onClose}>
      <div className="-mx-6 mb-5 flex gap-1 overflow-x-auto border-b border-border px-6">
        {tabs.map((tdef) => (
          <button
            key={tdef.id}
            onClick={() => setTab(tdef.id)}
            disabled={tdef.id !== "overview" && tdef.id !== "contact" && tdef.id !== "socials" && tdef.id !== "sources" && isNew}
            className={
              "shrink-0 border-b-2 px-3 py-2 text-xs font-semibold transition-colors " +
              (tab === tdef.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground") +
              (isNew && tdef.id !== "overview" && tdef.id !== "contact" && tdef.id !== "socials" && tdef.id !== "sources"
                ? " opacity-40 cursor-not-allowed"
                : "")
            }
          >
            {tdef.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Full name *">
            <Input value={v.full_name} onChange={(x) => setV({ ...v, full_name: x })} />
          </Field>
          <Field label="Slug">
            <Input
              value={v.slug}
              onChange={(x) => setV({ ...v, slug: x })}
              placeholder={slugify(v.full_name) || "auto-generated"}
            />
          </Field>
          <Field label="Party">
            <select
              value={v.party_id ?? ""}
              onChange={(e) => setV({ ...v, party_id: e.target.value || null })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">— None —</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_en}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Primary district">
            <select
              value={v.primary_district_id ?? ""}
              onChange={(e) => setV({ ...v, primary_district_id: e.target.value || null })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">— None —</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.number} · {d.name_en}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contesting districts (2026)" full>
            <p className="mb-2 text-xs text-muted-foreground">
              Select every district this candidate is contesting in 2026.
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
              {districts.map((d) => {
                const checked = effectiveDistrictIds.includes(d.id);
                const isPrimary = d.id === v.primary_district_id;
                return (
                  <label
                    key={d.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      checked
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDistrict(d.id)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="truncate">
                      {d.number} · {d.name_en}
                      {isPrimary ? (
                        <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                          primary
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </Field>
          <Field label="Photo URL" full>
            <Input value={v.photo_url ?? ""} onChange={(x) => setV({ ...v, photo_url: x })} />
          </Field>
          <Field label="Bio (EN)" full>
            <Textarea value={v.bio_en ?? ""} onChange={(x) => setV({ ...v, bio_en: x })} />
          </Field>
          <Field label="Bio (MT)" full>
            <Textarea value={v.bio_mt ?? ""} onChange={(x) => setV({ ...v, bio_mt: x })} />
          </Field>
          <Field label="Flags" full>
            <div className="flex flex-col gap-2 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={v.is_incumbent}
                  onChange={(e) => setV({ ...v, is_incumbent: e.target.checked })}
                />
                Sitting MP (incumbent)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={v.electoral_confirmed}
                  onChange={(e) => setV({ ...v, electoral_confirmed: e.target.checked })}
                />
                Confirmed on electoral.gov.mt
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={v.not_contesting_2026}
                  onChange={(e) => setV({ ...v, not_contesting_2026: e.target.checked })}
                />
                Not contesting 2026 election
              </label>
            </div>
          </Field>
        </div>
      )}

      {tab === "contact" && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email">
            <Input value={v.email ?? ""} onChange={(x) => setV({ ...v, email: x })} placeholder="name@example.com" />
          </Field>
          <Field label="Phone">
            <Input value={v.phone ?? ""} onChange={(x) => setV({ ...v, phone: x })} placeholder="+356 …" />
          </Field>
          <Field label="Office address" full>
            <Textarea value={v.office_address ?? ""} onChange={(x) => setV({ ...v, office_address: x })} />
          </Field>
          <Field label="Date of birth">
            <Input
              type="date"
              value={v.date_of_birth ?? ""}
              onChange={(x) => setV({ ...v, date_of_birth: x || null })}
            />
          </Field>
          <Field label="Birthplace">
            <Input value={v.birthplace ?? ""} onChange={(x) => setV({ ...v, birthplace: x })} />
          </Field>
          <Field label="Profession">
            <Input value={v.profession ?? ""} onChange={(x) => setV({ ...v, profession: x })} />
          </Field>
          <Field label="Languages (comma-separated)">
            <Input
              value={(v.languages ?? []).join(", ")}
              onChange={(x) =>
                setV({
                  ...v,
                  languages: x
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Maltese, English, Italian"
            />
          </Field>
          <Field label="Education" full>
            <Textarea value={v.education ?? ""} onChange={(x) => setV({ ...v, education: x })} />
          </Field>
        </div>
      )}

      {tab === "socials" && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Website">
            <Input value={v.website ?? ""} onChange={(x) => setV({ ...v, website: x })} />
          </Field>
          <Field label="Facebook">
            <Input value={v.facebook ?? ""} onChange={(x) => setV({ ...v, facebook: x })} />
          </Field>
          <Field label="X / Twitter">
            <Input value={v.twitter ?? ""} onChange={(x) => setV({ ...v, twitter: x })} />
          </Field>
          <Field label="Instagram">
            <Input value={v.instagram ?? ""} onChange={(x) => setV({ ...v, instagram: x })} />
          </Field>
          <Field label="TikTok">
            <Input value={v.tiktok ?? ""} onChange={(x) => setV({ ...v, tiktok: x })} />
          </Field>
          <Field label="LinkedIn">
            <Input value={v.linkedin ?? ""} onChange={(x) => setV({ ...v, linkedin: x })} />
          </Field>
          <Field label="YouTube channel" full>
            <Input value={v.youtube ?? ""} onChange={(x) => setV({ ...v, youtube: x })} />
          </Field>
        </div>
      )}

      {tab === "media" && !isNew && <MediaTab candidateId={v.id} />}
      {tab === "parliament" && !isNew && (
        <ParliamentTab
          candidateId={v.id}
          memberId={v.parliament_member_id ?? ""}
          parlamentUrl={v.parlament_mt_url ?? ""}
          syncedAt={v.parliament_synced_at}
          onChange={(memberId, url) =>
            setV({ ...v, parliament_member_id: memberId, parlament_mt_url: url })
          }
        />
      )}
      {tab === "endorsements" && !isNew && <EndorsementsTab candidateId={v.id} />}

      {tab === "sources" && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Source URL" full>
            <Input value={v.source_url ?? ""} onChange={(x) => setV({ ...v, source_url: x })} />
          </Field>
          <Field label="Internal notes" full>
            <Textarea value={v.notes ?? ""} onChange={(x) => setV({ ...v, notes: x })} />
          </Field>
          <Field label="Status">
            <StatusSelect value={v.status} onChange={(x) => setV({ ...v, status: x })} />
          </Field>
          {v.not_contesting_2026 ? (
            <>
              <Field label="Not contesting — source URL" full>
                <Input
                  value={v.not_contesting_source_url ?? ""}
                  onChange={(x) => setV({ ...v, not_contesting_source_url: x })}
                />
              </Field>
              <Field label="Not contesting — note (EN)" full>
                <Textarea
                  value={v.not_contesting_note_en ?? ""}
                  onChange={(x) => setV({ ...v, not_contesting_note_en: x })}
                />
              </Field>
              <Field label="Not contesting — note (MT)" full>
                <Textarea
                  value={v.not_contesting_note_mt ?? ""}
                  onChange={(x) => setV({ ...v, not_contesting_note_mt: x })}
                />
              </Field>
            </>
          ) : null}
        </div>
      )}

      {(tab === "media" || tab === "parliament" || tab === "endorsements") && isNew ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Save the candidate first to manage {tab}.
        </div>
      ) : null}

      <DrawerActions onClose={onClose} onSave={save} saving={saving} />
    </Drawer>
  );
}

// ---------- Media tab ----------

interface MediaRow {
  id: string;
  candidate_id: string;
  kind: "video" | "podcast" | "interview" | "speech" | "article";
  title: string | null;
  description: string | null;
  url: string;
  provider: string | null;
  embed_id: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  language: string | null;
  status: ReviewStatus;
  source_url: string | null;
  sort_order: number;
}

const emptyMedia = (candidateId: string): MediaRow => ({
  id: "",
  candidate_id: candidateId,
  kind: "video",
  title: "",
  description: "",
  url: "",
  provider: null,
  embed_id: null,
  thumbnail_url: "",
  published_at: null,
  language: "en",
  status: "pending_review",
  source_url: "",
  sort_order: 0,
});

function MediaTab({ candidateId }: { candidateId: string }) {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [editing, setEditing] = useState<MediaRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("candidate_media")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as MediaRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId]);

  const save = async (row: MediaRow) => {
    if (!row.url) return toast.error("URL is required");
    const det = detectMedia(row.url);
    const payload = {
      candidate_id: candidateId,
      kind: row.kind,
      title: row.title || null,
      description: row.description || null,
      url: row.url,
      provider: det.provider,
      embed_id: det.embedId,
      thumbnail_url: row.thumbnail_url || null,
      published_at: row.published_at || null,
      language: row.language || null,
      status: row.status,
      source_url: row.source_url || null,
      sort_order: row.sort_order,
    };
    const { error } = row.id
      ? await supabase.from("candidate_media").update(payload).eq("id", row.id)
      : await supabase.from("candidate_media").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEditing(null);
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("candidate_media").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Videos, podcasts, interviews and speeches. Provider auto-detected from URL.
        </p>
        <button
          onClick={() => setEditing(emptyMedia(candidateId))}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No media yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-md border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                      {r.kind}
                    </span>
                    {r.provider ? (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {r.provider}
                      </span>
                    ) : null}
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-1 truncate text-sm font-medium text-foreground">
                    {r.title || r.url}
                  </div>
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">
                    {r.url}
                  </a>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => setEditing(r)}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void remove(r.id)}
                    className="rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <div className="mt-4 rounded-lg border border-primary/40 bg-background p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <select
                value={editing.kind}
                onChange={(e) => setEditing({ ...editing, kind: e.target.value as MediaRow["kind"] })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="video">Video</option>
                <option value="podcast">Podcast</option>
                <option value="interview">Interview</option>
                <option value="speech">Speech</option>
                <option value="article">Article</option>
              </select>
            </Field>
            <Field label="Language">
              <select
                value={editing.language ?? "en"}
                onChange={(e) => setEditing({ ...editing, language: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="en">English</option>
                <option value="mt">Maltese</option>
              </select>
            </Field>
            <Field label="URL *" full>
              <Input value={editing.url} onChange={(x) => setEditing({ ...editing, url: x })} />
              {editing.url ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Detected: <strong>{detectMedia(editing.url).provider}</strong>
                </p>
              ) : null}
            </Field>
            <Field label="Title" full>
              <Input value={editing.title ?? ""} onChange={(x) => setEditing({ ...editing, title: x })} />
            </Field>
            <Field label="Description" full>
              <Textarea
                value={editing.description ?? ""}
                onChange={(x) => setEditing({ ...editing, description: x })}
              />
            </Field>
            <Field label="Published date">
              <Input
                type="date"
                value={editing.published_at ?? ""}
                onChange={(x) => setEditing({ ...editing, published_at: x || null })}
              />
            </Field>
            <Field label="Status">
              <StatusSelect value={editing.status} onChange={(x) => setEditing({ ...editing, status: x })} />
            </Field>
            <Field label="Source URL" full>
              <Input value={editing.source_url ?? ""} onChange={(x) => setEditing({ ...editing, source_url: x })} />
            </Field>
            <Field label="Sort order">
              <Input
                type="number"
                value={String(editing.sort_order)}
                onChange={(x) => setEditing({ ...editing, sort_order: Number(x) || 0 })}
              />
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setEditing(null)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={() => void save(editing)}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Save item
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------- Parliament tab ----------

interface PositionRow {
  id: string;
  candidate_id: string;
  legislature_number: number | null;
  title: string;
  body: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  source_url: string | null;
}

interface ContributionRow {
  id: string;
  candidate_id: string;
  legislature_number: number;
  attendance_pct: number | null;
  speeches_count: number | null;
  pmqs_count: number | null;
  bills_sponsored: number | null;
  bills_cosponsored: number | null;
  summary_en: string | null;
  summary_mt: string | null;
  source_url: string | null;
}

function ParliamentTab({
  candidateId,
  memberId,
  parlamentUrl,
  syncedAt,
  onChange,
}: {
  candidateId: string;
  memberId: string;
  parlamentUrl: string;
  syncedAt: string | null;
  onChange: (memberId: string, parlamentUrl: string) => void;
}) {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [contribs, setContribs] = useState<ContributionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const sync = useServerFn(syncCandidateFromParliament);

  const load = async () => {
    setLoading(true);
    const [p, c] = await Promise.all([
      supabase
        .from("candidate_positions")
        .select("*")
        .eq("candidate_id", candidateId)
        .order("start_date", { ascending: false, nullsFirst: false }),
      supabase
        .from("candidate_contributions")
        .select("*")
        .eq("candidate_id", candidateId)
        .order("legislature_number", { ascending: false }),
    ]);
    if (p.error) toast.error(p.error.message);
    if (c.error) toast.error(c.error.message);
    setPositions((p.data ?? []) as PositionRow[]);
    setContribs((c.data ?? []) as ContributionRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId]);

  const runSync = async () => {
    setSyncing(true);
    try {
      const result = await sync({ data: { candidateId } });
      if (result.ok) {
        toast.success(`Synced — added ${result.positionsAdded} position(s)`);
        void load();
      } else {
        toast.error(result.error);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const addPosition = async () => {
    const title = prompt("Position title (e.g. 'Member, Public Accounts Committee')");
    if (!title) return;
    const { error } = await supabase.from("candidate_positions").insert({
      candidate_id: candidateId,
      title,
      is_current: true,
    });
    if (error) return toast.error(error.message);
    void load();
  };

  const removePosition = async (id: string) => {
    if (!confirm("Delete position?")) return;
    const { error } = await supabase.from("candidate_positions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  const addContribution = async () => {
    const legStr = prompt("Legislature number (e.g. 13)");
    const leg = Number(legStr);
    if (!Number.isInteger(leg) || leg < 1) return;
    const { error } = await supabase.from("candidate_contributions").insert({
      candidate_id: candidateId,
      legislature_number: leg,
    });
    if (error) return toast.error(error.message);
    void load();
  };

  const updateContribution = async (id: string, patch: Partial<ContributionRow>) => {
    const { error } = await supabase.from("candidate_contributions").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  const removeContribution = async (id: string) => {
    if (!confirm("Delete contribution row?")) return;
    const { error } = await supabase.from("candidate_contributions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Field label="parlament.mt member id">
          <Input value={memberId} onChange={(x) => onChange(x, parlamentUrl)} placeholder="e.g. 1234" />
        </Field>
        <Field label="parlament.mt URL">
          <Input value={parlamentUrl} onChange={(x) => onChange(memberId, x)} />
        </Field>
        <Field label="Last synced" full>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {syncedAt ? new Date(syncedAt).toLocaleString() : "Never"}
            </span>
            <button
              onClick={() => void runSync()}
              disabled={syncing || (!memberId && !parlamentUrl)}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <RefreshCw className={"h-3 w-3 " + (syncing ? "animate-spin" : "")} />
              {syncing ? "Syncing…" : "Sync from parlament.mt"}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Save the candidate first if you just changed the member id.
          </p>
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Positions</h3>
          <button
            onClick={() => void addPosition()}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : positions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No positions recorded.</p>
        ) : (
          <ul className="space-y-2">
            {positions.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{p.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.body ? `${p.body} · ` : ""}
                    {p.legislature_number ? `Leg ${p.legislature_number}` : "—"}
                    {p.is_current ? " · current" : ""}
                  </div>
                </div>
                <button
                  onClick={() => void removePosition(p.id)}
                  className="rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Contributions per legislature</h3>
          <button
            onClick={() => void addContribution()}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        {contribs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <ul className="space-y-3">
            {contribs.map((c) => (
              <li key={c.id} className="rounded-md border border-border bg-surface p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold">Legislature {c.legislature_number}</div>
                  <button
                    onClick={() => void removeContribution(c.id)}
                    className="rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <NumStat
                    label="Attendance %"
                    value={c.attendance_pct}
                    onCommit={(n) => void updateContribution(c.id, { attendance_pct: n })}
                  />
                  <NumStat
                    label="Speeches"
                    value={c.speeches_count}
                    onCommit={(n) => void updateContribution(c.id, { speeches_count: n })}
                  />
                  <NumStat
                    label="PMQs"
                    value={c.pmqs_count}
                    onCommit={(n) => void updateContribution(c.id, { pmqs_count: n })}
                  />
                  <NumStat
                    label="Bills sponsored"
                    value={c.bills_sponsored}
                    onCommit={(n) => void updateContribution(c.id, { bills_sponsored: n })}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NumStat({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number | null;
  onCommit: (n: number | null) => void;
}) {
  const [v, setV] = useState<string>(value === null ? "" : String(value));
  useEffect(() => {
    setV(value === null ? "" : String(value));
  }, [value]);
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type="number"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onCommit(v === "" ? null : Number(v))}
        className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
      />
    </label>
  );
}

// ---------- Endorsements ----------

interface EndorsementRow {
  id: string;
  candidate_id: string;
  quote_en: string | null;
  quote_mt: string | null;
  attributed_to: string;
  attributed_role: string | null;
  source_url: string | null;
  published_at: string | null;
  status: ReviewStatus;
  sort_order: number;
}

const emptyEnd = (cid: string): EndorsementRow => ({
  id: "",
  candidate_id: cid,
  quote_en: "",
  quote_mt: "",
  attributed_to: "",
  attributed_role: "",
  source_url: "",
  published_at: null,
  status: "pending_review",
  sort_order: 0,
});

function EndorsementsTab({ candidateId }: { candidateId: string }) {
  const [rows, setRows] = useState<EndorsementRow[]>([]);
  const [editing, setEditing] = useState<EndorsementRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("candidate_endorsements")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("sort_order");
    if (error) toast.error(error.message);
    setRows((data ?? []) as EndorsementRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId]);

  const save = async (r: EndorsementRow) => {
    if (!r.attributed_to) return toast.error("Attribution is required");
    const payload = {
      candidate_id: candidateId,
      quote_en: r.quote_en || null,
      quote_mt: r.quote_mt || null,
      attributed_to: r.attributed_to,
      attributed_role: r.attributed_role || null,
      source_url: r.source_url || null,
      published_at: r.published_at || null,
      status: r.status,
      sort_order: r.sort_order,
    };
    const { error } = r.id
      ? await supabase.from("candidate_endorsements").update(payload).eq("id", r.id)
      : await supabase.from("candidate_endorsements").insert(payload);
    if (error) return toast.error(error.message);
    setEditing(null);
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete?")) return;
    const { error } = await supabase.from("candidate_endorsements").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Quotes endorsing this candidate.</p>
        <button
          onClick={() => setEditing(emptyEnd(candidateId))}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No endorsements.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-md border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{r.attributed_to}</div>
                  {r.attributed_role ? (
                    <div className="text-xs text-muted-foreground">{r.attributed_role}</div>
                  ) : null}
                  {r.quote_en ? (
                    <p className="mt-1 line-clamp-2 text-sm italic text-muted-foreground">"{r.quote_en}"</p>
                  ) : null}
                  <StatusBadge status={r.status} />
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => setEditing(r)} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
                    Edit
                  </button>
                  <button
                    onClick={() => void remove(r.id)}
                    className="rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <div className="mt-4 rounded-lg border border-primary/40 bg-background p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Attributed to *">
              <Input
                value={editing.attributed_to}
                onChange={(x) => setEditing({ ...editing, attributed_to: x })}
              />
            </Field>
            <Field label="Role / title">
              <Input
                value={editing.attributed_role ?? ""}
                onChange={(x) => setEditing({ ...editing, attributed_role: x })}
              />
            </Field>
            <Field label="Quote (EN)" full>
              <Textarea
                value={editing.quote_en ?? ""}
                onChange={(x) => setEditing({ ...editing, quote_en: x })}
              />
            </Field>
            <Field label="Quote (MT)" full>
              <Textarea
                value={editing.quote_mt ?? ""}
                onChange={(x) => setEditing({ ...editing, quote_mt: x })}
              />
            </Field>
            <Field label="Source URL">
              <Input
                value={editing.source_url ?? ""}
                onChange={(x) => setEditing({ ...editing, source_url: x })}
              />
            </Field>
            <Field label="Published date">
              <Input
                type="date"
                value={editing.published_at ?? ""}
                onChange={(x) => setEditing({ ...editing, published_at: x || null })}
              />
            </Field>
            <Field label="Status">
              <StatusSelect value={editing.status} onChange={(x) => setEditing({ ...editing, status: x })} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
              Cancel
            </button>
            <button
              onClick={() => void save(editing)}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Save
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
