// Builds public/data/malta-districts.geojson by:
// 1. Fetching all admin_level=8 boundaries in Malta from Overpass.
// 2. Mapping each OSM locality (Maltese name) → electoral district number.
// 3. Unioning the polygons per district into a single MultiPolygon.
//
// Run: bun scripts/build-malta-districts.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import osmtogeojson from "osmtogeojson";
import { union } from "@turf/union";
import { featureCollection } from "@turf/helpers";

// OSM Maltese name → district number.
// "(part)" localities are assigned to their MAJORITY district; this is an
// approximation since OSM has the whole council as one polygon.
const LOCALITY_TO_DISTRICT = {
  // District 1 — Valletta & Inner Harbour
  "Il-Belt Valletta": 1,
  "Il-Furjana": 1,
  "Ħal Qormi": 6, // Qormi is mainly D6
  "Ħamrun": 1,
  "Il-Ħamrun": 1,
  "Il-Marsa": 1,
  "Tal-Pietà": 1,
  "Santa Venera": 1,

  // District 2 — Cottonera & Żabbar
  "Il-Birgu": 2,
  "L-Isla": 2,
  "Bormla": 2,
  "Ħaż-Żabbar": 2,
  "Il-Kalkara": 2,
  "Ix-Xgħajra": 2,
  "Wied il-Għajn": 3, // Marsaskala — assigned to D3 (majority)

  // District 3 — Żejtun & South-East
  "Iż-Żejtun": 3,
  "Ħal Għaxaq": 3,
  "Marsaxlokk": 3,

  // District 4 — Paola & Tarxien
  "Il-Fgura": 4, // Fgura — assigned to D4 (majority)
  "Il-Gudja": 4,
  "Raħal Ġdid": 4, // Paola
  "Santa Luċija": 4,
  "Ħal Tarxien": 4,

  // District 5 — Birżebbuġa & Żurrieq
  "Birżebbuġa": 5,
  "L-Imqabba": 5,
  "Ħal Kirkop": 5,
  "Il-Qrendi": 5,
  "Ħal Safi": 5,
  "Iż-Żurrieq": 5,

  // District 6 — Qormi, Siġġiewi & Luqa
  "Is-Siġġiewi": 6,
  "Ħal Luqa": 6,

  // District 7 — Mdina, Rabat & Western Villages
  "L-Imdina": 7,
  "Ħaż-Żebbuġ": 7, // Żebbuġ Malta
  "Ħad-Dingli": 7,
  "L-Imtarfa": 7,
  "Ir-Rabat": 7, // Rabat Malta

  // District 8 — Birkirkara & Central Villages
  "Ħal Balzan": 8,
  "Birkirkara": 8,
  "L-Iklin": 8,
  "Ħal Lija": 8,
  "In-Naxxar": 8, // Naxxar — assigned to D8 (majority)

  // District 9 — Msida, San Ġwann & Swieqi
  "Ħal Għargħur": 9,
  "L-Imsida": 9,
  "San Ġwann": 9,
  "Is-Swieqi": 9,
  "Ta' Xbiex": 9,

  // District 10 — Sliema & St Julian's
  "Il-Gżira": 10,
  "Pembroke": 10,
  "San Ġiljan": 10,
  "Tas-Sliema": 10,

  // District 11 — Attard & Mosta
  "Ħ'Attard": 11,
  "Il-Mosta": 11,

  // District 12 — Mġarr, Mellieħa & St Paul's Bay
  "L-Imġarr": 12,
  "Il-Mellieħa": 12,
  "San Pawl il-Baħar": 12,

  // District 13 — Gozo & Comino
  "Il-Belt Victoria": 13,
  "Ir-Rabat (Għawdex)": 13,
  "Il-Fontana": 13,
  "Għajnsielem": 13,
  "L-Għarb": 13,
  "L-Għasri": 13,
  "Ta' Kerċem": 13,
  "Il-Munxar": 13,
  "In-Nadur": 13,
  "Il-Qala": 13,
  "San Lawrenz": 13,
  "Ta' Sannat": 13,
  "Ix-Xagħra": 13,
  "Ix-Xewkija": 13,
  "Iż-Żebbuġ": 13, // Żebbuġ Gozo (the only Żebbuġ in OSM list with this exact form? collision risk!)
};

