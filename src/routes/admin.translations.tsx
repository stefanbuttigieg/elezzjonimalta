import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dictionaries } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Search, RotateCcw, Languages } from "lucide-react";

export const Route = createFileRoute("/admin/translations")({
  head: () => ({
    meta: [
      { title: "Translations — Elezzjoni Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminTranslationsPage,
});

type OverrideRow = {
  id: string;
  lang: Locale;
  key: string;
  value: string;
  notes: string | null;
  updated_at: string;
};

type Editing = {
  key: string;
  en: string;
  mt: string;
  notes: string;
};

const LANGS: Locale[] = ["en", "mt"];

function groupOf(key: string): string {
  const dot = key.indexOf(".");
  return dot === -1 ? "(other)" : key.slice(0, dot);
}

function useOverrides() {
  return useQuery({
    queryKey: ["translation_overrides", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("translation_overrides")
        .select("*")
        .order("key");
      if (error) throw error;
      return (data ?? []) as OverrideRow[];
    },
  });
}

function AdminTranslationsPage() {
  const qc = useQueryClient();
  const { data: overrides, isLoading } = useOverrides();
  const [filter, setFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [showOnly, setShowOnly] = useState<"all" | "overridden" | "missing-mt">("all");
  const [editing, setEditing] = useState<Editing | null>(null);

  const overridesByKey = useMemo(() => {
    const map = new Map<string, { en?: OverrideRow; mt?: OverrideRow }>();
    for (const r of overrides ?? []) {
      const cur = map.get(r.key) ?? {};
      cur[r.lang] = r;
      map.set(r.key, cur);
    }
    return map;
  }, [overrides]);

  const allKeys = useMemo(() => Object.keys(dictionaries.en).sort(), []);
  const groups = useMemo(() => {
    const set = new Set<string>(allKeys.map(groupOf));
    return ["all", ...Array.from(set).sort()];
  }, [allKeys]);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return allKeys.filter((key) => {
      if (groupFilter !== "all" && groupOf(key) !== groupFilter) return false;
      const en = dictionaries.en[key] ?? "";
      const mt = dictionaries.mt[key] ?? "";
      const ov = overridesByKey.get(key);
      if (term) {
        const hay = `${key} ${en} ${mt} ${ov?.en?.value ?? ""} ${ov?.mt?.value ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (showOnly === "overridden" && !ov) return false;
      if (showOnly === "missing-mt" && mt && mt !== en) return false;
      return true;
    });
  }, [allKeys, filter, groupFilter, showOnly, overridesByKey]);

  const upsert = useMutation({
    mutationFn: async (input: Editing) => {
      const baseEn = dictionaries.en[input.key] ?? "";
      const baseMt = dictionaries.mt[input.key] ?? "";
      const ops: Array<Promise<unknown>> = [];

      // EN
      if (input.en.trim() && input.en !== baseEn) {
        ops.push(
          supabase
            .from("translation_overrides")
            .upsert(
              {
                lang: "en",
                key: input.key,
                value: input.en,
                notes: input.notes || null,
              },
              { onConflict: "lang,key" },
            )
            .then(({ error }) => { if (error) throw error; }),
        );
      } else {
        ops.push(
          supabase
            .from("translation_overrides")
            .delete()
            .eq("lang", "en")
            .eq("key", input.key)
            .then(({ error }) => { if (error) throw error; }),
        );
      }
      // MT
      if (input.mt.trim() && input.mt !== baseMt) {
        ops.push(
          supabase
            .from("translation_overrides")
            .upsert(
              {
                lang: "mt",
                key: input.key,
                value: input.mt,
                notes: input.notes || null,
              },
              { onConflict: "lang,key" },
            )
            .then(({ error }) => { if (error) throw error; }),
        );
      } else {
        ops.push(
          supabase
            .from("translation_overrides")
            .delete()
            .eq("lang", "mt")
            .eq("key", input.key)
            .then(({ error }) => { if (error) throw error; }),
        );
      }
      await Promise.all(ops);
    },
    onSuccess: () => {
      toast.success("Translation saved");
      qc.invalidateQueries({ queryKey: ["translation_overrides"] });
      setEditing(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });

  const reset = useMutation({
    mutationFn: async (key: string) => {
      const { error } = await supabase
        .from("translation_overrides")
        .delete()
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reverted to default");
      qc.invalidateQueries({ queryKey: ["translation_overrides"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Reset failed"),
  });

  const stats = useMemo(() => {
    const overriddenKeys = new Set((overrides ?? []).map((r) => r.key));
    return {
      total: allKeys.length,
      overridden: overriddenKeys.size,
      mtMissing: allKeys.filter(
        (k) => !dictionaries.mt[k] || dictionaries.mt[k] === dictionaries.en[k],
      ).length,
    };
  }, [overrides, allKeys]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Translations</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Override the English or Maltese copy used across the public site. Overrides take effect
            immediately — leave a field blank (or matching the default) to revert.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total keys" value={String(stats.total)} />
        <Stat label="Overridden" value={String(stats.overridden)} />
        <Stat label="Missing Maltese" value={String(stats.mtMissing)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search key or text…"
            className="w-72 pl-8"
          />
        </div>
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {groups.map((g) => (
              <SelectItem key={g} value={g}>
                {g === "all" ? "All sections" : g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={showOnly} onValueChange={(v) => setShowOnly(v as typeof showOnly)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All keys</SelectItem>
            <SelectItem value="overridden">Has override</SelectItem>
            <SelectItem value="missing-mt">Missing Maltese</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{visible.length} keys</span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-2">
          {visible.map((key) => {
            const en = dictionaries.en[key] ?? "";
            const mt = dictionaries.mt[key] ?? "";
            const ov = overridesByKey.get(key);
            const enEffective = ov?.en?.value ?? en;
            const mtEffective = ov?.mt?.value ?? mt;
            return (
              <Card key={key}>
                <CardContent className="p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{key}</code>
                      <Badge variant="outline" className="text-[10px]">{groupOf(key)}</Badge>
                      {ov && (
                        <Badge className="text-[10px]">
                          overridden {[ov.en && "EN", ov.mt && "MT"].filter(Boolean).join("+")}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          setEditing({
                            key,
                            en: enEffective,
                            mt: mtEffective,
                            notes: ov?.en?.notes ?? ov?.mt?.notes ?? "",
                          })
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {ov && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          title="Reset to default"
                          onClick={() => {
                            if (confirm("Revert this key to its default translations?"))
                              reset.mutate(key);
                          }}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {LANGS.map((lang) => {
                      const base = lang === "en" ? en : mt;
                      const eff = lang === "en" ? enEffective : mtEffective;
                      const isOver = ov?.[lang];
                      return (
                        <div
                          key={lang}
                          className="rounded border border-border bg-background p-2 text-sm"
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px]">{lang.toUpperCase()}</Badge>
                            {isOver && (
                              <Badge variant="outline" className="text-[10px]">override</Badge>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap text-foreground">{eff}</p>
                          {isOver && base !== eff && (
                            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground line-through">
                              {base}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {visible.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No keys match.</p>
          )}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Languages className="h-4 w-4" />
              Edit translation
            </DialogTitle>
            <DialogDescription>
              <code className="text-xs">{editing?.key}</code> — leave a field matching the default
              (or empty) to revert it.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>English</Label>
                <Textarea
                  value={editing.en}
                  onChange={(e) => setEditing({ ...editing, en: e.target.value })}
                  rows={3}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Default: <span className="italic">{dictionaries.en[editing.key]}</span>
                </p>
              </div>
              <div>
                <Label>Malti</Label>
                <Textarea
                  value={editing.mt}
                  onChange={(e) => setEditing({ ...editing, mt: e.target.value })}
                  rows={3}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Default: <span className="italic">{dictionaries.mt[editing.key]}</span>
                </p>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  value={editing.notes}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  rows={2}
                  placeholder="Why this override exists, source, follow-ups…"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editing && upsert.mutate(editing)} disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
