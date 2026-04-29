// Tiny helper to remember the user's preferred district between visits.
// Storage is essential/functional (it remembers a UI choice), not analytics,
// so it's safe to set without analytics consent. We still tolerate
// localStorage being unavailable.

const KEY = "vm26-preferred-district-v1";

export type PreferredDistrict = {
  number: number;
  // Optional friendly label (e.g. "Qormi") to render in welcome banners.
  locality?: string;
  setAt: string;
};

export function getPreferredDistrict(): PreferredDistrict | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PreferredDistrict;
    if (typeof parsed?.number !== "number" || parsed.number < 1 || parsed.number > 13) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setPreferredDistrict(value: { number: number; locality?: string }) {
  if (typeof window === "undefined") return;
  try {
    const payload: PreferredDistrict = {
      number: value.number,
      locality: value.locality,
      setAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function clearPreferredDistrict() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
