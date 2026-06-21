import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { supabase, fetchAllRows } from '../lib/supabase';
import { getMeetingDay, formatTimeET, minutesSinceMidnightET } from '../lib/dateUtils';
import type { Person, Meeting, Gender } from '../types';
import { ProfileSkeleton } from '../components/Skeleton';
import AnimatedNumber from '../components/AnimatedNumber';
import ConfirmDialog from '../components/ConfirmDialog';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { useScrolledDown } from '../hooks/useScrolledDown';
import './PersonProfilePage.css';

function hexDarken(hex: string, factor = 0.82): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return '#' + [r, g, b].map(c => Math.max(0, Math.round(c * factor)).toString(16).padStart(2, '0')).join('');
}

function hexLighten(hex: string, factor = 0.35): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return '#' + [r, g, b].map(c => Math.min(255, Math.round(c + (255 - c) * factor)).toString(16).padStart(2, '0')).join('');
}

interface AttendanceRow {
  id: string;
  meeting_id: string;
  date: string;
  marked_at: string;
}

interface MeetingStat {
  meeting: Meeting;
  timesAttended: number;
  longestStreak: number;
  currentStreak: number;
  attendanceRate: number;
  avgArrivalTime: string;
}

interface StreakBadge {
  emoji: string;
  label: string;
  minWeeks: number;
}

const STREAK_BADGES: StreakBadge[] = [
  { emoji: '👑', label: 'Legend',    minWeeks: 52 },
  { emoji: '🏆', label: 'Champion',  minWeeks: 20 },
  { emoji: '💎', label: 'Devoted',   minWeeks: 10 },
  { emoji: '⚡', label: 'Consistent', minWeeks: 5 },
  { emoji: '🔥', label: 'On Fire',   minWeeks: 2 },
];

const SHABIBEH_LEADERS = [
  'Andrew Helou',
  'Shayla Achkar',
  'Chloe Nasrallah',
  'James Helou',
  'Jessica Sebali',
  'Michael Nasrallah',
  'Patricia Mangalo',
];

function getStreakBadge(streak: number): StreakBadge | null {
  return STREAK_BADGES.find(b => streak >= b.minWeeks) ?? null;
}

interface HistoryRow {
  id: string;
  meeting_id: string;
  date: string;
  marked_at: string;
  meetingName: string;
}

function computeLongestStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const sorted = [...dates].sort();
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00');
    const curr = new Date(sorted[i] + 'T00:00:00');
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 7) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }
  return longest;
}

