import { useState } from 'react';
import { createFileRoute, useParams } from '@tanstack/react-router';
import { isLocale, type Locale } from '@/i18n/types';
import { StripeEmbeddedCheckout } from '@/components/StripeEmbeddedCheckout';
import { PaymentTestModeBanner } from '@/components/PaymentTestModeBanner';
import { Heart, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from '@tanstack/react-router';

type Kind = 'one_off' | 'monthly';

const TIERS: Record<Kind, { priceId: string; amount: number; label: string }[]> = {
  one_off: [
    { priceId: 'support_one_off_5', amount: 5, label: '€5' },
    { priceId: 'support_one_off_15', amount: 15, label: '€15' },
    { priceId: 'support_one_off_50', amount: 50, label: '€50' },
  ],
  monthly: [
    { priceId: 'supporter_monthly_3', amount: 3, label: '€3' },
    { priceId: 'supporter_monthly_10', amount: 10, label: '€10' },
    { priceId: 'supporter_monthly_25', amount: 25, label: '€25' },
  ],
};

const COPY = {
  en: {
    eyebrow: 'Independent · Reader-supported',
    title: 'Support Elezzjoni',
    intro:
      'Elezzjoni is an independent civic project — free for every voter, with no ads, no paywalls, and no political affiliations. Running it costs a small amount each month for hosting, the database, and the AI that helps categorise thousands of proposals.',
    intro2:
      'If the site has helped you understand the election a little better, a one-off contribution or a small monthly amount keeps it neutral and online.',
    tabOneOff: 'One-off',
    tabMonthly: 'Monthly',
    chooseAmount: 'Choose an amount',
    perMonth: 'per month',
    optionalHeading: 'Optional — only if you want to be listed publicly',
    namePlaceholder: 'Your name (optional)',
    messagePlaceholder: 'A short message (optional)',
    showOnPage: 'Show my name on the public Supporters page',
    continue: 'Continue to payment',
    cancel: 'Cancel',
    neutralityTitle: 'Editorial independence',
    neutralityBody:
      'Supporters and patrons have no influence over the candidates, parties, or proposals shown on this site. Every contribution is acknowledged the same way regardless of size.',
    transparencyTitle: 'Where it goes',
    transparencyBody:
      'Hosting, database storage, the AI that categorises party proposals, and ongoing maintenance through the 2026 election cycle. See live costs on the ',
    supportersLink: 'Supporters page',
    safetyTitle: 'Secure payment',
    safetyBody:
      'Payments are handled by Stripe. We never see or store your card details, and your email stays with Stripe — not in our database.',
  },
  mt: {
    eyebrow: 'Indipendenti · Sostnut mill-qarrejja',
    title: 'Appoġġja lil Elezzjoni',
    intro:
      'Elezzjoni hu proġett ċiviku indipendenti — b\'xejn għal kull votant, mingħajr reklami, mingħajr ħlasijiet, u mingħajr rabtiet politiċi. Biex jibqa\' għaddej iqum ftit kull xahar għall-hosting, id-database, u l-IA li tikkategorizza eluf ta\' proposti.',
    intro2:
      'Jekk is-sit għenek tifhem aktar dwar l-elezzjoni, kontribuzzjoni waħdanija jew ammont żgħir kull xahar jgħin biex jibqa\' newtrali u online.',
    tabOneOff: 'Darba waħda',
    tabMonthly: 'Kull xahar',
    chooseAmount: 'Agħżel ammont',
    perMonth: 'fix-xahar',
    optionalHeading: 'Mhux meħtieġ — biss jekk trid tidher pubblikament',
    namePlaceholder: 'Ismek (mhux meħtieġ)',
    messagePlaceholder: 'Messaġġ qasir (mhux meħtieġ)',
    showOnPage: 'Uri ismi fuq il-paġna pubblika ta\' Sostenituri',
    continue: 'Kompli sal-ħlas',
    cancel: 'Ikkanċella',
    neutralityTitle: 'Indipendenza editorjali',
    neutralityBody:
      'Is-sostenituri u l-patruni m\'għandhom l-ebda influwenza fuq il-kandidati, il-partiti, jew il-proposti murija fuq is-sit. Kull kontribuzzjoni hi rikonoxxuta l-istess, irrispettivament mill-ammont.',
    transparencyTitle: 'Fejn imur',
    transparencyBody:
      'Hosting, ħażna tad-database, l-IA li tikkategorizza l-proposti, u manutenzjoni kontinwa tul l-elezzjoni 2026. Ara l-ispejjeż fuq il-',
    supportersLink: 'paġna tas-Sostenituri',
    safetyTitle: 'Ħlas sigur',
    safetyBody:
      'Il-ħlasijiet jiġu pproċessati minn Stripe. Aħna qatt ma naraw jew naħżnu d-dettalji tal-karta tiegħek, u l-email tiegħek tibqa\' ma\' Stripe.',
  },
} as const;

export const Route = createFileRoute('/$lang/support')({
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
  component: SupportPage,
});

function SupportPage() {
  const { lang } = useParams({ from: '/$lang/support' });
  const loc: Locale = isLocale(lang) ? lang : 'en';
  const t = COPY[loc];

  const [kind, setKind] = useState<Kind>('one_off');
  const [priceId, setPriceId] = useState<string>(TIERS.one_off[1].priceId);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [showPublicly, setShowPublicly] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const handleKind = (next: Kind) => {
    setKind(next);
    setPriceId(TIERS[next][1].priceId);
  };

  return (
    <>
      <PaymentTestModeBanner />
      <article className="container mx-auto max-w-3xl px-4 py-12 md:py-16">
        <header className="border-b border-border pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t.eyebrow}
          </p>
          <h1 className="mt-2 flex items-center gap-3 font-serif text-3xl font-bold text-foreground md:text-4xl">
            <Heart className="h-7 w-7 text-primary" aria-hidden />
            {t.title}
          </h1>
        </header>

        <div className="mt-8 space-y-4 text-base leading-relaxed text-foreground">
          <p>{t.intro}</p>
          <p>{t.intro2}</p>
        </div>

        {!checkoutOpen && (
          <section className="mt-10 rounded-2xl border border-border bg-surface p-6 md:p-8">
            <div className="inline-flex rounded-full border border-border bg-background p-1">
              <button
                type="button"
                onClick={() => handleKind('one_off')}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  kind === 'one_off' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.tabOneOff}
              </button>
              <button
                type="button"
                onClick={() => handleKind('monthly')}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  kind === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.tabMonthly}
              </button>
            </div>

            <h2 className="mt-6 text-sm font-semibold text-foreground">{t.chooseAmount}</h2>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {TIERS[kind].map((tier) => (
                <button
                  key={tier.priceId}
                  type="button"
                  onClick={() => setPriceId(tier.priceId)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-4 py-4 text-center transition-colors ${
                    priceId === tier.priceId
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border bg-background text-foreground hover:border-primary/40'
                  }`}
                >
                  <span className="font-serif text-2xl font-semibold">{tier.label}</span>
                  {kind === 'monthly' && (
                    <span className="text-xs text-muted-foreground">{t.perMonth}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="mt-8 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t.optionalHeading}
              </p>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 60))}
                placeholder={t.namePlaceholder}
                maxLength={60}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 280))}
                placeholder={t.messagePlaceholder}
                maxLength={280}
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showPublicly}
                  disabled={!name.trim()}
                  onChange={(e) => setShowPublicly(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                {t.showOnPage}
              </label>
            </div>

            <button
              type="button"
              onClick={() => setCheckoutOpen(true)}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Heart className="h-4 w-4" aria-hidden />
              {t.continue}
            </button>
          </section>
        )}

        {checkoutOpen && (
          <section className="mt-10">
            <button
              type="button"
              onClick={() => setCheckoutOpen(false)}
              className="mb-4 text-sm text-muted-foreground hover:text-foreground"
            >
              ← {t.cancel}
            </button>
            <StripeEmbeddedCheckout
              priceId={priceId}
              displayName={name.trim() || undefined}
              message={message.trim() || undefined}
              showPublicly={showPublicly && Boolean(name.trim())}
            />
          </section>
        )}

        <section className="mt-12 grid gap-4 md:grid-cols-3">
          <InfoCard icon={<ShieldCheck className="h-5 w-5 text-primary" />} title={t.neutralityTitle}>
            {t.neutralityBody}
          </InfoCard>
          <InfoCard icon={<Sparkles className="h-5 w-5 text-primary" />} title={t.transparencyTitle}>
            <>
              {t.transparencyBody}
              <Link
                to="/$lang/supporters"
                params={{ lang }}
                className="underline underline-offset-2 hover:text-primary"
              >
                {t.supportersLink}
              </Link>
              .
            </>
          </InfoCard>
          <InfoCard icon={<ShieldCheck className="h-5 w-5 text-primary" />} title={t.safetyTitle}>
            {t.safetyBody}
          </InfoCard>
        </section>
      </article>
    </>
  );
}

function InfoCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
