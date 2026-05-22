import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { isLocale, type Locale } from "@/i18n/types";
import { SupportNudge } from "@/components/site/SupportNudge";

export const Route = createFileRoute("/$lang/methodology")({
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : "en") as Locale;
    const title =
      lang === "mt"
        ? "Metodoloġija — Kif niġbru l-proposti — Elezzjoni"
        : "Methodology — How we collect proposals — Elezzjoni";
    const description =
      lang === "mt"
        ? "Kif niġbru, nittraduċu u nikkategorizzaw il-proposti politiċi — u l-limiti tal-estrazzjoni bl-AI."
        : "How we collect, translate and categorise political proposals — and the limits of AI-assisted extraction.";
    const url = `https://elezzjoni.app/${lang}/methodology`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { name: "twitter:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: MethodologyPage,
});

function MethodologyPage() {
  const { lang } = Route.useParams();
  const loc: Locale = isLocale(lang) ? lang : "en";
  const c = loc === "mt" ? CONTENT.mt : CONTENT.en;

  return (
    <article className="container mx-auto max-w-3xl px-4 py-12 md:py-16">
      <header className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {loc === "mt" ? "Trasparenza editorjali" : "Editorial transparency"}
        </p>
        <h1 className="mt-2 font-serif text-3xl font-bold text-foreground md:text-4xl">
          {c.title}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {c.lede}
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          {c.badgeExplain}
        </div>
      </header>

      <div className="legal-prose mt-8 space-y-4 text-base leading-relaxed text-foreground [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_a]:underline [&_a]:underline-offset-2 [&_a]:text-foreground hover:[&_a]:text-primary [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1">
        {c.body}
        <p className="mt-10 rounded-md border border-border bg-surface p-4 text-sm text-muted-foreground">
          {loc === "mt" ? "Lura għall-" : "Back to the "}
          <Link to="/$lang/proposals" params={{ lang: loc }}>
            {loc === "mt" ? "proposti" : "proposals"}
          </Link>
          .
        </p>
      </div>
      <SupportNudge />
    </article>
  );
}

