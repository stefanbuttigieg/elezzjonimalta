import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export type PageSeoRow = {
  id: string;
  path: string;
  lang: "en" | "mt";
  title: string | null;
  description: string | null;
  og_image: string | null;
  keywords: string[];
  noindex: boolean;
  notes: string | null;
  updated_at: string;
};

/** Strip /en or /mt prefix to a language-agnostic path used as the override key. */
export function normalisePath(pathname: string): { path: string; lang: "en" | "mt" } {
  const m = pathname.match(/^\/(en|mt)(\/.*)?$/);
  if (!m) return { path: pathname || "/", lang: "en" };
  const lang = m[1] as "en" | "mt";
  const rest = m[2] ?? "";
  return { path: rest === "" ? "/" : rest.replace(/\/$/, "") || "/", lang };
}

export function usePageSeoOverride(pathname: string) {
  const { path, lang } = normalisePath(pathname);
  return useQuery({
    queryKey: ["page_seo", path, lang],
    queryFn: async (): Promise<PageSeoRow | null> => {
      const { data } = await supabase
        .from("page_seo")
        .select("*")
        .eq("path", path)
        .eq("lang", lang)
        .maybeSingle();
      return (data as PageSeoRow | null) ?? null;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

function setMeta(selector: string, attr: "name" | "property", attrValue: string, content: string) {
  if (typeof document === "undefined") return () => {};
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  let created = false;
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, attrValue);
    document.head.appendChild(tag);
    created = true;
  }
  const previous = tag.getAttribute("content");
  tag.setAttribute("content", content);
  return () => {
    if (created) tag?.remove();
    else if (previous !== null) tag?.setAttribute("content", previous);
  };
}

/** Mount once in __root. Applies page_seo overrides to the live <head> for the current route. */
export function PageSeoOverride() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data } = usePageSeoOverride(pathname);

  useEffect(() => {
    if (!data) return;
    const cleanups: Array<() => void> = [];
    let prevTitle: string | null = null;

    if (data.title) {
      prevTitle = document.title;
      document.title = data.title;
      cleanups.push(setMeta('meta[property="og:title"]', "property", "og:title", data.title));
      cleanups.push(setMeta('meta[name="twitter:title"]', "name", "twitter:title", data.title));
    }
    if (data.description) {
      cleanups.push(setMeta('meta[name="description"]', "name", "description", data.description));
      cleanups.push(setMeta('meta[property="og:description"]', "property", "og:description", data.description));
      cleanups.push(setMeta('meta[name="twitter:description"]', "name", "twitter:description", data.description));
    }
    if (data.og_image) {
      cleanups.push(setMeta('meta[property="og:image"]', "property", "og:image", data.og_image));
      cleanups.push(setMeta('meta[name="twitter:image"]', "name", "twitter:image", data.og_image));
    }
    if (data.keywords?.length) {
      cleanups.push(setMeta('meta[name="keywords"]', "name", "keywords", data.keywords.join(", ")));
    }
    if (data.noindex) {
      cleanups.push(setMeta('meta[name="robots"]', "name", "robots", "noindex, nofollow"));
    }

    return () => {
      cleanups.forEach((c) => c());
      if (prevTitle !== null) document.title = prevTitle;
    };
  }, [data]);

  return null;
}
