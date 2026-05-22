const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken?.startsWith('pk_test_')) return null;
  return (
    <div className="w-full border-b border-orange-300 bg-orange-100 px-4 py-2 text-center text-sm text-orange-900">
      Test mode — no real card will be charged. Use card{' '}
      <code className="font-mono">4242 4242 4242 4242</code> with any future expiry and CVC.
    </div>
  );
}
