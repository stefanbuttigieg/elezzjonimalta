// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Relax TanStack Start's import-protection file pattern back to the upstream default
// `**/*.server.*`. Some hosted environments use a stricter `**/server/**` rule that
// also blocks `src/server/*.functions.ts` server-function files — but those are
// `createServerFn()` modules that get RPC-bridged at build time and are meant to be
// imported from the client.
export default defineConfig({
  tanstackStart: {
    importProtection: {
      client: {
        files: ["**/*.server.*"],
      },
    },
  },
});
