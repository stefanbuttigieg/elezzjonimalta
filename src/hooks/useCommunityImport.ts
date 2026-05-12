// Poll a community import row until it reaches a terminal status.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCommunityImportStatus } from "@/server/communityImport.functions";

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
  extracted: unknown[];
  summary: Record<string, unknown>;
}

export function useCommunityImport(importId: string | null) {
  const fn = useServerFn(getCommunityImportStatus);
  const [row, setRow] = useState<CommunityImportRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!importId) { setRow(null); setError(null); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fn({ data: { importId } });
        if (cancelled) return;
        if (!res.ok) { setError(res.error); return; }
        setRow(res.row as CommunityImportRow);
        if ((res.row as CommunityImportRow).status === "processing") {
          timer = setTimeout(tick, 2000);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [importId, fn]);

  return { row, error };
}
