import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, fetchAllRows } from '../lib/supabase';
import { getMeetingDay, parseDate, snapToValidDate, getTodayDate, shiftDate, minutesSinceMidnightET, minutesToClock, onTimeCutoffMinutes, niceTimeTicks, computeLongestStreak, computeCurrentStreak } from '../lib/dateUtils';
import type { Meeting } from '../types';
import { HistorySkeleton } from '../components/Skeleton';
import AnimatedNumber from '../components/AnimatedNumber';
import ConfirmDialog from '../components/ConfirmDialog';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { useScrolledDown } from '../hooks/useScrolledDown';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
  LabelList,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import './HistoryPage.css';

interface DateRow {
  id: string;
  person_id: string;
  person_name: string;
  marked_at: string;
}

interface AllTimeRow {
  person_id: string;
  person_name: string;
  count: number;
}

interface PersonRecord {
  id: string;
  date: string;
}

interface WeekPoint {
  date: string;
  label: string;
  [meetingName: string]: string | number;
}

interface TopAttendee {
  person_id: string;
  person_name: string;
  count: number;
}

interface ComparePoint {
  label: string;
  [meetingName: string]: string | number;
}

interface GenderPoint {
  date: string;
  label: string;
  Male: number;
  Female: number;
  maleCount: number;
  femaleCount: number;
}

type Timeframe = '4w' | '12w' | '6m' | '1y' | 'all';

interface StreakLeader {
  person_id: string;
  person_name: string;
  meeting_name: string;
  streak: number;
}

interface OnTimeLeader {
  person_id: string;
  person_name: string;
  avgTime: string;
  avgMinutes: number;
  timesAttended: number;
}

interface ConsistencyLeader {
  person_id: string;
  person_name: string;
  rate: number;
  attended: number;
  possible: number;
}

interface RecordEntry {
  label: string;
  value: string;
  detail: string;
}

type RecordVariant = 'peak' | 'streak' | 'fresh' | 'legend';

function recordTheme(label: string): { variant: RecordVariant; icon: ReactNode } {
  if (label.startsWith('Highest')) {
    return {
      variant: 'peak',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M14 7h7v7" />
        </svg>
      ),
    };
  }
  if (label.startsWith('Longest Streak')) {
    return {
      variant: 'streak',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      ),
    };
  }
  if (label.startsWith('Most First-Timers')) {
    return {
      variant: 'fresh',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.9 5.8H20l-4.95 3.6L16.9 18 12 14.4 7.1 18l1.85-5.6L4 8.8h6.1z" />
        </svg>
      ),
    };
  }
  return {
    variant: 'legend',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7l4 6 5-8 5 8 4-6v11H3z" />
        <path d="M3 20h18" />
      </svg>
    ),
  };
}

interface InactivePerson {
  person_id: string;
  person_name: string;
  totalAttendances: number;
  lastSeenDate: string;
  weeksSinceLast: number;
}

interface RisingStar {
  person_id: string;
  person_name: string;
  firstDate: string;
  attendanceCount: number;
}

interface MusicianCount {
  person_id: string;
  person_name: string;
  totalAppearances: number;
  topRoles: string[];
}

interface RoleCount {
  person_id: string;
  person_name: string;
  totalAppearances: number;
}

interface RoleRow {
  person_id: string;
  name: string;
  role: string;
  date: string;
  meeting_id: string;
}

// Sound is an assignable role with its own Top Sound board, but it is not a
// musician — keep it out of the Top Musicians leaderboard.
const PLAYING_ROLES = new Set([
  'Piano', 'Guitar', 'Bass', 'Drums', 'Keyboard', 'Violin', 'Singer', 'Backup Singer',
]);

/** Leaderboard for a single role, optionally filtered to one meeting ('' = all meetings). */
function simpleRoleLeaderboard(rows: RoleRow[], role: string, meetingId: string): RoleCount[] {
  const map = new Map<string, { name: string; dates: Set<string> }>();
  for (const r of rows) {
    if (r.role !== role) continue;
    if (meetingId && r.meeting_id !== meetingId) continue;
    if (!map.has(r.person_id)) map.set(r.person_id, { name: r.name, dates: new Set() });
    map.get(r.person_id)!.dates.add(r.date);
  }
  return Array.from(map.entries())
    .map(([pid, s]) => ({ person_id: pid, person_name: s.name, totalAppearances: s.dates.size }))
    .sort((a, b) => b.totalAppearances - a.totalAppearances)
    .slice(0, 15);
}