const DISTRICT_NAMES = {
  1: "Valletta & Inner Harbour",
  2: "Cottonera & Żabbar",
  3: "Żejtun & South-East",
  4: "Paola & Tarxien",
  5: "Birżebbuġa & Żurrieq",
  6: "Qormi, Siġġiewi & Luqa",
  7: "Mdina, Rabat & Western Villages",
  8: "Birkirkara & Central Villages",
  9: "Msida, San Ġwann & Swieqi",
  10: "Sliema & St Julian's",
  11: "Attard & Mosta",
  12: "Mġarr, Mellieħa & St Paul's Bay",
  13: "Gozo & Comino",
};

// Note on collisions:
// - "Iż-Żebbuġ" exists for both Malta (D7) and Gozo (D13) in OSM.
//   Disambiguated below using is_in:region tag.
// - "Santa Luċija" exists for both Malta (D4) and Gozo (D13, part of Kerċem).
//   Gozo's Santa Luċija is NOT a separate council, so OSM only has the Malta one.
// - "Ir-Rabat" exists for both Malta (D7) and Gozo (Victoria, D13).
//   Disambiguated below.

const OVERPASS_QUERY = `
[out:json][timeout:90];
area["ISO3166-1"="MT"][admin_level=2]->.mt;
relation(area.mt)["boundary"="administrative"]["admin_level"="8"];
(._;>;);
out body;
`;

async function main() {
  console.log("Fetching OSM data via Overpass…");
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: "data=" + encodeURIComponent(OVERPASS_QUERY),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "elezzjoni-app/1.0 (district map builder)",
    },
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const osm = await res.json();
  console.log(`OSM elements: ${osm.elements.length}`);

  const gj = osmtogeojson(osm);
  // Keep only polygonal admin boundaries.
  const localityFeatures = gj.features.filter(
    (f) =>
      f.properties &&
      f.properties.boundary === "administrative" &&
      f.properties.admin_level === "8" &&
      (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
  );
  console.log(`Locality polygons: ${localityFeatures.length}`);

  // Group by district number, with disambiguation.
  const byDistrict = new Map();
  const unmatched = [];
  for (const f of localityFeatures) {
    const name = f.properties.name;
    let district = LOCALITY_TO_DISTRICT[name];

    // Disambiguate Malta vs Gozo namesakes. Region tags in OSM are unreliable
    // for Maltese councils, so we fall back to geographic position: anything
    // with a centroid latitude >= 36.0 is on Gozo/Comino.
    const region =
      f.properties["is_in:region"] ||
      f.properties["addr:region"] ||
      f.properties["is_in"] ||
      "";
    let inGozo = /gozo|għawdex/i.test(region);
    if (!inGozo) {
      // Centroid latitude check
      const coordsStr = JSON.stringify(f.geometry.coordinates);
      const nums = coordsStr.match(/-?[\d.]+/g);
      if (nums) {
        const lats = [];
        for (let i = 1; i < nums.length; i += 2) lats.push(Number(nums[i]));
        const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
        if (avgLat >= 36.0) inGozo = true;
      }
    }

    if (name === "Iż-Żebbuġ") district = inGozo ? 13 : 7;
    if (name === "Ir-Rabat") district = inGozo ? 13 : 7;
    if (name === "Santa Luċija") district = inGozo ? 13 : 4;

    if (!district) {
      unmatched.push(name);
      continue;
    }
    if (!byDistrict.has(district)) byDistrict.set(district, []);
    byDistrict.get(district).push(f);
  }

  if (unmatched.length) {
    console.warn("Unmatched OSM localities (skipped):", unmatched);
  }

  const districtFeatures = [];
  for (let n = 1; n <= 13; n++) {
    const parts = byDistrict.get(n) || [];
    if (!parts.length) {
      console.warn(`District ${n} has no parts!`);
      continue;
    }
    let merged = parts[0];
    for (let i = 1; i < parts.length; i++) {
      try {
        merged = union(featureCollection([merged, parts[i]])) || merged;
      } catch (e) {
        console.warn(`Union failed in district ${n} at part ${i}:`, e.message);
      }
    }
    districtFeatures.push({
      type: "Feature",
      properties: { number: n, name: DISTRICT_NAMES[n] },
      geometry: merged.geometry,
    });
    console.log(`District ${n}: ${parts.length} localities merged`);
  }

  const out = { type: "FeatureCollection", features: districtFeatures };
  mkdirSync("public/data", { recursive: true });
  writeFileSync("public/data/malta-districts.geojson", JSON.stringify(out));
  console.log(`Wrote public/data/malta-districts.geojson (${districtFeatures.length} districts)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
