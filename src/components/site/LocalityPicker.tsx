import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MapPin, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n/useT";
import type { Locale } from "@/i18n/types";
import {
  buildLocalityIndex,
  searchLocalities,
  type DistrictLite,
  type LocalityEntry,
  type LocalityMatch,
} from "@/lib/localityIndex";
import { setPreferredDistrict } from "@/lib/preferredDistrict";

export function LocalityPicker({ lang }: { lang: Locale }) {
  const t = useT();
  const navigate = useNavigate();
  const inputId = useId();
  const listId = useId();

  const [districts, setDistricts] = useState<DistrictLite[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showAllChips, setShowAllChips] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Load districts client-side (cheap, ~13 rows). Avoids touching the
  // homepage SSR loader contract.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("districts")
        .select("id, number, name_en, name_mt, localities_en, localities_mt")
        .eq("status", "published")
        .order("number", { ascending: true });
      if (cancelled || error || !data) return;
      setDistricts(data as DistrictLite[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const index = useMemo(() => buildLocalityIndex(districts, lang), [districts, lang]);
  const results = useMemo(() => searchLocalities(index, query, 8), [index, query]);

  // Reset highlight when result list changes.
  useEffect(() => {
    setActiveIdx(0);
  }, [results.length]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const goToDistrict = (districtNumber: number, locality?: string) => {
    setPreferredDistrict({ number: districtNumber, locality });
    void navigate({
      to: "/$lang/my-district/$number",
      params: { lang, number: String(districtNumber) },
    });
  };

  const choose = (match: LocalityMatch) => {
    if (match.kind === "district") {
      goToDistrict(match.districtNumber);
    } else {
      goToDistrict(match.entry.districtNumber, match.entry.label);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[activeIdx]) {
        choose(results[activeIdx]);
      } else {
        // Fall back to district number typed directly.
        const n = Number(query.trim());
        if (Number.isInteger(n) && n >= 1 && n <= 13) goToDistrict(n);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const districtNumbers = useMemo(() => {
    const set = new Set<number>();
    for (const d of districts) set.add(d.number);
    return Array.from(set).sort((a, b) => a - b);
  }, [districts]);

  return (
    <div ref={containerRef} className="relative">
      <label
        htmlFor={inputId}
        className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        {t("home.locality.label")}
      </label>

      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-owns={listId}
        aria-controls={listId}
        className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 shadow-card focus-within:ring-2 focus-within:ring-primary"
      >
        <MapPin className="h-5 w-5 text-primary" />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t("home.locality.placeholder")}
          aria-autocomplete="list"
          aria-activedescendant={
            open && results[activeIdx] ? `${listId}-opt-${activeIdx}` : undefined
          }
          className="flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-lg"
        />
        <button
          type="button"
          onClick={() => {
            if (results[0]) choose(results[0]);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          disabled={results.length === 0 && query.trim().length === 0}
        >
          <Search className="h-4 w-4" />
          {t("home.locality.go")}
        </button>
      </div>

      {open && results.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-2 max-h-80 w-full overflow-auto rounded-xl border border-border bg-surface p-1 shadow-elevated"
        >
          {results.map((match, idx) => {
            const isActive = idx === activeIdx;
            const id = `${listId}-opt-${idx}`;
            const primary =
              match.kind === "district"
                ? t("home.locality.optionDistrict", {
                    number: match.districtNumber,
                    name: match.districtName,
                  })
                : match.entry.label;
            const secondary =
              match.kind === "district"
                ? t("home.locality.optionDistrictHint")
                : t("home.locality.optionLocalityHint", {
                    number: match.entry.districtNumber,
                    name: match.entry.districtName,
                  });
            return (
              <li
                key={id}
                id={id}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(match);
                }}
                className={
                  "flex cursor-pointer items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm " +
                  (isActive ? "bg-accent text-accent-foreground" : "text-foreground")
                }
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">{primary}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{secondary}</div>
                </div>
                <span className="ml-2 inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                  {match.kind === "district" ? match.districtNumber : match.entry.districtNumber}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("home.locality.quickPick")}
        </span>
        {(showAllChips ? districtNumbers : districtNumbers.slice(0, 8)).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => goToDistrict(n)}
            className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded-full border border-border bg-background px-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            {n}
          </button>
        ))}
        {!showAllChips && districtNumbers.length > 8 ? (
          <button
            type="button"
            onClick={() => setShowAllChips(true)}
            className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("home.locality.showAll")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