/** Top musicians (any playing role), optionally filtered to one meeting ('' = all). */
function musicianLeaderboard(rows: RoleRow[], meetingId: string): MusicianCount[] {
  const map = new Map<string, { name: string; dates: Set<string>; roleCounts: Map<string, number> }>();
  for (const r of rows) {
    if (!PLAYING_ROLES.has(r.role)) continue;
    if (meetingId && r.meeting_id !== meetingId) continue;
    if (!map.has(r.person_id)) map.set(r.person_id, { name: r.name, dates: new Set(), roleCounts: new Map() });
    const s = map.get(r.person_id)!;
    s.dates.add(r.date);
    s.roleCounts.set(r.role, (s.roleCounts.get(r.role) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([pid, s]) => ({
      person_id: pid,
      person_name: s.name,
      totalAppearances: s.dates.size,
      topRoles: Array.from(s.roleCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([role]) => role),
    }))
    .sort((a, b) => b.totalAppearances - a.totalAppearances)
    .slice(0, 15);
}

function AvgTimeTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length || label === undefined) return null;
  const fullDate = new Date(label + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
  return (
    <div className="profile-chart-tooltip">
      <span className="profile-chart-tooltip-date">{fullDate}</span>
      <span className="profile-chart-tooltip-time">Avg {minutesToClock(payload[0].value)}</span>
    </div>
  );
}

/** Per-leaderboard meeting picker: All Meetings + one option per ministry. */
function RoleMeetingSelect({ value, onChange, meetings }: { value: string; onChange: (v: string) => void; meetings: Meeting[] }) {
  return (
    <div className="history-controls">
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">All Meetings</option>
        {meetings.map(m => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    </div>
  );
}

// computeLongestStreak now lives in dateUtils (service-date aware, bridges
// cancelled / no-service weeks).

const LINE_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const COMPARE_COLORS = [
  { base: '#8b5cf6', light: '#a78bfa' },
  { base: '#0ea5e9', light: '#38bdf8' },
  { base: '#10b981', light: '#34d399' },
  { base: '#f59e0b', light: '#fbbf24' },
  { base: '#f43f5e', light: '#fb7185' },
  { base: '#4f46e5', light: '#6366f1' },
];

export default function HistoryPage() {
  const navigate = useNavigate();
  useEscapeBack();
  const scrolled = useScrolledDown();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Date lookup state
  const [dateMeetingId, setDateMeetingId] = useState('');
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [dateResults, setDateResults] = useState<DateRow[] | null>(null);
  const [dateLoading, setDateLoading] = useState(false);
  const [dateError, setDateError] = useState('');

  // All-time state
  const [allTimeMeetingId, setAllTimeMeetingId] = useState('');
  const [allTimeResults, setAllTimeResults] = useState<AllTimeRow[] | null>(null);
  const [allTimeLoading, setAllTimeLoading] = useState(false);
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
  const [personRecords, setPersonRecords] = useState<PersonRecord[]>([]);
  const [personRecordsLoading, setPersonRecordsLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; type: 'date' | 'person' } | null>(null);

  // Dashboard state
  const [chartData, setChartData] = useState<WeekPoint[]>([]);
  const [compareData, setCompareData] = useState<ComparePoint[]>([]);
  const [topAttendees, setTopAttendees] = useState<TopAttendee[]>([]);
  const [maxCount, setMaxCount] = useState(1);
  const [chartTimeframe, setChartTimeframe] = useState<Timeframe>('12w');
  // 'all' shows every series; otherwise a meeting id or 'firsttimers' isolates one line.
  const [chartMeeting, setChartMeeting] = useState<string>('all');
  const [compareTimeframe, setCompareTimeframe] = useState<Timeframe>('12w');
  const [topTimeframe, setTopTimeframe] = useState<Timeframe>('all');
  const [chartLoading, setChartLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [topLoading, setTopLoading] = useState(false);
  // Average-arrival-time chart: per-meeting, per-service averages (ET).
  const [avgSeries, setAvgSeries] = useState<Map<string, { date: string; minutes: number }[]>>(new Map());
  const [avgTimeLoading, setAvgTimeLoading] = useState(true);
  const [avgTimeframe, setAvgTimeframe] = useState<Timeframe>('6m');
  const [avgChartMeetingId, setAvgChartMeetingId] = useState('');
  const [genderData, setGenderData] = useState<GenderPoint[]>([]);
  const [genderTimeframe, setGenderTimeframe] = useState<Timeframe>('12w');
  const [genderMeetingId, setGenderMeetingId] = useState<string>('');
  const [genderLoading, setGenderLoading] = useState(false);
  const [streakLeaders, setStreakLeaders] = useState<StreakLeader[]>([]);
  const [streakLoading, setStreakLoading] = useState(true);
  const [onTimeLeaders, setOnTimeLeaders] = useState<OnTimeLeader[]>([]);
  const [onTimeLoading, setOnTimeLoading] = useState(true);
  const [onTimeMeetingId, setOnTimeMeetingId] = useState('');
  const [consistencyLeaders, setConsistencyLeaders] = useState<ConsistencyLeader[]>([]);
  const [consistencyLoading, setConsistencyLoading] = useState(true);
  const [consistencyMeetingId, setConsistencyMeetingId] = useState('');
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [inactiveList, setInactiveList] = useState<InactivePerson[]>([]);
  const [inactiveLoading, setInactiveLoading] = useState(true);
  const [inactiveMeetingId, setInactiveMeetingId] = useState<string>('');
  const insightsRowsRef = useRef<Array<{ pid: string; name: string; date: string; meetingId: string }>>([]);
  const [risingStars, setRisingStars] = useState<RisingStar[]>([]);
  const [risingStarsLoading, setRisingStarsLoading] = useState(true);
  // All musician_roles rows, loaded once; each leaderboard below derives from
  // these and filters by its own per-board meeting selection ('' = all).
  const [roleRows, setRoleRows] = useState<RoleRow[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [musiciansMeetingId, setMusiciansMeetingId] = useState('');
  const [preachersMeetingId, setPreachersMeetingId] = useState('');
  const [attendanceTakersMeetingId, setAttendanceTakersMeetingId] = useState('');
  const [soundMeetingId, setSoundMeetingId] = useState('');
  const [liveStreamMeetingId, setLiveStreamMeetingId] = useState('');
  const [powerPointMeetingId, setPowerPointMeetingId] = useState('');

  const topMusicians = useMemo(() => musicianLeaderboard(roleRows, musiciansMeetingId), [roleRows, musiciansMeetingId]);
  const topPreachers = useMemo(() => simpleRoleLeaderboard(roleRows, 'Preacher', preachersMeetingId), [roleRows, preachersMeetingId]);
  const topAttendanceTakers = useMemo(() => simpleRoleLeaderboard(roleRows, 'Attendance', attendanceTakersMeetingId), [roleRows, attendanceTakersMeetingId]);
  const topSound = useMemo(() => simpleRoleLeaderboard(roleRows, 'Sound', soundMeetingId), [roleRows, soundMeetingId]);
  const topLiveStream = useMemo(() => simpleRoleLeaderboard(roleRows, 'Live Stream', liveStreamMeetingId), [roleRows, liveStreamMeetingId]);
  const topPowerPoint = useMemo(() => simpleRoleLeaderboard(roleRows, 'PowerPoint', powerPointMeetingId), [roleRows, powerPointMeetingId]);
  function timeframeCutoff(tf: Timeframe): string | null {
    if (tf === 'all') return null;
    const daysMap = { '4w': 28, '12w': 84, '6m': 182, '1y': 365 } as const;
    return shiftDate(getTodayDate(), -daysMap[tf]);
  }

  // Average-arrival-time chart: selected meeting's per-service points within the timeframe.
  const avgChartMeeting = meetings.find(m => m.id === avgChartMeetingId) ?? meetings[0] ?? null;
  const avgChartData = useMemo(() => {
    if (!avgChartMeeting) return [] as Array<{ date: string; minutes: number; timeLabel: string }>;
    const cutoff = timeframeCutoff(avgTimeframe);
    return (avgSeries.get(avgChartMeeting.id) ?? [])
      .filter(p => !cutoff || p.date >= cutoff)
      .map(p => ({ date: p.date, minutes: p.minutes, timeLabel: minutesToClock(p.minutes) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avgSeries, avgChartMeeting, avgTimeframe]);

  const avgChartCutoff = avgChartMeeting ? onTimeCutoffMinutes(avgChartMeeting.name) : null;
  const [avgYDomain, avgYTicks] = useMemo<[[number, number], number[]]>(() => {
    if (avgChartData.length === 0) return [[0, 1440], []];
    const refs = avgChartCutoff !== null ? [avgChartCutoff] : [];
    const vals = [...avgChartData.map(d => d.minutes), ...refs];
    const lo = Math.max(0, Math.floor((Math.min(...vals) - 10) / 5) * 5);
    const hi = Math.min(1440, Math.ceil((Math.max(...vals) + 10) / 5) * 5);
    return [[lo, hi], niceTimeTicks(lo, hi)];
  }, [avgChartData, avgChartCutoff]);

  async function loadChartData(tf: Timeframe, meetingsList: Meeting[]) {
    setChartLoading(true);
    const cutoff = timeframeCutoff(tf);

    const [data, guestData] = await Promise.all([
      fetchAllRows((from, to) => {
        let query = supabase.from('attendance_records').select('meeting_id, date, first_time');
        if (cutoff) query = query.gte('date', cutoff);
        return query.order('id', { ascending: true }).range(from, to);
      }),
      fetchAllRows((from, to) => {
        let query = supabase.from('guest_attendance').select('meeting_id, date, first_time');
        if (cutoff) query = query.gte('date', cutoff);
        return query.order('id', { ascending: true }).range(from, to);
      }),
    ]);

    {
      const records = data as unknown as Array<{ meeting_id: string; date: string; first_time: boolean }>;
      const guestRecords = guestData as unknown as Array<{ meeting_id: string; date: string; first_time: boolean }>;

      function weekOf(dateStr: string): string {
        const d = new Date(dateStr + 'T00:00:00');
        const daysBack = d.getDay() === 0 ? 6 : d.getDay() - 1;
        d.setDate(d.getDate() - daysBack);
        return d.toISOString().slice(0, 10);
      }
      const weekCounts = new Map<string, Map<string, number>>();
      const weekFirstTimers = new Map<string, number>();
      for (const r of records) {
        const week = weekOf(r.date);
        if (!weekCounts.has(week)) weekCounts.set(week, new Map());
        const mc = weekCounts.get(week)!;
        mc.set(r.meeting_id, (mc.get(r.meeting_id) || 0) + 1);
        if (r.first_time) weekFirstTimers.set(week, (weekFirstTimers.get(week) || 0) + 1);
      }
      for (const r of guestRecords) {
        const week = weekOf(r.date);
        if (!weekCounts.has(week)) weekCounts.set(week, new Map());
        const mc = weekCounts.get(week)!;
        mc.set(r.meeting_id, (mc.get(r.meeting_id) || 0) + 1);
        if (r.first_time) weekFirstTimers.set(week, (weekFirstTimers.get(week) || 0) + 1);
      }
      const allWeeks = Array.from(weekCounts.keys()).sort();
      const points: WeekPoint[] = allWeeks.map(week => {
        const sat = new Date(week + 'T00:00:00');
        sat.setDate(sat.getDate() + 5);
        const sun = new Date(week + 'T00:00:00');
        sun.setDate(sun.getDate() + 6);
        const satLabel = sat.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const label = sat.getMonth() === sun.getMonth()
          ? `${satLabel}–${sun.getDate()}`
          : `${satLabel}–${sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        const point: WeekPoint = { date: week, label };
        const mc = weekCounts.get(week)!;
        for (const m of meetingsList) point[m.name] = mc.get(m.id) || 0;
        point['First Timers'] = weekFirstTimers.get(week) || 0;
        return point;
      });
      setChartData(points);
    }
    setChartLoading(false);
  }

  async function loadAvgTimeData() {
    setAvgTimeLoading(true);
    const data = await fetchAllRows((from, to) =>
      supabase
        .from('attendance_records')
        .select('meeting_id, date, marked_at')
        .order('id', { ascending: true })
        .range(from, to)
    );
    const records = data as unknown as Array<{ meeting_id: string; date: string; marked_at: string }>;
    // meeting_id -> date -> { sum, count } of arrival minutes (ET)
    const acc = new Map<string, Map<string, { sum: number; count: number }>>();
    for (const r of records) {
      const mins = minutesSinceMidnightET(r.marked_at);
      if (mins === null) continue;
      if (!acc.has(r.meeting_id)) acc.set(r.meeting_id, new Map());
      const byDate = acc.get(r.meeting_id)!;
      if (!byDate.has(r.date)) byDate.set(r.date, { sum: 0, count: 0 });
      const a = byDate.get(r.date)!;
      a.sum += mins;
      a.count++;
    }
    const series = new Map<string, { date: string; minutes: number }[]>();
    for (const [mid, byDate] of acc) {
      const pts = Array.from(byDate.entries())
        .map(([date, a]) => ({ date, minutes: Math.round(a.sum / a.count) }))
        .sort((x, y) => x.date.localeCompare(y.date));
      series.set(mid, pts);
    }
    setAvgSeries(series);
    setAvgTimeLoading(false);
  }

  async function loadCompareData(tf: Timeframe, meetingsList: Meeting[]) {
    setCompareLoading(true);
    const cutoff = timeframeCutoff(tf);
    const data = await fetchAllRows((from, to) => {
      let query = supabase.from('attendance_records').select('meeting_id');
      if (cutoff) query = query.gte('date', cutoff);
      return query.order('id', { ascending: true }).range(from, to);
    });
    {
      const records = data as unknown as Array<{ meeting_id: string }>;
      const totals = new Map<string, number>();
      for (const r of records) totals.set(r.meeting_id, (totals.get(r.meeting_id) || 0) + 1);
      setCompareData(meetingsList.map(m => ({ label: m.name, Attendance: totals.get(m.id) || 0 })));
    }
    setCompareLoading(false);
  }

  async function loadGenderData(tf: Timeframe, meetingId: string) {
    setGenderLoading(true);
    const cutoff = timeframeCutoff(tf);
    const data = await fetchAllRows((from, to) => {
      let query = supabase.from('attendance_records').select('date, person:people(gender)');
      if (cutoff) query = query.gte('date', cutoff);
      if (meetingId) query = query.eq('meeting_id', meetingId);
      return query.order('id', { ascending: true }).range(from, to);
    });
    {
      const records = data as unknown as Array<{ date: string; person: { gender: string | null } | null }>;
      function weekOf(dateStr: string): string {
        const d = new Date(dateStr + 'T00:00:00');
        const daysBack = d.getDay() === 0 ? 6 : d.getDay() - 1;
        d.setDate(d.getDate() - daysBack);
        return d.toISOString().slice(0, 10);
      }
      const buckets = new Map<string, { male: number; female: number }>();
      for (const r of records) {
        const g = r.person?.gender;
        if (g !== 'male' && g !== 'female') continue;
        const week = weekOf(r.date);
        if (!buckets.has(week)) buckets.set(week, { male: 0, female: 0 });
        const c = buckets.get(week)!;
        if (g === 'male') c.male++; else c.female++;
      }
      const points: GenderPoint[] = Array.from(buckets.keys()).sort().map(week => {
        const c = buckets.get(week)!;
        const total = c.male + c.female;
        const malePct = total > 0 ? Math.round((c.male / total) * 100) : 0;
        const femalePct = total > 0 ? 100 - malePct : 0;
        const sat = new Date(week + 'T00:00:00');
        sat.setDate(sat.getDate() + 5);
        const sun = new Date(week + 'T00:00:00');
        sun.setDate(sun.getDate() + 6);
        const satLabel = sat.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const label = sat.getMonth() === sun.getMonth()
          ? `${satLabel}–${sun.getDate()}`
          : `${satLabel}–${sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        return { date: week, label, Male: malePct, Female: femalePct, maleCount: c.male, femaleCount: c.female };
      });
      setGenderData(points);
    }
    setGenderLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (meetings.length > 0) loadChartData(chartTimeframe, meetings); }, [chartTimeframe]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (meetings.length > 0) loadCompareData(compareTimeframe, meetings); }, [compareTimeframe]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (meetings.length > 0) loadGenderData(genderTimeframe, genderMeetingId); }, [genderTimeframe, genderMeetingId]);

  async function loadStreakLeaders() {
    setStreakLoading(true);
    const data = await fetchAllRows((from, to) =>
      supabase
        .from('attendance_records')
        .select('person_id, meeting_id, date, person:people(full_name), meeting:meetings(name)')
        .order('id', { ascending: true })
        .range(from, to)
    );
    {
      const groups = new Map<string, { person_id: string; person_name: string; meeting_id: string; meeting_name: string; dates: string[] }>();
      const serviceDatesByMeeting = new Map<string, Set<string>>();
      for (const r of data as Array<Record<string, unknown>>) {
        const meetingId = r.meeting_id as string;
        const key = `${r.person_id}|${meetingId}`;
        const personName = ((r.person as Record<string, unknown>)?.full_name as string) || 'Unknown';
        const meetingName = ((r.meeting as Record<string, unknown>)?.name as string) || 'Unknown';
        if (!groups.has(key)) groups.set(key, { person_id: r.person_id as string, person_name: personName, meeting_id: meetingId, meeting_name: meetingName, dates: [] });
        groups.get(key)!.dates.push(r.date as string);
        if (!serviceDatesByMeeting.has(meetingId)) serviceDatesByMeeting.set(meetingId, new Set());
        serviceDatesByMeeting.get(meetingId)!.add(r.date as string);
      }
      const leaders: StreakLeader[] = [];
      for (const g of groups.values()) {
        // Current (active) streak — ends when someone stops attending, so people
        // who racked up a long run then left drop off the board.
        const streak = computeCurrentStreak(g.dates, Array.from(serviceDatesByMeeting.get(g.meeting_id) ?? []));
        if (streak >= 2) leaders.push({ person_id: g.person_id, person_name: g.person_name, meeting_name: g.meeting_name, streak });
      }
      leaders.sort((a, b) => b.streak - a.streak);
      setStreakLeaders(leaders.slice(0, 15));
    }
    setStreakLoading(false);
  }

  async function loadOnTimeLeaders(meetingId?: string) {
    const targetMeetingId = meetingId ?? onTimeMeetingId;
    if (!targetMeetingId) return;
    setOnTimeLoading(true);

    // Fetch all data we need
    const attendanceData = await fetchAllRows((from, to) =>
      supabase
        .from('attendance_records')
        .select('person_id, marked_at, date, meeting_id, person:people(full_name)')
        .eq('meeting_id', targetMeetingId)
        .order('id', { ascending: true })
        .range(from, to)
    );

    {

      // Build active dates per meeting (only weeks where attendance was actually taken)
      const activeDatesByMeeting = new Map<string, Set<string>>();
      for (const r of attendanceData as Array<Record<string, unknown>>) {
        const meetingId = r.meeting_id as string;
        const date = r.date as string;
        if (!activeDatesByMeeting.has(meetingId)) activeDatesByMeeting.set(meetingId, new Set());
        activeDatesByMeeting.get(meetingId)!.add(date);
      }

      // Build person stats
      const personStats = new Map<string, {
        name: string;
        times: number[];
        attendances: number;
        datesByMeeting: Map<string, Set<string>>;
      }>();

      for (const r of attendanceData as Array<Record<string, unknown>>) {
        const pid = r.person_id as string;
        const name = ((r.person as Record<string, unknown>)?.full_name as string) || 'Unknown';
        const rawMarkedAt = r.marked_at as string | null;
        const date = r.date as string;
        const meetingId = r.meeting_id as string;

        if (!personStats.has(pid)) {
          personStats.set(pid, { name, times: [], attendances: 0, datesByMeeting: new Map() });
        }
        const stats = personStats.get(pid)!;
        // Records with the time removed still count as an attendance, but they
        // can't contribute to the average arrival time. Times are evaluated in
        // Eastern Time so leaders rank consistently regardless of viewer locale.
        const mins = minutesSinceMidnightET(rawMarkedAt);
        if (mins !== null) stats.times.push(mins);
        stats.attendances++;

        if (!stats.datesByMeeting.has(meetingId)) {
          stats.datesByMeeting.set(meetingId, new Set());
        }
        stats.datesByMeeting.get(meetingId)!.add(date);
      }

      // Calculate leaders with 65%+ attendance rate
      const leaders: OnTimeLeader[] = [];
      for (const [pid, stats] of personStats.entries()) {
        // Calculate attendance rate: attended dates / active dates (weeks where attendance was taken)
        let totalPossible = 0;
        for (const meetingId of stats.datesByMeeting.keys()) {
          const activeDates = activeDatesByMeeting.get(meetingId);
          if (activeDates) totalPossible += activeDates.size;
        }

        const attendanceRate = totalPossible > 0 ? (stats.attendances / totalPossible) * 100 : 0;
        if (attendanceRate < 50) continue; // Only include 50%+ attendance rate
        if (stats.times.length === 0) continue; // no recorded times → can't rank on-time

        const avgMinutes = Math.round(stats.times.reduce((a, b) => a + b, 0) / stats.times.length);
        const hours = Math.floor(avgMinutes / 60);
        const mins = avgMinutes % 60;
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        const avgTime = `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
        leaders.push({ person_id: pid, person_name: stats.name, avgTime, avgMinutes, timesAttended: stats.attendances });
      }

      leaders.sort((a, b) => a.avgMinutes - b.avgMinutes);
      setOnTimeLeaders(leaders);
    }
    setOnTimeLoading(false);
  }

  async function loadTopAttendees(timeframe: Timeframe) {
    setTopLoading(true);
    const today = getTodayDate();
    const daysMap = { '4w': 28, '12w': 84, '6m': 182, '1y': 365 } as const;
    const cutoff = timeframe !== 'all' ? shiftDate(today, -daysMap[timeframe]) : null;

    const records = await fetchAllRows((from, to) => {
      let query = supabase
        .from('attendance_records')
        .select('person_id, date, person:people(full_name)');
      if (cutoff) query = query.gte('date', cutoff);
      return query.order('id', { ascending: true }).range(from, to);
    });

    const personData = new Map<string, { name: string; dates: Set<string> }>();
    for (const r of records) {
      const pid = r.person_id as string;
      const date = r.date as string;
      const name = ((r.person as Record<string, unknown>)?.full_name as string) || 'Unknown';
      if (!personData.has(pid)) personData.set(pid, { name, dates: new Set() });
      personData.get(pid)!.dates.add(date);
    }
    const sorted = Array.from(personData.entries())
      .map(([pid, r]) => ({ person_id: pid, person_name: r.name, count: r.dates.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
    setTopAttendees(sorted);
    setMaxCount(sorted[0]?.count || 1);
    setTopLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadTopAttendees(topTimeframe); }, [topTimeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadConsistencyLeaders(meetingId?: string) {
    const targetId = meetingId ?? consistencyMeetingId;
    if (!targetId) return;
    setConsistencyLoading(true);

    const cutoff = shiftDate(getTodayDate(), -84); // last 12 weeks
    const data = await fetchAllRows((from, to) =>
      supabase
        .from('attendance_records')
        .select('person_id, date, person:people(full_name)')
        .eq('meeting_id', targetId)
        .gte('date', cutoff)
        .order('id', { ascending: true })
        .range(from, to)
    );

    {
      const rows = data as Array<Record<string, unknown>>;
      const activeDates = new Set<string>();
      const personMap = new Map<string, { name: string; dates: Set<string> }>();

      for (const r of rows) {
        const date = r.date as string;
        const pid = r.person_id as string;
        const name = ((r.person as Record<string, unknown>)?.full_name as string) || 'Unknown';
        activeDates.add(date);
        if (!personMap.has(pid)) personMap.set(pid, { name, dates: new Set() });
        personMap.get(pid)!.dates.add(date);
      }

      const totalDates = activeDates.size;
      if (totalDates === 0) { setConsistencyLeaders([]); setConsistencyLoading(false); return; }

      const leaders: ConsistencyLeader[] = [];
      for (const [pid, stats] of personMap.entries()) {
        const rate = Math.round((stats.dates.size / totalDates) * 100);
        if (stats.dates.size >= 2) {
          leaders.push({ person_id: pid, person_name: stats.name, rate, attended: stats.dates.size, possible: totalDates });
        }
      }
      leaders.sort((a, b) => b.rate - a.rate || b.attended - a.attended);
      setConsistencyLeaders(leaders.slice(0, 15));
    }
    setConsistencyLoading(false);
  }

  async function loadRecords(meetingsList: Meeting[]) {
    setRecordsLoading(true);
    const entries: RecordEntry[] = [];

    // Fetch all attendance + guest data
    const [attData, guestData] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase.from('attendance_records')
          .select('meeting_id, date, person_id, first_time, person:people(full_name)')
          .order('id', { ascending: true }).range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase.from('guest_attendance').select('meeting_id, date, first_time')
          .order('id', { ascending: true }).range(from, to)
      ),
    ]);

    {
      const attRows = attData as Array<Record<string, unknown>>;
      const guestRows = guestData as Array<Record<string, unknown>>;

      // 1. Highest attendance per meeting date
      const dateCounts = new Map<string, { count: number; date: string; meetingName: string }>();
      for (const r of attRows) {
        const key = `${r.meeting_id}|${r.date}`;
        if (!dateCounts.has(key)) {
          const meeting = meetingsList.find(m => m.id === r.meeting_id);
          dateCounts.set(key, { count: 0, date: r.date as string, meetingName: meeting?.name || '' });
        }
        dateCounts.get(key)!.count++;
      }
      for (const r of guestRows) {
        const key = `${r.meeting_id}|${r.date}`;
        if (!dateCounts.has(key)) {
          const meeting = meetingsList.find(m => m.id === r.meeting_id);
          dateCounts.set(key, { count: 0, date: r.date as string, meetingName: meeting?.name || '' });
        }
        dateCounts.get(key)!.count++;
      }
      let highest = { count: 0, date: '', meetingName: '' };
      for (const entry of dateCounts.values()) {
        if (entry.count > highest.count) highest = entry;
      }
      if (highest.count > 0) {
        const d = new Date(highest.date + 'T00:00:00');
        entries.push({
          label: 'Highest Attendance',
          value: String(highest.count),
          detail: `${highest.meetingName} — ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        });
      }

      // 2. Longest streak ever
      const streakGroups = new Map<string, { name: string; meeting_id: string; meeting: string; dates: string[] }>();
      const streakServiceDates = new Map<string, Set<string>>();
      for (const r of attRows) {
        const meetingId = r.meeting_id as string;
        const key = `${r.person_id}|${meetingId}`;
        const name = ((r.person as Record<string, unknown>)?.full_name as string) || 'Unknown';
        const meeting = meetingsList.find(m => m.id === meetingId)?.name || '';
        if (!streakGroups.has(key)) streakGroups.set(key, { name, meeting_id: meetingId, meeting, dates: [] });
        streakGroups.get(key)!.dates.push(r.date as string);
        if (!streakServiceDates.has(meetingId)) streakServiceDates.set(meetingId, new Set());
        streakServiceDates.get(meetingId)!.add(r.date as string);
      }
      let longestStreak = { count: 0, name: '', meeting: '' };
      for (const g of streakGroups.values()) {
        const s = computeLongestStreak(g.dates, Array.from(streakServiceDates.get(g.meeting_id) ?? []));
        if (s > longestStreak.count) longestStreak = { count: s, name: g.name, meeting: g.meeting };
      }
      if (longestStreak.count > 0) {
        entries.push({
          label: 'Longest Streak Ever',
          value: `${longestStreak.count} weeks`,
          detail: `${longestStreak.name} — ${longestStreak.meeting}`,
        });
      }

      // 3. Most first-timers in a single week
      const weekFirstTimers = new Map<string, { count: number; date: string }>();
      for (const r of [...attRows, ...guestRows]) {
        if (!(r.first_time as boolean)) continue;
        const date = r.date as string;
        const d = new Date(date + 'T00:00:00');
        const daysBack = d.getDay() === 0 ? 6 : d.getDay() - 1;
        d.setDate(d.getDate() - daysBack);
        const week = d.toISOString().slice(0, 10);
        if (!weekFirstTimers.has(week)) weekFirstTimers.set(week, { count: 0, date });
        weekFirstTimers.get(week)!.count++;
      }
      let mostFirstTimers = { count: 0, date: '' };
      for (const entry of weekFirstTimers.values()) {
        if (entry.count > mostFirstTimers.count) mostFirstTimers = entry;
      }
      if (mostFirstTimers.count > 0) {
        const d = new Date(mostFirstTimers.date + 'T00:00:00');
        entries.push({
          label: 'Most First-Timers (1 Week)',
          value: String(mostFirstTimers.count),
          detail: `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        });
      }

      // 4. Most attended person ever
      const personCounts = new Map<string, { name: string; count: number }>();
      for (const r of attRows) {
        const pid = r.person_id as string;
        const name = ((r.person as Record<string, unknown>)?.full_name as string) || 'Unknown';
        if (!personCounts.has(pid)) personCounts.set(pid, { name, count: 0 });
        personCounts.get(pid)!.count++;
      }
      let topPerson = { name: '', count: 0 };
      for (const p of personCounts.values()) {
        if (p.count > topPerson.count) topPerson = p;
      }
      if (topPerson.count > 0) {
        entries.push({
          label: 'Most Attended (All Time)',
          value: `${topPerson.count} times`,
          detail: topPerson.name,
        });
      }
    }

    setRecords(entries);
    setRecordsLoading(false);
  }

  // Build the inactive watchlist from the already-fetched rows, optionally scoped
  // to a single ministry. Empty meetingId = combined across both ministries.
  function computeInactive(meetingId: string): InactivePerson[] {
    const personMap = new Map<string, { name: string; dates: string[] }>();
    for (const r of insightsRowsRef.current) {
      if (meetingId && r.meetingId !== meetingId) continue;
      if (!personMap.has(r.pid)) personMap.set(r.pid, { name: r.name, dates: [] });
      personMap.get(r.pid)!.dates.push(r.date);
    }

    const today = new Date(getTodayDate() + 'T00:00:00');
    const inactive: InactivePerson[] = [];
    for (const [pid, stats] of personMap.entries()) {
      if (stats.dates.length < 3) continue;
      const sorted = [...stats.dates].sort();
      const lastDate = sorted[sorted.length - 1];
      const last = new Date(lastDate + 'T00:00:00');
      const weeksSince = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24 * 7));
      if (weeksSince >= 3) {
        inactive.push({ person_id: pid, person_name: stats.name, totalAttendances: stats.dates.length, lastSeenDate: lastDate, weeksSinceLast: weeksSince });
      }
    }
    inactive.sort((a, b) => b.weeksSinceLast - a.weeksSinceLast);
    return inactive.slice(0, 15);
  }

  // Recompute the watchlist instantly when the ministry filter changes (no refetch).
  useEffect(() => {
    if (insightsRowsRef.current.length > 0) setInactiveList(computeInactive(inactiveMeetingId));
  }, [inactiveMeetingId]);

  async function loadPeopleInsights() {
    setInactiveLoading(true);
    setRisingStarsLoading(true);
    const data = await fetchAllRows((from, to) =>
      supabase
        .from('attendance_records')
        .select('person_id, date, meeting_id, person:people(full_name)')
        .order('id', { ascending: true })
        .range(from, to)
    );
    {
      const rows = data as Array<Record<string, unknown>>;
      insightsRowsRef.current = rows.map(r => ({
        pid: r.person_id as string,
        name: ((r.person as Record<string, unknown>)?.full_name as string) || 'Unknown',
        date: r.date as string,
        meetingId: r.meeting_id as string,
      }));

      // Inactive: attended 3+ times, last seen 3+ weeks ago (scoped to selected ministry)
      setInactiveList(computeInactive(inactiveMeetingId));

      const personMap = new Map<string, { name: string; dates: string[] }>();
      for (const r of insightsRowsRef.current) {
        if (!personMap.has(r.pid)) personMap.set(r.pid, { name: r.name, dates: [] });
        personMap.get(r.pid)!.dates.push(r.date);
      }

      // Rising Stars: first attendance within 8 weeks, attended 3+ times
      const cutoff = shiftDate(getTodayDate(), -56);
      const rising: RisingStar[] = [];
      for (const [pid, stats] of personMap.entries()) {
        const sorted = [...stats.dates].sort();
        const firstDate = sorted[0];
        if (firstDate >= cutoff && stats.dates.length >= 3) {
          rising.push({ person_id: pid, person_name: stats.name, firstDate, attendanceCount: stats.dates.length });
        }
      }
      rising.sort((a, b) => b.attendanceCount - a.attendanceCount);
      setRisingStars(rising.slice(0, 15));
    }
    setInactiveLoading(false);
    setRisingStarsLoading(false);
  }

  async function loadRoleLeaderboards() {
    setRolesLoading(true);
    const { data } = await supabase
      .from('musician_roles')
      .select('person_id, role, date, meeting_id, person:people(full_name)');
    if (data) {
      setRoleRows((data as Array<Record<string, unknown>>).map(r => ({
        person_id: r.person_id as string,
        name: ((r.person as Record<string, unknown>)?.full_name as string) || 'Unknown',
        role: r.role as string,
        date: r.date as string,
        meeting_id: r.meeting_id as string,
      })));
    }
    setRolesLoading(false);
  }

  useEffect(() => {
    async function load() {
      const today = getTodayDate();

      const meetingsRes = await supabase.from('meetings').select('*').order('display_order');

      const data = meetingsRes.data;

      if (data) {
        setMeetings(data);
        const shabibeh = data.find(m => m.name.toLowerCase().includes('shabibeh')) ?? data[0];
        if (data.length > 0) {
          setDateMeetingId(data[0].id);
          setAllTimeMeetingId(data[0].id);
          setOnTimeMeetingId(shabibeh.id);
          setConsistencyMeetingId(shabibeh.id);
          setAvgChartMeetingId(shabibeh.id);
          const day = getMeetingDay(data[0].name);
          setSelectedDate(snapToValidDate(today, day));
        }

        loadChartData(chartTimeframe, data);
        loadCompareData(compareTimeframe, data);
        loadGenderData(genderTimeframe, genderMeetingId);
      }
      loadStreakLeaders();
      loadOnTimeLeaders(data?.find(m => m.name.toLowerCase().includes('shabibeh'))?.id ?? data?.[0]?.id);
      loadConsistencyLeaders(data?.find(m => m.name.toLowerCase().includes('shabibeh'))?.id ?? data?.[0]?.id);
      if (data) loadRecords(data);
      loadPeopleInsights();
      loadRoleLeaderboards();
      loadAvgTimeData();
      setLoading(false);
    }
    load();
  }, []);

  function handleDateMeetingChange(newId: string) {
    setDateMeetingId(newId);
    setDateResults(null);
    setDateError('');
    const meeting = meetings.find(m => m.id === newId);
    if (meeting) {
      const day = getMeetingDay(meeting.name);
      setSelectedDate(snapToValidDate(selectedDate, day));
    }
  }

  function handleDateChange(newDate: string) {
    if (!newDate) return;
    const meeting = meetings.find(m => m.id === dateMeetingId);
    if (meeting) {
      const day = getMeetingDay(meeting.name);
      if (day !== null && parseDate(newDate).getDay() !== day) {
        const dayName = day === 0 ? 'Sunday' : 'Saturday';
        setDateError(`This service only meets on ${dayName}s.`);
        return;
      }
    }
    setDateError('');
    setSelectedDate(newDate);
  }

  async function lookupDate() {
    if (!dateMeetingId || !selectedDate) return;
    setDateLoading(true);
    setDateError('');

    const { data } = await supabase
      .from('attendance_records')
      .select('id, person_id, marked_at, person:people(full_name)')
      .eq('meeting_id', dateMeetingId)
      .eq('date', selectedDate)
      .order('marked_at', { ascending: true });

    if (data) {
      setDateResults(
        data.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          person_id: r.person_id as string,
          person_name: ((r.person as Record<string, unknown>)?.full_name as string) || 'Unknown',
          marked_at: r.marked_at as string,
        }))
      );
    }

    setDateLoading(false);
  }

  async function lookupAllTime() {
    if (!allTimeMeetingId) return;
    setAllTimeLoading(true);

    const data = await fetchAllRows((from, to) =>
      supabase
        .from('attendance_records')
        .select('person_id, person:people(full_name)')
        .eq('meeting_id', allTimeMeetingId)
        .order('id', { ascending: true })
        .range(from, to)
    );

    {
      const countMap = new Map<string, { name: string; count: number }>();
      for (const r of data as Array<Record<string, unknown>>) {
        const pid = r.person_id as string;
        const name = ((r.person as Record<string, unknown>)?.full_name as string) || 'Unknown';
        const existing = countMap.get(pid);
        if (existing) {
          existing.count++;
        } else {
          countMap.set(pid, { name, count: 1 });
        }
      }

      const rows = Array.from(countMap.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .map(([pid, r]) => ({ person_id: pid, person_name: r.name, count: r.count }));

      setAllTimeResults(rows);
      setExpandedPersonId(null);
    }

    setAllTimeLoading(false);
  }

  async function togglePersonRecords(personId: string) {
    if (expandedPersonId === personId) {
      setExpandedPersonId(null);
      return;
    }
    setExpandedPersonId(personId);
    setPersonRecordsLoading(true);

    const { data } = await supabase
      .from('attendance_records')
      .select('id, date')
      .eq('meeting_id', allTimeMeetingId)
      .eq('person_id', personId)
      .order('date', { ascending: false });

    setPersonRecords(
      data
        ? data.map((r: Record<string, unknown>) => ({ id: r.id as string, date: r.date as string }))
        : []
    );
    setPersonRecordsLoading(false);
  }

  async function confirmDeleteRecord() {
    if (!pendingDelete) return;
    const { id, type } = pendingDelete;
    setPendingDelete(null);

    if (type === 'person') {
      setPersonRecords(prev => prev.filter(r => r.id !== id));
      setAllTimeResults(prev => {
        if (!prev || !expandedPersonId) return prev;
        return prev
          .map(r => r.person_id === expandedPersonId ? { ...r, count: r.count - 1 } : r)
          .filter(r => r.count > 0);
      });
    } else {
      setDateResults(prev => prev ? prev.filter(r => r.id !== id) : prev);
    }

    await supabase.from('attendance_records').delete().eq('id', id);
  }

  async function exportCSV() {
    setExporting(true);
    const data = await fetchAllRows((from, to) =>
      supabase
        .from('attendance_records')
        .select('date, marked_at, person:people(full_name), meeting:meetings(name)')
        .order('date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to)
    );

    if (data.length > 0) {
      const rows = data as Array<Record<string, unknown>>;
      const csvLines = ['Date,Meeting,Name,Time'];
      for (const r of rows) {
        const date = r.date as string;
        const meetingName = ((r.meeting as Record<string, unknown>)?.name as string) || '';
        const personName = ((r.person as Record<string, unknown>)?.full_name as string) || '';
        const time = (r.marked_at as string | null) ?? '';
        csvLines.push(`${date},"${meetingName}","${personName}",${time}`);
      }
      const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aebc-attendance-${getTodayDate()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  }

  if (loading) return <HistorySkeleton />;

  return (
    <div className="history-page">
      <div className={`history-header${scrolled ? ' header-compact' : ''}`}>
        <button className="back-btn" onClick={() => navigate('/')}>
          &larr;
        </button>
        <h1>Attendance History</h1>
        <button className="export-btn" onClick={exportCSV} disabled={exporting}>
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      <div className="history-body">
      {/* Attendance Over Time — full width */}
      <section className="history-section">
        <div className="section-header-row">
          <h2>Attendance Over Time</h2>
          <div className="timeframe-pills">
            {(['4w', '12w', '6m', '1y', 'all'] as const).map(tf => (
              <button
                key={tf}
                className={`timeframe-pill${chartTimeframe === tf ? ' timeframe-pill-active' : ''}`}
                onClick={() => setChartTimeframe(tf)}
              >
                {tf === 'all' ? 'All' : tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="meeting-filter-toggle" role="tablist" aria-label="Ministry">
          <button
            type="button"
            role="tab"
            aria-selected={chartMeeting === 'all'}
            className={`meeting-filter-option${chartMeeting === 'all' ? ' meeting-filter-option-active' : ''}`}
            onClick={() => setChartMeeting('all')}
          >
            All
          </button>
          {meetings.map(m => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={chartMeeting === m.id}
              className={`meeting-filter-option${chartMeeting === m.id ? ' meeting-filter-option-active' : ''}`}
              onClick={() => setChartMeeting(m.id)}
            >
              {m.name.replace(/ Service$/, '')}
            </button>
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={chartMeeting === 'firsttimers'}
            className={`meeting-filter-option${chartMeeting === 'firsttimers' ? ' meeting-filter-option-active' : ''}`}
            onClick={() => setChartMeeting('firsttimers')}
          >
            First Timers
          </button>
        </div>
        {chartLoading ? (
          <p className="history-empty">Loading...</p>
        ) : chartData.length === 0 ? (
          <p className="history-empty">No attendance data for this period.</p>
        ) : (
          <div className="dashboard-chart-wrapper">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: -10 }}>
                <defs>
                  {meetings.map((m, i) => (
                    <linearGradient key={m.id} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={LINE_COLORS[i % LINE_COLORS.length]} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={LINE_COLORS[i % LINE_COLORS.length]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                  <linearGradient id="grad-firsttimers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} strokeOpacity={0.5} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border)' }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontSize: '0.8125rem',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '0.5rem' }} />
                {meetings.map((m, i) => (
                  (chartMeeting === 'all' || chartMeeting === m.id) ? (
                    <Area
                      key={m.id}
                      type="monotone"
                      dataKey={m.name}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      strokeWidth={2.5}
                      fill={`url(#grad-${i})`}
                      dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                      animationDuration={800}
                      animationEasing="ease-out"
                      animationBegin={200}
                    />
                  ) : null
                ))}
                {(chartMeeting === 'all' || chartMeeting === 'firsttimers') && (
                  <Area
                    type="monotone"
                    dataKey="First Timers"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    fill="url(#grad-firsttimers)"
                    dot={{ r: 3, strokeWidth: 2, fill: '#fff' }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                    animationDuration={800}
                    animationEasing="ease-out"
                    animationBegin={400}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Average Arrival Time — full width, per meeting */}
      <section className="history-section">
        <div className="section-header-row">
          <h2>Average Arrival Time</h2>
          <div className="timeframe-pills">
            {(['4w', '12w', '6m', '1y', 'all'] as const).map(tf => (
              <button
                key={tf}
                className={`timeframe-pill${avgTimeframe === tf ? ' timeframe-pill-active' : ''}`}
                onClick={() => setAvgTimeframe(tf)}
              >
                {tf === 'all' ? 'All' : tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="history-controls">
          <select value={avgChartMeetingId} onChange={e => setAvgChartMeetingId(e.target.value)}>
            {meetings.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        {avgTimeLoading ? (
          <p className="history-empty">Loading...</p>
        ) : avgChartData.length === 0 ? (
          <p className="history-empty">No arrival-time data for this period.</p>
        ) : (
          <div className="dashboard-chart-wrapper">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={avgChartData} margin={{ top: 12, right: 20, bottom: 5, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} strokeOpacity={0.5} />
                <XAxis
                  dataKey="date"
                  tickFormatter={d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  minTickGap={28}
                />
                <YAxis
                  domain={avgYDomain}
                  ticks={avgYTicks}
                  tickFormatter={minutesToClock}
                  tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                />
                {avgChartCutoff !== null && avgChartCutoff >= avgYDomain[0] && avgChartCutoff <= avgYDomain[1] && (
                  <ReferenceLine
                    y={avgChartCutoff}
                    stroke="#16a34a"
                    strokeDasharray="5 4"
                    strokeOpacity={0.75}
                    label={{ value: `On-time · ${minutesToClock(avgChartCutoff)}`, position: 'insideTopLeft', fontSize: 10, fill: '#16a34a' }}
                  />
                )}
                <Tooltip content={<AvgTimeTooltip />} cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }} />
                <Line
                  type="monotone"
                  dataKey="minutes"
                  name="Avg arrival"
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, strokeWidth: 2, stroke: 'var(--color-primary)', fill: 'var(--color-surface)' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  animationDuration={800}
                  animationEasing="ease-out"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Gender Breakdown — full width */}
      <section className="history-section">
        <div className="section-header-row">
          <h2>Gender Breakdown</h2>
          <div className="section-header-controls">
            <select
              className="gender-meeting-select"
              value={genderMeetingId}
              onChange={e => setGenderMeetingId(e.target.value)}
            >
              <option value="">All ministries</option>
              {meetings.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <div className="timeframe-pills">
              {(['4w', '12w', '6m', '1y', 'all'] as const).map(tf => (
                <button
                  key={tf}
                  className={`timeframe-pill${genderTimeframe === tf ? ' timeframe-pill-active' : ''}`}
                  onClick={() => setGenderTimeframe(tf)}
                >
                  {tf === 'all' ? 'All' : tf.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
        {genderLoading ? (
          <p className="history-empty">Loading...</p>
        ) : genderData.length === 0 ? (
          <p className="history-empty">No gender data for this period.</p>
        ) : (
          <div className="dashboard-chart-wrapper">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={genderData} margin={{ top: 5, right: 20, bottom: 5, left: -10 }}>
                <defs>
                  <linearGradient id="grad-gender-male" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-gender-female" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ec4899" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} strokeOpacity={0.5} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border)' }}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontSize: '0.8125rem',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text)',
                  }}
                  formatter={((value: number, name: string, item: { payload?: GenderPoint }) => {
                    const p = item.payload;
                    const count = name === 'Male' ? p?.maleCount ?? 0 : p?.femaleCount ?? 0;
                    return [`${value}% (${count})`, name];
                  }) as never}
                />
                <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '0.5rem' }} />
                <Area
                  type="monotone"
                  dataKey="Male"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  fill="url(#grad-gender-male)"
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  animationDuration={800}
                  animationEasing="ease-out"
                  animationBegin={200}
                />
                <Area
                  type="monotone"
                  dataKey="Female"
                  stroke="#ec4899"
                  strokeWidth={2.5}
                  fill="url(#grad-gender-female)"
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  animationDuration={800}
                  animationEasing="ease-out"
                  animationBegin={400}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* 2x2 grid for remaining panels */}
      <div className="history-grid">
        {/* Ministry Comparison */}
        <section className="history-section">
          <div className="section-header-row">
            <h2>Ministry Comparison</h2>
            <div className="timeframe-pills">
              {(['4w', '12w', '6m', '1y', 'all'] as const).map(tf => (
                <button
                  key={tf}
                  className={`timeframe-pill${compareTimeframe === tf ? ' timeframe-pill-active' : ''}`}
                  onClick={() => setCompareTimeframe(tf)}
                >
                  {tf === 'all' ? 'All' : tf.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {compareLoading ? (
            <p className="history-empty">Loading...</p>
          ) : compareData.length === 0 ? (
            <p className="history-empty">No attendance data yet.</p>
          ) : (
            <div className="dashboard-chart-wrapper">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={compareData} margin={{ top: 24, right: 16, bottom: 4, left: -10 }} barCategoryGap="38%">
                  <defs>
                    {COMPARE_COLORS.map((c, i) => (
                      <linearGradient key={i} id={`cmp-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c.light} stopOpacity={1} />
                        <stop offset="100%" stopColor={c.base} stopOpacity={0.9} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" vertical={false} strokeOpacity={0.6} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'var(--color-text-muted)', fontWeight: 500 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--color-primary-light)', radius: 6 }}
                    contentStyle={{
                      borderRadius: '10px',
                      border: '1px solid var(--color-border)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      fontSize: '0.8125rem',
                      background: 'var(--color-surface)',
                      color: 'var(--color-text)',
                      padding: '8px 12px',
                    }}
                    labelStyle={{ fontWeight: 600, marginBottom: '2px', color: 'var(--color-text)' }}
                    itemStyle={{ color: 'var(--color-text-secondary)' }}
                  />
                  <Bar dataKey="Attendance" radius={[8, 8, 3, 3]} maxBarSize={68} animationDuration={800} animationEasing="ease-out" animationBegin={200}>
                    <LabelList
                      dataKey="Attendance"
                      position="top"
                      style={{ fontSize: '11px', fontWeight: 700, fill: 'var(--color-text-secondary)' }}
                    />
                    {compareData.map((_entry, i) => (
                      <Cell key={i} fill={`url(#cmp-grad-${i % COMPARE_COLORS.length})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Top Attendees */}
        <section className="history-section leaderboard-section">
          <div className="section-header-row">
            <h2>Top Attendees</h2>
            <div className="timeframe-pills">
              {(['4w', '12w', '6m', '1y', 'all'] as const).map(tf => (
                <button
                  key={tf}
                  className={`timeframe-pill${topTimeframe === tf ? ' timeframe-pill-active' : ''}`}
                  onClick={() => setTopTimeframe(tf)}
                >
                  {tf === 'all' ? 'All' : tf.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {topLoading ? (
            <p className="history-empty">Loading...</p>
          ) : topAttendees.length === 0 ? (
            <p className="history-empty">No attendance data yet.</p>
          ) : (
            <div className="leaderboard-scroll">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th className="lb-col-rank">#</th>
                  <th>Name</th>
                  <th className="lb-col-bar">Progress</th>
                  <th className="lb-col-count">Count</th>
                </tr>
              </thead>
              <tbody>
                {topAttendees.map((person, _i, arr) => {
                  const rank = arr.findIndex(p => p.count === person.count) + 1;
                  return (
                  <tr
                    key={person.person_id}
                    className={`lb-row ${rank <= 3 ? `lb-top-${rank}` : ''}`}
                    onClick={() => navigate(`/person/${person.person_id}`)}
                  >
                    <td className="lb-col-rank">
                      {rank <= 3 ? (
                        <span className={`lb-medal lb-medal-${rank}`}>{rank}</span>
                      ) : (
                        <span className="lb-rank-num">{rank}</span>
                      )}
                    </td>
                    <td className="lb-col-name">
                      <span className="person-link">{person.person_name}</span>
                    </td>
                    <td className="lb-col-bar">
                      <div className="lb-bar-bg">
                        <div
                          className="lb-bar-fill"
                          style={{ width: `${(person.count / maxCount) * 100}%` }}
                        />
                      </div>
                    </td>
                    <td className="lb-col-count"><AnimatedNumber value={person.count} /></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </section>

        <div className="leaderboard-pair">
        {/* Most On Time Leaderboard */}
        <section className="history-section leaderboard-section streak-lb-section">
          <h2>⏰ Most On Time</h2>
          <div className="history-controls">
            <select
              value={onTimeMeetingId}
              onChange={e => {
                setOnTimeMeetingId(e.target.value);
                loadOnTimeLeaders(e.target.value);
              }}
            >
              {meetings.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          {onTimeLoading ? (
            <p className="history-empty">Loading...</p>
          ) : onTimeLeaders.length === 0 ? (
            <p className="history-empty">Not enough data yet.</p>
          ) : (
            <div className="leaderboard-scroll">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th className="lb-col-rank">#</th>
                    <th>Name</th>
                    <th className="lb-col-count">Avg Time</th>
                    <th className="lb-col-count">Attendances</th>
                  </tr>
                </thead>
                <tbody>
                  {onTimeLeaders.map((leader, _i, arr) => {
                    const rank = arr.findIndex(l => l.avgMinutes === leader.avgMinutes) + 1;
                    return (
                    <tr
                      key={leader.person_id}
                      className={`lb-row ${rank <= 3 ? `lb-top-${rank}` : ''}`}
                      onClick={() => navigate(`/person/${leader.person_id}`)}
                    >
                      <td className="lb-col-rank">
                        {rank <= 3 ? (
                          <span className={`lb-medal lb-medal-${rank}`}>{rank}</span>
                        ) : (
                          <span className="lb-rank-num">{rank}</span>
                        )}
                      </td>
                      <td className="lb-col-name">
                        <span className="person-link">{leader.person_name}</span>
                      </td>
                      <td className="lb-col-count">{leader.avgTime}</td>
                      <td className="lb-col-count"><AnimatedNumber value={leader.timesAttended} /></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Streak Leaderboard */}
        <section className="history-section leaderboard-section streak-lb-section">
          <h2>🔥 Current Streaks</h2>
          {streakLoading ? (
            <p className="history-empty">Loading...</p>
          ) : streakLeaders.length === 0 ? (
            <p className="history-empty">No active streaks right now.</p>
          ) : (
            <div className="leaderboard-scroll">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th className="lb-col-rank">#</th>
                    <th>Name</th>
                    <th>Meeting</th>
                    <th className="lb-col-count">Weeks</th>
                  </tr>
                </thead>
                <tbody>
                  {streakLeaders.map((leader, _i, arr) => {
                    const rank = arr.findIndex(l => l.streak === leader.streak) + 1;
                    return (
                    <tr
                      key={leader.person_id + leader.meeting_name}
                      className={`lb-row ${rank <= 3 ? `lb-top-${rank}` : ''}`}
                      onClick={() => navigate(`/person/${leader.person_id}`)}
                    >
                      <td className="lb-col-rank">
                        {rank <= 3 ? (
                          <span className={`lb-medal lb-medal-${rank}`}>{rank}</span>
                        ) : (
                          <span className="lb-rank-num">{rank}</span>
                        )}
                      </td>
                      <td className="lb-col-name">
                        <span className="person-link">{leader.person_name}</span>
                      </td>
                      <td className="streak-lb-meeting">{leader.meeting_name}</td>
                      <td className="lb-col-count"><AnimatedNumber value={leader.streak} prefix="🔥 " /></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </div>

        {/* Consistency & Records side by side */}
        <div className="leaderboard-pair">
        {/* Consistency Leaderboard */}
        <section className="history-section leaderboard-section streak-lb-section">
          <h2>Consistency (12w)</h2>
          <div className="history-controls">
            <select
              value={consistencyMeetingId}
              onChange={e => {
                setConsistencyMeetingId(e.target.value);
                loadConsistencyLeaders(e.target.value);
              }}
            >
              {meetings.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          {consistencyLoading ? (
            <p className="history-empty">Loading...</p>
          ) : consistencyLeaders.length === 0 ? (
            <p className="history-empty">Not enough data yet.</p>
          ) : (
            <div className="leaderboard-scroll">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th className="lb-col-rank">#</th>
                    <th>Name</th>
                    <th className="lb-col-count">Rate</th>
                    <th className="lb-col-count">Attended</th>
                  </tr>
                </thead>
                <tbody>
                  {consistencyLeaders.map((leader, _i, arr) => {
                    const rank = arr.findIndex(l => l.rate === leader.rate) + 1;
                    return (
                    <tr
                      key={leader.person_id}
                      className={`lb-row ${rank <= 3 ? `lb-top-${rank}` : ''}`}
                      onClick={() => navigate(`/person/${leader.person_id}`)}
                    >
                      <td className="lb-col-rank">
                        {rank <= 3 ? (
                          <span className={`lb-medal lb-medal-${rank}`}>{rank}</span>
                        ) : (
                          <span className="lb-rank-num">{rank}</span>
                        )}
                      </td>
                      <td className="lb-col-name">
                        <span className="person-link">{leader.person_name}</span>
                      </td>
                      <td className="lb-col-count">{leader.rate}%</td>
                      <td className="lb-col-count">{leader.attended}/{leader.possible}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Record Breakers */}
        <section className="history-section leaderboard-section streak-lb-section records-section">
          <h2>Record Breakers</h2>
          {recordsLoading ? (
            <p className="history-empty">Loading...</p>
          ) : records.length === 0 ? (
            <p className="history-empty">Not enough data yet.</p>
          ) : (
            <div className="records-grid">
              {records.map(record => {
                const theme = recordTheme(record.label);
                return (
                  <div key={record.label} className={`record-card record-card--${theme.variant}`}>
                    <div className="record-icon" aria-hidden="true">{theme.icon}</div>
                    <div className="record-label">{record.label}</div>
                    <div className="record-value">{record.value}</div>
                    <div className="record-detail">{record.detail}</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        </div>

        {/* Inactive Watchlist + Rising Stars */}
        <div className="leaderboard-pair">
        <section className="history-section leaderboard-section streak-lb-section">
          <div className="section-header-row">
            <h2>Inactive Watchlist</h2>
            <div className="section-header-controls">
              <select
                className="gender-meeting-select"
                value={inactiveMeetingId}
                onChange={e => setInactiveMeetingId(e.target.value)}
              >
                <option value="">All ministries</option>
                {meetings.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
          {inactiveLoading ? (
            <p className="history-empty">Loading...</p>
          ) : inactiveList.length === 0 ? (
            <p className="history-empty">Everyone is active!</p>
          ) : (
            <div className="leaderboard-scroll">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="lb-col-count">Last Seen</th>
                    <th className="lb-col-count">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {inactiveList.map(person => (
                    <tr
                      key={person.person_id}
                      className="lb-row"
                      onClick={() => navigate(`/person/${person.person_id}`)}
                    >
                      <td className="lb-col-name">
                        <span className="person-link">{person.person_name}</span>
                      </td>
                      <td className="lb-col-count">
                        <span className={`weeks-badge weeks-${person.weeksSinceLast >= 8 ? 'danger' : person.weeksSinceLast >= 5 ? 'warn' : 'info'}`}>
                          {person.weeksSinceLast}w ago
                        </span>
                      </td>
                      <td className="lb-col-count">{person.totalAttendances}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="history-section leaderboard-section streak-lb-section">
          <h2>Rising Stars</h2>
          {risingStarsLoading ? (
            <p className="history-empty">Loading...</p>
          ) : risingStars.length === 0 ? (
            <p className="history-empty">No rising stars yet.</p>
          ) : (
            <div className="leaderboard-scroll">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="lb-col-count">Since</th>
                    <th className="lb-col-count">Times</th>
                  </tr>
                </thead>
                <tbody>
                  {risingStars.map(star => (
                    <tr
                      key={star.person_id}
                      className="lb-row"
                      onClick={() => navigate(`/person/${star.person_id}`)}
                    >
                      <td className="lb-col-name">
                        <span className="person-link">{star.person_name}</span>
                      </td>
                      <td className="lb-col-count" style={{ fontSize: '0.75rem' }}>
                        {new Date(star.firstDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="lb-col-count">{star.attendanceCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </div>

        {/* Top Preachers + Top Attendance Takers pair */}
        <div className="leaderboard-pair">
        <section className="history-section leaderboard-section streak-lb-section">
          <h2>Top Preachers</h2>
          <RoleMeetingSelect value={preachersMeetingId} onChange={setPreachersMeetingId} meetings={meetings} />
          {rolesLoading ? (
            <p className="history-empty">Loading...</p>
          ) : topPreachers.length === 0 ? (
            <p className="history-empty">No preacher data yet.</p>
          ) : (
            <div className="leaderboard-scroll">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th className="lb-col-rank">#</th>
                    <th>Name</th>
                    <th className="lb-col-count">Times</th>
                  </tr>
                </thead>
                <tbody>
                  {topPreachers.map((p, _i, arr) => {
                    const rank = arr.findIndex(x => x.totalAppearances === p.totalAppearances) + 1;
                    return (
                    <tr
                      key={p.person_id}
                      className={`lb-row ${rank <= 3 ? `lb-top-${rank}` : ''}`}
                      onClick={() => navigate(`/person/${p.person_id}`)}
                    >
                      <td className="lb-col-rank">
                        {rank <= 3 ? (
                          <span className={`lb-medal lb-medal-${rank}`}>{rank}</span>
                        ) : (
                          <span className="lb-rank-num">{rank}</span>
                        )}
                      </td>
                      <td className="lb-col-name">
                        <span className="person-link">{p.person_name}</span>
                      </td>
                      <td className="lb-col-count"><AnimatedNumber value={p.totalAppearances} /></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="history-section leaderboard-section streak-lb-section">
          <h2>Top Attendance Takers</h2>
          <RoleMeetingSelect value={attendanceTakersMeetingId} onChange={setAttendanceTakersMeetingId} meetings={meetings} />
          {rolesLoading ? (
            <p className="history-empty">Loading...</p>
          ) : topAttendanceTakers.length === 0 ? (
            <p className="history-empty">No attendance-taker data yet.</p>
          ) : (
            <div className="leaderboard-scroll">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th className="lb-col-rank">#</th>
                    <th>Name</th>
                    <th className="lb-col-count">Times</th>
                  </tr>
                </thead>
                <tbody>
                  {topAttendanceTakers.map((p, _i, arr) => {
                    const rank = arr.findIndex(x => x.totalAppearances === p.totalAppearances) + 1;
                    return (
                    <tr
                      key={p.person_id}
                      className={`lb-row ${rank <= 3 ? `lb-top-${rank}` : ''}`}
                      onClick={() => navigate(`/person/${p.person_id}`)}
                    >
                      <td className="lb-col-rank">
                        {rank <= 3 ? (
                          <span className={`lb-medal lb-medal-${rank}`}>{rank}</span>
                        ) : (
                          <span className="lb-rank-num">{rank}</span>
                        )}
                      </td>
                      <td className="lb-col-name">
                        <span className="person-link">{p.person_name}</span>
                      </td>
                      <td className="lb-col-count"><AnimatedNumber value={p.totalAppearances} /></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </div>

        {/* Top Sound + Top Live Stream pair */}
        <div className="leaderboard-pair">
        <section className="history-section leaderboard-section streak-lb-section">
          <h2>🔊 Top Sound</h2>
          <RoleMeetingSelect value={soundMeetingId} onChange={setSoundMeetingId} meetings={meetings} />
          {rolesLoading ? (
            <p className="history-empty">Loading...</p>
          ) : topSound.length === 0 ? (
            <p className="history-empty">No sound data yet.</p>
          ) : (
            <div className="leaderboard-scroll">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th className="lb-col-rank">#</th>
                    <th>Name</th>
                    <th className="lb-col-count">Times</th>
                  </tr>
                </thead>
                <tbody>
                  {topSound.map((p, _i, arr) => {
                    const rank = arr.findIndex(x => x.totalAppearances === p.totalAppearances) + 1;
                    return (
                    <tr
                      key={p.person_id}
                      className={`lb-row ${rank <= 3 ? `lb-top-${rank}` : ''}`}
                      onClick={() => navigate(`/person/${p.person_id}`)}
                    >
                      <td className="lb-col-rank">
                        {rank <= 3 ? (
                          <span className={`lb-medal lb-medal-${rank}`}>{rank}</span>
                        ) : (
                          <span className="lb-rank-num">{rank}</span>
                        )}
                      </td>
                      <td className="lb-col-name">
                        <span className="person-link">{p.person_name}</span>
                      </td>
                      <td className="lb-col-count"><AnimatedNumber value={p.totalAppearances} /></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="history-section leaderboard-section streak-lb-section">
          <h2>📡 Top Live Stream</h2>
          <RoleMeetingSelect value={liveStreamMeetingId} onChange={setLiveStreamMeetingId} meetings={meetings} />
          {rolesLoading ? (
            <p className="history-empty">Loading...</p>
          ) : topLiveStream.length === 0 ? (
            <p className="history-empty">No live stream data yet.</p>
          ) : (
            <div className="leaderboard-scroll">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th className="lb-col-rank">#</th>
                    <th>Name</th>
                    <th className="lb-col-count">Times</th>
                  </tr>
                </thead>
                <tbody>
                  {topLiveStream.map((p, _i, arr) => {
                    const rank = arr.findIndex(x => x.totalAppearances === p.totalAppearances) + 1;
                    return (
                    <tr
                      key={p.person_id}
                      className={`lb-row ${rank <= 3 ? `lb-top-${rank}` : ''}`}
                      onClick={() => navigate(`/person/${p.person_id}`)}
                    >
                      <td className="lb-col-rank">
                        {rank <= 3 ? (
                          <span className={`lb-medal lb-medal-${rank}`}>{rank}</span>
                        ) : (
                          <span className="lb-rank-num">{rank}</span>
                        )}
                      </td>
                      <td className="lb-col-name">
                        <span className="person-link">{p.person_name}</span>
                      </td>
                      <td className="lb-col-count"><AnimatedNumber value={p.totalAppearances} /></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </div>

        {/* Top PowerPoint + Top Musicians pair */}
        <div className="leaderboard-pair">
        <section className="history-section leaderboard-section streak-lb-section">
          <h2>🖥️ Top PowerPoint</h2>
          <RoleMeetingSelect value={powerPointMeetingId} onChange={setPowerPointMeetingId} meetings={meetings} />
          {rolesLoading ? (
            <p className="history-empty">Loading...</p>
          ) : topPowerPoint.length === 0 ? (
            <p className="history-empty">No PowerPoint data yet.</p>
          ) : (
            <div className="leaderboard-scroll">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th className="lb-col-rank">#</th>
                    <th>Name</th>
                    <th className="lb-col-count">Times</th>
                  </tr>
                </thead>
                <tbody>
                  {topPowerPoint.map((p, _i, arr) => {
                    const rank = arr.findIndex(x => x.totalAppearances === p.totalAppearances) + 1;
                    return (
                    <tr
                      key={p.person_id}
                      className={`lb-row ${rank <= 3 ? `lb-top-${rank}` : ''}`}
                      onClick={() => navigate(`/person/${p.person_id}`)}
                    >
                      <td className="lb-col-rank">
                        {rank <= 3 ? (
                          <span className={`lb-medal lb-medal-${rank}`}>{rank}</span>
                        ) : (
                          <span className="lb-rank-num">{rank}</span>
                        )}
                      </td>
                      <td className="lb-col-name">
                        <span className="person-link">{p.person_name}</span>
                      </td>
                      <td className="lb-col-count"><AnimatedNumber value={p.totalAppearances} /></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Top Musicians */}
        <section className="history-section leaderboard-section streak-lb-section">
          <h2>Top Musicians</h2>
          <RoleMeetingSelect value={musiciansMeetingId} onChange={setMusiciansMeetingId} meetings={meetings} />
          {rolesLoading ? (
            <p className="history-empty">Loading...</p>
          ) : topMusicians.length === 0 ? (
            <p className="history-empty">No musician data yet.</p>
          ) : (
            <div className="leaderboard-scroll">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th className="lb-col-rank">#</th>
                    <th>Name</th>
                    <th>Roles</th>
                    <th className="lb-col-count">Times</th>
                  </tr>
                </thead>
                <tbody>
                  {topMusicians.map((musician, _i, arr) => {
                    const rank = arr.findIndex(m => m.totalAppearances === musician.totalAppearances) + 1;
                    return (
                    <tr
                      key={musician.person_id}
                      className={`lb-row ${rank <= 3 ? `lb-top-${rank}` : ''}`}
                      onClick={() => navigate(`/person/${musician.person_id}`)}
                    >
                      <td className="lb-col-rank">
                        {rank <= 3 ? (
                          <span className={`lb-medal lb-medal-${rank}`}>{rank}</span>
                        ) : (
                          <span className="lb-rank-num">{rank}</span>
                        )}
                      </td>
                      <td className="lb-col-name">
                        <span className="person-link">{musician.person_name}</span>
                      </td>
                      <td>
                        <div className="musician-role-pills">
                          {musician.topRoles.map(role => (
                            <span key={role} className="musician-role-pill">{role}</span>
                          ))}
                        </div>
                      </td>
                      <td className="lb-col-count"><AnimatedNumber value={musician.totalAppearances} /></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </div>

        {/* Date lookup section */}
        <section className="history-section">
          <h2>Lookup by Date</h2>
          <div className="history-controls">
            <select
              value={dateMeetingId}
              onChange={e => handleDateMeetingChange(e.target.value)}
            >
              {meetings.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={selectedDate}
              onChange={e => handleDateChange(e.target.value)}
            />
            <button className="history-search-btn" onClick={lookupDate} disabled={dateLoading}>
              {dateLoading ? 'Loading...' : 'Search'}
            </button>
          </div>
          {dateError && <p className="history-error">{dateError}</p>}

          {dateResults !== null && (
            dateResults.length === 0 ? (
              <p className="history-empty">No attendance records for this date.</p>
            ) : (
              <table className="history-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th className="col-action"></th>
                  </tr>
                </thead>
                <tbody>
                  {dateResults.map((row, i) => (
                    <tr key={row.id}>
                      <td className="col-num">{i + 1}</td>
                      <td>
                        <span className="person-link" onClick={() => navigate(`/person/${row.person_id}`)}>
                          {row.person_name}
                        </span>
                      </td>
                      <td className="col-action">
                        <button className="history-remove-btn" onClick={() => setPendingDelete({ id: row.id, type: 'date' })}>
                          &times;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="history-total">
                      Total: {dateResults.length}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )
          )}
        </section>

        {/* All-time section */}
        <section className="history-section">
          <h2>All-Time Attendance</h2>
          <div className="history-controls">
            <select
              value={allTimeMeetingId}
              onChange={e => setAllTimeMeetingId(e.target.value)}
            >
              {meetings.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <button className="history-search-btn" onClick={lookupAllTime} disabled={allTimeLoading}>
              {allTimeLoading ? 'Loading...' : 'Search'}
            </button>
          </div>

          {allTimeResults !== null && (
            allTimeResults.length === 0 ? (
              <p className="history-empty">No attendance records for this meeting.</p>
            ) : (
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Name</th>
                    <th>Times Attended</th>
                  </tr>
                </thead>
                <tbody>
                  {allTimeResults.map((row, _i, arr) => {
                    const rank = arr.findIndex(r => r.count === row.count) + 1;
                    return (
                    <>
                      <tr
                        key={row.person_id}
                        className={`alltime-row ${expandedPersonId === row.person_id ? 'alltime-row-active' : ''}`}
                        onClick={() => togglePersonRecords(row.person_id)}
                      >
                        <td className="col-num">{rank}</td>
                        <td className="alltime-name">
                          <span className="person-link" onClick={e => { e.stopPropagation(); navigate(`/person/${row.person_id}`); }}>
                            {row.person_name}
                          </span>
                        </td>
                        <td className="col-count">{row.count}</td>
                      </tr>
                      {expandedPersonId === row.person_id && (
                        <tr key={`${row.person_id}-detail`}>
                          <td colSpan={3} className="person-records-cell">
                            {personRecordsLoading ? (
                              <p className="person-records-loading">Loading...</p>
                            ) : personRecords.length === 0 ? (
                              <p className="person-records-loading">No records found.</p>
                            ) : (
                              <ul className="person-records-list">
                                {personRecords.map(rec => (
                                  <li key={rec.id}>
                                    <span>{new Date(rec.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
                                    <button className="history-remove-btn" onClick={e => { e.stopPropagation(); setPendingDelete({ id: rec.id, type: 'person' }); }}>
                                      &times;
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                    );
                  })}
                </tbody>
              </table>
            )
          )}
        </section>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          message="Are you sure you want to remove this attendance record?"
          onConfirm={confirmDeleteRecord}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      </div>
    </div>
  );
}
