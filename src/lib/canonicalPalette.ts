/**
 * Canonical palette and color hashing — copied verbatim from the legacy
 * HTML dashboard so colors are consistent across the two apps.
 *
 * Single source of truth: do NOT redefine these in DashboardChart, signatureML,
 * or anywhere else. Import from here instead.
 *
 * Source: legacy_dashboard.html (constants C1..C5 + array P + getStringColor)
 */

/** 20-color palette, exact order from the HTML dashboard. */
export const CANONICAL_PALETTE = [
  '#097C87', '#FCA47C', '#23CED9', '#F9D779', '#A1CCA6',
  '#065e68', '#e07a50', '#1aabba', '#e8c055', '#7fb585',
  '#3db8c2', '#fdc8a8', '#7ae6ee', '#fce9a8', '#cce5cf',
  '#04434a', '#c85a30', '#0f8f9e', '#d4a830', '#4d9e57',
] as const;

/** Backwards-compat alias used by older imports. */
export const DEPT_PALETTE = CANONICAL_PALETTE;

/**
 * Deterministic color for a given key (department, series, faculty name, etc.)
 *
 * Uses the exact same string-hash function as the HTML dashboard:
 *   hash = charCode + ((hash << 5) - hash)
 *
 * Special cases:
 *   - empty / null / undefined → '#888888'
 *   - 'OFD' or 'office of faculty development' → '#64748b' (slate grey)
 */
export function getStringColor(str: string | null | undefined, alpha = ''): string {
  if (!str) return '#888888' + alpha;
  const s = str.trim();
  if (s === 'OFD' || s.toLowerCase() === 'office of faculty development') {
    return '#64748b' + alpha;
  }
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % CANONICAL_PALETTE.length;
  return CANONICAL_PALETTE[index] + alpha;
}

/** Backwards-compat alias for older code that imported colorForKey. */
export const colorForKey = getStringColor;

/**
 * Append a hex alpha suffix to a color.
 *
 * @param color base hex color, e.g. '#097C87'
 * @param alpha 0..1 opacity
 */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const hex = Math.round(a * 255).toString(16).padStart(2, '0');
  return color + hex;
}
