/**
 * Data Catalogue Registry — single source of truth.
 *
 * This file lists every dataset the site publishes. It powers both the
 * human-readable /data page and the DCAT-AP 3.0 JSON-LD endpoint at
 * /api/public/v1/catalog.jsonld so they cannot drift apart.
 *
 * DCAT-AP 3.0 reference:
 *   https://semiceu.github.io/DCAT-AP/releases/3.0.0/
 * EU controlled vocabularies:
 *   - data themes: http://publications.europa.eu/resource/authority/data-theme
 *   - licences:    http://publications.europa.eu/resource/authority/licence
 *   - countries:   http://publications.europa.eu/resource/authority/country
 *   - frequency:   http://publications.europa.eu/resource/authority/frequency
 *   - file types:  http://publications.europa.eu/resource/authority/file-type
 */

// ---- Catalogue-wide constants ---------------------------------------------

export const CATALOGUE_PUBLISHER = {
  name: "Elezzjoni",
  homepage: "https://elezzjoni.app",
  // Generic project contact — surfaced as dcat:contactPoint.
  contactEmail: "mailto:hello@elezzjoni.app",
} as const;

export const CATALOGUE_LICENCE = {
  // CC BY 4.0 — applies to every dataset unless overridden.
  uri: "http://publications.europa.eu/resource/authority/licence/CC_BY_4_0",
  label: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
  href: "https://creativecommons.org/licenses/by/4.0/",
} as const;

export const CATALOGUE_SPATIAL = {
  // Malta (EU country authority URI).
  uri: "http://publications.europa.eu/resource/authority/country/MLT",
  label: "Malta",
} as const;

export const CATALOGUE_LANGUAGES = [
  { uri: "http://publications.europa.eu/resource/authority/language/ENG", code: "en" },
  { uri: "http://publications.europa.eu/resource/authority/language/MLT", code: "mt" },
] as const;

// EU controlled accrual periodicity vocabulary.
export const FREQ = {
  CONT: "http://publications.europa.eu/resource/authority/frequency/CONT", // continuous
  DAILY: "http://publications.europa.eu/resource/authority/frequency/DAILY",
  WEEKLY: "http://publications.europa.eu/resource/authority/frequency/WEEKLY",
  IRREG: "http://publications.europa.eu/resource/authority/frequency/IRREG",
  EVENT: "http://publications.europa.eu/resource/authority/frequency/OP_DATPRO",
} as const;

// EU data themes (subset relevant to this project).
export const THEME = {
  GOVERNMENT: "http://publications.europa.eu/resource/authority/data-theme/GOVE",
  EDUCATION: "http://publications.europa.eu/resource/authority/data-theme/EDUC",
  SOCIETY: "http://publications.europa.eu/resource/authority/data-theme/SOCI",
  REGIONS: "http://publications.europa.eu/resource/authority/data-theme/REGI",
  JUSTICE: "http://publications.europa.eu/resource/authority/data-theme/JUST",
} as const;

// IANA media type → EU file-type URI (only the ones we currently emit).
export const FILE_TYPE = {
  JSON: "http://publications.europa.eu/resource/authority/file-type/JSON",
  HTML: "http://publications.europa.eu/resource/authority/file-type/HTML",
  XML: "http://publications.europa.eu/resource/authority/file-type/XML",
  JSON_LD: "http://publications.europa.eu/resource/authority/file-type/JSON_LD",
} as const;

// ---- Types -----------------------------------------------------------------

export type LangString = { en: string; mt?: string };

export type Distribution = {
  /** Stable slug used to build the distribution IRI. */
  id: string;
  title: LangString;
  description?: LangString;
  /** Path relative to site origin, e.g. "/api/public/v1/candidates". */
  accessPath: string;
  /** Optional separate download path; defaults to accessPath. */
  downloadPath?: string;
  mediaType: string; // IANA media type
  formatUri: string; // EU file-type URI
  /** Bytes (optional). */
  byteSize?: number;
};

export type Dataset = {
  /** Stable slug, used as dct:identifier and to build dataset IRIs. */
  id: string;
  title: LangString;
  description: LangString;
  keywords: { en: string[]; mt?: string[] };
  themeUris: string[];
  /** EU accrual periodicity URI. */
  accrualPeriodicity: string;
  /** ISO date (YYYY-MM-DD) when first published. */
  issued: string;
  /** ISO date when last meaningfully changed. */
  modified: string;
  /** Path to a human landing page on the site (often the public list view). */
  landingPath?: string;
  distributions: Distribution[];
  /** Per-dataset licence override (defaults to CATALOGUE_LICENCE). */
  licenceUri?: string;
  /** Free-text access-rights note for sensitive datasets. */
  accessRightsNote?: LangString;
};

// ---- The registry ---------------------------------------------------------

