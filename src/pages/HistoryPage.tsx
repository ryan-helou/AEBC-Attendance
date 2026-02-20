import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getMeetingDay, parseDate, snapToValidDate, getTodayDate, shiftDate } from '../lib/dateUtils';
import type { Meeting } from '../types';
import Spinner from '../components/Spinner';
import ConfirmDialog from '../components/ConfirmDialog';
import { useEscapeBack } from '../hooks/useEscapeBack';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
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

type Timeframe = '4w' | '12w' | '6m' | '1y' | 'all';

interface StreakLeader {
  person_id: string;
  person_name: string;
  meeting_name: string;
  streak: number;
}

function computeLongestStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const sorted = [...dates].sort();
  let longest = 1, current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00');
    const curr = new Date(sorted[i] + 'T00:00:00');
    const diff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 7) { current++; if (current > longest) longest = current; }
    else current = 1;
  }
  return longest;
}

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
  const [compareTimeframe, setCompareTimeframe] = useState<Timeframe>('12w');
  const [topTimeframe, setTopTimeframe] = useState<Timeframe>('12w');
  const [chartLoading, setChartLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [topLoading, setTopLoading] = useState(false);
  const [streakLeaders, setStreakLeaders] = useState<StreakLeader[]>([]);
  const [streakLoading, setStreakLoading] = useState(true);

  function timeframeCutoff(tf: Timeframe): string | null {
    if (tf === 'all') return null;
    const daysMap = { '4w': 28, '12w': 84, '6m': 182, '1y': 365 } as const;
    return shiftDate(getTodayDate(), -daysMap[tf]);
  }

  async function loadChartData(tf: Timeframe, meetingsList: Meeting[]) {
    setChartLoading(true);
    let query = supabase.from('attendance_records').select('meeting_id, date');
    const cutoff = timeframeCutoff(tf);
    if (cutoff) query = query.gte('date', cutoff);
    const { data } = await query;
    if (data) {
      const records = data as Array<{ meeting_id: string; date: string }>;
      function weekOf(dateStr: string): string {
        const d = new Date(dateStr + 'T00:00:00');
        const daysBack = d.getDay() === 0 ? 6 : d.getDay() - 1;
        d.setDate(d.getDate() - daysBack);
        return d.toISOString().slice(0, 10);
      }
      const weekCounts = new Map<string, Map<string, number>>();
      for (const r of records) {
        const week = weekOf(r.date);
        if (!weekCounts.has(week)) weekCounts.set(week, new Map());
        const mc = weekCounts.get(week)!;
        mc.set(r.meeting_id, (mc.get(r.meeting_id) || 0) + 1);
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
        return point;
      });
      setChartData(points);
    }
    setChartLoading(false);
  }

  async function loadCompareData(tf: Timeframe, meetingsList: Meeting[]) {
    setCompareLoading(true);
    let query = supabase.from('attendance_records').select('meeting_id');
    const cutoff = timeframeCutoff(tf);
    if (cutoff) query = query.gte('date', cutoff);
    const { data } = await query;
    if (data) {
      const records = data as Array<{ meeting_id: string }>;
      const totals = new Map<string, number>();
      for (const r of records) totals.set(r.meeting_id, (totals.get(r.meeting_id) || 0) + 1);
      setCompareData(meetingsList.map(m => ({ label: m.name, Attendance: totals.get(m.id) || 0 })));
    }
    setCompareLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (meetings.length > 0) loadChartData(chartTimeframe, meetings); }, [chartTimeframe]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (meetings.length > 0) loadCompareData(compareTimeframe, meetings); }, [compareTimeframe]);

  async function loadStreakLeaders() {
    setStreakLoading(true);
    const { data } = await supabase
      .from('attendance_records')
      .select('person_id, meeting_id, date, person:people(full_name), meeting:meetings(name)');
    if (data) {
      const groups = new Map<string, { person_id: string; person_name: string; meeting_name: string; dates: string[] }>();
      for (const r of data as Array<Record<string, unknown>>) {
        const key = `${r.person_id}|${r.meeting_id}`;
        const personName = ((r.person as Record<string, unknown>)?.full_name as string) || 'Unknown';
        const meetingName = ((r.meeting as Record<string, unknown>)?.name as string) || 'Unknown';
        if (!groups.has(key)) groups.set(key, { person_id: r.person_id as string, person_name: personName, meeting_name: meetingName, dates: [] });
        groups.get(key)!.dates.push(r.date as string);
      }
      const leaders: StreakLeader[] = [];
      for (const g of groups.values()) {
        const streak = computeLongestStreak(g.dates);
        if (streak >= 2) leaders.push({ person_id: g.person_id, person_name: g.person_name, meeting_name: g.meeting_name, streak });
      }
      leaders.sort((a, b) => b.streak - a.streak);
      setStreakLeaders(leaders.slice(0, 15));
    }
    setStreakLoading(false);
  }

  async function loadTopAttendees(timeframe: Timeframe) {
    setTopLoading(true);
    const today = getTodayDate();
    let query = supabase
      .from('attendance_records')
      .select('person_id, person:people(full_name)');
    if (timeframe !== 'all') {
      const daysMap = { '4w': 28, '12w': 84, '6m': 182, '1y': 365 } as const;
      query = query.gte('date', shiftDate(today, -daysMap[timeframe]));
    }
    const { data } = await query;
    if (data) {
      const personCounts = new Map<string, { name: string; count: number }>();
      for (const r of data as Array<Record<string, unknown>>) {
        const pid = r.person_id as string;
        const name = ((r.person as Record<string, unknown>)?.full_name as string) || 'Unknown';
        const existing = personCounts.get(pid);
        if (existing) { existing.count++; } else { personCounts.set(pid, { name, count: 1 }); }
      }
      const sorted = Array.from(personCounts.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 15)
        .map(([pid, r]) => ({ person_id: pid, person_name: r.name, count: r.count }));
      setTopAttendees(sorted);
      setMaxCount(sorted[0]?.count || 1);
    }
    setTopLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadTopAttendees(topTimeframe); }, [topTimeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function load() {
      const today = getTodayDate();

      const meetingsRes = await supabase.from('meetings').select('*').order('display_order');

      const data = meetingsRes.data;

      if (data) {
        setMeetings(data);
        if (data.length > 0) {
          setDateMeetingId(data[0].id);
          setAllTimeMeetingId(data[0].id);
          const day = getMeetingDay(data[0].name);
          setSelectedDate(snapToValidDate(today, day));
        }

        loadChartData(chartTimeframe, data);
        loadCompareData(compareTimeframe, data);
      }
      loadStreakLeaders();
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

    const { data } = await supabase
      .from('attendance_records')
      .select('person_id, person:people(full_name)')
      .eq('meeting_id', allTimeMeetingId);

    if (data) {
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
    const { data } = await supabase
      .from('attendance_records')
      .select('date, marked_at, person:people(full_name), meeting:meetings(name)')
      .order('date', { ascending: false });

    if (data && data.length > 0) {
      const rows = data as Array<Record<string, unknown>>;
      const csvLines = ['Date,Meeting,Name,Time'];
      for (const r of rows) {
        const date = r.date as string;
        const meetingName = ((r.meeting as Record<string, unknown>)?.name as string) || '';
        const personName = ((r.person as Record<string, unknown>)?.full_name as string) || '';
        const time = r.marked_at as string;
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

  if (loading) return <Spinner />;

  return (
    <div className="history-page">
      <div className="history-header">
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
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border)' }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
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
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '0.5rem' }} />
                {meetings.map((m, i) => (
                  <Area
                    key={m.id}
                    type="monotone"
                    dataKey={m.name}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={2.5}
                    fill={`url(#grad-${i})`}
                    dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                ))}
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
                  <Bar dataKey="Attendance" radius={[8, 8, 3, 3]} maxBarSize={68}>
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
                {topAttendees.map((person, i) => (
                  <tr
                    key={person.person_id}
                    className={`lb-row ${i < 3 ? `lb-top-${i + 1}` : ''}`}
                    onClick={() => navigate(`/person/${person.person_id}`)}
                  >
                    <td className="lb-col-rank">
                      {i < 3 ? (
                        <span className={`lb-medal lb-medal-${i + 1}`}>{i + 1}</span>
                      ) : (
                        <span className="lb-rank-num">{i + 1}</span>
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
                    <td className="lb-col-count">{person.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </section>

        {/* Streak Leaderboard */}
        <section className="history-section leaderboard-section streak-lb-section">
          <h2>🔥 Best Streaks</h2>
          {streakLoading ? (
            <p className="history-empty">Loading...</p>
          ) : streakLeaders.length === 0 ? (
            <p className="history-empty">Not enough data yet.</p>
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
                  {streakLeaders.map((leader, i) => (
                    <tr
                      key={leader.person_id + leader.meeting_name}
                      className={`lb-row ${i < 3 ? `lb-top-${i + 1}` : ''}`}
                      onClick={() => navigate(`/person/${leader.person_id}`)}
                    >
                      <td className="lb-col-rank">
                        {i < 3 ? (
                          <span className={`lb-medal lb-medal-${i + 1}`}>{i + 1}</span>
                        ) : (
                          <span className="lb-rank-num">{i + 1}</span>
                        )}
                      </td>
                      <td className="lb-col-name">
                        <span className="person-link">{leader.person_name}</span>
                      </td>
                      <td className="streak-lb-meeting">{leader.meeting_name}</td>
                      <td className="lb-col-count">🔥 {leader.streak}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

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
                  {allTimeResults.map((row, i) => (
                    <>
                      <tr
                        key={row.person_id}
                        className={`alltime-row ${expandedPersonId === row.person_id ? 'alltime-row-active' : ''}`}
                        onClick={() => togglePersonRecords(row.person_id)}
                      >
                        <td className="col-num">{i + 1}</td>
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
                  ))}
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
