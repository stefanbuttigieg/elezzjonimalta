import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { isLocale, type Locale } from '@/i18n/types';
import { Heart, ShieldCheck, Users, Building2 } from 'lucide-react';

const getSupportersData = createServerFn({ method: 'GET' }).handler(async () => {
  const [patronsRes, donationsRes, financeRes] = await Promise.all([
    supabaseAdmin
      .from('patrons')
      .select('id,name,logo_url,website,disclosure_note,sort_order')
      .eq('published', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('public_donations')
      .select('id,display_name,message,kind,created_at')
      .eq('show_publicly', true)
      .order('created_at', { ascending: false })
      .limit(60),
    supabaseAdmin
      .from('site_finance')
      .select('monthly_cost_eur,currency,notes')
      .eq('singleton', true)
      .maybeSingle(),
  ]);

  return {
    patrons: patronsRes.data ?? [],
    donations: donationsRes.data ?? [],
    finance: financeRes.data ?? null,
  };
});

const supportersQueryOptions = queryOptions({
  queryKey: ['supporters-page'],
  queryFn: () => getSupportersData(),
});

const COPY = {
  en: {
    eyebrow: 'Sustainability · Transparency',
    title: 'Supporters',
    intro:
      'Elezzjoni stays free, neutral, and ad-free thanks to the people and organisations below. Patrons and supporters have no influence over editorial content, party coverage, or candidate profiles.',
    patrons: 'Institutional patrons',
    patronsEmpty: 'No institutional patrons yet — be the first to back the project.',
    individuals: 'Individual supporters',
    individualsEmpty: 'No public supporters yet. People who contribute can choose to be listed here.',
    cost: 'Monthly running cost',
    costSuffix: 'covers hosting, the database, AI categorisation, and ongoing maintenance.',
    supportCta: 'Become a supporter',
    monthly: 'monthly supporter',
    oneOff: 'one-off supporter',
  },
  mt: {
    eyebrow: 'Sostenibbiltà · Trasparenza',
    title: 'Sostenituri',
    intro:
      'Elezzjoni jibqa\' b\'xejn, newtrali u mingħajr reklami grazzi għan-nies u l-organizzazzjonijiet ta\' hawn taħt. Is-sostenituri u l-patruni m\'għandhom l-ebda influwenza fuq il-kontenut editorjali, il-partiti, jew il-kandidati.',
    patrons: 'Patruni istituzzjonali',
    patronsEmpty: 'Għadhom m\'hemmx patruni istituzzjonali — kun l-ewwel li tappoġġja l-proġett.',
    individuals: 'Sostenituri individwali',
    individualsEmpty: 'Għadhom m\'hemm l-ebda sostenituri pubbliċi. Min jikkontribwixxi jista\' jagħżel li jiġi mniżżel hawn.',
    cost: 'Spiża fix-xahar',
    costSuffix: 'tkopri hosting, database, kategorizzazzjoni bl-IA u manutenzjoni kontinwa.',
    supportCta: 'Sir sostenitur',
    monthly: 'sostenitur ta\' kull xahar',
    oneOff: 'sostenitur ta\' darba waħda',
  },
} as const;

export const Route = createFileRoute('/$lang/supporters')({
  head: ({ params }) => {
    const lang = (isLocale(params.lang) ? params.lang : 'en') as Locale;
    const t = COPY[lang];
    return {
      meta: [
        { title: `${t.title} — Elezzjoni` },
        { name: 'description', content: t.intro },
        { property: 'og:title', content: `${t.title} — Elezzjoni` },
        { property: 'og:description', content: t.intro },
      ],
    };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(supportersQueryOptions),
  component: SupportersPage,
});

function SupportersPage() {
  const { lang } = useParams({ from: '/$lang/supporters' });
  const loc: Locale = isLocale(lang) ? lang : 'en';
  const t = COPY[loc];
  const { data } = useSuspenseQuery(supportersQueryOptions);

  return (
    <article className="container mx-auto max-w-4xl px-4 py-12 md:py-16">
      <header className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {t.eyebrow}
        </p>
        <h1 className="mt-2 flex items-center gap-3 font-serif text-3xl font-bold text-foreground md:text-4xl">
          <Heart className="h-7 w-7 text-primary" aria-hidden />
          {t.title}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {t.intro}
        </p>
      </header>

      {data.finance && (
        <section className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-baseline gap-3">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t.cost}
            </h2>
          </div>
          <p className="mt-3 font-serif text-3xl font-bold text-foreground">
            €{Number(data.finance.monthly_cost_eur).toFixed(0)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">/ month</span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.costSuffix}</p>
          {data.finance.notes && (
            <p className="mt-2 text-xs italic text-muted-foreground">{data.finance.notes}</p>
          )}
        </section>
      )}

      <section className="mt-10">
        <h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-foreground">
          <Building2 className="h-5 w-5 text-primary" aria-hidden />
          {t.patrons}
        </h2>
        {data.patrons.length === 0 ? (
          <p className="mt-3 text-sm italic text-muted-foreground">{t.patronsEmpty}</p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {data.patrons.map((p: any) => (
              <li key={p.id} className="flex gap-4 rounded-xl border border-border bg-surface p-4">
                {p.logo_url ? (
                  <img
                    src={p.logo_url}
                    alt={p.name}
                    className="h-12 w-12 flex-none rounded-md object-contain"
                    loading="lazy"
                  />
                ) : (
                  <div className="grid h-12 w-12 flex-none place-items-center rounded-md bg-muted text-sm font-semibold text-muted-foreground">
                    {(p.name || '?').slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0">
                  {p.website ? (
                    <a
                      href={p.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-semibold text-foreground hover:underline"
                    >
                      {p.name}
                    </a>
                  ) : (
                    <p className="font-semibold text-foreground">{p.name}</p>
                  )}
                  {p.disclosure_note && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {p.disclosure_note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-foreground">
          <Users className="h-5 w-5 text-primary" aria-hidden />
          {t.individuals}
        </h2>
        {data.donations.length === 0 ? (
          <p className="mt-3 text-sm italic text-muted-foreground">{t.individualsEmpty}</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.donations.map((d: any) => (
              <li key={d.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-foreground">{d.display_name}</p>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {d.kind === 'monthly' ? t.monthly : t.oneOff}
                  </span>
                </div>
                {d.message && (
                  <p className="mt-2 text-sm italic leading-relaxed text-muted-foreground">
                    "{d.message}"
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-12 text-center">
        <Link
          to="/$lang/support"
          params={{ lang }}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Heart className="h-4 w-4" aria-hidden />
          {t.supportCta}
        </Link>
      </div>
    </article>
  );
}
