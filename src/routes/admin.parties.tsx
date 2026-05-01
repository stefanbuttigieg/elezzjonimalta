import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge, slugify, deleteRow, usePersistentEditor, type ReviewStatus } from "@/lib/admin";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/parties")({
  component: PartiesAdmin,
});

interface Party {
  id: string;
  slug: string;
  name_en: string;
  name_mt: string | null;
  short_name: string | null;
  color: string | null;
  website: string | null;
  description_en: string | null;
  description_mt: string | null;
  status: ReviewStatus;
  source_url: string | null;
  imported_from: string | null;
}

const empty: Party = {
  id: "",
  slug: "",
  name_en: "",
  name_mt: "",
  short_name: "",
  color: "",
  website: "",
  description_en: "",
  description_mt: "",
  status: "draft",
  source_url: "",
  imported_from: "",
};

function PartiesAdmin() {
  const [rows, setRows] = useState<Party[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing, clearEditing] = usePersistentEditor<Party>("admin:editor:parties");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("parties")
      .select("*")
      .order("name_en");
    if (error) toast.error(error.message);
    setRows((data ?? []) as Party[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        q ? `${r.name_en} ${r.name_mt ?? ""} ${r.short_name ?? ""}`.toLowerCase().includes(q.toLowerCase()) : true
      ),
    [rows, q]
  );

  return (
    <div>
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Parties</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage political parties shown on the public site.
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...empty })}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New party
        </button>
      </header>

      <div className="mt-6 flex items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search parties…"
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Short</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No parties yet. Create the first one.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {r.color ? (
                        <span
                          className="h-3 w-3 rounded-full border border-border"
                          style={{ backgroundColor: r.color }}
                        />
                      ) : null}
                      <div>
                        <div className="font-medium text-foreground">{r.name_en}</div>
                        {r.name_mt ? (
                          <div className="text-xs text-muted-foreground">{r.name_mt}</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.short_name ?? "—"}</td>
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
                        if (!confirm(`Delete "${r.name_en}"? This cannot be undone.`)) return;
                        try {
                          await deleteRow("parties", r.id);
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
        <PartyEditor
          value={editing}
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

function PartyEditor({
  value,
  onClose,
  onSaved,
}: {
  value: Party;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState<Party>(value);
  const [saving, setSaving] = useState(false);
  const isNew = !v.id;

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        slug: v.slug || slugify(v.name_en),
        name_en: v.name_en,
        name_mt: v.name_mt || null,
        short_name: v.short_name || null,
        color: v.color || null,
        website: v.website || null,
        description_en: v.description_en || null,
        description_mt: v.description_mt || null,
        status: v.status,
        source_url: v.source_url || null,
      };
      if (!payload.name_en) throw new Error("English name is required");
      const { error } = isNew
        ? await supabase.from("parties").insert(payload)
        : await supabase.from("parties").update(payload).eq("id", v.id);
      if (error) throw error;
      toast.success(isNew ? "Party created" : "Party updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer title={isNew ? "New party" : `Edit: ${v.name_en}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name (EN) *">
          <Input value={v.name_en} onChange={(x) => setV({ ...v, name_en: x })} />
        </Field>
        <Field label="Name (MT)">
          <Input value={v.name_mt ?? ""} onChange={(x) => setV({ ...v, name_mt: x })} />
        </Field>
        <Field label="Slug">
          <Input
            value={v.slug}
            onChange={(x) => setV({ ...v, slug: x })}
            placeholder={slugify(v.name_en) || "auto-generated"}
          />
        </Field>
        <Field label="Short name">
          <Input value={v.short_name ?? ""} onChange={(x) => setV({ ...v, short_name: x })} />
        </Field>
        <Field label="Color (hex)">
          <Input value={v.color ?? ""} onChange={(x) => setV({ ...v, color: x })} placeholder="#cc0000" />
        </Field>
        <Field label="Website">
          <Input value={v.website ?? ""} onChange={(x) => setV({ ...v, website: x })} />
        </Field>
        <Field label="Description (EN)" full>
          <Textarea value={v.description_en ?? ""} onChange={(x) => setV({ ...v, description_en: x })} />
        </Field>
        <Field label="Description (MT)" full>
          <Textarea value={v.description_mt ?? ""} onChange={(x) => setV({ ...v, description_mt: x })} />
        </Field>
        <Field label="Source URL" full>
          <Input value={v.source_url ?? ""} onChange={(x) => setV({ ...v, source_url: x })} />
        </Field>
        <Field label="Status">
          <StatusSelect value={v.status} onChange={(x) => setV({ ...v, status: x })} />
        </Field>
      </div>
      <DrawerActions onClose={onClose} onSave={save} saving={saving} />
    </Drawer>
  );
}

// --- Shared form bits used by all admin editors ---

export function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-foreground/30 backdrop-blur-sm"
      />
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background shadow-elevated">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <h2 className="font-serif text-xl font-bold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Close
          </button>
        </div>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}

export function DrawerActions({
  onClose,
  onSave,
  saving,
}: {
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="mt-8 flex justify-end gap-2">
      <button
        onClick={onClose}
        className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
      >
        Cancel
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

export function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={"block " + (full ? "col-span-2" : "")}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
    />
  );
}

export function Textarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
    />
  );
}

export function StatusSelect({
  value,
  onChange,
}: {
  value: ReviewStatus;
  onChange: (v: ReviewStatus) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ReviewStatus)}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <option value="draft">Draft</option>
      <option value="pending_review">Pending review</option>
      <option value="published">Published</option>
      <option value="archived">Archived</option>
    </select>
  );
}
