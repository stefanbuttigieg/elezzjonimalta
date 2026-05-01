import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CandidateStatusBadge, slugify, deleteRow, usePersistentEditor, type ReviewStatus } from "@/lib/admin";
import { Plus, Pencil, Trash2, Search, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerActions,
  Field,
  Input,
  StatusSelect,
  Textarea,
} from "./admin.parties";

type CandidatesSearch = { edit?: string };

export const Route = createFileRoute("/admin/candidates")({
  component: CandidatesAdmin,
  validateSearch: (search: Record<string, unknown>): CandidatesSearch => {
    const edit = typeof search.edit === "string" ? search.edit : undefined;
    return edit ? { edit } : {};
  },
});

interface Candidate {
  id: string;
  slug: string;
  full_name: string;
  party_id: string | null;
  primary_district_id: string | null;
  is_incumbent: boolean;
  electoral_confirmed: boolean;
  commission_confirmed: boolean;
  bio_en: string | null;
  bio_mt: string | null;
  photo_url: string | null;
  website: string | null;
  facebook: string | null;
  twitter: string | null;
  instagram: string | null;
  tiktok: string | null;
  email: string | null;
  phone: string | null;
  parlament_mt_url: string | null;
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
  commission_confirmed: false,
  bio_en: "",
  bio_mt: "",
  photo_url: "",
  website: "",
  facebook: "",
  twitter: "",
  instagram: "",
  tiktok: "",
  email: "",
  phone: "",
  parlament_mt_url: "",
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
  const [editing, setEditing, clearEditing] = usePersistentEditor<Candidate>("admin:editor:candidates");
  const [loading, setLoading] = useState(true);
  const { edit: editIdFromUrl } = Route.useSearch();
  const navigate = useNavigate();

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

  // If we arrived with ?edit=<id>, open that candidate in the editor as soon
  // as rows are loaded, then clear the param so refreshes don't override
  // unrelated persisted edits.
  useEffect(() => {
    if (!editIdFromUrl || rows.length === 0) return;
    const target = rows.find((r) => r.id === editIdFromUrl);
    if (target) setEditing(target);
    void navigate({ to: "/admin/candidates", search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editIdFromUrl, rows]);

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
                        <span title="Confirmed via news sources" className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                          <CheckCircle2 className="h-3 w-3" /> News
                        </span>
                      ) : null}
                      {r.commission_confirmed ? (
                        <span title="Confirmed by Electoral Commission" className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
                          <CheckCircle2 className="h-3 w-3" /> Commission
                        </span>
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
                    <CandidateStatusBadge
                      status={r.status}
                      isIncumbent={r.is_incumbent}
                      electoralConfirmed={r.electoral_confirmed}
                    />
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
          onChange={setEditing}
          onClose={clearEditing}
          onSaved={() => {
            clearEditing();
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function CandidateEditor({
  value,
  parties,
  districts,
  onChange,
  onClose,
  onSaved,
}: {
  value: Candidate;
  parties: PartyOpt[];
  districts: DistrictOpt[];
  onChange: (next: Candidate) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const v = value;
  const setV = (next: Candidate) => onChange(next);
  const [saving, setSaving] = useState(false);
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

  // Ensure the primary district is always part of the contesting-districts
  // set, so the candidate shows up on that district's public page.
  const effectiveDistrictIds = useMemo(() => {
    if (v.primary_district_id && !districtIds.includes(v.primary_district_id)) {
      return [...districtIds, v.primary_district_id];
    }
    return districtIds;
  }, [districtIds, v.primary_district_id]);

  const toggleDistrict = (id: string) => {
    // Don't allow unchecking the primary district — change the primary first.
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
        commission_confirmed: v.commission_confirmed,
        bio_en: v.bio_en || null,
        bio_mt: v.bio_mt || null,
        photo_url: v.photo_url || null,
        website: v.website || null,
        facebook: v.facebook || null,
        twitter: v.twitter || null,
        instagram: v.instagram || null,
        tiktok: v.tiktok || null,
        email: v.email || null,
        phone: v.phone || null,
        parlament_mt_url: v.parlament_mt_url || null,
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
      } else {
        const { error } = await supabase
          .from("candidates")
          .update(payload)
          .eq("id", v.id);
        if (error) throw error;
      }

      // Sync candidate_districts for the 2026 election. Always include the
      // primary district so the public site can show the candidate there.
      const finalIds = primaryDistrict && !effectiveDistrictIds.includes(primaryDistrict)
        ? [...effectiveDistrictIds, primaryDistrict]
        : effectiveDistrictIds;
      const toAdd = finalIds.filter((id) => !initialDistrictIds.includes(id));
      const toRemove = initialDistrictIds.filter(
        (id) => !finalIds.includes(id)
      );
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

  return (
    <Drawer title={isNew ? "New candidate" : `Edit: ${v.full_name}`} onClose={onClose}>
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
            Select every district this candidate is contesting in 2026. The
            primary district above is used as the main display affiliation.
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
        <Field label="Photo URL">
          <Input value={v.photo_url ?? ""} onChange={(x) => setV({ ...v, photo_url: x })} />
        </Field>
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
        <Field label="Email">
          <Input value={v.email ?? ""} onChange={(x) => setV({ ...v, email: x })} placeholder="name@example.com" />
        </Field>
        <Field label="Contact number">
          <Input value={v.phone ?? ""} onChange={(x) => setV({ ...v, phone: x })} placeholder="+356 …" />
        </Field>
        <Field label="parlament.mt URL" full>
          <Input
            value={v.parlament_mt_url ?? ""}
            onChange={(x) => setV({ ...v, parlament_mt_url: x })}
          />
        </Field>
        <Field label="Bio (EN)" full>
          <Textarea value={v.bio_en ?? ""} onChange={(x) => setV({ ...v, bio_en: x })} />
        </Field>
        <Field label="Bio (MT)" full>
          <Textarea value={v.bio_mt ?? ""} onChange={(x) => setV({ ...v, bio_mt: x })} />
        </Field>
        <Field label="Source URL" full>
          <Input value={v.source_url ?? ""} onChange={(x) => setV({ ...v, source_url: x })} />
        </Field>
        <Field label="Internal notes" full>
          <Textarea value={v.notes ?? ""} onChange={(x) => setV({ ...v, notes: x })} />
        </Field>
        <Field label="Status">
          <StatusSelect value={v.status} onChange={(x) => setV({ ...v, status: x })} />
        </Field>
        <Field label="Flags">
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
              Confirmed via news sources
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={v.commission_confirmed}
                onChange={(e) => setV({ ...v, commission_confirmed: e.target.checked })}
              />
              Confirmed on electoral commission
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
        {v.not_contesting_2026 ? (
          <>
            <Field label="Not contesting — source URL" full>
              <Input
                value={v.not_contesting_source_url ?? ""}
                onChange={(x) => setV({ ...v, not_contesting_source_url: x })}
                placeholder="https://… article where they announced"
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
      <DrawerActions onClose={onClose} onSave={save} saving={saving} />
    </Drawer>
  );
}
