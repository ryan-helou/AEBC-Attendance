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

/** Minutes-since-midnight (0–1439) → a clock label like "7:32 PM". */
export function minutesToClock(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  const period = h >= 12 ? 'PM' : 'AM';
  const dh = h % 12 || 12;
  return `${dh}:${m.toString().padStart(2, '0')} ${period}`;
}

/** Y-axis ticks at a sensible whole-clock interval (minutes) across a range. */
export function niceTimeTicks(lo: number, hi: number): number[] {
  const range = Math.max(1, hi - lo);
  const step = [15, 30, 60, 120, 180, 240].find(s => range / s <= 6) ?? 360;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  return ticks;
}

/**
 * Legacy name-based on-time cutoff (minutes since midnight, ET), or null.
 * Only a fallback now — prefer meetingCutoffMinutes, which reads the per-meeting
 * setting. Matching on the name silently breaks if a meeting is ever renamed.
 */
export function onTimeCutoffMinutes(meetingName: string): number | null {
  const l = meetingName.toLowerCase();
  if (l.includes('english') || l.includes('sunday')) return 10 * 60 + 30; // 10:30 AM
  if (l.includes('saturday') || l.includes('shabibeh')) return 19 * 60 + 30; // 7:30 PM
  return null;
}

/**
 * On-time cutoff for a meeting: the configured per-meeting value when set,
 * otherwise the legacy name-based default (so behaviour is unchanged until the
 * column is populated).
 */
export function meetingCutoffMinutes(
  meeting: { name: string; on_time_cutoff_minutes?: number | null } | null | undefined,
): number | null {
  if (!meeting) return null;
  return meeting.on_time_cutoff_minutes ?? onTimeCutoffMinutes(meeting.name);
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

/**
 * Longest run of consecutive *service dates* the person attended. `serviceDates`
 * is every date the meeting was actually held; weeks with no service (cancelled,
 * or none held) aren't in it, so a gap across them does NOT break the streak.
 */
export function computeLongestStreak(attendedDates: string[], serviceDates: string[]): number {
  if (attendedDates.length === 0) return 0;
  const services = Array.from(new Set(serviceDates)).sort();
  const attended = new Set(attendedDates);
  let longest = 0;
  let current = 0;
  for (const d of services) {
    if (attended.has(d)) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }
  return longest;
}

/**
 * Current (ongoing) streak: consecutive service dates attended, counting back
 * from the most recent service. Missing the latest *past* service ends the
 * streak (returns 0) — so someone who stopped coming no longer has a streak.
 * Today's service is exempt (it may still be in progress / not fully marked).
 * Cancelled / no-service weeks aren't in `serviceDates`, so they're bridged.
 */
export function computeCurrentStreak(attendedDates: string[], serviceDates: string[]): number {
  if (attendedDates.length === 0) return 0;
  const services = Array.from(new Set(serviceDates)).sort();
  if (services.length === 0) return 0;
  const attended = new Set(attendedDates);
  let i = services.length - 1;
  if (!attended.has(services[i])) {
    if (services[i] === getTodayDate()) i--; // don't end the streak on a service happening today
    else return 0; // missed the most recent past service → streak has ended
  }
  let streak = 0;
  for (; i >= 0; i--) {
    if (attended.has(services[i])) streak++;
    else break;
  }
  return streak;
}
