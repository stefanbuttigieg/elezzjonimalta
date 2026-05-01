import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deleteRow, usePersistentEditor } from "@/lib/admin";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Drawer, DrawerActions, Field, Input, Textarea } from "./admin.parties";
import type { CustomFieldDefinition, CustomFieldType } from "@/components/admin/CustomFieldsSection";

export const Route = createFileRoute("/admin/custom-fields")({
  component: CustomFieldsAdmin,
});

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Single-line text" },
  { value: "textarea", label: "Multi-line text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / No (checkbox)" },
  { value: "date", label: "Date" },
  { value: "url", label: "URL" },
  { value: "select", label: "Dropdown (choose one)" },
];

const empty: CustomFieldDefinition = {
  id: "",
  entity_type: "candidate",
  key: "",
  label: "",
  field_type: "text",
  options: [],
  help_text: "",
  required: false,
  public_visible: false,
  sort_order: 0,
};

function slugifyKey(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function CustomFieldsAdmin() {
  const [rows, setRows] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing, clearEditing] =
    usePersistentEditor<CustomFieldDefinition>("admin:editor:custom-fields");
  const [tab, setTab] = useState<"candidate" | "proposal">("candidate");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("custom_field_definitions")
      .select("*")
      .order("entity_type")
      .order("sort_order")
      .order("label");
    if (error) toast.error(error.message);
    setRows(
      (data ?? []).map((d) => ({
        ...d,
        options: Array.isArray(d.options) ? (d.options as string[]) : [],
      })) as CustomFieldDefinition[]
    );
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = rows.filter((r) => r.entity_type === tab);

  return (
    <div>
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Custom fields</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define extra fields that admins can fill in on candidates and proposals,
            without needing a code change.
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...empty, entity_type: tab })}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New field
        </button>
      </header>

      <div className="mt-6 inline-flex rounded-md border border-border bg-surface p-1">
        {(["candidate", "proposal"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1.5 text-sm font-medium capitalize ${
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {t}s
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Flags</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No custom fields defined yet for {tab}s.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-foreground">{r.label}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.key}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.field_type}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.sort_order}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.required ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Required</span>
                      ) : null}
                      {r.public_visible ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">Public</span>
                      ) : null}
                    </div>
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
                        if (!confirm(`Delete field "${r.label}"? Existing values on records will remain in storage but will no longer be editable.`)) return;
                        try {
                          await deleteRow("custom_field_definitions", r.id);
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
        <CustomFieldEditor
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

function CustomFieldEditor({
  value,
  onChange,
  onClose,
  onSaved,
}: {
  value: CustomFieldDefinition;
  onChange: (next: CustomFieldDefinition) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const v = value;
  const setV = (next: CustomFieldDefinition) => onChange(next);
  const [saving, setSaving] = useState(false);
  const isNew = !v.id;
  const [optionsText, setOptionsText] = useState(v.options.join("\n"));

  const save = async () => {
    setSaving(true);
    try {
      if (!v.label.trim()) throw new Error("Label is required");
      const key = v.key.trim() || slugifyKey(v.label);
      if (!/^[a-z0-9_]+$/.test(key)) {
        throw new Error("Key must contain only lowercase letters, numbers and underscores");
      }
      const options = v.field_type === "select"
        ? optionsText.split("\n").map((s) => s.trim()).filter(Boolean)
        : [];
      const payload = {
        entity_type: v.entity_type,
        key,
        label: v.label.trim(),
        field_type: v.field_type,
        options,
        help_text: v.help_text?.trim() || null,
        required: v.required,
        public_visible: v.public_visible,
        sort_order: Number(v.sort_order) || 0,
      };
      const { error } = isNew
        ? await supabase.from("custom_field_definitions").insert(payload as never)
        : await supabase.from("custom_field_definitions").update(payload as never).eq("id", v.id);
      if (error) throw error;
      toast.success(isNew ? "Field created" : "Field updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer title={isNew ? "New custom field" : `Edit: ${v.label}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Applies to *">
          <select
            value={v.entity_type}
            onChange={(e) => setV({ ...v, entity_type: e.target.value as "candidate" | "proposal" })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={!isNew}
          >
            <option value="candidate">Candidates</option>
            <option value="proposal">Proposals</option>
          </select>
        </Field>
        <Field label="Field type *">
          <select
            value={v.field_type}
            onChange={(e) => setV({ ...v, field_type: e.target.value as CustomFieldType })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Label *">
          <Input
            value={v.label}
            onChange={(x) => setV({ ...v, label: x, key: v.key || slugifyKey(x) })}
          />
        </Field>
        <Field label="Key (storage id)">
          <Input
            value={v.key}
            onChange={(x) => setV({ ...v, key: x })}
            placeholder={slugifyKey(v.label) || "auto_generated"}
          />
        </Field>
        <Field label="Help text" full>
          <Input
            value={v.help_text ?? ""}
            onChange={(x) => setV({ ...v, help_text: x })}
            placeholder="Shown under the field as a hint"
          />
        </Field>
        {v.field_type === "select" ? (
          <Field label="Options (one per line) *" full>
            <Textarea value={optionsText} onChange={setOptionsText} />
          </Field>
        ) : null}
        <Field label="Sort order">
          <Input
            type="number"
            value={String(v.sort_order)}
            onChange={(x) => setV({ ...v, sort_order: Number(x) || 0 })}
          />
        </Field>
        <Field label="Flags">
          <div className="flex flex-col gap-2 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={v.required}
                onChange={(e) => setV({ ...v, required: e.target.checked })}
              />
              Required
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={v.public_visible}
                onChange={(e) => setV({ ...v, public_visible: e.target.checked })}
              />
              Show on public site
            </label>
          </div>
        </Field>
      </div>
      <DrawerActions onClose={onClose} onSave={save} saving={saving} />
    </Drawer>
  );
}
