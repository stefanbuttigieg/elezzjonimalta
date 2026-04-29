import type { ReactNode } from "react";
import type { Locale } from "@/i18n/types";

export type LegalSlug =
  | "terms"
  | "privacy"
  | "cookies"
  | "accessibility"
  | "about"
  | "contact";

export const LEGAL_LAST_UPDATED = "2026-04-28";

export const LEGAL_CONTENT: Record<LegalSlug, Record<Locale, { title: string; body: ReactNode }>> = {
  terms: {
    en: {
      title: "Terms of Use",
      body: (
        <>
          <p>
            Elezzjoni 2026 is an independent, non-partisan information service. By accessing this site
            or its API you agree to use the data for lawful informational, journalistic, civic, or
            research purposes, and to attribute Elezzjoni 2026 as the source where applicable.
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
            Elezzjoni 2026 hu servizz ta' informazzjoni indipendenti u imparzjali. Billi taċċessa dan
            is-sit jew l-API tiegħu int taqbel li tuża d-data għal skopijiet legali ta' informazzjoni,
            ġurnaliżmu, ċiviċi, jew riċerka, u li tagħti attribuzzjoni lil Elezzjoni 2026 bħala s-sors
            fejn applikabbli.
          </p>
          <h2>Natura editorjali</h2>
          <p>
            Aħna naġġregaw informazzjoni pubblika dwar il-kandidati u l-partiti. Aħna ma nappoġġjaw
            l-ebda kandidat jew partit. Naħdmu biex nivverifikaw l-informazzjoni ma' sorsi primarji,
            iżda ma nagħtu l-ebda garanzija ta' eżattezza, kompletezza, jew adattabbiltà għal xi skop.
            Dejjem iċċekkja mal-Kummissjoni Elettorali ta' Malta għal informazzjoni uffiċjali.
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
          <p>
            Nistgħu naġġornaw dawn it-termini; l-aħħar verżjoni dejjem tiġi ppubblikata fuq din il-paġna.
          </p>
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
            <li><strong>Essential cookies:</strong> a cookie consent record and language preference.</li>
            <li><strong>Analytics (optional):</strong> anonymised usage statistics, only after you opt in.</li>
            <li><strong>AI assistant queries:</strong> the text of your question, stored briefly to improve neutrality and detect abuse. Not linked to your identity.</li>
            <li><strong>API usage:</strong> request metadata (endpoint, timestamp, API key) for rate limiting and abuse prevention.</li>
            <li><strong>Account data (developers and editors only):</strong> email address.</li>
          </ul>
          <h2>Legal basis</h2>
          <p>Consent (analytics, optional cookies), legitimate interest (security and abuse prevention), and contract (developer accounts).</p>
          <h2>Retention</h2>
          <p>Analytics data is retained for up to 14 months. AI query logs are retained for up to 30 days. API usage logs are retained for up to 12 months.</p>
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
            Aħna impenjati li nipproteġu l-privatezza tiegħek skont l-Att dwar il-Protezzjoni tad-Data
            ta' Malta u r-Regolament Ġenerali dwar il-Protezzjoni tad-Data tal-UE (GDPR).
          </p>
          <h2>X'niġbru</h2>
          <ul>
            <li><strong>Cookies essenzjali:</strong> rekord tal-kunsens tal-cookies u preferenza tal-lingwa.</li>
            <li><strong>Analitika (opzjonali):</strong> statistika anonimizzata tal-użu, biss wara li tagħti l-kunsens tiegħek.</li>
            <li><strong>Mistoqsijiet tal-assistent AI:</strong> it-test tal-mistoqsija tiegħek, maħżun għal żmien qasir biex titjieb in-newtralità u jiġi identifikat l-abbuż. Mhux marbut mal-identità tiegħek.</li>
            <li><strong>Użu tal-API:</strong> metadata tat-talbiet (endpoint, ħin, ċavetta tal-API) għar-rate limiting u l-prevenzjoni tal-abbuż.</li>
            <li><strong>Data tal-account (żviluppaturi u edituri biss):</strong> indirizz email.</li>
          </ul>
          <h2>Bażi legali</h2>
          <p>Kunsens (analitika, cookies opzjonali), interess leġittimu (sigurtà u prevenzjoni tal-abbuż), u kuntratt (accounts tal-iżviluppaturi).</p>
          <h2>Ritenzjoni</h2>
          <p>Id-data analitika tinżamm sa 14-il xahar. Logs tal-mistoqsijiet AI jinżammu sa 30 ġurnata. Logs tal-użu tal-API jinżammu sa 12-il xahar.</p>
          <h2>Drittijiet tiegħek</h2>
          <p>
            Skont il-GDPR tista' titlob aċċess, korrezzjoni, tħassir, portabbiltà jew restrizzjoni
            tad-data personali tiegħek. Ikkuntattjana bid-dettalji fil-paġna ta' Kuntatt. Tista' wkoll
            tippreżenta ilment mal-Kummissarju għall-Informazzjoni u l-Protezzjoni tad-Data (IDPC) ta' Malta.
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
          <p>This page explains the cookies and similar technologies used on Elezzjoni 2026 and how you can control them.</p>
          <h2>Categories</h2>
          <h3>Essential</h3>
          <p>Required for the site to work: cookie consent state, language preference, security tokens for logged-in editors. These cannot be disabled.</p>
          <h3>Analytics (opt-in)</h3>
          <p>Anonymised usage analytics so we can improve the site. Loaded only after you accept analytics cookies in the consent banner.</p>
          <h2>Managing cookies</h2>
          <p>You can change your choice at any time by clearing site data in your browser, which will re-show the consent banner on your next visit. You can also block cookies entirely in your browser settings, but the site may not work as expected.</p>
        </>
      ),
    },
    mt: {
      title: "Politika tal-Cookies",
      body: (
        <>
          <p>Din il-paġna tispjega l-cookies u t-teknoloġiji simili użati fuq Elezzjoni 2026 u kif tista' tikkontrollahom.</p>
          <h2>Kategoriji</h2>
          <h3>Essenzjali</h3>
          <p>Meħtieġa biex is-sit jaħdem: stat tal-kunsens tal-cookies, preferenza tal-lingwa, tokens ta' sigurtà għall-edituri loggjati. Dawn ma jistgħux jiġu diżattivati.</p>
          <h3>Analitika (opt-in)</h3>
          <p>Analitika anonimizzata tal-użu biex intejbu s-sit. Mitgħobbija biss wara li taċċetta l-cookies analitiċi fil-banner tal-kunsens.</p>
          <h2>Tmexxi l-cookies</h2>
          <p>Tista' tibdel l-għażla tiegħek f'kull ħin billi tneħħi d-data tas-sit fil-browser, u l-banner tal-kunsens jerġa' jidher fuq iż-żjara li jmiss. Tista' wkoll timblokka l-cookies għal kollox fis-settings tal-browser, iżda s-sit jista' ma jaħdimx kif mistenni.</p>
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
            <strong>Elezzjoni</strong> is committed to making this site
            accessible to everyone, in line with the EU Web Accessibility
            Directive (Directive (EU) 2016/2102), the harmonised European
            standard <strong>EN 301 549 v3.2.1</strong>, and{" "}
            <strong>WCAG 2.1 Level AA</strong>.
          </p>

          <h2>Conformance status</h2>
          <p>
            This site is{" "}
            <strong>partially conformant</strong> with WCAG 2.1 Level AA and
            EN 301 549 v3.2.1. "Partially conformant" means that some parts
            of the content do not yet fully meet the standard. The known gaps
            are listed below and are being addressed.
          </p>

          <h2>Scope</h2>
          <p>
            This statement covers the public website at{" "}
            <a
              href="https://elezzjoni.app"
              target="_blank"
              rel="noreferrer"
            >
              elezzjoni.app
            </a>{" "}
            (and{" "}
            <a
              href="https://www.elezzjoni.app"
              target="_blank"
              rel="noreferrer"
            >
              www.elezzjoni.app
            </a>
            ), including the candidate, party, district, proposal, "ask AI"
            and developer/API pages in both English and Maltese. The
            staff-only admin dashboard is out of scope.
          </p>

          <h2>What we do</h2>
          <ul>
            <li>Single, semantic HTML structure with{" "}
              <code>main</code>, <code>header</code>, <code>nav</code>,{" "}
              <code>footer</code> landmarks and a logical heading hierarchy.
            </li>
            <li>
              Server-rendered <code>&lt;html lang&gt;</code> that matches the
              URL locale (<code>/en</code> or <code>/mt</code>).
            </li>
            <li>
              Visible "skip to content" link and visible keyboard focus on
              every interactive element.
            </li>
            <li>
              Every interactive element is keyboard reachable and operable;
              no keyboard traps.
            </li>
            <li>
              Form inputs have associated labels; required state and
              autocomplete hints are exposed to assistive technology.
            </li>
            <li>
              Icon-only buttons and links carry an{" "}
              <code>aria-label</code> with the same accessible name as their
              tooltip.
            </li>
            <li>
              Images have meaningful <code>alt</code> text or{" "}
              <code>alt=""</code> when decorative.
            </li>
            <li>
              Colour contrast meets at least 4.5:1 for body text and 3:1 for
              large text and non-text UI in both light and dark modes.
            </li>
            <li>
              Status is never conveyed by colour alone — text labels and
              icons are also used (e.g. the "Not contesting for 2026" tag).
            </li>
            <li>
              Animations and transitions are disabled when the user has{" "}
              <code>prefers-reduced-motion</code> set.
            </li>
            <li>
              No autoplaying audio or video; no auto-refreshing content
              longer than 5 seconds without a control.
            </li>
            <li>
              Bilingual content (English / Maltese) with proper{" "}
              <code>lang</code> attributes and matching{" "}
              <code>hreflang</code> alternates.
            </li>
          </ul>

          <h2>Known limitations</h2>
          <ul>
            <li>
              The interactive Malta district map (Leaflet) is operable by
              mouse and touch and exposes district information by hover and
              click. Equivalent textual access is provided by the
              "13 districts" cards listed directly below the map and by the
              per-district pages, which fully meet WCAG.
            </li>
            <li>
              Some scraped or AI-generated bios and proposal summaries may
              not yet have human-reviewed translations or alt text. We are
              progressively improving these.
            </li>
            <li>
              Embedded third-party content (e.g. external news source links)
              is outside our control; we link out and cite the source so
              users can rely on the original publisher's accessibility.
            </li>
            <li>
              The site has not yet been independently audited; conformance
              is based on internal review.
            </li>
          </ul>

          <h2>Assistive technology and browsers tested</h2>
          <p>
            The site is built and tested with current versions of Chromium,
            Firefox and WebKit on desktop and mobile. Screen-reader smoke
            testing has been done with VoiceOver (macOS / iOS) and NVDA
            (Windows + Firefox).
          </p>

          <h2>Feedback and contact</h2>
          <p>
            If you find an accessibility barrier on this site, please tell us
            via the{" "}
            <a href="/en/contact">Contact page</a>. We aim to acknowledge
            within 5 working days and respond substantively within 10 working
            days. Where we cannot fix something promptly, we will explain
            why and offer the information through an alternative channel.
          </p>

          <h2>Enforcement</h2>
          <p>
            If you are not satisfied with our response, you can contact the
            Maltese national accessibility enforcement body, the{" "}
            <a
              href="https://www.crpd.org.mt/"
              target="_blank"
              rel="noreferrer"
            >
              Commission for the Rights of Persons with Disability (CRPD)
            </a>
            .
          </p>

          <h2>Preparation of this statement</h2>
          <p>
            This statement was prepared on <strong>29 April 2026</strong>{" "}
            using a self-evaluation method. It will be reviewed at least
            annually and after any substantial change to the site.
          </p>
        </>
      ),
    },
    mt: {
      title: "Stqarrija ta' Aċċessibbiltà",
      body: (
        <>
          <p>
            <strong>Elezzjoni</strong> hu impenjat li dan is-sit ikun
            aċċessibbli għal kulħadd, skont id-Direttiva tal-UE dwar
            l-Aċċessibbiltà tal-Web (Direttiva (UE) 2016/2102), l-istandard
            armonizzat Ewropew <strong>EN 301 549 v3.2.1</strong> u l-
            <strong>WCAG 2.1 Livell AA</strong>.
          </p>

          <h2>Status ta' konformità</h2>
          <p>
            Dan is-sit huwa <strong>parzjalment konformi</strong> mal-WCAG 2.1
            Livell AA u mal-EN 301 549 v3.2.1. "Parzjalment konformi" jfisser
            li xi partijiet mill-kontenut għadhom ma jissodisfawx
            kompletament l-istandard. Il-limitazzjonijiet magħrufa huma
            elenkati hawn taħt u qed jiġu indirizzati.
          </p>

          <h2>Kamp ta' applikazzjoni</h2>
          <p>
            Din l-istqarrija tkopri s-sit pubbliku{" "}
            <a
              href="https://elezzjoni.app"
              target="_blank"
              rel="noreferrer"
            >
              elezzjoni.app
            </a>
            , inklużi l-paġni tal-kandidati, partiti, distretti, proposti,
            "staqsi lill-AI" u l-paġni għall-iżviluppaturi/API kemm
            bl-Ingliż kif ukoll bil-Malti. Il-pannell tal-amministrazzjoni
            għall-istaff biss huwa barra mill-kamp ta' applikazzjoni.
          </p>

          <h2>X'nagħmlu</h2>
          <ul>
            <li>
              Struttura HTML semantika b'<code>main</code>,{" "}
              <code>header</code>, <code>nav</code> u <code>footer</code> u
              ġerarkija ta' titoli loġika.
            </li>
            <li>
              <code>&lt;html lang&gt;</code> server-rendered li jaqbel
              mal-lingwa tal-URL (<code>/en</code> jew <code>/mt</code>).
            </li>
            <li>
              Link viżibbli "aqbeż għall-kontenut" u focus tat-tastiera
              viżibbli fuq kull element interattiv.
            </li>
            <li>
              Kull element interattiv huwa raġġungibbli u operabbli
              bit-tastiera; m'hemmx keyboard traps.
            </li>
            <li>
              L-inputs tal-formoli għandhom labels assoċjati; l-istat
              meħtieġ u l-hints tal-autocomplete huma esposti lit-teknoloġija
              ta' assistenza.
            </li>
            <li>
              Buttuni u links biss bl-ikoni għandhom <code>aria-label</code>{" "}
              bl-istess isem aċċessibbli bħat-tooltip.
            </li>
            <li>
              L-immaġini għandhom test alternattiv (<code>alt</code>)
              sinifikanti jew <code>alt=""</code> meta jkunu dekorattivi.
            </li>
            <li>
              Kuntrast ta' kulur ta' mill-inqas 4.5:1 għat-test tal-ġisem u
              3:1 għat-test kbir u UI mhux test, kemm fil-mod ċar kif ukoll
              skur.
            </li>
            <li>
              L-istatus qatt mhu mwassal bil-kulur biss — jintużaw ukoll
              labels tat-test u ikoni (eż. it-tag "Mhux qed jikkontesta
              għall-2026").
            </li>
            <li>
              L-animazzjonijiet u t-transizzjonijiet jiġu diżattivati meta
              l-utent ikollu <code>prefers-reduced-motion</code>.
            </li>
            <li>
              Ma jindaqqx awtomatikament l-ebda awdjo jew vidjo; m'hemmx
              kontenut li jaġġorna awtomatikament għal aktar minn 5 sekondi
              mingħajr kontroll.
            </li>
            <li>
              Kontenut bilingwi (Ingliż / Malti) bl-attributi <code>lang</code>{" "}
              xierqa u alternattivi <code>hreflang</code> li jaqblu.
            </li>
          </ul>

          <h2>Limitazzjonijiet magħrufa</h2>
          <ul>
            <li>
              Il-mappa interattiva tad-distretti ta' Malta (Leaflet) topera
              bil-maws u bit-touch u tesponi l-informazzjoni tad-distrett
              bil-hover u bil-klikk. Aċċess testwali ekwivalenti huwa
              pprovdut mill-kards "13-il distrett" eżatt taħt il-mappa u
              mill-paġni ta' kull distrett, li jissodisfaw bis-sħiħ WCAG.
            </li>
            <li>
              Xi bijografiji jew sommarji ta' proposti scraped jew ġenerati
              mill-AI jista' għadhom ma jkollhomx traduzzjonijiet jew test
              alternattiv riveduti minn bniedem. Qed intejbu dawn b'mod
              gradwali.
            </li>
            <li>
              Kontenut ta' partijiet terzi inkluż (eż. links għal artikoli
              tal-aħbarijiet) huwa barra mill-kontroll tagħna; nillinkjaw u
              niċċitaw is-sors biex l-utenti jistgħu jiddependu fuq
              l-aċċessibbiltà tal-pubblikatur oriġinali.
            </li>
            <li>
              Is-sit għadu ma kienx ivverifikat b'mod indipendenti;
              il-konformità hija bbażata fuq reviżjoni interna.
            </li>
          </ul>

          <h2>Teknoloġija ta' assistenza u browsers ittestjati</h2>
          <p>
            Is-sit huwa mibni u ttestjat b'verżjonijiet attwali ta' Chromium,
            Firefox u WebKit fuq desktop u mobile. Sar testjar bażiku ta'
            screen-reader b'VoiceOver (macOS / iOS) u NVDA (Windows + Firefox).
          </p>

          <h2>Feedback u kuntatt</h2>
          <p>
            Jekk issib ostaklu ta' aċċessibbiltà fuq dan is-sit, jekk jogħġbok
            avżana mill-paġna ta'{" "}
            <a href="/mt/contact">Kuntatt</a>. Naħdmu biex nirrikonoxxu fi
            żmien 5 ijiem tax-xogħol u nwieġbu sostantivament fi żmien 10
            ijiem tax-xogħol. Fejn ma nistgħux nirranġaw xi ħaġa malajr,
            nispjegaw għaliex u noffru l-informazzjoni minn kanal alternattiv.
          </p>

          <h2>Infurzar</h2>
          <p>
            Jekk m'intix sodisfatt bir-risposta tagħna, tista' tikkuntattja
            l-korp nazzjonali Malti tal-infurzar tal-aċċessibbiltà,{" "}
            <a
              href="https://www.crpd.org.mt/"
              target="_blank"
              rel="noreferrer"
            >
              il-Kummissjoni għad-Drittijiet ta' Persuni b'Diżabilità (CRPD)
            </a>
            .
          </p>

          <h2>Preparazzjoni ta' din l-istqarrija</h2>
          <p>
            Din l-istqarrija tħejjiet fid-<strong>29 ta' April 2026</strong>{" "}
            bl-użu ta' metodu ta' awto-evalwazzjoni. Din se tiġi riveduta
            mill-inqas darba fis-sena u wara kull tibdil sostanzjali fis-sit.
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
          <p>Elezzjoni 2026 is an independent civic-tech project. We are not affiliated with any political party, candidate, or with the Electoral Commission of Malta.</p>
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
          <p>Elezzjoni 2026 hu proġett ta' civic-tech indipendenti. M'aħniex affiljati ma' xi partit politiku, kandidat, jew mal-Kummissjoni Elettorali ta' Malta.</p>
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
            <strong>GitHub:</strong>{" "}
            <a href="https://github.com/stefanbuttigieg/" target="_blank" rel="noopener noreferrer">
              github.com/stefanbuttigieg
            </a>
          </p>
          <p>
            Open an issue on any of the public repositories, or reach out via the contact details listed on the GitHub
            profile. We aim to respond within 5 working days.
          </p>
        </>
      ),
    },
    mt: {
      title: "Ikkuntattjana",
      body: (
        <>
          <p>Uża din il-paġna għal korrezzjonijiet, talbiet ta' tneħħija, feedback dwar l-aċċessibbiltà, jew mistoqsijiet ġenerali.</p>
          <p>
            <strong>GitHub:</strong>{" "}
            <a href="https://github.com/stefanbuttigieg/" target="_blank" rel="noopener noreferrer">
              github.com/stefanbuttigieg
            </a>
          </p>
          <p>
            Iftaħ issue fuq xi waħda mir-repożitorji pubbliċi, jew ikkuntattjana permezz tad-dettalji elenkati fuq il-profil
            tal-GitHub. Naħdmu biex inwieġbu fi żmien 5 ijiem tax-xogħol.
          </p>
        </>
      ),
    },
  },
};
