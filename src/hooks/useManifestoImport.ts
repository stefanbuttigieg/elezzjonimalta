// Poll a manifesto import row until it reaches a terminal status.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getManifestoImportStatus } from "@/server/manifestoImport.functions";

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
  error: string | null;
  extracted: unknown[];
  summary: Record<string, unknown>;
}

export function useManifestoImport(importId: string | null) {
  const fn = useServerFn(getManifestoImportStatus);
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

    const tick = async () => {
      try {
        const res = await fn({ data: { importId } });
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setRow(res.row as ManifestoImportRow);
        const status = (res.row as ManifestoImportRow).status;
        if (status === "processing") {
          timer = setTimeout(tick, 2000);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [importId, fn]);

  return { row, error };
}
