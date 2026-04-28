import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge, slugify, deleteRow, type ReviewStatus } from "@/lib/admin";
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
  parlament_mt_url: string | null;
  status: ReviewStatus;
  source_url: string | null;
  imported_from: string | null;
  notes: string | null;
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
  parlament_mt_url: "",
  status: "pending_review",
  source_url: "",
  imported_from: "",
  notes: "",
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
  const isNew = !v.id;

  const save = async () => {
    setSaving(true);
    try {
      if (!v.full_name) throw new Error("Full name is required");
      const payload = {
        slug: v.slug || slugify(v.full_name),
        full_name: v.full_name,
        party_id: v.party_id || null,
        primary_district_id: v.primary_district_id || null,
        is_incumbent: v.is_incumbent,
        electoral_confirmed: v.electoral_confirmed,
        bio_en: v.bio_en || null,
        bio_mt: v.bio_mt || null,
        photo_url: v.photo_url || null,
        website: v.website || null,
        facebook: v.facebook || null,
        twitter: v.twitter || null,
        parlament_mt_url: v.parlament_mt_url || null,
        status: v.status,
        source_url: v.source_url || null,
        notes: v.notes || null,
      };
      const { error } = isNew
        ? await supabase.from("candidates").insert(payload)
        : await supabase.from("candidates").update(payload).eq("id", v.id);
      if (error) throw error;
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
              Confirmed on electoral.gov.mt
            </label>
          </div>
        </Field>
      </div>
      <DrawerActions onClose={onClose} onSave={save} saving={saving} />
    </Drawer>
  );
}
