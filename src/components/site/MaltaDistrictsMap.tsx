import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Locale } from "@/i18n/types";
import { useT } from "@/i18n/useT";

type Props = {
  locale: Locale;
  candidateCounts?: Record<number, number>;
  height?: number;
  className?: string;
};

type DistrictFeature = {
  type: "Feature";
  properties: { number: number; name: string };
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon;
};

export function MaltaDistrictsMap({
  locale,
  candidateCounts = {},
  height = 460,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const t = useT();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");

        const res = await fetch("/data/malta-districts.geojson");
        const data = (await res.json()) as GeoJSON.FeatureCollection;
        if (cancelled || !containerRef.current) return;

        // Malta bounding box (SW, NE) — covers Malta, Gozo and Comino
        const maltaBounds = L.latLngBounds(
          L.latLng(35.78, 14.17),
          L.latLng(36.10, 14.59)
        );

        const map = L.map(containerRef.current, {
          zoomControl: true,
          scrollWheelZoom: false,
          attributionControl: true,
          minZoom: 10,
          maxBounds: maltaBounds.pad(0.5),
        });

        // Always center on Malta first so the map is useful even if GeoJSON fails.
        map.fitBounds(maltaBounds, { padding: [12, 12] });

        L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 18,
          }
        ).addTo(map);

        const primary =
          getComputedStyle(document.documentElement)
            .getPropertyValue("--primary")
            .trim() || "#1e3a8a";

        const baseStyle = {
          color: primary,
          weight: 1.5,
          opacity: 1,
          fillColor: primary,
          fillOpacity: 0.18,
        };
        const hoverStyle = {
          weight: 2.5,
          fillOpacity: 0.45,
        };

        const layer = L.geoJSON(data as GeoJSON.GeoJsonObject, {
          style: () => baseStyle,
          onEachFeature: (feature, lyr) => {
            const props = (feature as DistrictFeature).properties;
            const count = candidateCounts[props.number] ?? 0;
            const candidatesLabel =
              count > 0
                ? t("districts.candidates.count", { count })
                : t("districts.candidates.none");
            lyr.bindTooltip(
              `<div style="font-weight:600">${t("districts.number", {
                number: props.number,
              })}</div><div>${props.name}</div><div style="font-size:11px;opacity:0.75;margin-top:2px">${candidatesLabel}</div>`,
              { sticky: true, direction: "top", offset: [0, -4] }
            );
            lyr.on({
              mouseover: (e) => {
                (e.target as L.Path).setStyle(hoverStyle);
              },
              mouseout: (e) => {
                (e.target as L.Path).setStyle(baseStyle);
              },
              click: () => {
                navigate({
                  to: "/$lang/my-district/$number",
                  params: { lang: locale, number: String(props.number) },
                });
              },
            });
          },
        }).addTo(map);

        map.fitBounds(layer.getBounds(), { padding: [12, 12] });

        cleanup = () => {
          map.remove();
        };
      } catch (e) {
        console.error("Failed to load Malta districts map", e);
        if (!cancelled) setError("map_failed");
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  return (
    <div
      className={
        "relative overflow-hidden rounded-xl border border-border bg-surface shadow-card " +
        (className ?? "")
      }
    >
      <div ref={containerRef} style={{ height }} className="w-full" />
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/90 p-4 text-center text-sm text-muted-foreground">
          {t("districts.map.error")}
        </div>
      ) : null}
    </div>
  );
}

export default MaltaDistrictsMap;
