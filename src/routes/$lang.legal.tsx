import { createFileRoute } from "@tanstack/react-router";
import { useT, translate } from "@/i18n/useT";
import { isLocale, type Locale } from "@/i18n/types";
import type { ReactNode } from "react";

type LegalPage = "terms" | "privacy" | "cookies" | "accessibility" | "about" | "contact";

const LAST_UPDATED = "2026-04-28";

const CONTENT: Record<LegalPage, Record<Locale, { title: string; body: ReactNode }>> = {
  terms: {
    en: {
      title: "Terms of Use",
      body: (
        <>
          <p>
            Vot Malta 2026 is an independent, non-partisan information service. By accessing this site
            or its API you agree to use the data for lawful informational, journalistic, civic, or
            research purposes, and to attribute Vot Malta 2026 as the source where applicable.
          </p>
          <h2>Editorial nature</h2>
          <p>
            We aggregate publicly available information about candidates and parties. We do not
            endorse any candidate or party. We make reasonable efforts to verify information against
            primary sources, but we make no warranty of accuracy, completeness, or fitness for any
            purpose. Always check with the Electoral Commission of Malta for official information.
          </p>
          <h2>Acceptable use</h2>
          <p>
            You may not use the site or API to harass individuals, to misrepresent the data, to
            generate misleading political content, or in any way that violates Maltese or EU law.
            Automated access to the public site (scraping) without using the documented API is not
            permitted.
          </p>
          <h2>Liability</h2>
          <p>
            The service is provided "as is". To the maximum extent permitted by law, the operators
            disclaim liability for any loss arising from use of the site or its data.
          </p>
          <h2>Changes</h2>
          <p>We may update these terms; the latest version is always published on this page.</p>
        </>
      ),
    },
    mt: {
      title: "Termini tal-Użu",
      body: (
        <>
          <p>
            Vot Malta 2026 hu servizz ta' informazzjoni indipendenti u imparzjali. Billi taċċessa dan
            is-sit jew l-API tiegħu int taqbel li tuża d-data għal skopijiet legali ta' informazzjoni,
            ġurnaliżmu, ċiviċi, jew riċerka, u li tagħti attribuzzjoni lil Vot Malta 2026 bħala s-sors
            fejn applikabbli.
          </p>
          <h2>Natura editorjali</h2>
          <p>
            Aħna naġġregaw informazzjoni pubblika dwar il-kandidati u l-partiti. Aħna ma nappoġġjaw l-ebda
            kandidat jew partit. Naħdmu biex nivverifikaw l-informazzjoni ma' sorsi primarji, iżda ma
            nagħtu l-ebda garanzija ta' eżattezza, kompletezza, jew adattabbiltà għal xi skop. Dejjem
            iċċekkja mal-Kummissjoni Elettorali ta' Malta għal informazzjoni uffiċjali.
          </p>
          <h2>Użu aċċettabbli</h2>
          <p>
            M'għandekx tuża s-sit jew l-API biex tdejjaq lil individwi, tirrappreżenta ħażin id-data,
            tiġġenera kontenut politiku qarrieqi, jew b'xi mod li jikser il-liġi Maltija jew tal-UE.
            Aċċess awtomatizzat għas-sit pubbliku (scraping) mingħajr ma tuża l-API dokumentat mhuwiex
            permess.
          </p>
          <h2>Responsabbiltà</h2>
          <p>
            Is-servizz huwa pprovdut "kif inhu". Sal-massimu permess mil-liġi, l-operaturi
            jirrifjutaw kwalunkwe responsabbiltà għal telf li jirriżulta mill-użu tas-sit jew tad-data.
          </p>
          <h2>Bidliet</h2>
          <p>Nistgħu naġġornaw dawn it-termini; l-aħħar verżjoni dejjem tiġi ppubblikata fuq din il-paġna.</p>
        </>
      ),
    },
  },
  privacy: {
    en: {
      title: "Privacy Policy",
      body: (
        <>
          <p>
            We are committed to protecting your privacy under the Maltese Data Protection Act and the
            EU General Data Protection Regulation (GDPR).
          </p>
          <h2>What we collect</h2>
          <ul>
            <li>
              <strong>Essential cookies:</strong> a cookie consent record and language preference.
            </li>
            <li>
              <strong>Analytics (optional):</strong> anonymised usage statistics, only after you opt in.
            </li>
            <li>
              <strong>AI assistant queries:</strong> the text of your question, stored briefly to
              improve neutrality and detect abuse. Not linked to your identity.
            </li>
            <li>
              <strong>API usage:</strong> request metadata (endpoint, timestamp, API key) for rate
              limiting and abuse prevention.
            </li>
            <li>
              <strong>Account data (developers and editors only):</strong> email address.
            </li>
          </ul>
          <h2>Legal basis</h2>
          <p>
            Consent (analytics, optional cookies), legitimate interest (security and abuse prevention),
            and contract (developer accounts).
          </p>
          <h2>Retention</h2>
          <p>
            Analytics data is retained for up to 14 months. AI query logs are retained for up to 30
            days. API usage logs are retained for up to 12 months.
          </p>
          <h2>Your rights</h2>
          <p>
            Under GDPR you may request access, correction, deletion, portability, or restriction of
            your personal data. Contact us using the details on the Contact page. You may also lodge a
            complaint with the Information and Data Protection Commissioner (IDPC) of Malta.
          </p>
        </>
      ),
    },
    mt: {
      title: "Politika tal-Privatezza",
      body: (
        <>
          <p>
            Aħna impenjati li nipproteġu l-privatezza tiegħek skont l-Att dwar il-Protezzjoni
            tad-Data ta' Malta u r-Regolament Ġenerali dwar il-Protezzjoni tad-Data tal-UE (GDPR).
          </p>
          <h2>X'niġbru</h2>
          <ul>
            <li>
              <strong>Cookies essenzjali:</strong> rekord tal-kunsens tal-cookies u preferenza
              tal-lingwa.
            </li>
            <li>
              <strong>Analitika (opzjonali):</strong> statistika anonimizzata tal-użu, biss wara li
              tagħti l-kunsens tiegħek.
            </li>
            <li>
              <strong>Mistoqsijiet tal-assistent AI:</strong> it-test tal-mistoqsija tiegħek, maħżun
              għal żmien qasir biex titjieb in-newtralità u jiġi identifikat l-abbuż. Mhux marbut
              mal-identità tiegħek.
            </li>
            <li>
              <strong>Użu tal-API:</strong> metadata tat-talbiet (endpoint, ħin, ċavetta tal-API)
              għar-rate limiting u l-prevenzjoni tal-abbuż.
            </li>
            <li>
              <strong>Data tal-account (żviluppaturi u edituri biss):</strong> indirizz email.
            </li>
          </ul>
          <h2>Bażi legali</h2>
          <p>
            Kunsens (analitika, cookies opzjonali), interess leġittimu (sigurtà u prevenzjoni
            tal-abbuż), u kuntratt (accounts tal-iżviluppaturi).
          </p>
          <h2>Ritenzjoni</h2>
          <p>
            Id-data analitika tinżamm sa 14-il xahar. Logs tal-mistoqsijiet AI jinżammu sa 30 ġurnata.
            Logs tal-użu tal-API jinżammu sa 12-il xahar.
          </p>
          <h2>Drittijiet tiegħek</h2>
          <p>
            Skont il-GDPR tista' titlob aċċess, korrezzjoni, tħassir, portabbiltà jew restrizzjoni tad-data
            personali tiegħek. Ikkuntattjana bid-dettalji fil-paġna ta' Kuntatt. Tista' wkoll tippreżenta
            ilment mal-Kummissarju għall-Informazzjoni u l-Protezzjoni tad-Data (IDPC) ta' Malta.
          </p>
        </>
      ),
    },
  },
  cookies: {
    en: {
      title: "Cookie Policy",
      body: (
        <>
          <p>
            This page explains the cookies and similar technologies used on Vot Malta 2026 and how you
            can control them.
          </p>
          <h2>Categories</h2>
          <h3>Essential</h3>
          <p>
            Required for the site to work: cookie consent state, language preference, security tokens
            for logged-in editors. These cannot be disabled.
          </p>
          <h3>Analytics (opt-in)</h3>
          <p>
            Anonymised usage analytics so we can improve the site. Loaded only after you accept
            analytics cookies in the consent banner.
          </p>
          <h2>Managing cookies</h2>
          <p>
            You can change your choice at any time by clearing site data in your browser, which will
            re-show the consent banner on your next visit. You can also block cookies entirely in your
            browser settings, but the site may not work as expected.
          </p>
        </>
      ),
    },
    mt: {
      title: "Politika tal-Cookies",
      body: (
        <>
          <p>
            Din il-paġna tispjega l-cookies u t-teknoloġiji simili użati fuq Vot Malta 2026 u kif
            tista' tikkontrollahom.
          </p>
          <h2>Kategoriji</h2>
          <h3>Essenzjali</h3>
          <p>
            Meħtieġa biex is-sit jaħdem: stat tal-kunsens tal-cookies, preferenza tal-lingwa, tokens
            ta' sigurtà għall-edituri loggjati. Dawn ma jistgħux jiġu diżattivati.
          </p>
          <h3>Analitika (opt-in)</h3>
          <p>
            Analitika anonimizzata tal-użu biex intejbu s-sit. Mitgħobbija biss wara li taċċetta
            l-cookies analitiċi fil-banner tal-kunsens.
          </p>
          <h2>Tmexxi l-cookies</h2>
          <p>
            Tista' tibdel l-għażla tiegħek f'kull ħin billi tneħħi d-data tas-sit fil-browser, u
            l-banner tal-kunsens jerġa' jidher fuq iż-żjara li jmiss. Tista' wkoll timblokka
            l-cookies għal kollox fis-settings tal-browser, iżda s-sit jista' ma jaħdimx kif mistenni.
          </p>
        </>
      ),
    },
  },
  accessibility: {
    en: {
      title: "Accessibility Statement",
      body: (
        <>
          <p>
            We are committed to making Vot Malta 2026 usable by everyone, in line with the EU Web
            Accessibility Directive and WCAG 2.1 Level AA.
          </p>
          <h2>What we do</h2>
          <ul>
            <li>Semantic HTML, landmarks, and clear heading structure.</li>
            <li>Keyboard navigation for every interactive element, with visible focus styles.</li>
            <li>Sufficient colour contrast in light and dark modes.</li>
            <li>Respect for users' motion preferences (prefers-reduced-motion).</li>
            <li>Alt text on meaningful images and ARIA labels where needed.</li>
            <li>Bilingual content with proper <code>lang</code> attributes.</li>
          </ul>
          <h2>Known limitations</h2>
          <p>
            Some scraped or AI-generated content may not yet have human-reviewed alt text or
            translation. We are progressively improving these.
          </p>
          <h2>Feedback</h2>
          <p>
            If you encounter an accessibility issue, please contact us via the Contact page. We aim to
            respond within 10 working days.
          </p>
        </>
      ),
    },
    mt: {
      title: "Stqarrija ta' Aċċessibbiltà",
      body: (
        <>
          <p>
            Aħna impenjati li Vot Malta 2026 ikun jista' jintuża minn kulħadd, skont id-Direttiva
            tal-UE dwar l-Aċċessibbiltà tal-Web u l-WCAG 2.1 Livell AA.
          </p>
          <h2>X'nagħmlu</h2>
          <ul>
            <li>HTML semantiku, landmarks, u struttura ċara tat-titoli.</li>
            <li>Navigazzjoni bit-tastiera għal kull element interattiv, b'focus styles viżibbli.</li>
            <li>Kuntrast ta' kulur biżżejjed f'modi ċari u skuri.</li>
            <li>Rispett għall-preferenzi ta' movement tal-utenti (prefers-reduced-motion).</li>
            <li>Test alternattiv fuq immaġni siewja u ARIA labels fejn meħtieġ.</li>
            <li>Kontenut biligwi b'attributi <code>lang</code> xierqa.</li>
          </ul>
          <h2>Limitazzjonijiet magħrufa</h2>
          <p>
            Xi kontenut scraped jew ġenerat mill-AI jista' għadu ma jkollux test alternattiv jew
            traduzzjoni rieżaminati minn bniedem. Qed intejbu dawn b'mod gradwali.
          </p>
          <h2>Feedback</h2>
          <p>
            Jekk tiltaqa' ma' problema ta' aċċessibbiltà, jekk jogħġbok ikkuntattjana mill-paġna ta'
            Kuntatt. Naħdmu biex inwieġbu fi żmien 10 ijiem tax-xogħol.
          </p>
        </>
      ),
    },
  },
  about: {
    en: {
      title: "About & Methodology",
      body: (
        <>
          <p>
            Vot Malta 2026 is an independent civic-tech project. We are not affiliated with any
            political party, candidate, or with the Electoral Commission of Malta.
          </p>
          <h2>Sources</h2>
          <ul>
            <li><a href="https://electoral.gov.mt/" target="_blank" rel="noreferrer">electoral.gov.mt</a> — official candidate confirmation.</li>
            <li><a href="https://parlament.mt/" target="_blank" rel="noreferrer">parlament.mt</a> — parliamentary records of incumbents.</li>
            <li>Party websites: Partit Laburista, Partit Nazzjonalista, ADPD, Momentum.</li>
            <li>Maltese news outlets: Times of Malta, MaltaToday, Lovin Malta, Malta Daily.</li>
            <li>Editor-curated quotes, podcast appearances, and social profiles.</li>
          </ul>
          <h2>Neutrality commitments</h2>
          <ul>
            <li>We never recommend a candidate or party.</li>
            <li>The AI assistant cites sources and refuses endorsements.</li>
            <li>Party colours appear only as small badges, never as page surfaces.</li>
            <li>Editor changes are logged and surfaced in the public changelog.</li>
          </ul>
        </>
      ),
    },
    mt: {
      title: "Dwarna u Metodoloġija",
      body: (
        <>
          <p>
            Vot Malta 2026 hu proġett ta' civic-tech indipendenti. M'aħniex affiljati ma' xi partit
            politiku, kandidat, jew mal-Kummissjoni Elettorali ta' Malta.
          </p>
          <h2>Sorsi</h2>
          <ul>
            <li><a href="https://electoral.gov.mt/" target="_blank" rel="noreferrer">electoral.gov.mt</a> — konferma uffiċjali tal-kandidati.</li>
            <li><a href="https://parlament.mt/" target="_blank" rel="noreferrer">parlament.mt</a> — rekords parlamentari tal-inkumbenti.</li>
            <li>Websajts tal-partiti: Partit Laburista, Partit Nazzjonalista, ADPD, Momentum.</li>
            <li>Sorsi tal-aħbarijiet Maltin: Times of Malta, MaltaToday, Lovin Malta, Malta Daily.</li>
            <li>Quotes, dehriet f'podcasts, u profili soċjali kkurati mill-edituri.</li>
          </ul>
          <h2>Impenji ta' newtralità</h2>
          <ul>
            <li>Qatt ma nirrakkomandaw kandidat jew partit.</li>
            <li>L-assistent AI jiċċita sorsi u jirrifjuta endorsjamenti.</li>
            <li>Il-kuluri tal-partiti jidhru biss bħala badges żgħar, qatt bħala wiċċ tal-paġna.</li>
            <li>Il-bidliet tal-edituri huma loggjati u juru fir-reġistru pubbliku tal-bidliet.</li>
          </ul>
        </>
      ),
    },
  },
  contact: {
    en: {
      title: "Contact",
      body: (
        <>
          <p>Use this page for corrections, takedown requests, accessibility feedback, or general questions.</p>
          <p>
            <strong>Email:</strong>{" "}
            <a href="mailto:hello@votmalta2026.example">hello@votmalta2026.example</a>
          </p>
          <p>We aim to respond within 5 working days.</p>
        </>
      ),
    },
    mt: {
      title: "Ikkuntattjana",
      body: (
        <>
          <p>Uża din il-paġna għal korrezzjonijiet, talbiet ta' tneħħija, feedback dwar l-aċċessibbiltà, jew mistoqsijiet ġenerali.</p>
          <p>
            <strong>Email:</strong>{" "}
            <a href="mailto:hello@votmalta2026.example">hello@votmalta2026.example</a>
          </p>
          <p>Naħdmu biex inwieġbu fi żmien 5 ijiem tax-xogħol.</p>
        </>
      ),
    },
  },
};

