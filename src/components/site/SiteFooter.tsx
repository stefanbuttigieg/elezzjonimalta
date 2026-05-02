import { Link, useParams } from "@tanstack/react-router";
import { useT } from "@/i18n/useT";
import { isLocale, type Locale } from "@/i18n/types";

export function SiteFooter() {
  const t = useT();
  const params = useParams({ strict: false }) as { lang?: string };
  const lang: Locale = isLocale(params.lang) ? params.lang : "en";

  const legal = [
    { to: `/${lang}/terms`, label: t("footer.terms") },
    { to: `/${lang}/privacy`, label: t("footer.privacy") },
    { to: `/${lang}/cookies`, label: t("footer.cookies") },
    { to: `/${lang}/accessibility`, label: t("footer.accessibility") },
  ];
  const explore = [
    { to: `/${lang}/districts`, label: t("nav.districts") },
    { to: `/${lang}/parties`, label: t("nav.parties") },
    { to: `/${lang}/sitting-mps`, label: t("nav.sittingMps") },
    { to: `/${lang}/compare`, label: t("nav.compare") },
    { to: `/${lang}/resources`, label: t("nav.resources") },
    { to: `/${lang}/ask`, label: t("nav.askAi") },
  ];
  const project = [
    { to: `/${lang}/about`, label: t("footer.about") },
    { to: `/${lang}/contact`, label: t("footer.contact") },
    { to: `/${lang}/developers`, label: t("footer.developers") },
    { to: `/${lang}/changelog`, label: t("footer.changelog") },
  ];

  return (
    <footer className="mt-24 border-t border-border bg-surface">
      <div className="container mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <Link
              to="/$lang"
              params={{ lang }}
              className="font-serif text-lg font-bold text-foreground"
            >
              Elezzjoni
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("footer.disclaimer")}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t("footer.sources")}
            </p>
            <a
              href="https://t.me/elezzjonibot"
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="currentColor"
              >
                <path d="M9.78 15.27 9.6 19a.6.6 0 0 0 1.02.43l2.18-2.09 4.52 3.32c.83.46 1.43.22 1.65-.77l2.99-14.04c.29-1.27-.46-1.77-1.27-1.47L2.4 10.42c-1.24.5-1.22 1.21-.21 1.53l4.74 1.48L17.92 6.7c.52-.31.99-.14.6.18z" />
              </svg>
              {t("footer.telegram")}
            </a>
          </div>
          <FooterColumn title={t("nav.menu")} items={explore} />
          <FooterColumn title={t("nav.about")} items={project} />
          <FooterColumn title={t("footer.legal")} items={legal} />
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>{t("footer.rights", { year: new Date().getFullYear() })}</p>
          <p>
            {t("footer.lastUpdated")}: {new Date().toISOString().slice(0, 10)}
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  items,
}: {
  title: string;
  items: { to: string; label: string }[];
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
