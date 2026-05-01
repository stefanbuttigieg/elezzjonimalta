import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Field, Input, Textarea } from "@/routes/admin.parties";
import { toast } from "sonner";

export type CustomFieldType = "text" | "textarea" | "number" | "boolean" | "date" | "url" | "select";

export interface CustomFieldDefinition {
  id: string;
  entity_type: "candidate" | "proposal";
  key: string;
  label: string;
  field_type: CustomFieldType;
  options: string[];
  help_text: string | null;
  required: boolean;
  public_visible: boolean;
  sort_order: number;
}

interface Props {
  entityType: "candidate" | "proposal";
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

export function CustomFieldsSection({ entityType, values, onChange }: Props) {
  const [defs, setDefs] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("custom_field_definitions")
        .select("*")
        .eq("entity_type", entityType)
        .order("sort_order")
        .order("label");
      if (error) {
        toast.error(error.message);
      } else {
        setDefs(
          (data ?? []).map((d) => ({
            ...d,
            options: Array.isArray(d.options) ? (d.options as string[]) : [],
          })) as CustomFieldDefinition[]
        );
      }
      setLoading(false);
    })();
  }, [entityType]);

  if (loading) return null;
  if (defs.length === 0) return null;

  const setVal = (key: string, val: unknown) => {
    const next = { ...(values || {}) };
    if (val === "" || val === null || val === undefined) {
      delete next[key];
    } else {
      next[key] = val;
    }
    onChange(next);
  };

  return (
    <div className="mt-6 rounded-lg border border-border bg-muted/20 p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Custom fields
      </h3>
      <div className="grid grid-cols-2 gap-4">
        {defs.map((d) => {
          const current = values?.[d.key];
          const label = d.required ? `${d.label} *` : d.label;
          const full = d.field_type === "textarea";
          return (
            <Field key={d.id} label={label} full={full}>
              {d.field_type === "text" || d.field_type === "url" ? (
                <Input
                  value={(current as string) ?? ""}
                  onChange={(x) => setVal(d.key, x)}
                />
              ) : d.field_type === "textarea" ? (
                <Textarea
                  value={(current as string) ?? ""}
                  onChange={(x) => setVal(d.key, x)}
                />
              ) : d.field_type === "number" ? (
                <Input
                  type="number"
                  value={current === undefined || current === null ? "" : String(current)}
                  onChange={(x) => setVal(d.key, x === "" ? null : Number(x))}
                />
              ) : d.field_type === "date" ? (
                <Input
                  type="date"
                  value={(current as string) ?? ""}
                  onChange={(x) => setVal(d.key, x)}
                />
              ) : d.field_type === "boolean" ? (
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(current)}
                    onChange={(e) => setVal(d.key, e.target.checked)}
                  />
                  <span className="text-muted-foreground">{d.help_text ?? "Yes"}</span>
                </label>
              ) : d.field_type === "select" ? (
                <select
                  value={(current as string) ?? ""}
                  onChange={(e) => setVal(d.key, e.target.value || null)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">— None —</option>
                  {d.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : null}
              {d.help_text && d.field_type !== "boolean" ? (
                <p className="mt-1 text-xs text-muted-foreground">{d.help_text}</p>
              ) : null}
            </Field>
          );
        })}
      </div>
    </div>
  );
}
