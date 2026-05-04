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
      date: "2026-05-04",
      sections: [
        {
          heading: "Added",
          items: [
            "Admin proposals: multi-select with per-row checkboxes and a bulk action bar for one-click status changes (Draft / Pending review / Published / Archived) and bulk delete.",
            "Telegram bot: candidate and district replies now include direct links back to the matching pages on the site, and the site footer links to the bot at t.me/elezzjonibot.",
            "AI Assistant: authoritative facts (party leaders, deputy leaders, election date) are now built live from the database and injected on every chat request, so leadership questions can no longer fall back to outdated training data — including via the Telegram /ask command.",
            "AI Assistant: district intent boost — queries mentioning a district (e.g. \"district 12\") now trigger a direct database lookup for the 2026 cycle and inject the structured candidate list into the chat context.",
          ],
        },
        {
          heading: "Fixed",
          items: [
            "Telegram bot: /district 12 returned a different candidate set than the /my-district/12 page on the site. The bot now applies the same filtering as the site (sitting MPs included, unconfirmed incumbents hidden, published status required for new candidates).",
          ],
        },
      ],
    },
    {
      version: "2026-05-01",
      date: "2026-05-01",
      sections: [
        {
          heading: "Added",
          items: [
            "Proposals: AI-generated bilingual translation — one-click EN/MT fill-in from the proposal editor, plus an \"Auto-translate missing\" bulk action in the admin list.",
            "Proposals: multiple categories per proposal, with AI-generated category suggestions in the editor.",
            "Manifesto Import: split-pane PDF preview in the Review step, jumping to the source page for the selected row with the AI's verbatim quote shown above the PDF.",
            "Candidate photo finder: bulk \"Find missing photos\" action and per-row \"Find photo\" button using Firecrawl + Gemini against trusted sources, with social-CDN URLs filtered out.",
            "News Monitor → Convert to Action: AI auto-fill button that re-scrapes the source article and pre-populates the target form (candidate, party, or proposal), and support for creating multiple proposals from a single article in one batch save.",
            "AI Assistant admin (/admin/assistant) workspace to configure data sources, reindex on demand, edit the system prompt and model, and review reindex runs.",
            "Paste-a-URL news scan in /admin/news using the same Firecrawl + AI pipeline as the scheduled scans.",
            "Voting eligibility CTA on the landing page linking to the official Electoral Commission register.",
            "Dynamic stats strip on the landing page with live counts and a days-to-election countdown.",
            "District candidate counts on the landing-page interactive map.",
          ],
        },
        {
          heading: "Changed",
          items: [
            "Voting FAQs: English translation is now on-demand — Maltese-only rows are saved as-is and staff can trigger an AI Translate per row.",
            "AI Assistant retrieval switched from vector embeddings to Postgres full-text search (ts_rank over a generated tsvector with GIN index), removing \"invalid model\" reindex errors.",
            "Admin candidates status column now shows \"Sitting MP · not contesting 2026\" for sitting MPs flagged as not contesting the 2026 election.",
          ],
        },
        {
          heading: "Fixed",
          items: [
            "Disclaimers admin: resolved a \"No QueryClient set\" runtime error when opening the disclaimers workspace.",
          ],
        },
      ],
    },
    {
      version: "2026-04-29",
      date: "2026-04-29",
      sections: [
        {
          heading: "Added",
          items: [
            "Admin News monitor — automated scanner across Times of Malta, Malta Independent, MaltaToday, Lovin Malta, and Newsbook (4× daily plus on-demand) using Lovable AI to detect proposals, candidates, and key developments.",
            "Convert findings into actions: one-click create/update of a candidate, new proposal, or new party from a news finding, auto-linking the source URL.",
            "Admin audit log — every staff action on candidates, proposals, parties, and news findings is recorded at /admin/audit.",
            "Global command palette (⌘K / Ctrl+K) covering candidates, parties, proposals, and districts, with arrow-key navigation and a \"See all results\" fallback.",
            "Global search reachable from every viewport, including a header search button on small/medium screens and a Search entry in the mobile menu.",
            "District results in global search and on the /search page (with a Districts filter tab).",
            "Keyboard shortcuts (press ? to view): /, h, c, d, p, r, m, x, a, l, Esc.",
            "New party: Imperium Europa with candidate Eman Cross.",
            "New party: Aħwa Maltin, led by Iris Vella, contesting all 13 districts in 2026.",
            "PN proposal: National Healthcare Park.",
            "6 new PL proposals (social-security transfer between couples, +€50/week pensions, free child therapy, +28 days parental leave, 6 months paid parental leave, \"Our Next Home\" benefits).",
            "\"Not contesting for 2026\" tag on candidate cards and sitting-MP listings.",
          ],
        },
        {
          heading: "Changed",
          items: [
            "Rebrand: \"Vot Malta\" renamed to \"Elezzjoni\" across the site (legal pages, navigation, dictionaries, admin, auth, candidate and district pages).",
          ],
        },
      ],
    },
  ],
  mt: [
    {
      version: "Mhux rilaxxjat",
      date: "2026-05-04",
      sections: [
        {
          heading: "Miżjud",
          items: [
            "Admin proposti: għażla multipla b'checkboxes f'kull ringiela u bar ta' azzjonijiet bulk biex tibdel l-istatus (Draft / Pending review / Published / Archived) jew tħassar bosta proposti b'click wieħed.",
            "Telegram bot: ir-risposti tal-kandidati u tad-distretti issa jinkludu links diretti lura għall-paġni fuq is-sit, u l-footer issa jorbot mal-bot fuq t.me/elezzjonibot.",
            "Assistent AI: il-fatti awtorevoli (mexxejja tal-partiti, deputy leaders, data tal-elezzjoni) issa jinġabru mid-database f'kull talba u jiġu injettati bħala system message ta' prijorità għolja, anke fil-kmand /ask tat-Telegram.",
            "Assistent AI: boost ta' intent għad-distretti — mistoqsijiet li jsemmu distrett (eż. \"distrett 12\") issa jiskattaw lookup dirett fid-database għaċ-ċiklu 2026 u jinjettaw il-lista tal-kandidati fil-kuntest.",
          ],
        },
        {
          heading: "Iffissat",
          items: [
            "Telegram bot: /district 12 kien qed jirritorna sett ta' kandidati differenti minn dak fuq /my-district/12. Il-bot issa juża l-istess filtri tas-sit.",
          ],
        },
      ],
    },
    {
      version: "2026-05-01",
      date: "2026-05-01",
      sections: [
        {
          heading: "Miżjud",
          items: [
            "Proposti: traduzzjoni bilingwi ġġenerata mill-AI — fill-in EN/MT b'click wieħed mill-edituri, b'azzjoni bulk \"Auto-translate missing\" fil-lista admin.",
            "Proposti: kategoriji multipli għal kull proposta, b'suġġerimenti tal-kategoriji ġġenerati mill-AI.",
            "Importazzjoni manifest: preview tal-PDF fil-Review step, b'qabża għall-paġna tas-sors u l-kwotazzjoni verbatim tal-AI murija ħdejha.",
            "Sejjieb tar-ritratti tal-kandidati: azzjoni bulk \"Find missing photos\" u buttuna per ringiela b'Firecrawl + Gemini fuq sorsi fdati.",
            "News Monitor → Convert to Action: buttuna AI auto-fill u sapport għal proposti multipli minn artiklu wieħed f'salvataġġ batch wieħed.",
            "Workspace AI Assistant admin (/admin/assistant) biex jiġu kkonfigurati s-sorsi, jerġa' jsir l-indiċjar, u jiġu editjati l-prompt u l-mudell.",
            "Paste-a-URL news scan f'/admin/news bl-istess pipeline tal-iscans skedati.",
            "CTA dwar l-eliġibbiltà tal-vot fuq il-landing page b'link għar-reġistru tal-Kummissjoni Elettorali.",
            "Strixxa ta' statistika dinamika fuq il-landing page b'għadd live u countdown sal-elezzjoni.",
            "Għadd tal-kandidati per distrett fuq il-mappa interattiva tal-landing page.",
          ],
        },
        {
          heading: "Mibdul",
          items: [
            "Voting FAQs: it-traduzzjoni għall-Ingliż saret on-demand — entrati bil-Malti biss jinżammu kif inhuma u staff jistgħu jagħfsu Translate per ringiela.",
            "Retrieval tal-AI Assistant inbidel minn vector embeddings għal Postgres full-text search (ts_rank fuq tsvector ġenerat b'indiċi GIN).",
            "Status tal-kandidati admin issa juri \"Sitting MP · not contesting 2026\" għall-membri attwali mmarkati li mhumiex se jikkontestaw.",
          ],
        },
        {
          heading: "Iffissat",
          items: [
            "Admin tad-Disclaimers: solvejna żball runtime \"No QueryClient set\" meta jinfetaħ il-workspace.",
          ],
        },
      ],
    },
    {
      version: "2026-04-29",
      date: "2026-04-29",
      sections: [
        {
          heading: "Miżjud",
          items: [
            "News monitor admin — scanner awtomatiku fuq Times of Malta, Malta Independent, MaltaToday, Lovin Malta, u Newsbook (4 darbiet kuljum plus on-demand) bl-AI biex jidentifika proposti, kandidati, u żviluppi ewlenin.",
            "Konverżjoni ta' findings f'azzjonijiet b'click wieħed: kandidat ġdid jew aġġornat, proposta ġdida, jew partit ġdid, b'awto-link tas-sors.",
            "Admin audit log f'/admin/audit — kull azzjoni tal-istaff fuq il-kandidati, proposti, partiti, u findings tinżamm.",
            "Command palette globali (⌘K / Ctrl+K) li tkopri kandidati, partiti, proposti u distretti.",
            "Tiftix globali aċċessibbli f'kull viewport, inkluż buttuna fil-header għall-iskrins żgħar/medji.",
            "Riżultati ta' distretti fit-tiftix globali u fuq il-paġna /search.",
            "Shortcuts tal-keyboard (agħfas ?): /, h, c, d, p, r, m, x, a, l, Esc.",
            "Partit ġdid: Imperium Europa, bil-kandidat Eman Cross.",
            "Partit ġdid: Aħwa Maltin, immexxi minn Iris Vella, se jikkontesta fit-13-il distrett għall-2026.",
            "Proposta tal-PN: Park Nazzjonali tas-Saħħa.",
            "6 proposti ġodda tal-PL.",
            "Tag \"Mhux qed jikkontesta għall-2026\" fuq il-kards tal-kandidati u l-listi tal-membri parlamentari attwali.",
          ],
        },
        {
          heading: "Mibdul",
          items: [
            "Bidla fl-isem: \"Vot Malta\" inbidel għal \"Elezzjoni\" fis-sit kollu.",
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
