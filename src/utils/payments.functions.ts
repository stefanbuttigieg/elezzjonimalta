import { createServerFn } from '@tanstack/react-start';
import { type StripeEnv, createStripeClient } from '@/lib/stripe.server';

export const createSupportCheckout = createServerFn({ method: 'POST' })
  .inputValidator((data: {
    priceId: string;
    displayName?: string;
    message?: string;
    showPublicly?: boolean;
    returnUrl: string;
    environment: StripeEnv;
  }) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(data.priceId)) throw new Error('Invalid priceId');
    if (data.displayName && data.displayName.length > 60) throw new Error('Display name too long');
    if (data.message && data.message.length > 280) throw new Error('Message too long');
    if (!/^https?:\/\//.test(data.returnUrl)) throw new Error('Invalid returnUrl');
    return data;
  })
  .handler(async ({ data }) => {
    const stripe = createStripeClient(data.environment);

    const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
    if (!prices.data.length) throw new Error('Price not found');
    const stripePrice = prices.data[0];
    const isRecurring = stripePrice.type === 'recurring';

    let productDescription: string | undefined;
    if (!isRecurring) {
      const productId = typeof stripePrice.product === 'string'
        ? stripePrice.product
        : stripePrice.product.id;
      const product = await stripe.products.retrieve(productId);
      productDescription = product.name;
    }

    const displayName = (data.displayName ?? '').trim().slice(0, 60);
    const message = (data.message ?? '').trim().slice(0, 280);
    const showPublicly = Boolean(data.showPublicly && displayName);

    const sharedMetadata: Record<string, string> = {
      kind: isRecurring ? 'monthly' : 'one_off',
      show_publicly: showPublicly ? 'true' : 'false',
    };
    if (displayName) sharedMetadata.display_name = displayName;
    if (message) sharedMetadata.message = message;

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: isRecurring ? 'subscription' : 'payment',
      ui_mode: 'embedded_page',
      return_url: data.returnUrl,
      metadata: sharedMetadata,
      ...(isRecurring
        ? { subscription_data: { metadata: sharedMetadata } }
        : { payment_intent_data: { description: productDescription, metadata: sharedMetadata } }),
    });

    return session.client_secret;
  });