export const DATASETS: Dataset[] = [
  {
    id: "candidates",
    title: { en: "Candidates", mt: "Kandidati" },
    description: {
      en: "Profiles of candidates contesting (or considered for) the Maltese 2026 General Election: name, party, primary district, biography, social links and incumbency.",
      mt: "Profili tal-kandidati għall-Elezzjoni Ġenerali Maltija 2026: isem, partit, distrett prinċipali, bijografija, links soċjali u status ta' Membru Parlamentari.",
    },
    keywords: {
      en: ["candidates", "elections", "Malta", "2026", "MPs"],
      mt: ["kandidati", "elezzjonijiet", "Malta", "2026"],
    },
    themeUris: [THEME.GOVERNMENT, THEME.SOCIETY],
    accrualPeriodicity: FREQ.DAILY,
    issued: "2025-09-01",
    modified: "2026-05-20",
    landingPath: "/en/candidates",
    distributions: [
      {
        id: "candidates-json",
        title: { en: "Candidates — JSON API", mt: "Kandidati — JSON API" },
        accessPath: "/api/public/v1/candidates",
        mediaType: "application/json",
        formatUri: FILE_TYPE.JSON,
      },
    ],
  },
  {
    id: "parties",
    title: { en: "Political parties", mt: "Partiti politiċi" },
    description: {
      en: "Registered Maltese political parties with name, short name, colour, slug and metadata.",
      mt: "Partiti politiċi Maltin reġistrati bl-isem, isem qasir, kulur u slug.",
    },
    keywords: { en: ["parties", "politics", "Malta"], mt: ["partiti", "politika", "Malta"] },
    themeUris: [THEME.GOVERNMENT],
    accrualPeriodicity: FREQ.IRREG,
    issued: "2025-09-01",
    modified: "2026-05-20",
    landingPath: "/en/parties",
    distributions: [
      {
        id: "parties-json",
        title: { en: "Parties — JSON API" },
        accessPath: "/api/public/v1/parties",
        mediaType: "application/json",
        formatUri: FILE_TYPE.JSON,
      },
    ],
  },
  {
    id: "districts",
    title: { en: "Electoral districts", mt: "Distretti elettorali" },
    description: {
      en: "The thirteen Maltese electoral districts with number, name, and member localities.",
      mt: "It-tlettax-il distrett elettorali Malti bin-numru, l-isem u l-lokalitajiet.",
    },
    keywords: {
      en: ["districts", "boundaries", "Malta", "constituencies"],
      mt: ["distretti", "Malta"],
    },
    themeUris: [THEME.REGIONS, THEME.GOVERNMENT],
    accrualPeriodicity: FREQ.IRREG,
    issued: "2025-09-01",
    modified: "2026-05-20",
    landingPath: "/en/districts",
    distributions: [
      {
        id: "districts-json",
        title: { en: "Districts — JSON API" },
        accessPath: "/api/public/v1/districts",
        mediaType: "application/json",
        formatUri: FILE_TYPE.JSON,
      },
    ],
  },
  {
    id: "proposals",
    title: { en: "Candidate & party proposals", mt: "Proposti tal-kandidati u tal-partiti" },
    description: {
      en: "Catalogued electoral proposals extracted from manifestos and public statements. Some entries are AI-extracted and not yet manually verified — see the methodology page.",
      mt: "Proposti elettorali estratti minn manifesti u dikjarazzjonijiet pubbliċi. Xi annotazzjonijiet huma estratti bl-AI u għadhom ma ġewx ivverifikati manwalment.",
    },
    keywords: {
      en: ["proposals", "manifestos", "policies", "elections"],
      mt: ["proposti", "manifesti", "politika"],
    },
    themeUris: [THEME.GOVERNMENT, THEME.SOCIETY],
    accrualPeriodicity: FREQ.CONT,
    issued: "2025-10-01",
    modified: "2026-05-20",
    landingPath: "/en/proposals",
    distributions: [
      {
        id: "proposals-html",
        title: { en: "Proposals — browsable web index" },
        accessPath: "/en/proposals",
        mediaType: "text/html",
        formatUri: FILE_TYPE.HTML,
      },
    ],
  },
  {
    id: "themes",
    title: { en: "Policy themes", mt: "Temi politiċi" },
    description: {
      en: "Thematic taxonomy used to group proposals (e.g. health, environment, economy).",
      mt: "Tassonomija tematika użata biex tiggrupp il-proposti.",
    },
    keywords: { en: ["themes", "taxonomy", "policy"], mt: ["temi", "politika"] },
    themeUris: [THEME.GOVERNMENT],
    accrualPeriodicity: FREQ.IRREG,
    issued: "2025-10-01",
    modified: "2026-05-20",
    landingPath: "/en/themes",
    distributions: [
      {
        id: "themes-html",
        title: { en: "Themes — browsable index" },
        accessPath: "/en/themes",
        mediaType: "text/html",
        formatUri: FILE_TYPE.HTML,
      },
    ],
  },
  {
    id: "sitting-mps",
    title: { en: "Sitting Members of Parliament", mt: "Membri Parlamentari attwali" },
    description: {
      en: "Members currently sitting in the Maltese Parliament, with party, district and links to parlament.mt.",
      mt: "Membri li bħalissa qed iservu fil-Parlament Malti, bil-partit, distrett u link għal parlament.mt.",
    },
    keywords: { en: ["MPs", "parliament", "Malta"], mt: ["MPs", "parlament"] },
    themeUris: [THEME.GOVERNMENT],
    accrualPeriodicity: FREQ.IRREG,
    issued: "2025-09-01",
    modified: "2026-05-20",
    landingPath: "/en/sitting-mps",
    distributions: [
      {
        id: "sitting-mps-html",
        title: { en: "Sitting MPs — browsable index" },
        accessPath: "/en/sitting-mps",
        mediaType: "text/html",
        formatUri: FILE_TYPE.HTML,
      },
    ],
  },
  {
    id: "voting-faqs",
    title: { en: "Voting FAQs", mt: "Mistoqsijiet dwar il-vot" },
    description: {
      en: "Curated answers to common voter questions about the Maltese electoral process.",
      mt: "Tweġibiet għal mistoqsijiet komuni tal-votanti dwar il-proċess elettorali Malti.",
    },
    keywords: { en: ["voting", "FAQ", "elections"], mt: ["vot", "elezzjonijiet"] },
    themeUris: [THEME.GOVERNMENT, THEME.EDUCATION],
    accrualPeriodicity: FREQ.IRREG,
    issued: "2025-10-01",
    modified: "2026-05-20",
    landingPath: "/en/faq",
    distributions: [
      {
        id: "voting-faqs-html",
        title: { en: "Voting FAQs — browsable index" },
        accessPath: "/en/faq",
        mediaType: "text/html",
        formatUri: FILE_TYPE.HTML,
      },
    ],
  },
  {
    id: "community-proposals",
    title: { en: "Community proposals", mt: "Proposti tal-komunità" },
    description: {
      en: "Proposals submitted by members of the public via the community channel.",
      mt: "Proposti sottomessi mill-pubbliku permezz tal-kanal tal-komunità.",
    },
    keywords: { en: ["community", "proposals", "public"], mt: ["komunità", "proposti"] },
    themeUris: [THEME.SOCIETY, THEME.GOVERNMENT],
    accrualPeriodicity: FREQ.CONT,
    issued: "2025-11-01",
    modified: "2026-05-20",
    landingPath: "/en/community-proposals",
    distributions: [
      {
        id: "community-proposals-html",
        title: { en: "Community proposals — browsable index" },
        accessPath: "/en/community-proposals",
        mediaType: "text/html",
        formatUri: FILE_TYPE.HTML,
      },
    ],
  },
  {
    id: "resources",
    title: { en: "Civic resources", mt: "Riżorsi ċiviċi" },
    description: {
      en: "Curated directory of links to official and trusted civic sources (Electoral Commission, parlament.mt, etc.).",
      mt: "Direttorju ta' links għal sorsi ċiviċi uffiċjali u affidabbli.",
    },
    keywords: { en: ["resources", "links", "civic"], mt: ["riżorsi", "ċiviku"] },
    themeUris: [THEME.GOVERNMENT, THEME.EDUCATION],
    accrualPeriodicity: FREQ.IRREG,
    issued: "2025-09-01",
    modified: "2026-05-20",
    landingPath: "/en/resources",
    distributions: [
      {
        id: "resources-html",
        title: { en: "Resources — browsable index" },
        accessPath: "/en/resources",
        mediaType: "text/html",
        formatUri: FILE_TYPE.HTML,
      },
    ],
  },
];

