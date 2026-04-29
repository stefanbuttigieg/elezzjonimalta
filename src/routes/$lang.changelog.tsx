import { createFileRoute, Link } from "@tanstack/react-router";
import { useT } from "@/i18n/useT";
import type { Locale } from "@/i18n/types";

type ReleaseSection = {
  heading: string;
  items: string[];
};

type Release = {
  version: string;
  date: string;
  sections: ReleaseSection[];
};

const releasesByLocale: Record<Locale, Release[]> = {
  en: [
    {
      version: "Unreleased",
      date: "2026-04-29",
      sections: [
        {
          heading: "Added",
          items: [
            "New party: Imperium Europa, with candidate Eman Cross (sourced from MaltaToday).",
            "New party: Aħwa Maltin, led by Iris Vella, contesting all 13 districts in 2026.",
            "PN proposal: National Healthcare Park — rehabilitation, early intervention and post-hospital recovery.",
            "6 new PL proposals: transfer of social-security contributions between couples; +€50/week pension increase; free therapy for children; +28 days additional leave for new parents returning to work; 6 months of paid parental leave; \"Our Next Home\" first-time-buyer benefits for second-time families.",
            "\"Not contesting for 2026\" tag on candidate cards and sitting-MP listings, with a link to the source announcement.",
          ],
        },
        {
          heading: "Changed",
          items: [
            "Rebrand: \"Vot Malta\" renamed to \"Elezzjoni\" across the site (legal pages, navigation, dictionaries, admin, auth, candidate and district pages).",
          ],
        },
        {
          heading: "Notes",
          items: [
            "All new candidate and proposal records carry public source URLs so claims can be traced back to the originating article or party site.",
          ],
        },
      ],
    },
  ],
  mt: [
    {
      version: "Mhux rilaxxjat",
      date: "2026-04-29",
      sections: [
        {
          heading: "Miżjud",
          items: [
            "Partit ġdid: Imperium Europa, bil-kandidat Eman Cross (sors: MaltaToday).",
            "Partit ġdid: Aħwa Maltin, immexxi minn Iris Vella, se jikkontesta fit-13-il distrett għall-2026.",
            "Proposta tal-PN: Park Nazzjonali tas-Saħħa — riabilitazzjoni, intervent bikri u rkupru wara l-isptar.",
            "6 proposti ġodda tal-PL: trasferiment ta' kontribuzzjonijiet tas-sigurtà soċjali bejn il-koppji; żieda ta' €50 fil-ġimgħa fil-pensjoni; terapija b'xejn għat-tfal; 28 ġurnata leave addizzjonali għal ġenituri ġodda li jirritornaw għax-xogħol; 6 xhur leave tal-ġenituri mħallas; \"Id-Dar Li Jmiss Tagħna\" — benefiċċji ta' first-time buyer għal familji li jixtru t-tieni darba.",
            "Tag \"Mhux qed jikkontesta għall-2026\" fuq il-kards tal-kandidati u l-listi tal-membri parlamentari attwali, b'link għas-sors.",
          ],
        },
        {
          heading: "Mibdul",
          items: [
            "Bidla fl-isem: \"Vot Malta\" inbidel għal \"Elezzjoni\" fis-sit kollu (paġni legali, navigazzjoni, dizzjunarji, admin, awtentikazzjoni, paġni tal-kandidati u tad-distretti).",
          ],
        },
        {
          heading: "Noti",
          items: [
            "Ir-rekords kollha l-ġodda tal-kandidati u l-proposti għandhom URLs pubbliċi tas-sors biex il-klejms ikunu jistgħu jiġu traċċjati lura għall-artiklu jew sit tal-partit oriġinali.",
          ],
        },
      ],
    },
  ],
};

export const Route = createFileRoute("/$lang/changelog")({
  head: ({ params }) => {
    const isMt = params.lang === "mt";
    const title = isMt
      ? "Noti tar-Rilaxx — Elezzjoni"
      : "Release Notes — Elezzjoni";
    const description = isMt
      ? "Sommarju tal-aħħar bidliet u żidiet fuq Elezzjoni, b'link għaċ-changelog sħiħ."
      : "Summary of the latest changes and additions on Elezzjoni, with a link to the full changelog.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: ChangelogPage,
});

function ChangelogPage() {
  const t = useT();
  const { lang } = Route.useParams();
  const locale = (lang === "mt" ? "mt" : "en") as Locale;
  const releases = releasesByLocale[locale];

  const intro =
    locale === "mt"
      ? "Sommarju qasir tal-aħħar żidiet u korrezzjonijiet. Għall-istorja sħiħa ara s-CHANGELOG fir-repożitorju."
      : "A short summary of the latest additions and corrections. For the full history see the CHANGELOG in the repository.";

  const fullChangelogLabel =
    locale === "mt" ? "Ara CHANGELOG sħiħ" : "View full CHANGELOG";
  const backHomeLabel = locale === "mt" ? "Lura fil-home" : "Back to home";

  return (
    <section className="container mx-auto max-w-3xl px-4 py-16">
      <header className="text-center">
        <h1 className="font-serif text-3xl font-bold text-foreground md:text-4xl">
          {t("footer.changelog")}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {intro}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <a
            href="https://github.com/stefanbuttigieg/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            {fullChangelogLabel}
          </a>
          <Link
            to="/$lang"
            params={{ lang: locale }}
            className="inline-flex items-center rounded-md border border-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            ← {backHomeLabel}
          </Link>
        </div>
      </header>

      <div className="mt-12 space-y-10">
        {releases.map((release) => (
          <article
            key={release.version}
            className="rounded-xl border border-border bg-surface p-6 shadow-card"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
              <h2 className="font-serif text-2xl font-semibold text-foreground">
                {release.version}
              </h2>
              <time
                dateTime={release.date}
                className="text-sm text-muted-foreground"
              >
                {release.date}
              </time>
            </div>

            <div className="mt-5 space-y-5">
              {release.sections.map((section) => (
                <div key={section.heading}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {section.heading}
                  </h3>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground">
                    {section.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
