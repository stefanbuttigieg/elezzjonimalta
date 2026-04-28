import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge, deleteRow, type ReviewStatus } from "@/lib/admin";
import {
  Drawer,
  DrawerActions,
  Field,
  Input,
  StatusSelect,
  Textarea,
} from "@/routes/admin.parties";
import { Plus, Pencil, Trash2, Search, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/proposals")({
  component: ProposalsAdmin,
});

interface PartyLite {
  id: string;
  name_en: string;
  short_name: string | null;
}
interface CandidateLite {
  id: string;
  full_name: string;
}

interface Proposal {
  id: string;
  title_en: string;
  title_mt: string | null;
  description_en: string | null;
  description_mt: string | null;
  category: string | null;
  party_id: string | null;
  candidate_id: string | null;
  status: ReviewStatus;
  source_url: string | null;
  party?: PartyLite | null;
  candidate?: CandidateLite | null;
}

const empty: Proposal = {
  id: "",
  title_en: "",
  title_mt: "",
  description_en: "",
  description_mt: "",
  category: "",
  party_id: null,
  candidate_id: null,
  status: "pending_review",
  source_url: "",
};

function ProposalsAdmin() {
  const [rows, setRows] = useState<Proposal[]>([]);
  const [parties, setParties] = useState<PartyLite[]>([]);
  const [candidates, setCandidates] = useState<CandidateLite[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [proposalsRes, partiesRes, candidatesRes] = await Promise.all([
      supabase
        .from("proposals")
        .select(
          "*, party:parties(id, name_en, short_name), candidate:candidates(id, full_name)"
        )
        .order("created_at", { ascending: false }),
      supabase.from("parties").select("id, name_en, short_name").order("name_en"),
      supabase.from("candidates").select("id, full_name").order("full_name"),
    ]);
    if (proposalsRes.error) toast.error(proposalsRes.error.message);
    if (partiesRes.error) toast.error(partiesRes.error.message);
    if (candidatesRes.error) toast.error(candidatesRes.error.message);
    setRows((proposalsRes.data ?? []) as Proposal[]);
    setParties((partiesRes.data ?? []) as PartyLite[]);
    setCandidates((candidatesRes.data ?? []) as CandidateLite[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        q
          ? `${r.title_en} ${r.title_mt ?? ""} ${r.category ?? ""}`
              .toLowerCase()
              .includes(q.toLowerCase())
          : true
      ),
    [rows, q]
  );

  return (
    <div>
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Proposals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Policy proposals linked to a party, a candidate, or both.
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...empty })}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New proposal
        </button>
      </header>

      <div className="mt-6 flex items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search proposals…"
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Linked to</th>
              <th className="px-4 py-3">Category</th>
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
                  <FileText className="mx-auto mb-2 h-6 w-6" />
                  No proposals yet. Create the first one.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{r.title_en}</div>
                    {r.title_mt ? (
                      <div className="text-xs text-muted-foreground">{r.title_mt}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="flex flex-col gap-0.5">
                      {r.party ? (
                        <span>🏛 {r.party.short_name ?? r.party.name_en}</span>
                      ) : null}
                      {r.candidate ? <span>👤 {r.candidate.full_name}</span> : null}
                      {!r.party && !r.candidate ? "—" : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.category ?? "—"}</td>
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
                        if (!confirm(`Delete "${r.title_en}"? This cannot be undone.`))
                          return;
                        try {
                          await deleteRow("proposals", r.id);
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
        <ProposalEditor
          value={editing}
          parties={parties}
          candidates={candidates}
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

function ProposalEditor({
  value,
  parties,
  candidates,
  onClose,
  onSaved,
}: {
  value: Proposal;
  parties: PartyLite[];
  candidates: CandidateLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState<Proposal>(value);
  const [saving, setSaving] = useState(false);
  const isNew = !v.id;

  const save = async () => {
    setSaving(true);
    try {
      if (!v.title_en.trim()) throw new Error("English title is required");
      if (!v.party_id && !v.candidate_id) {
        throw new Error("Link this proposal to a party, a candidate, or both");
      }
      const payload = {
        title_en: v.title_en,
        title_mt: v.title_mt || null,
        description_en: v.description_en || null,
        description_mt: v.description_mt || null,
        category: v.category || null,
        party_id: v.party_id || null,
        candidate_id: v.candidate_id || null,
        status: v.status,
        source_url: v.source_url || null,
      };
      const { error } = isNew
        ? await supabase.from("proposals").insert(payload)
        : await supabase.from("proposals").update(payload).eq("id", v.id);
      if (error) throw error;
      toast.success(isNew ? "Proposal created" : "Proposal updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer title={isNew ? "New proposal" : `Edit: ${v.title_en}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Title (EN) *" full>
          <Input value={v.title_en} onChange={(x) => setV({ ...v, title_en: x })} />
        </Field>
        <Field label="Title (MT)" full>
          <Input value={v.title_mt ?? ""} onChange={(x) => setV({ ...v, title_mt: x })} />
        </Field>
        <Field label="Description (EN)" full>
          <Textarea
            value={v.description_en ?? ""}
            onChange={(x) => setV({ ...v, description_en: x })}
          />
        </Field>
        <Field label="Description (MT)" full>
          <Textarea
            value={v.description_mt ?? ""}
            onChange={(x) => setV({ ...v, description_mt: x })}
          />
        </Field>
        <Field label="Category">
          <Input
            value={v.category ?? ""}
            onChange={(x) => setV({ ...v, category: x })}
            placeholder="e.g. Economy, Health"
          />
        </Field>
        <Field label="Status">
          <StatusSelect value={v.status} onChange={(x) => setV({ ...v, status: x })} />
        </Field>
        <Field label="Linked party">
          <select
            value={v.party_id ?? ""}
            onChange={(e) => setV({ ...v, party_id: e.target.value || null })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">— None —</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name_en}
                {p.short_name ? ` (${p.short_name})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Linked candidate">
          <select
            value={v.candidate_id ?? ""}
            onChange={(e) => setV({ ...v, candidate_id: e.target.value || null })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">— None —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source URL" full>
          <Input value={v.source_url ?? ""} onChange={(x) => setV({ ...v, source_url: x })} />
        </Field>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        At least one of <span className="font-semibold">linked party</span> or{" "}
        <span className="font-semibold">linked candidate</span> is required.
      </p>
      <DrawerActions onClose={onClose} onSave={save} saving={saving} />
    </Drawer>
  );
}
