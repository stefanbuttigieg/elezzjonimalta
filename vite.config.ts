import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Bundle every lucide icon import into a single chunk so the
            // browser doesn't waterfall dozens of ~1 KB icon files (each was
            // taking 1.4–1.6 s on production due to request queuing).
            if (id.includes("node_modules/lucide-react/")) {
              return "lucide-icons";
            }
          },
        },
      },
    },
  },
});