// ---- Helpers ---------------------------------------------------------------

/** Resolve the absolute site origin for a request. Falls back to production. */
export function resolveOrigin(request?: Request): string {
  if (request) {
    try {
      return new URL(request.url).origin;
    } catch {
      /* ignore */
    }
  }
  return "https://elezzjoni.app";
}

/** Render the catalogue as a DCAT-AP 3.0 JSON-LD document. */
export function buildCatalogJsonLd(origin: string): Record<string, unknown> {
  const catalogIri = `${origin}/api/public/v1/catalog.jsonld`;
  const publisherIri = `${origin}/#publisher`;

  const datasets = DATASETS.map((d) => buildDatasetNode(d, origin));

  return {
    "@context": {
      dcat: "http://www.w3.org/ns/dcat#",
      dct: "http://purl.org/dc/terms/",
      foaf: "http://xmlns.com/foaf/0.1/",
      vcard: "http://www.w3.org/2006/vcard/ns#",
      xsd: "http://www.w3.org/2001/XMLSchema#",
      adms: "http://www.w3.org/ns/adms#",
      "dct:title": { "@container": "@language" },
      "dct:description": { "@container": "@language" },
      "dcat:keyword": { "@container": "@set" },
      "dcat:theme": { "@type": "@id" },
      "dct:publisher": { "@type": "@id" },
      "dct:language": { "@type": "@id" },
      "dct:spatial": { "@type": "@id" },
      "dct:license": { "@type": "@id" },
      "dct:accrualPeriodicity": { "@type": "@id" },
      "dct:format": { "@type": "@id" },
      "dcat:accessURL": { "@type": "@id" },
      "dcat:downloadURL": { "@type": "@id" },
      "dcat:landingPage": { "@type": "@id" },
      "dct:issued": { "@type": "xsd:date" },
      "dct:modified": { "@type": "xsd:date" },
    },
    "@graph": [
      {
        "@id": catalogIri,
        "@type": "dcat:Catalog",
        "dct:title": { en: "Elezzjoni Open Data Catalogue", mt: "Katalgu Open Data ta' Elezzjoni" },
        "dct:description": {
          en: "Machine-readable DCAT-AP 3.0 catalogue of datasets published by Elezzjoni about the Maltese 2026 General Election.",
          mt: "Katalgu DCAT-AP 3.0 tad-datasets ippubblikati minn Elezzjoni dwar l-Elezzjoni Ġenerali Maltija 2026.",
        },
        "dct:publisher": publisherIri,
        "dct:language": CATALOGUE_LANGUAGES.map((l) => l.uri),
        "dct:spatial": CATALOGUE_SPATIAL.uri,
        "dct:license": CATALOGUE_LICENCE.uri,
        "dct:issued": "2025-09-01",
        "dct:modified": new Date().toISOString().slice(0, 10),
        "foaf:homepage": origin,
        "dcat:dataset": datasets.map((d) => d["@id"]),
      },
      {
        "@id": publisherIri,
        "@type": "foaf:Agent",
        "foaf:name": CATALOGUE_PUBLISHER.name,
        "foaf:homepage": CATALOGUE_PUBLISHER.homepage,
        "foaf:mbox": CATALOGUE_PUBLISHER.contactEmail,
      },
      ...datasets,
    ],
  };
}

