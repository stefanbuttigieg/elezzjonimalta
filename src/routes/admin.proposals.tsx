import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge, deleteRow, usePersistentEditor, type ReviewStatus } from "@/lib/admin";
import {
  Drawer,
  DrawerActions,
  Field,
  Input,
  StatusSelect,
  Textarea,
} from "@/routes/admin.parties";
import { CustomFieldsSection } from "@/components/admin/CustomFieldsSection";
import { ProposalSourcesSection } from "@/components/admin/ProposalSourcesSection";
import { ProposalHistorySection } from "@/components/admin/ProposalHistorySection";
import { Plus, Pencil, Trash2, Search, FileText, GitMerge, Layers } from "lucide-react";
import { toast } from "sonner";
import { findDuplicates } from "@/lib/proposal-dedupe";
import { mergeProposals } from "@/lib/proposal-merge";

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
interface CategoryLite {
  id: string;
  name_en: string;
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
  custom_fields: Record<string, unknown>;
  notes: string | null;
  merged_into_id: string | null;
  merged_at: string | null;
  merge_note: string | null;
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
  custom_fields: {},
  notes: null,
  merged_into_id: null,
  merged_at: null,
  merge_note: null,
};

function ProposalsAdmin() {
  const [rows, setRows] = useState<Proposal[]>([]);
  const [parties, setParties] = useState<PartyLite[]>([]);
  const [candidates, setCandidates] = useState<CandidateLite[]>([]);
  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [q, setQ] = useState("");
  const [showMerged, setShowMerged] = useState(false);
  const [editing, setEditing, clearEditing] = usePersistentEditor<Proposal>("admin:editor:proposals");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [proposalsRes, partiesRes, candidatesRes, categoriesRes] = await Promise.all([
      supabase
        .from("proposals")
        .select(
          "*, party:parties(id, name_en, short_name), candidate:candidates(id, full_name)"
        )
        .order("created_at", { ascending: false }),
      supabase.from("parties").select("id, name_en, short_name").order("name_en"),
      supabase.from("candidates").select("id, full_name").order("full_name"),
      supabase.from("proposal_categories").select("id, name_en").order("sort_order").order("name_en"),
    ]);
    if (proposalsRes.error) toast.error(proposalsRes.error.message);
    if (partiesRes.error) toast.error(partiesRes.error.message);
    if (candidatesRes.error) toast.error(candidatesRes.error.message);
    setRows((proposalsRes.data ?? []) as Proposal[]);
    setParties((partiesRes.data ?? []) as PartyLite[]);
    setCandidates((candidatesRes.data ?? []) as CandidateLite[]);
    setCategories((categoriesRes.data ?? []) as CategoryLite[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (!showMerged && r.merged_into_id) return false;
        if (!q) return true;
        return `${r.title_en} ${r.title_mt ?? ""} ${r.category ?? ""}`
          .toLowerCase()
          .includes(q.toLowerCase());
      }),
    [rows, q, showMerged]
  );

  const mergedCount = useMemo(() => rows.filter((r) => r.merged_into_id).length, [rows]);
  // Lightweight pool used for in-editor duplicate suggestions
  const dupePool = useMemo(
    () =>
      rows.map((r) => ({
        id: r.id,
        title_en: r.title_en,
        title_mt: r.title_mt,
        description_en: r.description_en,
        description_mt: r.description_mt,
        party_id: r.party_id,
        candidate_id: r.candidate_id,
        status: r.status,
        merged_into_id: r.merged_into_id,
      })),
    [rows]
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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search proposals…"
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showMerged}
            onChange={(e) => setShowMerged(e.target.checked)}
          />
          Show merged ({mergedCount})
        </label>
        <Link
          to="/admin/duplicates"
          className="ml-auto inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          <Layers className="h-4 w-4" /> Find duplicates
        </Link>
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
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-foreground">{r.title_en}</div>
                      {r.merged_into_id ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                          <GitMerge className="h-3 w-3" /> Merged
                        </span>
                      ) : null}
                    </div>
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
          categories={categories}
          dupePool={dupePool}
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

