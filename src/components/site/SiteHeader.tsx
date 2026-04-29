import { Link, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Menu, X, ShieldCheck, Search, MapPin } from "lucide-react";
import { getPreferredDistrict, type PreferredDistrict } from "@/lib/preferredDistrict";
import { useT } from "@/i18n/useT";
import { isLocale, LOCALES, type Locale } from "@/i18n/types";
import { useAuth } from "@/lib/auth";

function buildSwitchPath(currentPath: string, currentLang: Locale, nextLang: Locale): string {
  // Replace the first /xx segment with the new locale.
  if (currentPath === `/${currentLang}` || currentPath === "/") return `/${nextLang}`;
  return currentPath.replace(new RegExp(`^/${currentLang}(?=/|$)`), `/${nextLang}`);
}

export function SiteHeader() {
  const t = useT();
  const params = useParams({ strict: false }) as { lang?: string };
  const lang: Locale = isLocale(params.lang) ? params.lang : "en";
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { isStaff } = useAuth();

  const navItems = [
    { to: `/${lang}/candidates`, label: t("nav.candidates") },
    { to: `/${lang}/districts`, label: t("nav.districts") },
    { to: `/${lang}/parties`, label: t("nav.parties") },
    { to: `/${lang}/proposals`, label: t("nav.proposals") },
    { to: `/${lang}/sitting-mps`, label: t("nav.sittingMps") },
    { to: `/${lang}/compare`, label: t("nav.compare") },
    { to: `/${lang}/resources`, label: t("nav.resources") },
    { to: `/${lang}/ask`, label: t("nav.askAi") },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {t("common.skipToContent")}
      </a>
      <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          to="/$lang"
          params={{ lang }}
          className="flex items-baseline gap-2 font-serif text-xl font-bold tracking-tight text-foreground"
        >
          <span>Vot Malta</span>
          <span className="text-base font-medium text-muted-foreground">2026</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
              activeProps={{ className: "bg-accent text-foreground" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <HeaderSearch lang={lang} />
          {isStaff ? (
            <Link
              to="/admin"
              className="hidden items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-accent md:inline-flex"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin
            </Link>
          ) : null}
          <LanguageToggle currentLang={lang} currentPath={location.pathname} />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border md:hidden"
            aria-label={open ? t("nav.close") : t("nav.menu")}
            aria-expanded={open}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border bg-background md:hidden">
          <nav
            className="container mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3"
            aria-label="Mobile"
          >
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground"
                activeProps={{ className: "bg-accent text-foreground" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function LanguageToggle({
  currentLang,
  currentPath,
}: {
  currentLang: Locale;
  currentPath: string;
}) {
  const t = useT();
  return (
    <div
      className="inline-flex items-center rounded-md border border-border bg-surface p-0.5 text-xs font-semibold"
      role="group"
      aria-label={t("lang.toggle")}
    >
      {LOCALES.map((loc) => {
        const target = buildSwitchPath(currentPath, currentLang, loc);
        const active = loc === currentLang;
        return (
          <a
            key={loc}
            href={target}
            aria-current={active ? "page" : undefined}
            aria-label={t("lang.switchTo", { lang: t(`lang.${loc}`) })}
            className={
              "rounded-[4px] px-2.5 py-1 transition-colors " +
              (active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {loc.toUpperCase()}
          </a>
        );
      })}
    </div>
  );
}

function HeaderSearch({ lang }: { lang: Locale }) {
  const t = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (trimmed.length < 1) return;
    void navigate({
      to: "/$lang/search",
      params: { lang },
      search: { q: trimmed, type: "all" },
    });
  };

  return (
    <form
      onSubmit={submit}
      role="search"
      aria-label={t("nav.search")}
      className="hidden items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground focus-within:ring-2 focus-within:ring-primary md:inline-flex"
    >
      <Search className="h-3.5 w-3.5 text-muted-foreground" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("search.headerPlaceholder")}
        aria-label={t("nav.search")}
        className="w-36 bg-transparent text-xs outline-none placeholder:text-muted-foreground lg:w-48"
      />
    </form>
  );
}

