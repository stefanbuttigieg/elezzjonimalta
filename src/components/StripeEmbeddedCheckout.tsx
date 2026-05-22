import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { getStripe, getStripeEnvironment } from '@/lib/stripe';
import { createSupportCheckout } from '@/utils/payments.functions';

interface Props {
  priceId: string;
  displayName?: string;
  message?: string;
  showPublicly?: boolean;
  returnUrl?: string;
}

export function StripeEmbeddedCheckout({
  priceId,
  displayName,
  message,
  showPublicly,
  returnUrl,
}: Props) {
  const fetchClientSecret = async (): Promise<string> => {
    const url = returnUrl || `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;
    const secret = await createSupportCheckout({
      data: {
        priceId,
        displayName,
        message,
        showPublicly,
        returnUrl: url,
        environment: getStripeEnvironment(),
      },
    });
    if (!secret) throw new Error('Could not start checkout');
    return secret;
  };

  return (
    <div id="checkout" className="overflow-hidden rounded-xl border border-border bg-background">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
