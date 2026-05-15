import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Locale } from "./types";

export type TranslationOverrideRow = {
  id: string;
  lang: Locale;
  key: string;
  value: string;
  notes: string | null;
  updated_at: string;
};

// Module-level store so translate() (a plain function) can read overrides
// without React context. UI subscribes via useSyncExternalStore for reactivity.
const store: Record<Locale, Map<string, string>> = {
  en: new Map(),
  mt: new Map(),
};
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function getOverride(locale: Locale, key: string): string | undefined {
  return store[locale]?.get(key);
}

export function setOverrides(rows: TranslationOverrideRow[]) {
  store.en = new Map();
  store.mt = new Map();
  for (const r of rows) {
    if (r.lang === "en" || r.lang === "mt") {
      store[r.lang].set(r.key, r.value);
    }
  }
  emit();
}

export function subscribeOverrides(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getOverridesVersion() {
  return version;
}

/** Used inside useT to re-render components when overrides change. */
export function useOverridesVersion() {
  return useSyncExternalStore(
    subscribeOverrides,
    getOverridesVersion,
    () => 0,
  );
}

/** Mount once near the root to load overrides into the module store. */
export function TranslationOverridesLoader() {
  const { data } = useQuery({
    queryKey: ["translation_overrides"],
    queryFn: async (): Promise<TranslationOverrideRow[]> => {
      const { data, error } = await supabase
        .from("translation_overrides")
        .select("*");
      if (error) throw error;
      return (data ?? []) as TranslationOverrideRow[];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (data) setOverrides(data);
  }, [data]);

  return null;
}