function ProposalEditor({
  value,
  parties,
  candidates,
  categories,
  dupePool,
  onChange,
  onClose,
  onSaved,
}: {
  value: Proposal;
  parties: PartyLite[];
  candidates: CandidateLite[];
  categories: CategoryLite[];
  dupePool: Array<{
    id: string;
    title_en: string;
    title_mt: string | null;
    description_en: string | null;
    description_mt: string | null;
    party_id: string | null;
    candidate_id: string | null;
    status: string;
    merged_into_id: string | null;
  }>;
  onChange: (next: Proposal) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const v = value;
  const setV = (next: Proposal) => onChange(next);
  const [saving, setSaving] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);
  const isNew = !v.id;

  const suggestions = useMemo(() => {
    if (isNew || !v.title_en) return [];
    return findDuplicates(
      {
        id: v.id,
        title_en: v.title_en,
        title_mt: v.title_mt,
        description_en: v.description_en,
        description_mt: v.description_mt,
        party_id: v.party_id,
        candidate_id: v.candidate_id,
        status: v.status,
        merged_into_id: v.merged_into_id,
      },
      dupePool,
      0.4
    );
  }, [isNew, v, dupePool]);

  const mergeOne = async (dupId: string) => {
    const dup = dupePool.find((p) => p.id === dupId);
    if (!dup) return;
    const note = prompt("Merge note (optional):") ?? "";
    setMerging(dupId);
    try {
      await mergeProposals({
        primary: {
          id: v.id,
          title_en: v.title_en,
          title_mt: v.title_mt,
          description_en: v.description_en,
          description_mt: v.description_mt,
          source_url: v.source_url,
          notes: v.notes,
          party_id: v.party_id,
          candidate_id: v.candidate_id,
          status: v.status,
        },
        duplicates: [
          {
            id: dup.id,
            title_en: dup.title_en,
            title_mt: dup.title_mt,
            description_en: dup.description_en,
            description_mt: dup.description_mt,
            source_url: null,
            party_id: dup.party_id,
            candidate_id: dup.candidate_id,
            status: dup.status,
          },
        ],
        note,
      });
      toast.success("Merged");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setMerging(null);
    }
  };

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
        custom_fields: v.custom_fields ?? {},
        notes: v.notes || null,
      };
      let savedId = v.id;
      if (isNew) {
        const { data, error } = await supabase
          .from("proposals")
          .insert(payload as never)
          .select("id")
          .single();
        if (error) throw error;
        savedId = (data as { id: string }).id;
      } else {
        const { error } = await supabase
          .from("proposals")
          .update(payload as never)
          .eq("id", v.id);
        if (error) throw error;
      }
      // Write audit log entry (best-effort, non-blocking)
      try {
        const { data: userRes } = await supabase.auth.getUser();
        await supabase.from("admin_audit_log").insert({
          entity_type: "proposal",
          entity_id: savedId,
          action: isNew ? "create" : "update",
          actor_id: userRes.user?.id ?? null,
          actor_email: userRes.user?.email ?? null,
          before: isNew ? null : (value as unknown as Record<string, unknown>),
          after: { id: savedId, ...payload } as unknown as Record<string, unknown>,
        } as never);
      } catch {
        // ignore audit failures
      }
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
          <select
            value={v.category ?? ""}
            onChange={(e) => setV({ ...v, category: e.target.value || null })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name_en}>
                {c.name_en}
              </option>
            ))}
            {v.category && !categories.some((c) => c.name_en === v.category) ? (
              <option value={v.category}>{v.category} (legacy)</option>
            ) : null}
          </select>
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
        <Field label="Primary source URL" full>
          <Input value={v.source_url ?? ""} onChange={(x) => setV({ ...v, source_url: x })} />
        </Field>
        <Field label="Internal notes" full>
          <Textarea value={v.notes ?? ""} onChange={(x) => setV({ ...v, notes: x })} />
        </Field>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        At least one of <span className="font-semibold">linked party</span> or{" "}
        <span className="font-semibold">linked candidate</span> is required.
      </p>

      {!isNew && suggestions.length > 0 ? (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
            <GitMerge className="h-4 w-4" /> Possible duplicates ({suggestions.length})
          </h3>
          <ul className="space-y-2">
            {suggestions.map(({ proposal, score }) => (
              <li
                key={proposal.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-2 text-sm"
              >
                <div className="flex-1">
                  <div className="font-medium">{proposal.title_en}</div>
                  <div className="text-xs text-muted-foreground">
                    similarity {(score * 100).toFixed(0)}% · status {proposal.status}
                  </div>
                </div>
                <button
                  disabled={merging === proposal.id}
                  onClick={() => mergeOne(proposal.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
                >
                  <GitMerge className="h-3 w-3" />
                  {merging === proposal.id ? "Merging…" : "Merge into this"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <CustomFieldsSection
        entityType="proposal"
        values={(v.custom_fields ?? {}) as Record<string, unknown>}
        onChange={(next) => setV({ ...v, custom_fields: next })}
      />

      {!isNew ? (
        <>
          <ProposalSourcesSection proposalId={v.id} />
          <ProposalHistorySection proposalId={v.id} />
        </>
      ) : (
        <p className="mt-6 rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          Save the proposal first to manage additional source URLs and view its update history.
        </p>
      )}

      <DrawerActions onClose={onClose} onSave={save} saving={saving} />
    </Drawer>
  );
}
