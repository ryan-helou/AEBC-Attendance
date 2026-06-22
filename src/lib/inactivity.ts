import { getTodayDate } from './dateUtils';

/** One attendance occurrence, flattened for inactivity aggregation. */
export interface InactivityRow {
  pid: string;
  name: string;
  date: string;
  meetingId: string;
}

export interface InactiveResult {
  person_id: string;
  person_name: string;
  totalAttendances: number;
  lastSeenDate: string;
  weeksSinceLast: number;
}

/**
 * People who have gone quiet: attended at least `minAttendances` times and not
 * seen for `cutoffWeeks`+ weeks. Pass `meetingId` to scope to a single ministry,
 * or '' to combine across all. Returns the full list sorted by weeks-since
 * (most overdue first) — callers slice if they want a top-N.
 */
export function computeInactivePeople(
  rows: InactivityRow[],
  cutoffWeeks: number,
  meetingId = '',
  minAttendances = 3,
): InactiveResult[] {
  const personMap = new Map<string, { name: string; dates: string[] }>();
  for (const r of rows) {
    if (meetingId && r.meetingId !== meetingId) continue;
    if (!personMap.has(r.pid)) personMap.set(r.pid, { name: r.name, dates: [] });
    personMap.get(r.pid)!.dates.push(r.date);
  }

  const today = new Date(getTodayDate() + 'T00:00:00');
  const inactive: InactiveResult[] = [];
  for (const [pid, stats] of personMap.entries()) {
    if (stats.dates.length < minAttendances) continue;
    const sorted = [...stats.dates].sort();
    const lastDate = sorted[sorted.length - 1];
    const last = new Date(lastDate + 'T00:00:00');
    const weeksSince = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24 * 7));
    if (weeksSince >= cutoffWeeks) {
      inactive.push({
        person_id: pid,
        person_name: stats.name,
        totalAttendances: stats.dates.length,
        lastSeenDate: lastDate,
        weeksSinceLast: weeksSince,
      });
    }
  }
  inactive.sort((a, b) => b.weeksSinceLast - a.weeksSinceLast);
  return inactive;
}
