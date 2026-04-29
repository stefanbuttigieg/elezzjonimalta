import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useT } from "@/i18n/useT";
import { isLocale, type Locale } from "@/i18n/types";
import { Keyboard, X } from "lucide-react";

type ShortcutDef = {
  keys: string[];
  labelKey: string;
  fallback: string;
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function KeyboardShortcuts({ lang }: { lang: Locale }) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);

  const go = useCallback(
    (path: string) => {
      void navigate({ to: path });
    },
    [navigate],
  );

  const focusSearch = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>(
      'form[role="search"] input[type="search"]',
    );
    if (input) {
      input.focus();
      input.select();
    } else {
      void navigate({ to: "/$lang/search", params: { lang }, search: { q: "", type: "all" } });
    }
  }, [lang, navigate]);

  const toggleLang = useCallback(() => {
    const next: Locale = lang === "en" ? "mt" : "en";
    const path = location.pathname;
    const newPath =
      path === `/${lang}` || path === "/"
        ? `/${next}`
        : path.replace(new RegExp(`^/${lang}(?=/|$)`), `/${next}`);
    window.location.href = newPath;
  }, [lang, location.pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) {
        // Allow Escape to close help even when typing
        if (e.key === "Escape" && helpOpen) {
          e.preventDefault();
          setHelpOpen(false);
        }
        return;
      }

      // Single-key shortcuts
      switch (e.key) {
        case "?":
          e.preventDefault();
          setHelpOpen((v) => !v);
          return;
        case "Escape":
          if (helpOpen) {
            e.preventDefault();
            setHelpOpen(false);
          }
          return;
        case "/":
          e.preventDefault();
          focusSearch();
          return;
        case "h":
          e.preventDefault();
          go(`/${lang}`);
          return;
        case "c":
          e.preventDefault();
          go(`/${lang}/candidates`);
          return;
        case "d":
          e.preventDefault();
          go(`/${lang}/districts`);
          return;
        case "p":
          e.preventDefault();
          go(`/${lang}/parties`);
          return;
        case "r":
          e.preventDefault();
          go(`/${lang}/proposals`);
          return;
        case "m":
          e.preventDefault();
          go(`/${lang}/sitting-mps`);
          return;
        case "x":
          e.preventDefault();
          go(`/${lang}/compare`);
          return;
        case "a":
          e.preventDefault();
          go(`/${lang}/ask`);
          return;
        case "l":
          e.preventDefault();
          toggleLang();
          return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusSearch, go, helpOpen, lang, toggleLang]);

  const shortcuts: ShortcutDef[] = [
    { keys: ["?"], labelKey: "shortcuts.help", fallback: "Show keyboard shortcuts" },
    { keys: ["⌘", "K"], labelKey: "shortcuts.commandPalette", fallback: "Open command palette (global search)" },
    { keys: ["/"], labelKey: "shortcuts.search", fallback: "Focus search" },
    { keys: ["h"], labelKey: "shortcuts.home", fallback: "Go to home" },
    { keys: ["c"], labelKey: "shortcuts.candidates", fallback: "Go to candidates" },
    { keys: ["d"], labelKey: "shortcuts.districts", fallback: "Go to districts" },
    { keys: ["p"], labelKey: "shortcuts.parties", fallback: "Go to parties" },
    { keys: ["r"], labelKey: "shortcuts.proposals", fallback: "Go to proposals" },
    { keys: ["m"], labelKey: "shortcuts.sittingMps", fallback: "Go to sitting MPs" },
    { keys: ["x"], labelKey: "shortcuts.compare", fallback: "Go to compare" },
    { keys: ["a"], labelKey: "shortcuts.ask", fallback: "Go to Ask AI" },
    { keys: ["l"], labelKey: "shortcuts.language", fallback: "Toggle language" },
    { keys: ["Esc"], labelKey: "shortcuts.close", fallback: "Close dialog" },
  ];

  if (!helpOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kbd-shortcuts-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur"
      onClick={() => setHelpOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="kbd-shortcuts-title" className="flex items-center gap-2 text-base font-semibold">
            <Keyboard className="h-4 w-4" aria-hidden="true" />
            {t("shortcuts.title") || "Keyboard shortcuts"}
          </h2>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            aria-label={t("nav.close") || "Close"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="space-y-2">
          {shortcuts.map((s) => {
            const label = t(s.labelKey);
            return (
              <li key={s.keys.join("+")} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground/80">{label && label !== s.labelKey ? label : s.fallback}</span>
                <span className="flex gap-1">
                  {s.keys.map((k) => (
                    <kbd
                      key={k}
                      className="inline-flex min-w-[1.75rem] items-center justify-center rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-xs"
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          {t("shortcuts.hint") !== "shortcuts.hint"
            ? t("shortcuts.hint")
            : "Shortcuts are disabled while typing in a field."}
        </p>
      </div>
    </div>
  );
}
