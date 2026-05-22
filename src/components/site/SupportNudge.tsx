import { Link, useParams } from '@tanstack/react-router';
import { isLocale, type Locale } from '@/i18n/types';
import { Heart } from 'lucide-react';

const COPY = {
  en: {
    title: 'Help keep Elezzjoni online',
    body: 'Elezzjoni is independent, free for every voter, and entirely ad-free. If it has been useful, a small contribution helps cover hosting and keep the project neutral through the election cycle.',
    cta: 'Support this project',
  },
  mt: {
    title: 'Għin biex Elezzjoni jibqa\' online',
    body: 'Elezzjoni hu indipendenti, b\'xejn għal kull votant, u mingħajr l-ebda reklam. Jekk għenek, kontribuzzjoni żgħira tgħin tkopri l-hosting u żżomm il-proġett newtrali tul l-elezzjoni.',
    cta: 'Appoġġja dan il-proġett',
  },
} as const;

export function SupportNudge() {
  const params = useParams({ strict: false }) as { lang?: string };
  const lang: Locale = isLocale(params.lang) ? params.lang : 'en';
  const t = COPY[lang];
  return (
    <aside className="mt-12 rounded-xl border border-primary/20 bg-primary/5 p-6">
      <div className="flex items-start gap-3">
        <Heart className="mt-0.5 h-5 w-5 flex-none text-primary" aria-hidden />
        <div className="min-w-0">
          <h2 className="font-serif text-lg font-semibold text-foreground">{t.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
          <Link
            to="/$lang/support"
            params={{ lang }}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            {t.cta} →
          </Link>
        </div>
      </div>
    </aside>
  );
}
