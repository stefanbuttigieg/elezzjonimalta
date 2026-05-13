import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, X } from "lucide-react";

export interface ProfessionBucket {
  slug: string;
  label_en: string;
  sort_order: number;
}
export interface ProfessionCode {
  code: string;
  title_en: string;
  bucket: string | null;
  major_group: string | null;
}

interface Props {
  code: string | null;
  bucket: string | null;
  freeText: string | null;
  onChange: (next: { code: string | null; bucket: string | null; freeText: string | null }) => void;
}

/**
 * Combobox for picking ISCO-08 profession code + auto-filled bucket (overridable).
 * Falls back to free-text "profession" when nothing matches.
 */
export function ProfessionPicker({ code, bucket, freeText, onChange }: Props) {
  const [buckets, setBuckets] = useState<ProfessionBucket[]>([]);
  const [codes, setCodes] = useState<ProfessionCode[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ data: b }, { data: c }] = await Promise.all([
        supabase.from("profession_buckets").select("slug,label_en,sort_order").order("sort_order"),
        supabase.from("profession_codes").select("code,title_en,bucket,major_group").eq("active", true).order("code"),
      ]);
      if (cancelled) return;
      setBuckets((b ?? []) as ProfessionBucket[]);
      setCodes((c ?? []) as ProfessionCode[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCode = useMemo(() => codes.find((c) => c.code === code) ?? null, [codes, code]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return codes.slice(0, 30);
    return codes
      .filter((c) => c.title_en.toLowerCase().includes(q) || c.code.includes(q))
      .slice(0, 50);
  }, [codes, query]);

  const pickCode = (c: ProfessionCode) => {
    onChange({ code: c.code, bucket: c.bucket ?? bucket, freeText });
    setOpen(false);
    setQuery("");
  };
  const clearCode = () => onChange({ code: null, bucket, freeText });

  return (
    <div className="space-y-2">
      {/* ISCO code field */}
      <div>
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          ISCO-08 occupation
        </div>
        {selectedCode ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <div className="min-w-0">
              <span className="font-mono text-xs text-muted-foreground">{selectedCode.code}</span>{" "}
              <span className="truncate">{selectedCode.title_en}</span>
            </div>
            <button
              type="button"
              onClick={clearCode}
              className="rounded p-1 text-muted-foreground hover:bg-background"
              aria-label="Clear ISCO code"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder="Search e.g. lawyer, doctor, engineer…"
                className="flex-1 bg-transparent outline-none"
              />
            </div>
            {open && filtered.length > 0 ? (
              <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
                {filtered.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickCode(c);
                    }}
                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                    <span className="flex-1">{c.title_en}</span>
                    {c.bucket ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {c.bucket}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Bucket override */}
      <div>
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Category bucket
        </div>
        <select
          value={bucket ?? ""}
          onChange={(e) => onChange({ code, bucket: e.target.value || null, freeText })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">— Auto from ISCO code —</option>
          {buckets.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.label_en}
            </option>
          ))}
        </select>
      </div>

      {/* Free-text fallback */}
      <div>
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Free-text label (display override)
        </div>
        <input
          value={freeText ?? ""}
          onChange={(e) => onChange({ code, bucket, freeText: e.target.value || null })}
          placeholder="e.g. Cardiologist, EU policy advisor, …"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}
