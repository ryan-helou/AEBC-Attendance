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

/**
 * Check-in times are always shown in church-local Eastern Time, regardless of
 * where the viewer's device is. marked_at is stored as a UTC instant, so the
 * display/calc helpers below pin it to America/New_York (handles EST/EDT).
 */
export const ET_TIME_ZONE = 'America/New_York';

/** Offset of a time zone from UTC, in minutes, at a given instant (ET = -240 EDT / -300 EST). */
function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return (asUTC - date.getTime()) / 60000;
}

/** Format a marked_at ISO timestamp as an Eastern-Time clock time (e.g. "7:32 PM"). Empty string when there's no time. */
export function formatTimeET(isoString: string | null | undefined): string {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString('en-US', {
    timeZone: ET_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Minutes since midnight (0–1439) for a marked_at timestamp, evaluated in Eastern Time. null when there's no time. */
export function minutesSinceMidnightET(isoString: string | null | undefined): number | null {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  const etMs = date.getTime() + tzOffsetMinutes(date, ET_TIME_ZONE) * 60000;
  return ((Math.floor(etMs / 60000) % 1440) + 1440) % 1440;
}

/** Eastern-Time "HH:mm" value for an <input type="time">. Empty string when there's no time. */
export function toTimeInputValueET(isoString: string | null | undefined): string {
  const mins = minutesSinceMidnightET(isoString);
  if (mins === null) return '';
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** Build a UTC ISO timestamp from an Eastern-Time wall clock (date string + hours/minutes). */
export function etWallClockToISO(dateStr: string, hours: number, minutes: number): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  // Treat the wall clock as UTC, then shift back by ET's offset at that moment.
  const asIfUTC = Date.UTC(y, mo - 1, d, hours, minutes, 0, 0);
  const offset = tzOffsetMinutes(new Date(asIfUTC), ET_TIME_ZONE);
  return new Date(asIfUTC - offset * 60000).toISOString();
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
