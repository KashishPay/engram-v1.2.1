
// utils/errorImages.ts

/**
 * Base path for error images.
 * Using './' explicitly to respect the <base href="./" /> tag in index.html.
 * This ensures assets are found relative to the app root, not the domain root.
 */
const BASE = './images/error/';

const ERROR_IMAGES = [
  `${BASE}err_1.png`,
  `${BASE}err_2.png`,
  `${BASE}err_3.png`,
  `${BASE}err_4.png`,
];

const FALLBACK = `${BASE}fallback.png`;

/** Small, stable hash for deterministic image choice per seed string */
function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic-by-seed: returns exactly ONE image path */
export function getErrorImage(seedStr?: string): string {
  if (!seedStr) return ERROR_IMAGES[0];
  const idx = hashString(seedStr) % ERROR_IMAGES.length;
  return ERROR_IMAGES[idx];
}

/** Fallback image path */
export function getFallbackImage(): string {
  return FALLBACK;
}

/** Random selection for error events (used by ErrorCard) */
export function pickEventImageIndex(): number {
    return Math.floor(Math.random() * ERROR_IMAGES.length);
}

export function getImageByIndex(idx: number): string {
  if (idx < 0 || idx >= ERROR_IMAGES.length) return ERROR_IMAGES[0];
  return ERROR_IMAGES[idx];
}
