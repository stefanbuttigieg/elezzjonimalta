import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/types";

type Props = {
  locale: Locale;
  candidateCounts?: Record<number, number>;
  height?: number;
  className?: string;
};

const MaltaDistrictsMap = lazy(() =>
  import("./MaltaDistrictsMap").then((m) => ({ default: m.MaltaDistrictsMap })),
);

/**
 * Defers loading the Leaflet bundle, the map CSS and the 400 KB Malta
 * GeoJSON until the map scrolls near the viewport. The wrapper reserves
 * the final height up front to avoid layout shift.
 */
export function LazyMaltaDistrictsMap({ height = 460, className, ...rest }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  if (visible) {
    return (
      <Suspense
        fallback={
          <div
            className={
              "rounded-xl border border-border bg-surface shadow-card " +
              (className ?? "")
            }
            style={{ height }}
          />
        }
      >
        <MaltaDistrictsMap height={height} className={className} {...rest} />
      </Suspense>
    );
  }

  return (
    <div
      ref={ref}
      className={
        "rounded-xl border border-border bg-surface shadow-card " + (className ?? "")
      }
      style={{ height }}
      aria-hidden="true"
    />
  );
}

export default LazyMaltaDistrictsMap;
