import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { type StripeEnv, verifyWebhook } from '@/lib/stripe.server';

function extractFromMetadata(meta: Record<string, string> | undefined | null) {
  if (!meta) return null;
  const show = meta.show_publicly === 'true';
  const displayName = (meta.display_name ?? '').trim();
  if (!show || !displayName) return null;
  return {
    displayName: displayName.slice(0, 60),
    message: ((meta.message ?? '').trim().slice(0, 280) || null) as string | null,
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
  const amount_eur = opts.amountCents != null ? Number(opts.amountCents) / 100 : null;
  await supabaseAdmin
    .from('public_donations')
    .upsert(
      {
        stripe_session_id: opts.sessionId,
        display_name: opts.displayName,
        message: opts.message,
        kind: opts.kind,
        amount_eur,
        show_publicly: true,
      },
      { onConflict: 'stripe_session_id' },
    );
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  if (event.type === 'checkout.session.completed') {
    const session: any = event.data.object;
    if (session.payment_status !== 'paid' && session.status !== 'complete') return;
    const extracted = extractFromMetadata(session.metadata);
    if (!extracted) return;
    await recordPublicDonation({
      sessionId: session.id,
      amountCents: session.amount_total,
      currency: session.currency,
      displayName: extracted.displayName,
      message: extracted.message,
      kind: extracted.kind,
    });
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
