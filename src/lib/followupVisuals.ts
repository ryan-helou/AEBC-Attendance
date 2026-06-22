// Small presentational helpers shared by the follow-up dashboard + detail modal.

/** "How long away" is full at half a year; the away-meter caps its fill here. */
export const AWAY_CAP_WEEKS = 26;

/** Up-to-two-letter monogram for an avatar (first + last word, else first letters). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable hue (0–359) derived from a name, for tinting that person's monogram. */
export function hueFromName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/** Severity tier for time-since-last-seen — mirrors the app's weeks badges. */
export function awaySeverity(weeks: number): 'info' | 'warn' | 'danger' {
  return weeks >= 8 ? 'danger' : weeks >= 5 ? 'warn' : 'info';
}
