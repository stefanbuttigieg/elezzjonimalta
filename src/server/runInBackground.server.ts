// Schedule a promise to keep running after the current server response is sent.
//
// On Cloudflare Workers / Bun / Deno (via srvx adapters used by TanStack Start),
// the runtime attaches `request.n` (the minified `waitUntil`) to the incoming
// Request. Without calling it, any unawaited promise spawned from a server
// function is cancelled the moment the response is returned — which is why
// long-running document imports were getting stuck at "Queued…".
//
// This helper grabs the current request via TanStack's AsyncLocalStorage and
// hands the promise to the platform's waitUntil when available. In dev (Node)
// where there is no waitUntil, we just let the promise run unawaited (the
// Node process keeps the loop alive on its own).

import { getRequest } from "@tanstack/react-start/server";

export function runInBackground(work: Promise<unknown>): void {
  const safe = work.catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("background task failed:", msg);
  });

  try {
    const req = getRequest() as unknown as {
      n?: (p: Promise<unknown>) => void;
      waitUntil?: (p: Promise<unknown>) => void;
    };
    const waitUntil = req.waitUntil ?? req.n;
    if (typeof waitUntil === "function") {
      waitUntil.call(req, safe);
      return;
    }
  } catch {
    // No active request context (e.g. invoked outside a handler); fall through.
  }

  // Fallback: no waitUntil available — let it run unawaited.
  void safe;
}