function buildDatasetNode(d: Dataset, origin: string): Record<string, unknown> {
  const datasetIri = `${origin}/api/public/v1/catalog.jsonld#dataset/${d.id}`;
  const licenceUri = d.licenceUri ?? CATALOGUE_LICENCE.uri;

  const distributions = d.distributions.map((dist) => {
    const distIri = `${datasetIri}/distribution/${dist.id}`;
    const accessUrl = `${origin}${dist.accessPath}`;
    const downloadUrl = dist.downloadPath ? `${origin}${dist.downloadPath}` : accessUrl;
    return {
      "@id": distIri,
      "@type": "dcat:Distribution",
      "dct:title": dist.title,
      ...(dist.description ? { "dct:description": dist.description } : {}),
      "dcat:accessURL": accessUrl,
      "dcat:downloadURL": downloadUrl,
      "dcat:mediaType": dist.mediaType,
      "dct:format": dist.formatUri,
      "dct:license": licenceUri,
      ...(typeof dist.byteSize === "number" ? { "dcat:byteSize": dist.byteSize } : {}),
    };
  });

  return {
    "@id": datasetIri,
    "@type": "dcat:Dataset",
    "dct:identifier": d.id,
    "dct:title": d.title,
    "dct:description": d.description,
    "dcat:keyword": [...d.keywords.en, ...(d.keywords.mt ?? [])],
    "dcat:theme": d.themeUris,
    "dct:publisher": `${origin}/#publisher`,
    "dct:language": CATALOGUE_LANGUAGES.map((l) => l.uri),
    "dct:spatial": CATALOGUE_SPATIAL.uri,
    "dct:accrualPeriodicity": d.accrualPeriodicity,
    "dct:issued": d.issued,
    "dct:modified": d.modified,
    "dct:license": licenceUri,
    ...(d.landingPath ? { "dcat:landingPage": `${origin}${d.landingPath}` } : {}),
    ...(d.accessRightsNote
      ? { "dct:accessRights": { "@type": "dct:RightsStatement", "rdfs:label": d.accessRightsNote } }
      : {}),
    "dcat:contactPoint": {
      "@type": "vcard:Organization",
      "vcard:fn": CATALOGUE_PUBLISHER.name,
      "vcard:hasEmail": CATALOGUE_PUBLISHER.contactEmail,
    },
    "dcat:distribution": distributions,
  };
}