function makeLegalRoute(slug: LegalPage) {
  return {
    head: ({ params }: { params: { lang: string } }) => {
      const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
      const title = `${CONTENT[slug][lang].title} — Vot Malta 2026`;
      return {
        meta: [
          { title },
          { name: "description", content: translate(lang, "site.description") },
        ],
      };
    },
    component: () => <LegalPageView slug={slug} />,
  };
}

export const TermsRoute = createFileRoute("/$lang/terms")(makeLegalRoute("terms"));
export const PrivacyRoute = createFileRoute("/$lang/privacy")(makeLegalRoute("privacy"));
export const CookiesRoute = createFileRoute("/$lang/cookies")(makeLegalRoute("cookies"));
export const AccessibilityRoute = createFileRoute("/$lang/accessibility")(makeLegalRoute("accessibility"));
export const AboutRoute = createFileRoute("/$lang/about")(makeLegalRoute("about"));
export const ContactRoute = createFileRoute("/$lang/contact")(makeLegalRoute("contact"));

function LegalPageView({ slug }: { slug: LegalPage }) {
  const t = useT();
  // @ts-expect-error — typed lookup happens at render
  const params = LegalPageView.params ?? {};
  void params;
  return <LegalShell slug={slug} t={t} />;
}

function LegalShell({
  slug,
  t,
}: {
  slug: LegalPage;
  t: (k: string) => string;
}) {
  // Use the route params via the URL — read locale from <html lang>
  const lang: Locale =
    typeof document !== "undefined" && document.documentElement.lang === "mt" ? "mt" : "en";
  const { title, body } = CONTENT[slug][lang];

  return (
    <article className="container mx-auto max-w-3xl px-4 py-12 md:py-16">
      <header className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {t("footer.legal")}
        </p>
        <h1 className="mt-2 font-serif text-3xl font-bold text-foreground md:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("legal.lastUpdated")}: {LAST_UPDATED}
        </p>
      </header>
      <div className="legal-prose mt-8 space-y-4 text-base leading-relaxed text-foreground [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_a]:underline [&_a]:underline-offset-2 [&_a]:text-foreground hover:[&_a]:text-primary [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_code]:font-mono [&_code]:text-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded">
        {body}
      </div>
    </article>
  );
}