function computeCurrentStreak(dates: string[], meetingDay: number | null): number {
  if (dates.length === 0 || meetingDay === null) return 0;
  const sorted = [...dates].sort().reverse(); // most recent first
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check if the most recent attendance is within the last 2 weeks
  const lastDate = new Date(sorted[0] + 'T00:00:00');
  const daysSinceLast = Math.round((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceLast > 14) return 0; // streak is broken

  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00');
    const curr = new Date(sorted[i] + 'T00:00:00');
    const diff = Math.round((prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 7) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/** Minutes-since-midnight → "7:32 PM". */
function minutesToClock(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  const period = h >= 12 ? 'PM' : 'AM';
  const dh = h % 12 || 12;
  return `${dh}:${m.toString().padStart(2, '0')} ${period}`;
}

/** On-time cutoff (minutes since midnight, ET) for a meeting, matching the live page. */
function onTimeCutoffMinutes(meetingName: string): number | null {
  const l = meetingName.toLowerCase();
  if (l.includes('english') || l.includes('sunday')) return 10 * 60 + 30;
  if (l.includes('saturday') || l.includes('shabibeh')) return 19 * 60 + 30;
  return null;
}

/** Y-axis ticks at a sensible whole-clock interval across a minutes range. */
function niceTimeTicks(lo: number, hi: number): number[] {
  const range = Math.max(1, hi - lo);
  const step = [15, 30, 60, 120, 180, 240].find(s => range / s <= 6) ?? 360;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  return ticks;
}

interface ArrivalPoint {
  date: string;
  label: string;
  minutes: number;
  timeLabel: string;
}

function ArrivalTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ArrivalPoint }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const fullDate = new Date(p.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
  return (
    <div className="profile-chart-tooltip">
      <span className="profile-chart-tooltip-date">{fullDate}</span>
      <span className="profile-chart-tooltip-time">{p.timeLabel}</span>
    </div>
  );
}

export default function PersonProfilePage() {
  const { personId } = useParams<{ personId: string }>();
  const navigate = useNavigate();
  useEscapeBack();
  const scrolled = useScrolledDown();
  const [loading, setLoading] = useState(true);
  const [person, setPerson] = useState<Person | null>(null);
  const [meetingStats, setMeetingStats] = useState<MeetingStat[]>([]);
  const [totalAttendances, setTotalAttendances] = useState(0);
  const [firstMeetingDate, setFirstMeetingDate] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [chartMeetingId, setChartMeetingId] = useState<string>('');
  const [meetingAvgMinutes, setMeetingAvgMinutes] = useState<Map<string, number>>(new Map());
  const [accent, setAccent] = useState('#2563eb');
  const [pendingDelete, setPendingDelete] = useState<{ id: string; meetingId: string } | null>(null);
  const [notes, setNotes] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [customColor, setCustomColor] = useState<string>(
    () => localStorage.getItem('ryan-custom-hex') ?? '#7c3aed'
  );
  const [showColorPanel, setShowColorPanel] = useState(false);

  const GREY_SWATCHES = ['#ffffff', '#e2e8f0', '#94a3b8', '#64748b', '#334155', '#0f172a'];

  useEffect(() => {
    if (!personId) return;

    async function load() {
      const [personRes, meetingsRes, recordsRes, allDates] = await Promise.all([
        supabase.from('people').select('*').eq('id', personId).single(),
        supabase.from('meetings').select('*').order('display_order'),
        supabase
          .from('attendance_records')
          .select('id, meeting_id, date, marked_at')
          .eq('person_id', personId)
          .order('date', { ascending: false }),
        fetchAllRows((from, to) =>
          supabase
            .from('attendance_records')
            .select('meeting_id, date, marked_at')
            .order('id', { ascending: true })
            .range(from, to)
        ),
      ]);

      const personData = personRes.data as Person | null;
      const meetings = (meetingsRes.data ?? []) as Meeting[];
      const records = (recordsRes.data ?? []) as AttendanceRow[];

      // Build active dates per meeting (all dates where any attendance was taken),
      // and accumulate each meeting's average arrival time (ET) across everyone.
      const activeDatesByMeeting = new Map<string, Set<string>>();
      const avgAcc = new Map<string, { sum: number; count: number }>();
      for (const r of allDates as unknown as Array<{ meeting_id: string; date: string; marked_at: string }>) {
        if (!activeDatesByMeeting.has(r.meeting_id)) activeDatesByMeeting.set(r.meeting_id, new Set());
        activeDatesByMeeting.get(r.meeting_id)!.add(r.date);
        const mins = minutesSinceMidnightET(r.marked_at);
        if (mins !== null) {
          if (!avgAcc.has(r.meeting_id)) avgAcc.set(r.meeting_id, { sum: 0, count: 0 });
          const a = avgAcc.get(r.meeting_id)!;
          a.sum += mins;
          a.count++;
        }
      }
      const avgMap = new Map<string, number>();
      for (const [mid, a] of avgAcc) if (a.count > 0) avgMap.set(mid, Math.round(a.sum / a.count));
      setMeetingAvgMinutes(avgMap);

      setPerson(personData);
      setNotes(personData?.notes ?? '');
      setTotalAttendances(records.length);
      setFirstMeetingDate(records.length > 0 ? records[records.length - 1].date : null);

      // Build meeting map for names
      const meetingMap = new Map(meetings.map(m => [m.id, m]));

      // Build history rows
      setHistory(
        records.map(r => ({
          id: r.id,
          meeting_id: r.meeting_id,
          date: r.date,
          marked_at: r.marked_at,
          meetingName: meetingMap.get(r.meeting_id)?.name ?? 'Unknown',
        }))
      );

      // Compute stats per meeting
      const stats: MeetingStat[] = [];
      for (const meeting of meetings) {
        const meetingRecords = records.filter(r => r.meeting_id === meeting.id);
        if (meetingRecords.length === 0) continue;

        const dates = meetingRecords.map(r => r.date);
        const timesAttended = dates.length;
        const longestStreak = computeLongestStreak(dates);
        const day = getMeetingDay(meeting.name);
        const currentStreak = computeCurrentStreak(dates, day);

        let attendanceRate = 0;
        {
          const activeDates = activeDatesByMeeting.get(meeting.id);
          const totalOccurrences = activeDates?.size ?? 0;
          if (totalOccurrences > 0) {
            attendanceRate = Math.round((timesAttended / totalOccurrences) * 100);
          }
        }

        // Compute average arrival time (time-of-day only), in Eastern Time.
        // Records with no recorded time are excluded from the average.
        const times = meetingRecords
          .map(r => minutesSinceMidnightET(r.marked_at))
          .filter((m): m is number => m !== null);
        let avgArrivalTime = '—';
        if (times.length > 0) {
          const avgMinutes = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
          const avgH = Math.floor(avgMinutes / 60);
          const avgM = avgMinutes % 60;
          const period = avgH >= 12 ? 'PM' : 'AM';
          const displayH = avgH % 12 || 12;
          avgArrivalTime = `${displayH}:${avgM.toString().padStart(2, '0')} ${period}`;
        }

        stats.push({ meeting, timesAttended, longestStreak, currentStreak, attendanceRate, avgArrivalTime });
      }
      setMeetingStats(stats);
      // Default the arrival-time chart to Shabibeh if attended, else the first meeting.
      const preferred = stats.find(s => s.meeting.name.toLowerCase().includes('shabibeh')) ?? stats[0];
      if (preferred) setChartMeetingId(preferred.meeting.id);
      setLoading(false);
    }

    load();
  }, [personId]);

  // Resolve the themed accent to a concrete hex so chart gradients render reliably.
  useEffect(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
    if (v) setAccent(v);
  }, []);

  // Meetings the person has attended (for the chart's meeting toggle).
  const chartMeetings = useMemo(() => meetingStats.map(s => s.meeting), [meetingStats]);
  const selectedMeeting = chartMeetings.find(m => m.id === chartMeetingId) ?? chartMeetings[0] ?? null;

  // Arrival-time points for the selected meeting, oldest → newest, timed records only.
  const chartData = useMemo<ArrivalPoint[]>(() => {
    if (!selectedMeeting) return [];
    return history
      .filter(r => r.meeting_id === selectedMeeting.id)
      .map(r => ({ date: r.date, minutes: minutesSinceMidnightET(r.marked_at) }))
      .filter((r): r is { date: string; minutes: number } => r.minutes !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(r => ({
        date: r.date,
        label: new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        minutes: r.minutes,
        timeLabel: minutesToClock(r.minutes),
      }));
  }, [history, selectedMeeting]);

  const cutoff = selectedMeeting ? onTimeCutoffMinutes(selectedMeeting.name) : null;
  const meetingAvg = selectedMeeting ? meetingAvgMinutes.get(selectedMeeting.id) ?? null : null;

  // Y-axis domain hugging the data (plus the cutoff/average lines), padded
  // lightly and rounded to 5 min so it doesn't stretch into empty space.
  const [yDomain, yTicks] = useMemo<[[number, number], number[]]>(() => {
    if (chartData.length === 0) return [[0, 1440], []];
    const refs = [cutoff, meetingAvg].filter((v): v is number => v !== null);
    const vals = [...chartData.map(d => d.minutes), ...refs];
    const lo = Math.max(0, Math.floor((Math.min(...vals) - 10) / 5) * 5);
    const hi = Math.min(1440, Math.ceil((Math.max(...vals) + 10) / 5) * 5);
    return [[lo, hi], niceTimeTicks(lo, hi)];
  }, [chartData, cutoff, meetingAvg]);

  const hasAnyArrivalTimes = useMemo(
    () => history.some(r => minutesSinceMidnightET(r.marked_at) !== null),
    [history],
  );

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { id, meetingId } = pendingDelete;
    setPendingDelete(null);

    setHistory(prev => {
      const next = prev.filter(r => r.id !== id);
      setFirstMeetingDate(next.length > 0 ? next[next.length - 1].date : null);
      return next;
    });
    setTotalAttendances(prev => prev - 1);
    setMeetingStats(prev =>
      prev
        .map(s => {
          if (s.meeting.id !== meetingId) return s;
          return { ...s, timesAttended: s.timesAttended - 1 };
        })
        .filter(s => s.timesAttended > 0)
    );
    await supabase.from('attendance_records').delete().eq('id', id);
  }

  async function saveNotes() {
    const trimmed = notes.trim();
    await supabase
      .from('people')
      .update({ notes: trimmed || null })
      .eq('id', personId!);
    setPerson(prev => prev ? { ...prev, notes: trimmed || null } : prev);
  }

  async function setGender(next: Gender | null) {
    setPerson(prev => prev ? { ...prev, gender: next } : prev);
    await supabase.from('people').update({ gender: next }).eq('id', personId!);
  }

  function startEditName() {
    setNameValue(person?.full_name ?? '');
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  }

  async function saveName() {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === person?.full_name) {
      setEditingName(false);
      return;
    }
    await supabase.from('people').update({ full_name: trimmed }).eq('id', personId!);
    setPerson(prev => prev ? { ...prev, full_name: trimmed } : prev);
    setEditingName(false);
  }

  const isRyan = person?.full_name === 'Ryan Helou';
  const isJona = person?.full_name === 'Jona Safadi';
  const isGeorge = person?.full_name === 'George Hag Moussa';
  const isAttendanceMinistry = ['Holy', 'Aly', 'Julia'].some(n =>
    person?.full_name.startsWith(n)
  );

  function handleColorChange(hex: string) {
    setCustomColor(hex);
    localStorage.setItem('ryan-custom-hex', hex);
  }


  if (loading) return <ProfileSkeleton />;
  if (!person) {
    return (
      <div className="profile-page">
        <div className="profile-header">
          <button className="back-btn" onClick={() => navigate(-1)}>&larr;</button>
          <h1>Person not found</h1>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`profile-page ${isRyan ? 'profile-themed' : ''} ${isJona ? 'profile-jona' : ''}`}
      onMouseDown={() => setShowColorPanel(false)}
      style={isRyan ? {
        '--ryan-accent':       customColor,
        '--ryan-accent-hover': hexDarken(customColor),
        '--ryan-accent-dark':  hexDarken(customColor, 0.55),
        '--ryan-accent-light': hexLighten(customColor, 0.4),
      } as React.CSSProperties : undefined}
    >
      {isJona && (
        <div className="phil-bg" aria-hidden="true">
          {Array.from({ length: 3000 }, () => 'Phil Wickham ').join('')}
        </div>
      )}
      <div className={`profile-header${scrolled ? ' header-compact' : ''}`}>
        <button className="back-btn" onClick={() => navigate(-1)}>&larr;</button>
        <h1>
          {isRyan && <span className="profile-crown">👑</span>}
          {isJona && <span className="profile-crown">🤡</span>}
          {isGeorge && <img src="/lebron.png" alt="LeBron" className="profile-lebron" />}
          {isAttendanceMinistry && <span className="profile-crown">⭐</span>}
          {editingName ? (
            <input
              ref={nameInputRef}
              className="profile-name-input"
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') setEditingName(false);
              }}
              autoFocus
            />
          ) : (
            <span className="profile-name-tap" onClick={startEditName}>
              {person.full_name}
              {SHABIBEH_LEADERS.includes(person.full_name) && (
                <span className="profile-shabibeh-leader" title="Shabibeh Committee">COMMITTEE</span>
              )}
            </span>
          )}
        </h1>
        {isRyan && (
          <div className="ryan-color-picker">
            <button
              className="ryan-color-btn"
              style={{ background: customColor }}
              onClick={() => setShowColorPanel(v => !v)}
              title="Pick accent colour"
            >
              🎨
            </button>
            {showColorPanel && (
              <div className="ryan-color-panel" onMouseDown={e => e.stopPropagation()}>
                <div className="ryan-color-panel-inner">
                  <div className="ryan-grey-swatches">
                    {GREY_SWATCHES.map(hex => (
                      <button
                        key={hex}
                        className={`ryan-swatch${customColor === hex ? ' ryan-swatch-active' : ''}`}
                        style={{ background: hex }}
                        onClick={() => { handleColorChange(hex); setShowColorPanel(false); }}
                      />
                    ))}
                  </div>
                  <button
                    className="ryan-color-wheel-btn"
                    style={{ background: customColor }}
                    onClick={() => colorInputRef.current?.click()}
                    title="Open colour wheel"
                  >
                    🎨
                  </button>
                </div>
                <input
                  ref={colorInputRef}
                  type="color"
                  value={customColor}
                  onChange={e => handleColorChange(e.target.value)}
                  onBlur={() => setShowColorPanel(false)}
                  style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="profile-body">
      <div className="profile-total-card">
        <span className="profile-total-number"><AnimatedNumber value={totalAttendances} /></span>
        <span className="profile-total-label">Total Attendances</span>
        {firstMeetingDate && (
          <span className="profile-first-meeting" title="Date of first attendance">
            First Meeting · {new Date(firstMeetingDate + 'T00:00:00').toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        )}
      </div>

      <textarea
        className="profile-notes-input"
        placeholder="Notes…"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        onBlur={saveNotes}
        rows={2}
      />

      <div className="profile-gender-row">
        <span className="profile-gender-label">Gender</span>
        <div className="profile-gender-options">
          <button
            type="button"
            className={`profile-gender-option${person.gender === 'male' ? ' profile-gender-option-active' : ''}`}
            onClick={() => setGender(person.gender === 'male' ? null : 'male')}
          >
            Male
          </button>
          <button
            type="button"
            className={`profile-gender-option${person.gender === 'female' ? ' profile-gender-option-active' : ''}`}
            onClick={() => setGender(person.gender === 'female' ? null : 'female')}
          >
            Female
          </button>
        </div>
      </div>

      {meetingStats.map(stat => {
        const badge = getStreakBadge(stat.longestStreak);
        return (
        <div className="profile-meeting-card" key={stat.meeting.id}>
          <div className="profile-meeting-header">
            <span className="profile-meeting-name">{stat.meeting.name}</span>
            {badge && (
              <span className="profile-streak-badge" title={`${badge.label} — ${stat.longestStreak}-week best streak`}>
                {badge.emoji} {badge.label}
              </span>
            )}
          </div>
          <div className="profile-stat-row">
            <div className="profile-stat-item">
              <span className="profile-stat-value"><AnimatedNumber value={stat.timesAttended} /></span>
              <span className="profile-stat-label">Attended</span>
            </div>
            <div className="profile-stat-divider" />
            <div className="profile-stat-item">
              <span className="profile-stat-value"><AnimatedNumber value={stat.longestStreak} /></span>
              <span className="profile-stat-label">Best Streak</span>
            </div>
            <div className="profile-stat-divider" />
            <div className="profile-stat-item">
              <span className={`profile-stat-value${stat.currentStreak >= 2 ? ' profile-streak-active' : ''}`}><AnimatedNumber value={stat.currentStreak} /></span>
              <span className="profile-stat-label">Current</span>
            </div>
            <div className="profile-stat-divider" />
            <div className="profile-stat-item">
              <span className="profile-stat-value"><AnimatedNumber value={stat.attendanceRate} suffix="%" /></span>
              <span className="profile-stat-label">Rate</span>
            </div>
            <div className="profile-stat-divider" />
            <div className="profile-stat-item">
              <span className="profile-stat-value profile-stat-value-text">{stat.avgArrivalTime}</span>
              <span className="profile-stat-label">Avg Time</span>
            </div>
          </div>
        </div>
        );
      })}

      {hasAnyArrivalTimes && selectedMeeting && (
        <section className="profile-section profile-chart-section">
          <div className="profile-chart-head">
            <h2>Arrival Times</h2>
            {chartMeetings.length > 1 && (
              <div className="profile-chart-toggle" role="tablist" aria-label="Meeting">
                {chartMeetings.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={selectedMeeting.id === m.id}
                    className={`profile-chart-option${selectedMeeting.id === m.id ? ' profile-chart-option-active' : ''}`}
                    onClick={() => setChartMeetingId(m.id)}
                  >
                    {m.name.replace(/ Service$/, '')}
                  </button>
                ))}
              </div>
            )}
          </div>
          {chartData.length === 0 ? (
            <p className="profile-empty">No arrival times recorded for {selectedMeeting.name}.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
                  <defs>
                    <linearGradient id="arrival-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
                      <stop offset="95%" stopColor={accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} strokeOpacity={0.5} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    minTickGap={24}
                  />
                  <YAxis
                    domain={yDomain}
                    ticks={yTicks}
                    tickFormatter={minutesToClock}
                    tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                  />
                  {meetingAvg !== null && meetingAvg >= yDomain[0] && meetingAvg <= yDomain[1] && (
                    <ReferenceLine
                      y={meetingAvg}
                      stroke="var(--color-text-muted)"
                      strokeDasharray="2 4"
                      strokeOpacity={0.65}
                    />
                  )}
                  {cutoff !== null && cutoff >= yDomain[0] && cutoff <= yDomain[1] && (
                    <ReferenceLine
                      y={cutoff}
                      stroke="#16a34a"
                      strokeDasharray="5 4"
                      strokeOpacity={0.75}
                      label={{ value: `On-time · ${minutesToClock(cutoff)}`, position: 'insideTopLeft', fontSize: 10, fill: '#16a34a' }}
                    />
                  )}
                  <Tooltip content={<ArrivalTooltip />} cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }} />
                  <Area
                    type="monotone"
                    dataKey="minutes"
                    stroke={accent}
                    strokeWidth={2.5}
                    fill="url(#arrival-grad)"
                    dot={{ r: 3.5, strokeWidth: 2, stroke: accent, fill: 'var(--color-surface)' }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
              <p className="profile-chart-hint">
                Each dot is one service{cutoff !== null ? ' · green dashes = on-time' : ''}
                {meetingAvg !== null ? ` · dotted = meeting avg (${minutesToClock(meetingAvg)})` : ''}.
              </p>
            </>
          )}
        </section>
      )}

      <section className="profile-section">
        <h2>History</h2>
        {history.length === 0 ? (
          <p className="profile-empty">No attendance records found.</p>
        ) : (
          <table className="profile-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Meeting</th>
                <th>Time</th>
                <th className="col-action"></th>
              </tr>
            </thead>
            <tbody>
              {history.map(row => (
                <tr key={row.id}>
                  <td>
                    {new Date(row.date + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td>{row.meetingName}</td>
                  <td className="col-time">
                    {formatTimeET(row.marked_at)}
                  </td>
                  <td className="col-action">
                    <button className="profile-remove-btn" onClick={() => setPendingDelete({ id: row.id, meetingId: row.meeting_id })}>
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {pendingDelete && (
        <ConfirmDialog
          message="Are you sure you want to remove this attendance record?"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      </div>
    </div>
  );
}
