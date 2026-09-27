import { useState, useEffect, useMemo } from 'react';
import { supabase, fetchAllRows } from '../lib/supabase';
import { minutesSinceMidnightET, shiftDate, getTodayDate } from '../lib/dateUtils';

/**
 * Live projection of where today's headcount lands.
 *
 * Every past service of THIS meeting becomes an arrival curve: what share of
 * that night's final count had checked in by each minute. Today's count is then
 * divided by the share a typical service is at right now — 40 people in the
 * room at 7:38 PM, when a typical Shabibeh is two-thirds checked in by then,
 * projects to about 60.
 *
 * Meetings are never mixed: Shabibeh's curve is nothing like Sunday morning's.
 */

/** A past service reduced to its arrival curve. */
interface ServiceCurve {
  date: string;
  /** Check-ins that carried a time — the denominator for this day's fractions. */
  final: number;
  /** Every check-in time that day, ET minutes since midnight, ascending. */
  times: number[];
}

const LOOKBACK_DAYS = 180;
/** Recent services describe today better than a six-month-old one. */
const MAX_SERVICES = 20;
/** Fewer than this and a median across services means nothing. */
const MIN_SERVICES = 4;
/** A tiny service makes a jagged curve that swings the projection wildly. */
const MIN_FINAL = 15;
/** A service entered the next day has no real times — its curve is fiction. */
const MIN_TIMED_SHARE = 0.9;
/**
 * Below this, dividing by the fraction turns 3 early birds into 60 people.
 * Backtested over every (service, minute) pair in the real data, using only
 * services that preceded each one: median error is ~5% at any threshold, but
 * the tail is what hurts — the 90th-percentile error falls from 23% at 0.15 to
 * 18% here, while the projection still shows for roughly half the door time.
 * In practice it appears around the service's start time and firms up after.
 */
const MIN_FRACTION = 0.4;
/** Past this the doors are effectively shut and the projection is just the count. */
const DONE_FRACTION = 0.98;
/** Projecting off a handful of early birds is noise, not a forecast. */
const MIN_PRESENT = 5;

export interface Forecast {
  /** Projected final count. */
  expected: number;
  /** 10th–90th percentile band — about 4 in 5 services land inside it. */
  low: number;
  high: number;
  /** Share of a typical service that has arrived by now (0–1). */
  fraction: number;
  /** How many past services the estimate is built from. */
  services: number;
}

function quantile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/**
 * @param enabled Only worth computing for today's live, uncancelled service.
 * @param presentWithTime Check-ins so far today that carry a time — the curves
 *   are built from timed check-ins, so the live number has to match.
 */
export function useAttendanceForecast(
  meetingId: string | undefined,
  enabled: boolean,
  presentWithTime: number,
): Forecast | null {
  const [curves, setCurves] = useState<ServiceCurve[] | null>(null);
  const [nowMinute, setNowMinute] = useState(
    () => minutesSinceMidnightET(new Date().toISOString()) ?? 0
  );

  // The projection moves with the clock, not only with check-ins: standing at
  // 40 people is a different forecast at 7:35 than at 8:05.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(
      () => setNowMinute(minutesSinceMidnightET(new Date().toISOString()) ?? 0),
      60_000
    );
    return () => clearInterval(id);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !meetingId) {
      setCurves(null);
      return;
    }
    let abandoned = false;

    async function load() {
      const today = getTodayDate();
      const from = shiftDate(today, -LOOKBACK_DAYS);
      const [records, guestRecords] = await Promise.all([
        fetchAllRows((a, b) =>
          supabase
            .from('attendance_records')
            .select('date, marked_at')
            .eq('meeting_id', meetingId!)
            .gte('date', from)
            .lt('date', today)
            .order('id', { ascending: true })
            .range(a, b)
        ),
        fetchAllRows((a, b) =>
          supabase
            .from('guest_attendance')
            .select('date, marked_at')
            .eq('meeting_id', meetingId!)
            .gte('date', from)
            .lt('date', today)
            .order('id', { ascending: true })
            .range(a, b)
        ),
      ]);
      if (abandoned) return;

      // Guests are people in the room, so they shape the curve like anyone else.
      const byDate = new Map<string, { times: number[]; total: number }>();
      for (const r of [...records, ...guestRecords]) {
        const day = r.date as string;
        const slot = byDate.get(day) ?? { times: [], total: 0 };
        slot.total++;
        const minute = minutesSinceMidnightET(r.marked_at as string | null);
        if (minute !== null) slot.times.push(minute);
        byDate.set(day, slot);
      }

      const usable: ServiceCurve[] = [];
      for (const [day, { times, total }] of byDate) {
        if (times.length < MIN_FINAL) continue;
        if (times.length / total < MIN_TIMED_SHARE) continue;
        usable.push({
          date: day,
          final: times.length,
          times: times.sort((x, y) => x - y),
        });
      }
      usable.sort((a, b) => (a.date < b.date ? 1 : -1));
      setCurves(usable.slice(0, MAX_SERVICES));
    }

    load();
    return () => {
      abandoned = true;
    };
  }, [meetingId, enabled]);

  return useMemo(() => {
    if (!curves || curves.length < MIN_SERVICES) return null;
    if (presentWithTime < MIN_PRESENT) return null;

    const fractions = curves
      .map(c => c.times.filter(t => t <= nowMinute).length / c.final)
      .sort((a, b) => a - b);
    const mid = quantile(fractions, 0.5);
    if (mid < MIN_FRACTION || mid >= DONE_FRACTION) return null;

    // A bigger share already in the room means a smaller final total, so the
    // percentiles cross over: the busy-by-now services give the LOW estimate.
    const lowerBound = Math.max(quantile(fractions, 0.9), MIN_FRACTION);
    const upperBound = Math.max(quantile(fractions, 0.1), MIN_FRACTION);
    const project = (f: number) => Math.max(presentWithTime, Math.round(presentWithTime / f));

    return {
      expected: project(mid),
      low: project(lowerBound),
      high: project(upperBound),
      fraction: mid,
      services: curves.length,
    };
  }, [curves, presentWithTime, nowMinute]);
}
