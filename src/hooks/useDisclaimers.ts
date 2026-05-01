import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SiteDisclaimer {
  id: string;
  title: string;
  message: string;
  variant: string;
  is_active: boolean;
  placement: string[];
  created_at: string;
  updated_at: string;
}

/**
 * Fetch active disclaimers for a given placement key.
 * If `placement` is provided, results include any disclaimer whose
 * placement list includes that key OR the special "global" key.
 */
export function useDisclaimers(placement?: string) {
  return useQuery({
    queryKey: ["site-disclaimers", placement],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_disclaimers" as any)
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const rows = (data as unknown as SiteDisclaimer[]) || [];
      if (placement) {
        return rows.filter(
          (d) => d.placement.includes(placement) || d.placement.includes("global"),
        );
      }
      return rows;
    },
    staleTime: 60_000,
  });
}

export function useAllDisclaimers() {
  return useQuery({
    queryKey: ["site-disclaimers-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_disclaimers" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as SiteDisclaimer[]) || [];
    },
  });
}

export function useUpsertDisclaimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: Partial<SiteDisclaimer> & { id: string }) => {
      const { data, error } = await supabase
        .from("site_disclaimers" as any)
        .upsert(d as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-disclaimers"] });
      qc.invalidateQueries({ queryKey: ["site-disclaimers-all"] });
      toast.success("Disclaimer saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteDisclaimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("site_disclaimers" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-disclaimers"] });
      qc.invalidateQueries({ queryKey: ["site-disclaimers-all"] });
      toast.success("Disclaimer deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
