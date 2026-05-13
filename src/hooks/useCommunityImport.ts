// Drive a community import forward by repeatedly calling tickCommunityImport,
// and surface the latest persisted row to the UI.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getCommunityImportStatus,
  tickCommunityImport,
} from "@/server/communityImport.functions";

export interface CommunityImportRow {
  id: string;
  author_id: string;
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

export function useCommunityImport(importId: string | null) {
  const statusFn = useServerFn(getCommunityImportStatus);
  const tickFn = useServerFn(tickCommunityImport);
  const [row, setRow] = useState<CommunityImportRow | null>(null);
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
      const r = res.row as CommunityImportRow;
      setRow(r);
      return r;
    };

    const loop = async () => {
      try {
        const r = await refreshStatus();
        if (cancelled || !r) return;
        if (r.status !== "processing") return;

        const t = await tickFn({ data: { importId } });
        if (cancelled) return;
        if (!t.ok) {
          setError(t.error);
          await refreshStatus();
          return;
        }
        await refreshStatus();
        if (cancelled) return;
        if (t.done) return;
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
