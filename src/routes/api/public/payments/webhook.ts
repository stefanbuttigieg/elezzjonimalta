import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import { type StripeEnv, verifyWebhook } from '@/lib/stripe.server';

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

function extractFromMetadata(meta: Record<string, string> | undefined | null) {
  if (!meta) return null;
  const show = meta.show_publicly === 'true';
  const displayName = (meta.display_name ?? '').trim();
  if (!show || !displayName) return null;
  return {
    display_name: displayName.slice(0, 60),
    message: (meta.message ?? '').trim().slice(0, 280) || null,
    kind: meta.kind === 'monthly' ? 'monthly' : 'one_off',
  };
}

async function recordPublicDonation(opts: {
  sessionId: string;
  amountCents: number | null | undefined;
  currency: string | null | undefined;
  displayName: string;
  message: string | null;
  kind: string;
}) {
  if ((opts.currency ?? '').toLowerCase() !== 'eur') return;
  const amountEur = opts.amountCents != null ? Number(opts.amountCents) / 100 : null;
  // Upsert by stripe_session_id so retries don't duplicate.
  await getSupabase()
    .from('public_donations')
    .upsert(
      {
        stripe_session_id: opts.sessionId,
        display_name: opts.displayName,
        message: opts.message,
        kind: opts.kind,
        amount_eur: amountEur,
        show_publicly: true,
      },
      { onConflict: 'stripe_session_id' },
    );
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session: any = event.data.object;
      if (session.payment_status !== 'paid' && session.status !== 'complete') break;
      const extracted = extractFromMetadata(session.metadata);
      if (!extracted) break;
      await recordPublicDonation({
        sessionId: session.id,
        amountCents: session.amount_total,
        currency: session.currency,
        ...extracted,
      });
      break;
    }
    default:
      // ignore — we only display opt-in supporters.
      break;
  }
}

export const Route = createFileRoute('/api/public/payments/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get('env');
        if (rawEnv !== 'sandbox' && rawEnv !== 'live') {
          return Response.json({ received: true, ignored: 'invalid env' });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error('Webhook error:', e);
          return new Response('Webhook error', { status: 400 });
        }
      },
    },
  },
});
