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

const LINE_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

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

  useEffect(() => {
    async function load() {
      const today = getTodayDate();
      const weekStart = shiftDate(today, -12 * 7);

      const [meetingsRes, dashRecordsRes] = await Promise.all([
        supabase.from('meetings').select('*').order('display_order'),
        supabase
          .from('attendance_records')
          .select('meeting_id, date, person_id, person:people(full_name)')
          .gte('date', weekStart),
      ]);

      const data = meetingsRes.data;
      const dashRecords = (dashRecordsRes.data ?? []) as Array<Record<string, unknown>>;

      if (data) {
        setMeetings(data);
        if (data.length > 0) {
          setDateMeetingId(data[0].id);
          setAllTimeMeetingId(data[0].id);
          const day = getMeetingDay(data[0].name);
          setSelectedDate(snapToValidDate(today, day));
        }

        // Build chart data
        const dateMeetingCounts = new Map<string, Map<string, number>>();
        for (const r of dashRecords) {
          const d = r.date as string;
          const mid = r.meeting_id as string;
          if (!dateMeetingCounts.has(d)) dateMeetingCounts.set(d, new Map());
          const mc = dateMeetingCounts.get(d)!;
          mc.set(mid, (mc.get(mid) || 0) + 1);
        }

        const allDates = Array.from(dateMeetingCounts.keys()).sort();
        const points: WeekPoint[] = allDates.map(dateStr => {
          const d = parseDate(dateStr);
          const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const point: WeekPoint = { date: dateStr, label };
          const mc = dateMeetingCounts.get(dateStr)!;
          for (const meeting of data) {
            point[meeting.name] = mc.get(meeting.id) || 0;
          }
          return point;
        });
        setChartData(points);

        // Build top attendees
        const personCounts = new Map<string, { name: string; count: number }>();
        for (const r of dashRecords) {
          const pid = r.person_id as string;
          const name = ((r.person as Record<string, unknown>)?.full_name as string) || 'Unknown';
          const existing = personCounts.get(pid);
          if (existing) {
            existing.count++;
          } else {
            personCounts.set(pid, { name, count: 1 });
          }
        }

        const sorted = Array.from(personCounts.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 15)
          .map(([pid, r]) => ({ person_id: pid, person_name: r.name, count: r.count }));

        setTopAttendees(sorted);
        setMaxCount(sorted[0]?.count || 1);

        // Build comparison data (total per meeting)
        const meetingTotals = new Map<string, number>();
        for (const r of dashRecords) {
          const mid = r.meeting_id as string;
          meetingTotals.set(mid, (meetingTotals.get(mid) || 0) + 1);
        }
        const comparePoints: ComparePoint[] = data.map(m => ({
          label: m.name,
          Attendance: meetingTotals.get(m.id) || 0,
        }));
        setCompareData(comparePoints);
      }
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

      {/* Attendance Over Time — full width */}
      <section className="history-section">
        <h2>Attendance Over Time <span className="dashboard-subtitle">(last 12 weeks)</span></h2>
        {chartData.length === 0 ? (
          <p className="history-empty">No attendance data in the last 12 weeks.</p>
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
          <h2>Ministry Comparison <span className="dashboard-subtitle">(last 12 weeks)</span></h2>
          {compareData.length === 0 ? (
            <p className="history-empty">No attendance data yet.</p>
          ) : (
            <div className="dashboard-chart-wrapper">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={compareData} margin={{ top: 5, right: 20, bottom: 5, left: -10 }} barGap={8}>
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
                  <Bar dataKey="Attendance" radius={[6, 6, 0, 0]} maxBarSize={80}>
                    {compareData.map((_entry, i) => (
                      <Cell key={i} fill={LINE_COLORS[i % LINE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Top Attendees */}
        <section className="history-section leaderboard-section">
          <h2>Top Attendees <span className="dashboard-subtitle">(last 12 weeks)</span></h2>
          {topAttendees.length === 0 ? (
            <p className="history-empty">No attendance data yet.</p>
          ) : (
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
  );
}
