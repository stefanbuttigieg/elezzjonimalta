// Drive a manifesto import forward by repeatedly calling tickManifestoImport,
// and surface the latest persisted row to the UI.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getManifestoImportStatus,
  tickManifestoImport,
} from "@/server/manifestoImport.functions";

export interface ManifestoImportRow {
  id: string;
  party_id: string;
  source_url: string | null;
  source_kind: "pdf" | "html" | "upload";
  file_path: string | null;
  language: "en" | "mt" | "both";
  page_count: number | null;
  status: "processing" | "ready" | "applied" | "failed" | "cancelled";
  stage: string | null;
  progress: number | null;
  error: string | null;
  error_stack: string | null;
  logs: { at: string; pct: number; stage: string }[];
  extracted: unknown[];
  summary: Record<string, unknown>;
}

export function useManifestoImport(importId: string | null) {
  const statusFn = useServerFn(getManifestoImportStatus);
  const tickFn = useServerFn(tickManifestoImport);
  const [row, setRow] = useState<ManifestoImportRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!importId) {
      setRow(null);
      setError(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refreshStatus = async () => {
      const res = await statusFn({ data: { importId } });
      if (cancelled) return null;
      if (!res.ok) {
        setError(res.error);
        return null;
      }
      const r = res.row as ManifestoImportRow;
      setRow(r);
      return r;
    };

    const loop = async () => {
      try {
        const r = await refreshStatus();
        if (cancelled || !r) return;
        if (r.status !== "processing") return; // terminal — stop driving

        // Drive one step. The tick fn returns when its single phase finishes.
        const t = await tickFn({ data: { importId } });
        if (cancelled) return;
        if (!t.ok) {
          setError(t.error);
          // Refresh to surface the failure row.
          await refreshStatus();
          return;
        }
        await refreshStatus();
        if (cancelled) return;
        if (t.done) return;
        // Schedule the next tick. Small delay so the UI can repaint and so
        // we don't hammer the server if the previous tick was very fast.
        timer = setTimeout(loop, 500);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [importId, statusFn, tickFn]);

  return { row, error };
}
