import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // Bundle every lucide icon import into a single chunk so the
            // browser doesn't waterfall dozens of ~1 KB icon files (each was
            // taking 1.4–1.6 s on production due to request queuing).
            "lucide-icons": ["lucide-react"],
          },
        },
      },
    },
  },
});
