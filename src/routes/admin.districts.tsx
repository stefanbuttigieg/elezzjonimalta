import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge, deleteRow, type ReviewStatus } from "@/lib/admin";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerActions,
  Field,
  Input,
  StatusSelect,
  Textarea,
} from "./admin.parties";

export const Route = createFileRoute("/admin/districts")({
  component: DistrictsAdmin,
});

interface District {
  id: string;
  number: number;
  name_en: string;
  name_mt: string | null;
  localities_en: string | null;
  localities_mt: string | null;
  status: ReviewStatus;
  source_url: string | null;
}

const empty: District = {
  id: "",
  number: 1,
  name_en: "",
  name_mt: "",
  localities_en: "",
  localities_mt: "",
  status: "draft",
  source_url: "",
};

function DistrictsAdmin() {
  const [rows, setRows] = useState<District[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<District | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("districts").select("*").order("number");
    if (error) toast.error(error.message);
    setRows((data ?? []) as District[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        q
          ? `${r.number} ${r.name_en} ${r.name_mt ?? ""} ${r.localities_en ?? ""}`
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
          <h1 className="font-serif text-3xl font-bold text-foreground">Districts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Malta has 13 electoral districts. Manage their bilingual names and locality lists.
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...empty, number: (rows.at(-1)?.number ?? 0) + 1 })}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New district
        </button>
      </header>

      <div className="mt-6 flex items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search districts…"
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Name</th>
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
                  No districts yet.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold text-foreground">{r.number}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{r.name_en}</div>
                    {r.name_mt ? (
                      <div className="text-xs text-muted-foreground">{r.name_mt}</div>
                    ) : null}
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
                        if (!confirm(`Delete district ${r.number}: ${r.name_en}?`)) return;
                        try {
                          await deleteRow("districts", r.id);
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
        <DistrictEditor
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

function DistrictEditor({
  value,
  onClose,
  onSaved,
}: {
  value: District;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState<District>(value);
  const [saving, setSaving] = useState(false);
  const isNew = !v.id;

  const save = async () => {
    setSaving(true);
    try {
      if (!v.name_en) throw new Error("English name is required");
      if (!v.number || v.number < 1) throw new Error("Number must be a positive integer");
      const payload = {
        number: v.number,
        name_en: v.name_en,
        name_mt: v.name_mt || null,
        localities_en: v.localities_en || null,
        localities_mt: v.localities_mt || null,
        status: v.status,
        source_url: v.source_url || null,
      };
      const { error } = isNew
        ? await supabase.from("districts").insert(payload)
        : await supabase.from("districts").update(payload).eq("id", v.id);
      if (error) throw error;
      toast.success(isNew ? "District created" : "District updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer title={isNew ? "New district" : `Edit: ${v.name_en}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Number *">
          <Input
            type="number"
            value={String(v.number)}
            onChange={(x) => setV({ ...v, number: Number(x) || 0 })}
          />
        </Field>
        <Field label="Status">
          <StatusSelect value={v.status} onChange={(x) => setV({ ...v, status: x })} />
        </Field>
        <Field label="Name (EN) *">
          <Input value={v.name_en} onChange={(x) => setV({ ...v, name_en: x })} />
        </Field>
        <Field label="Name (MT)">
          <Input value={v.name_mt ?? ""} onChange={(x) => setV({ ...v, name_mt: x })} />
        </Field>
        <Field label="Localities (EN)" full>
          <Textarea
            value={v.localities_en ?? ""}
            onChange={(x) => setV({ ...v, localities_en: x })}
          />
        </Field>
        <Field label="Localities (MT)" full>
          <Textarea
            value={v.localities_mt ?? ""}
            onChange={(x) => setV({ ...v, localities_mt: x })}
          />
        </Field>
        <Field label="Source URL" full>
          <Input value={v.source_url ?? ""} onChange={(x) => setV({ ...v, source_url: x })} />
        </Field>
      </div>
      <DrawerActions onClose={onClose} onSave={save} saving={saving} />
    </Drawer>
  );
}