const CONTENT = {
  en: {
    title: "How we collect proposals",
    lede:
      "We aggregate political proposals from manifestos, official party communications, candidate statements and reputable news coverage. Many entries start out as drafts extracted by AI; this page explains how that works, what the labels on each card mean, and where the limits are.",
    badgeExplain:
      "Cards labelled “AI-extracted” have not yet been manually reviewed.",
    body: (
      <>
        <h2>What the “AI-extracted” tag means</h2>
        <p>
          A proposal is tagged <strong>AI-extracted</strong> when its text was
          pulled from a source document (a manifesto PDF, a public speech, a
          news article) by a language model, and a human editor has not yet
          modified the wording. The original source link is always preserved on
          the card so you can compare the extract against the primary source.
        </p>
        <p>
          As soon as an editor edits the title or description — to correct a
          mistranslation, tighten an over-broad summary, or split a paragraph
          that bundled several distinct ideas — the tag is removed and the
          proposal is shown without it.
        </p>

        <h2>Why we use AI at all</h2>
        <p>
          A typical Maltese general election produces thousands of proposals
          spread across hundreds of pages of manifestos, dozens of press
          conferences and a continuous stream of media coverage. Reading all of
          it by hand, in two languages, on the timescale that voters actually
          need, is not realistic for a small editorial team. AI lets us index
          source material quickly and produce a first draft that a human can
          then verify, edit, or reject.
        </p>

        <h2>The hard part: staying faithful to the source</h2>
        <p>
          Extracting a proposal “objectively” is harder than it sounds.
          Political language is deliberately ambiguous: a sentence like “we
          will strengthen support for working families” is a promise, a slogan
          and a framing all at once. Any short summary necessarily drops some
          of that, and every choice — which clause to keep, which qualifier to
          drop, whether to call something a “plan” or a “commitment” — shifts
          meaning.
        </p>
        <p>Specific failure modes we watch for:</p>
        <ul>
          <li>
            <strong>Over-confidence.</strong> Aspirational language (“we
            aspire to”, “we will explore”) being flattened into firm pledges.
          </li>
          <li>
            <strong>Loss of conditions.</strong> Numbers, deadlines, eligibility
            criteria or funding sources being dropped from the summary even
            though they materially change what is being proposed.
          </li>
          <li>
            <strong>Bundling.</strong> Two or three distinct measures in the
            same paragraph being merged into a single, vaguer proposal.
          </li>
          <li>
            <strong>Translation drift.</strong> Connotations that do not carry
            cleanly between Maltese and English, especially around words with
            civic or religious weight.
          </li>
          <li>
            <strong>Category framing.</strong> The same measure can credibly
            sit under “economy”, “families”, or “tax” — the chosen category
            subtly biases how readers compare parties.
          </li>
        </ul>

        <h2>Our editorial workflow</h2>
        <ul>
          <li>
            <strong>Ingestion.</strong> Source documents are fetched from
            party websites, the Electoral Commission, official social channels
            and public news sites. We store the URL with every proposal.
          </li>
          <li>
            <strong>Extraction.</strong> An AI model produces a draft title,
            description, language pair (English / Maltese) and suggested
            category. The draft is created with <code>status = pending review</code>{" "}
            and the <strong>AI-extracted</strong> tag set.
          </li>
          <li>
            <strong>Human review.</strong> An editor compares the draft against
            the source, corrects wording, adjusts the category, merges
            duplicates, or rejects the proposal entirely. Any edit clears the
            AI-extracted tag.
          </li>
          <li>
            <strong>Publication.</strong> Only proposals marked{" "}
            <code>published</code> appear on the public site. The AI-extracted
            tag is independent of that — it simply tells you whether a human
            has touched the wording yet.
          </li>
        </ul>

        <h2>What this means for you</h2>
        <p>
          Treat AI-extracted entries as a faithful pointer to the source, not
          as our final editorial judgement. If a proposal materially affects
          how you vote, open the source link and read the original sentence in
          context. If you believe an extract misrepresents the source, please{" "}
          <Link to="/$lang/contact" params={{ lang: "en" }}>contact us</Link>{" "}
          — corrections are usually live within a day.
        </p>

        <h2>What does <em>not</em> use AI</h2>
        <ul>
          <li>Candidate identity, party affiliation and district assignments.</li>
          <li>
            Merges between duplicate proposals — these are always made by a
            human editor and recorded in the audit log.
          </li>
          <li>Roles, sources of funding, and the public API contract.</li>
        </ul>
      </>
    ),
  },
  mt: {
    title: "Kif niġbru l-proposti",
    lede:
      "Niġbru proposti politiċi minn manifesti, komunikazzjonijiet uffiċjali tal-partiti, dikjarazzjonijiet ta' kandidati u kopertura tal-aħbarijiet ta' min joqgħod fuqha. Ħafna jibdew bħala abbozzi estratti bl-AI; din il-paġna tispjega kif jaħdem dan, xi jfissru t-tikketti fuq kull karta, u fejn jinsabu l-limiti.",
    badgeExplain:
      "Karti b'tikketta “Estratti bl-AI” għadhom ma ġewx riveduti minn editur.",
    body: (
      <>
        <h2>Xi tfisser it-tikketta “Estratta bl-AI”</h2>
        <p>
          Proposta tiġi mmarkata <strong>Estratta bl-AI</strong> meta t-test
          tagħha jkun ġie estratt minn dokument sors (PDF ta' manifest, diskors
          pubbliku, artiklu fl-aħbarijiet) minn mudell tal-lingwa, u editur
          uman għadu ma bidilx il-kliem. Il-link għas-sors oriġinali dejjem
          jinżamm fil-karta biex tkun tista' tqabbel l-estratt mas-sors.
        </p>
        <p>
          Hekk kif editur ibiddel it-titlu jew id-deskrizzjoni — biex
          jikkoreġi traduzzjoni żbaljata, isaħħaħ sommarju ġenerali wisq, jew
          jaqsam paragrafu li jiġbor diversi ideat — it-tikketta titneħħa.
        </p>

        <h2>Għaliex nużaw l-AI</h2>
        <p>
          Elezzjoni ġenerali Maltija tipproduċi eluf ta' proposti mferrxin fuq
          mijiet ta' paġni ta' manifesti, għexieren ta' konferenzi stampa u
          fluss kontinwu ta' kopertura medjatika. Li dan kollu jinqara bl-idejn,
          f'żewġ lingwi, fl-iskala ta' żmien li jeħtieġu l-votanti, ma huwiex
          realistiku għal tim editorjali żgħir. L-AI tippermettilna nindiċjaw
          il-materjal malajr u nipproduċu abbozz li mbagħad uman jista' jivverifika.
        </p>

        <h2>L-iktar parti diffiċli: nibqgħu fidili lejn is-sors</h2>
        <p>
          Li testratta proposta b'mod “oġġettiv” huwa eħrex milli jidher.
          Il-lingwa politika hija ambigwa apposta: frażi bħal “se nsaħħu
          l-għajnuna lill-familji li jaħdmu” hija fl-istess waqt wegħda,
          slogan u twemmin. Sommarju qasir bilfors jitlef xi parti minn dan, u
          kull għażla — liema klawżola tinżamm, liema kelma tiġi mwarrba, jekk
          xi ħaġa tissejjaħx “pjan” jew “impenn” — tbiddel it-tifsira.
        </p>
        <p>Problemi speċifiċi li nfittxu:</p>
        <ul>
          <li>
            <strong>Fiduċja żejda.</strong> Lingwa aspirazzjonali (“naspiraw
            li…”, “se nistudjaw”) titqies bħala wegħda soda.
          </li>
          <li>
            <strong>Telf ta' kundizzjonijiet.</strong> Numri, skadenzi, kriterji
            ta' eliġibbiltà jew sorsi ta' finanzjament jaqgħu mis-sommarju anke
            jekk jibdlu sostanzjalment x'qed jiġi propost.
          </li>
          <li>
            <strong>Tgħaqqid.</strong> Tnejn jew tliet miżuri distinti
            jingħaqdu fi proposta waħda iktar ġenerali.
          </li>
          <li>
            <strong>Drift fit-traduzzjoni.</strong> Konnotazzjonijiet li ma
            jaqsmux b'mod nadif bejn il-Malti u l-Ingliż.
          </li>
          <li>
            <strong>Inkwadratura tal-kategorija.</strong> L-istess miżura
            tista' kredibilment titqiegħed taħt “ekonomija”, “familji” jew
            “taxxi” — il-kategorija magħżula tinfluwenza l-paragun.
          </li>
        </ul>

        <h2>Il-fluss editorjali tagħna</h2>
        <ul>
          <li>
            <strong>Ġbir.</strong> Id-dokumenti tas-sors jinġiebu mis-siti tal-partiti,
            mill-Kummissjoni Elettorali, mill-kanali soċjali uffiċjali u minn
            siti tal-aħbarijiet pubbliċi. Ma' kull proposta nżommu l-URL tas-sors.
          </li>
          <li>
            <strong>Estrazzjoni.</strong> Mudell AI jipproduċi abbozz ta' titlu,
            deskrizzjoni, par lingwistiku (Ingliż / Malti) u kategorija
            ssuġġerita. L-abbozz jinħoloq bi status{" "}
            <code>pending review</code> u t-tikketta{" "}
            <strong>Estratta bl-AI</strong> tinżamm.
          </li>
          <li>
            <strong>Reviżjoni umana.</strong> Editur iqabbel l-abbozz
            mas-sors, jikkoreġi l-kliem, jaġġusta l-kategorija, jgħaqqad
            duplikati, jew jirrifjuta l-proposta. Kull bidla tneħħi t-tikketta.
          </li>
          <li>
            <strong>Pubblikazzjoni.</strong> Fuq is-sit pubbliku jidhru biss
            proposti b'status <code>published</code>. It-tikketta hija
            indipendenti minn dan — sempliċement tgħidlek jekk uman messx
            mal-kliem.
          </li>
        </ul>

        <h2>X'ifisser dan għalik</h2>
        <p>
          Ittratta l-entrati estratti bl-AI bħala indikatur fidil tas-sors,
          mhux bħala l-ġudizzju editorjali finali tagħna. Jekk proposta
          tinfluwenza sostanzjalment kif tivvota, iftaħ il-link tas-sors u
          aqra s-sentenza oriġinali fil-kuntest. Jekk taħseb li estratt
          jirrappreżenta ħażin is-sors,{" "}
          <Link to="/$lang/contact" params={{ lang: "mt" }}>ikkuntattjana</Link>
          {" "}— il-korrezzjonijiet normalment isiru fl-istess ġurnata.
        </p>

        <h2>X'<em>ma</em> jużax AI</h2>
        <ul>
          <li>L-identità tal-kandidati, l-affiljazzjoni mal-partit u d-distretti.</li>
          <li>
            Tgħaqqid bejn proposti duplikati — dawn dejjem isiru minn editur
            uman u jiġu rreġistrati fil-log tal-awditjar.
          </li>
          <li>Rwoli, sorsi ta' finanzjament, u l-kuntratt tal-API pubblika.</li>
        </ul>
      </>
    ),
  },
};
