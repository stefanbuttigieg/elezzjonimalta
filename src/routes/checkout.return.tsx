import { createFileRoute, Link } from '@tanstack/react-router';
import { CheckCircle2, Heart } from 'lucide-react';

export const Route = createFileRoute('/checkout/return')({
  head: () => ({
    meta: [
      { title: 'Thank you — Elezzjoni' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === 'string' ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id } = Route.useSearch();
  const completed = Boolean(session_id);

  return (
    <main className="container mx-auto max-w-2xl px-4 py-20">
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
          {completed ? <CheckCircle2 className="h-7 w-7" /> : <Heart className="h-7 w-7" />}
        </div>
        <h1 className="mt-6 font-serif text-3xl font-bold text-foreground">
          {completed ? 'Thank you' : 'Almost there'}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {completed
            ? 'Your contribution helps keep Elezzjoni independent and free for every voter. A receipt has been emailed to you.'
            : 'No payment information was found. You can return to the support page and try again.'}
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/$lang/supporters"
            params={{ lang: 'en' }}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:border-primary/40"
          >
            See the Supporters page
          </Link>
          <Link
            to="/$lang"
            params={{ lang: 'en' }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Back to Elezzjoni
          </Link>
        </div>
      </div>
    </main>
  );
}
