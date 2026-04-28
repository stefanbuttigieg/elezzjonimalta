import type { Locale } from "./types";

/**
 * Static UI dictionaries. Keys are dot-paths.
 * Maltese translations should be reviewed by a native speaker before launch.
 */
export const dictionaries: Record<Locale, Record<string, string>> = {
  en: {
    "site.name": "Vot Malta 2026",
    "site.tagline": "Malta General Election — 30 May 2026",
    "site.description":
      "An independent, non-partisan tool to research candidates and parties in Malta's 2026 General Election.",

    "nav.home": "Home",
    "nav.candidates": "Candidates",
    "nav.districts": "Districts",
    "nav.parties": "Parties",
    "nav.sittingMps": "Sitting MPs",
    "nav.compare": "Compare",
    "nav.askAi": "Ask AI",
    "nav.proposals": "Proposals",
    "nav.developers": "Developers",
    "nav.about": "About",
    "nav.menu": "Menu",
    "nav.close": "Close",

    "lang.toggle": "Language",
    "lang.en": "English",
    "lang.mt": "Malti",
    "lang.switchTo": "Switch to {lang}",

    "footer.legal": "Legal",
    "footer.terms": "Terms of Use",
    "footer.privacy": "Privacy Policy",
    "footer.cookies": "Cookie Policy",
    "footer.accessibility": "Accessibility Statement",
    "footer.about": "About & Methodology",
    "footer.contact": "Contact",
    "footer.developers": "Developer API",
    "footer.changelog": "Changelog",
    "footer.disclaimer":
      "Independent tool. Not affiliated with any political party or the Electoral Commission.",
    "footer.sources":
      "Data sourced from electoral.gov.mt, parlament.mt, party websites, and named news outlets.",
    "footer.lastUpdated": "Last updated",
    "footer.rights": "© {year} Vot Malta 2026. Open data, attribution required.",

    "home.hero.eyebrow": "Malta General Election",
    "home.hero.title": "Make an informed vote",
    "home.hero.subtitle":
      "Research every candidate by district and party. Read their record. Ask questions in plain English or Maltese.",
    "home.hero.ctaCandidates": "Browse candidates",
    "home.hero.ctaAsk": "Ask the AI assistant",
    "home.countdown.label": "Election day",
    "home.countdown.days": "days",
    "home.countdown.hours": "hours",
    "home.countdown.minutes": "min",
    "home.countdown.seconds": "sec",
    "home.countdown.passed": "Election day has arrived.",

    "home.search.placeholder": "Search by candidate name…",
    "home.search.button": "Search",

    "home.entry.districts.title": "Browse by district",
    "home.entry.districts.desc":
      "Malta's 13 electoral districts and the candidates running in each.",
    "home.entry.parties.title": "Browse by party",
    "home.entry.parties.desc": "Manifestos and candidate lists for every contesting party.",
    "home.entry.sitting.title": "Sitting MPs",
    "home.entry.sitting.desc": "Incumbents with their parliamentary record from parlament.mt.",
    "home.entry.compare.title": "Compare candidates",
    "home.entry.compare.desc": "Place 2–4 candidates side by side, neutrally.",
    "home.entry.ask.title": "Ask the AI assistant",
    "home.entry.ask.desc": "Neutral answers with sources, in English or Maltese.",
    "home.entry.developers.title": "Developer API",
    "home.entry.developers.desc": "Free, read-only access to the data behind this site.",

    "home.principles.title": "How we work",
    "home.principles.neutral.title": "Strictly neutral",
    "home.principles.neutral.desc":
      "We never recommend a candidate. The AI assistant cites sources and refuses endorsements.",
    "home.principles.sourced.title": "Every fact has a source",
    "home.principles.sourced.desc":
      "Each claim links back to its original source. Editors verify before publishing.",
    "home.principles.bilingual.title": "Bilingual by default",
    "home.principles.bilingual.desc":
      "Full English and Maltese. AI translation fills gaps until human translations are added.",
    "home.principles.open.title": "Open data",
    "home.principles.open.desc":
      "A free, documented public API. Use the data in your own research and reporting.",

    "candidates.meta.title": "Candidates — Vot Malta 2026",
    "candidates.meta.description":
      "Search published Malta 2026 General Election candidates by name, district, and political party.",
    "candidates.title": "Candidates",
    "candidates.subtitle": "Search the published candidate list by district and political party.",
    "candidates.search.label": "Search",
    "candidates.search.placeholder": "Candidate name…",
    "candidates.party.label": "Party",
    "candidates.party.all": "All parties",
    "candidates.district.label": "District",
    "candidates.district.all": "All districts",
    "candidates.filters.reset": "Reset",
    "candidates.results": "{count} candidates found",
    "candidates.empty.title": "No candidates found",
    "candidates.empty.body": "Try a different name, party, or district filter.",
    "candidates.unassigned": "Party or district not assigned",
    "candidates.bio.empty": "Biography pending editorial review.",
    "candidates.website": "Website",

    "districts.meta.title": "Electoral Districts — Vot Malta 2026",
    "districts.meta.description":
      "Malta's 13 electoral districts: localities covered, candidates contesting, and source from the Electoral Commission.",
    "districts.title": "Electoral districts",
    "districts.subtitle":
      "Malta is divided into 13 electoral divisions; each returns 5 MPs. Boundaries set under article 61 of the Constitution.",
    "districts.search.placeholder": "Search by district name or locality…",
    "districts.region.label": "Region",
    "districts.region.all": "All regions",
    "districts.region.malta": "Malta",
    "districts.region.gozo": "Gozo & Comino",
    "districts.results": "{count} districts shown",
    "districts.empty.title": "No districts match your filters",
    "districts.empty.body": "Try a different search term or reset the region filter.",
    "districts.localities.label": "Localities",
    "districts.candidates.count": "{count} candidates",
    "districts.candidates.none": "No published candidates yet",
    "districts.viewCandidates": "View candidates",
    "districts.viewSource": "Source: Electoral Commission",
    "districts.seats": "5 seats",

    "common.loading": "Loading…",
    "common.error": "Something went wrong.",
    "common.retry": "Try again",
    "common.notFound": "Not found",
    "common.backHome": "Back to home",
    "common.sittingMp": "Sitting MP",
    "common.electoralConfirmed": "Officially confirmed",
    "common.partyList": "On party list",
    "common.draft": "Draft",
    "common.viewAll": "View all",
    "common.learnMore": "Learn more",
    "common.skipToContent": "Skip to main content",

    "cookies.banner.title": "Cookies",
    "cookies.banner.body":
      "We use essential cookies to make the site work, and optional analytics cookies to improve it. You choose.",
    "cookies.banner.acceptAll": "Accept all",
    "cookies.banner.essentialOnly": "Essential only",
    "cookies.banner.preferences": "Preferences",
    "cookies.banner.policy": "Read the cookie policy",

    "legal.lastUpdated": "Last updated",
    "legal.terms.title": "Terms of Use",
    "legal.privacy.title": "Privacy Policy",
    "legal.cookies.title": "Cookie Policy",
    "legal.accessibility.title": "Accessibility Statement",
    "legal.about.title": "About & Methodology",
    "legal.contact.title": "Contact",

    "contact.intro":
      "Use this page for corrections, takedown requests, accessibility feedback, or general questions.",
    "contact.email.label": "Email",
    "contact.email.value": "hello@votmalta2026.example",

    "notFound.title": "Page not found",
    "notFound.body": "The page you're looking for doesn't exist or has been moved.",

    "proposals.meta.title": "Proposals — Vot Malta 2026",
    "proposals.meta.description":
      "Browse policy proposals from political parties and candidates running in Malta's 2026 General Election.",
    "proposals.title": "Proposals",
    "proposals.subtitle":
      "Policy proposals put forward by parties and candidates. Each proposal links back to its source.",
    "proposals.search.placeholder": "Search proposals…",
    "proposals.filter.scope.label": "Source",
    "proposals.filter.scope.all": "All sources",
    "proposals.filter.scope.party": "From parties",
    "proposals.filter.scope.candidate": "From candidates",
    "proposals.filter.party.label": "Party",
    "proposals.filter.party.all": "All parties",
    "proposals.filter.candidate.label": "Candidate",
    "proposals.filter.candidate.all": "All candidates",
    "proposals.filter.category.label": "Category",
    "proposals.filter.category.all": "All categories",
    "proposals.results": "{count} proposals found",
    "proposals.empty.title": "No proposals found",
    "proposals.empty.body": "Try a different search or filter.",
    "proposals.from.party": "Party proposal",
    "proposals.from.candidate": "Candidate proposal",
    "proposals.viewSource": "View source",
  },
  mt: {
    "site.name": "Vot Malta 2026",
    "site.tagline": "Elezzjoni Ġenerali Maltija — 30 ta' Mejju 2026",
    "site.description":
      "Għodda indipendenti u imparzjali biex tirriċerka l-kandidati u l-partiti fl-Elezzjoni Ġenerali Maltija 2026.",

    "nav.home": "Home",
    "nav.candidates": "Kandidati",
    "nav.districts": "Distretti",
    "nav.parties": "Partiti",
    "nav.sittingMps": "Membri Parlamentari",
    "nav.compare": "Qabbel",
    "nav.askAi": "Staqsi lill-AI",
    "nav.proposals": "Proposti",
    "nav.developers": "Żviluppaturi",
    "nav.about": "Dwarna",
    "nav.menu": "Menu",
    "nav.close": "Agħlaq",

    "lang.toggle": "Lingwa",
    "lang.en": "English",
    "lang.mt": "Malti",
    "lang.switchTo": "Aqleb għal {lang}",

    "footer.legal": "Legali",
    "footer.terms": "Termini tal-Użu",
    "footer.privacy": "Politika tal-Privatezza",
    "footer.cookies": "Politika tal-Cookies",
    "footer.accessibility": "Stqarrija ta' Aċċessibbiltà",
    "footer.about": "Dwarna u Metodoloġija",
    "footer.contact": "Ikkuntattjana",
    "footer.developers": "API għall-Iżviluppaturi",
    "footer.changelog": "Reġistru tal-Bidliet",
    "footer.disclaimer":
      "Għodda indipendenti. M'aħniex affiljati ma' xi partit politiku jew mal-Kummissjoni Elettorali.",
    "footer.sources":
      "Data minn electoral.gov.mt, parlament.mt, websajts tal-partiti, u sorsi tal-aħbarijiet imsemmija.",
    "footer.lastUpdated": "L-aħħar aġġornament",
    "footer.rights": "© {year} Vot Malta 2026. Data miftuħa, attribuzzjoni meħtieġa.",

    "home.hero.eyebrow": "Elezzjoni Ġenerali Maltija",
    "home.hero.title": "Ivvota b'għarfien",
    "home.hero.subtitle":
      "Irriċerka kull kandidat skont id-distrett u l-partit. Aqra r-rekord tagħhom. Staqsi mistoqsijiet bl-Ingliż jew bil-Malti.",
    "home.hero.ctaCandidates": "Ara l-kandidati",
    "home.hero.ctaAsk": "Staqsi lill-assistent AI",
    "home.countdown.label": "Jum l-elezzjoni",
    "home.countdown.days": "jiem",
    "home.countdown.hours": "sigħat",
    "home.countdown.minutes": "min",
    "home.countdown.seconds": "sek",
    "home.countdown.passed": "Wasal jum l-elezzjoni.",

    "home.search.placeholder": "Fittex kandidat bl-isem…",
    "home.search.button": "Fittex",

    "home.entry.districts.title": "Ara skont id-distrett",
    "home.entry.districts.desc":
      "It-13-il distrett elettorali ta' Malta u l-kandidati f'kull wieħed.",
    "home.entry.parties.title": "Ara skont il-partit",
    "home.entry.parties.desc": "Manifesti u listi tal-kandidati ta' kull partit kontestant.",
    "home.entry.sitting.title": "Membri Parlamentari",
    "home.entry.sitting.desc": "Inkumbenti bir-rekord parlamentari tagħhom minn parlament.mt.",
    "home.entry.compare.title": "Qabbel kandidati",
    "home.entry.compare.desc": "Qiegħed 2–4 kandidati ħdejn xulxin, b'mod imparzjali.",
    "home.entry.ask.title": "Staqsi lill-assistent AI",
    "home.entry.ask.desc": "Tweġibiet imparzjali b'sorsi, bl-Ingliż jew bil-Malti.",
    "home.entry.developers.title": "API għall-Iżviluppaturi",
    "home.entry.developers.desc": "Aċċess bla ħlas u read-only għad-data ta' wara dan is-sit.",

    "home.principles.title": "Kif naħdmu",
    "home.principles.neutral.title": "Strettament imparzjali",
    "home.principles.neutral.desc":
      "Qatt ma nirrakkomandaw kandidat. L-assistent AI jiċċita sorsi u jirrifjuta endorsjamenti.",
    "home.principles.sourced.title": "Kull fatt għandu sors",
    "home.principles.sourced.desc":
      "Kull dikjarazzjoni hija lotta lura mas-sors oriġinali tagħha. L-edituri jivverifikaw qabel jippubblikaw.",
    "home.principles.bilingual.title": "Biligwi b'mod awtomatiku",
    "home.principles.bilingual.desc":
      "Ingliż u Malti sħaħ. It-traduzzjoni AI timla l-vojt sakemm jiżdiedu traduzzjonijiet umani.",
    "home.principles.open.title": "Data miftuħa",
    "home.principles.open.desc":
      "API pubbliku, bla ħlas u dokumentat. Uża d-data fir-riċerka u r-rappurtaġġ tiegħek.",

    "candidates.meta.title": "Kandidati — Vot Malta 2026",
    "candidates.meta.description":
      "Fittex kandidati ppubblikati għall-Elezzjoni Ġenerali Maltija 2026 skont l-isem, id-distrett u l-partit politiku.",
    "candidates.title": "Kandidati",
    "candidates.subtitle":
      "Fittex il-lista ppubblikata tal-kandidati skont id-distrett u l-partit politiku.",
    "candidates.search.label": "Fittex",
    "candidates.search.placeholder": "Isem il-kandidat…",
    "candidates.party.label": "Partit",
    "candidates.party.all": "Il-partiti kollha",
    "candidates.district.label": "Distrett",
    "candidates.district.all": "Id-distretti kollha",
    "candidates.filters.reset": "Irrisettja",
    "candidates.results": "Instabu {count} kandidati",
    "candidates.empty.title": "Ma nstabux kandidati",
    "candidates.empty.body": "Ipprova isem, partit jew distrett differenti.",
    "candidates.unassigned": "Partit jew distrett mhux assenjat",
    "candidates.bio.empty": "Bijografija pendenti reviżjoni editorjali.",
    "candidates.website": "Websajt",

    "common.loading": "Qed jitla'…",
    "common.error": "Xi ħaġa marret ħażin.",
    "common.retry": "Erġa' pprova",
    "common.notFound": "Mhux misjub",
    "common.backHome": "Lura għad-dar",
    "common.sittingMp": "Membru Parlamentari",
    "common.electoralConfirmed": "Ikkonfermat uffiċjalment",
    "common.partyList": "Fuq il-lista tal-partit",
    "common.draft": "Abbozz",
    "common.viewAll": "Ara kollox",
    "common.learnMore": "Aktar informazzjoni",
    "common.skipToContent": "Aqbeż għall-kontenut prinċipali",

    "cookies.banner.title": "Cookies",
    "cookies.banner.body":
      "Nużaw cookies essenzjali biex is-sit jaħdem, u cookies analitiċi opzjonali biex intejbuh. Inti tagħżel.",
    "cookies.banner.acceptAll": "Aċċetta kollha",
    "cookies.banner.essentialOnly": "Essenzjali biss",
    "cookies.banner.preferences": "Preferenzi",
    "cookies.banner.policy": "Aqra l-politika tal-cookies",

    "legal.lastUpdated": "L-aħħar aġġornament",
    "legal.terms.title": "Termini tal-Użu",
    "legal.privacy.title": "Politika tal-Privatezza",
    "legal.cookies.title": "Politika tal-Cookies",
    "legal.accessibility.title": "Stqarrija ta' Aċċessibbiltà",
    "legal.about.title": "Dwarna u Metodoloġija",
    "legal.contact.title": "Ikkuntattjana",

    "contact.intro":
      "Uża din il-paġna għal korrezzjonijiet, talbiet ta' tneħħija, feedback dwar l-aċċessibbiltà, jew mistoqsijiet ġenerali.",
    "contact.email.label": "Email",
    "contact.email.value": "hello@votmalta2026.example",

    "notFound.title": "Paġna mhux misjuba",
    "notFound.body": "Il-paġna li qed tfittex ma teżistix jew ġiet imċaqilqa.",

    "proposals.meta.title": "Proposti — Vot Malta 2026",
    "proposals.meta.description":
      "Ara l-proposti politiċi tal-partiti u l-kandidati fl-Elezzjoni Ġenerali Maltija 2026.",
    "proposals.title": "Proposti",
    "proposals.subtitle":
      "Proposti politiċi mressqa minn partiti u kandidati. Kull proposta tirreferi għas-sors oriġinali.",
    "proposals.search.placeholder": "Fittex proposti…",
    "proposals.filter.scope.label": "Sors",
    "proposals.filter.scope.all": "Is-sorsi kollha",
    "proposals.filter.scope.party": "Mill-partiti",
    "proposals.filter.scope.candidate": "Mill-kandidati",
    "proposals.filter.party.label": "Partit",
    "proposals.filter.party.all": "Il-partiti kollha",
    "proposals.filter.candidate.label": "Kandidat",
    "proposals.filter.candidate.all": "Il-kandidati kollha",
    "proposals.filter.category.label": "Kategorija",
    "proposals.filter.category.all": "Il-kategoriji kollha",
    "proposals.results": "Instabu {count} proposti",
    "proposals.empty.title": "Ma nstabux proposti",
    "proposals.empty.body": "Ipprova tfittxija jew filtru differenti.",
    "proposals.from.party": "Proposta ta' partit",
    "proposals.from.candidate": "Proposta ta' kandidat",
    "proposals.viewSource": "Ara s-sors",
  },
};

export type DictionaryKey = keyof (typeof dictionaries)["en"];
