/** Local-timezone YYYY-MM-DD string (timezone-safe replacement for toISOString) */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today's date as YYYY-MM-DD in local timezone */
export function getTodayDate(): string {
  return toDateStr(new Date());
}

/** Parse YYYY-MM-DD into a local Date (avoids timezone shift) */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format YYYY-MM-DD for display */
export function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  return parseDate(dateStr).toLocaleDateString('en-US', options ?? {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

/** Shift a date string by N days */
export function shiftDate(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/** Get required weekday for a meeting (0=Sun, 6=Sat), or null if unrestricted */
export function getMeetingDay(name: string): number | null {
  const lower = name.toLowerCase();
  if (lower.includes('sunday')) return 0;
  if (lower.includes('saturday') || lower.includes('shabibeh')) return 6;
  return null;
}

/** Snap a date to the most recent valid meeting day */
export function snapToValidDate(dateStr: string, meetingDay: number | null): string {
  if (meetingDay === null) return dateStr;
  const d = parseDate(dateStr);
  const currentDay = d.getDay();
  if (currentDay !== meetingDay) {
    let diff = currentDay - meetingDay;
    if (diff < 0) diff += 7;
    d.setDate(d.getDate() - diff);
  }
  return toDateStr(d);
}
