import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerActions, Field, Input } from "@/routes/admin.parties";
import { usePersistentEditor } from "@/lib/admin";
import { Plus, Pencil, Trash2, Search, Tag } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/categories")({
  component: CategoriesAdmin,
});

interface Category {
  id: string;
  slug: string;
  name_en: string;
  name_mt: string | null;
  description_en: string | null;
  sort_order: number;
}

const empty: Category = {
  id: "",
  slug: "",
  name_en: "",
  name_mt: "",
  description_en: "",
  sort_order: 0,
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function CategoriesAdmin() {
  const [rows, setRows] = useState<Category[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [editing, setEditing, clearEditing] = usePersistentEditor<Category>("admin:editor:categories");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [catsRes, propsRes] = await Promise.all([
      supabase
        .from("proposal_categories")
        .select("*")
        .order("sort_order")
        .order("name_en"),
      supabase.from("proposals").select("category"),
    ]);
    if (catsRes.error) toast.error(catsRes.error.message);
    setRows((catsRes.data ?? []) as Category[]);
    const counts: Record<string, number> = {};
    for (const p of (propsRes.data ?? []) as { category: string | null }[]) {
      if (p.category) counts[p.category] = (counts[p.category] ?? 0) + 1;
    }
    setUsage(counts);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        q
          ? `${r.name_en} ${r.name_mt ?? ""} ${r.slug}`
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
          <h1 className="font-serif text-3xl font-bold text-foreground">Proposal categories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage the list of categories used to tag proposals.
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...empty })}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New category
        </button>
      </header>

      <div className="mt-6 flex items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search categories…"
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Sort</th>
              <th className="px-4 py-3">Used by</th>
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
                  <Tag className="mx-auto mb-2 h-6 w-6" />
                  No categories yet.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const count = usage[r.name_en] ?? 0;
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{r.name_en}</div>
                      {r.name_mt ? (
                        <div className="text-xs text-muted-foreground">{r.name_mt}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.slug}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.sort_order}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {count} proposal{count === 1 ? "" : "s"}
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
                          if (count > 0) {
                            if (
                              !confirm(
                                `"${r.name_en}" is used by ${count} proposal(s). Deleting will leave them with the old text label. Continue?`
                              )
                            )
                              return;
                          } else if (!confirm(`Delete "${r.name_en}"?`)) return;
                          const { error } = await supabase
                            .from("proposal_categories")
                            .delete()
                            .eq("id", r.id);
                          if (error) {
                            toast.error(error.message);
                            return;
                          }
                          toast.success("Deleted");
                          void load();
                        }}
                        className="ml-2 inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editing ? (
        <CategoryEditor
          value={editing}
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

function CategoryEditor({
  value,
  onChange,
  onClose,
  onSaved,
}: {
  value: Category;
  onChange: (next: Category) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const v = value;
  const setV = (next: Category) => onChange(next);
  const [saving, setSaving] = useState(false);
  const isNew = !v.id;

  const save = async () => {
    setSaving(true);
    try {
      if (!v.name_en.trim()) throw new Error("English name is required");
      const slug = (v.slug || slugify(v.name_en)).trim();
      if (!slug) throw new Error("Slug is required");
      const payload = {
        slug,
        name_en: v.name_en.trim(),
        name_mt: v.name_mt?.trim() || null,
        description_en: v.description_en?.trim() || null,
        sort_order: Number(v.sort_order) || 0,
      };
      const { error } = isNew
        ? await supabase.from("proposal_categories").insert(payload)
        : await supabase.from("proposal_categories").update(payload).eq("id", v.id);
      if (error) throw error;
      toast.success(isNew ? "Category created" : "Category updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer title={isNew ? "New category" : `Edit: ${v.name_en}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name (EN) *">
          <Input
            value={v.name_en}
            onChange={(x) =>
              setV({
                ...v,
                name_en: x,
                slug: isNew && !v.slug ? slugify(x) : v.slug,
              })
            }
          />
        </Field>
        <Field label="Name (MT)">
          <Input value={v.name_mt ?? ""} onChange={(x) => setV({ ...v, name_mt: x })} />
        </Field>
        <Field label="Slug *">
          <Input value={v.slug} onChange={(x) => setV({ ...v, slug: slugify(x) })} />
        </Field>
        <Field label="Sort order">
          <Input
            value={String(v.sort_order)}
            onChange={(x) => setV({ ...v, sort_order: parseInt(x, 10) || 0 })}
          />
        </Field>
        <Field label="Description (EN)" full>
          <Input
            value={v.description_en ?? ""}
            onChange={(x) => setV({ ...v, description_en: x })}
          />
        </Field>
      </div>
      <DrawerActions onClose={onClose} onSave={save} saving={saving} />
    </Drawer>
  );
}
