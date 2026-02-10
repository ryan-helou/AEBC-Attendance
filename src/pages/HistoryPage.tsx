import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Meeting } from '../types';
import Spinner from '../components/Spinner';
import './HistoryPage.css';

interface DateRow {
  person_name: string;
  marked_at: string;
}

interface AllTimeRow {
  person_name: string;
  count: number;
}

function getMeetingDay(name: string): number | null {
  const lower = name.toLowerCase();
  if (lower.includes('sunday')) return 0;
  if (lower.includes('saturday') || lower.includes('shabibeh')) return 6;
  return null;
}

function parseDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

// Get the nearest valid date (most recent matching day) for a meeting
function snapToValidDate(dateStr: string, meetingDay: number | null): string {
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

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('meetings')
        .select('*')
        .order('display_order');

      if (data) {
        setMeetings(data);
        if (data.length > 0) {
          setDateMeetingId(data[0].id);
          setAllTimeMeetingId(data[0].id);
          // Snap initial date to valid day for first meeting
          const day = getMeetingDay(data[0].name);
          setSelectedDate(snapToValidDate(getTodayDate(), day));
        }
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
      .select('marked_at, person:people(full_name)')
      .eq('meeting_id', dateMeetingId)
      .eq('date', selectedDate)
      .order('marked_at', { ascending: true });

    if (data) {
      setDateResults(
        data.map((r: Record<string, unknown>) => ({
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

      const rows = Array.from(countMap.values())
        .sort((a, b) => b.count - a.count)
        .map(r => ({ person_name: r.name, count: r.count }));

      setAllTimeResults(rows);
    }

    setAllTimeLoading(false);
  }

  if (loading) return <Spinner />;

  return (
    <div className="history-page">
      <div className="history-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          &larr;
        </button>
        <h1>Attendance History</h1>
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
                </tr>
              </thead>
              <tbody>
                {dateResults.map((row, i) => (
                  <tr key={i}>
                    <td className="col-num">{i + 1}</td>
                    <td>{row.person_name}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="history-total">
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
                  <tr key={i}>
                    <td className="col-num">{i + 1}</td>
                    <td>{row.person_name}</td>
                    <td className="col-count">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </section>
    </div>
  );
}
