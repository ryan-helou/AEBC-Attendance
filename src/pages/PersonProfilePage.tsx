import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getMeetingDay } from '../lib/dateUtils';
import type { Person, Meeting } from '../types';
import Spinner from '../components/Spinner';
import ConfirmDialog from '../components/ConfirmDialog';
import { useEscapeBack } from '../hooks/useEscapeBack';
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
}

interface MeetingStat {
  meeting: Meeting;
  timesAttended: number;
  longestStreak: number;
  currentStreak: number;
  attendanceRate: number;
}

interface HistoryRow {
  id: string;
  meeting_id: string;
  date: string;
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

function countOccurrencesSince(earliest: string, meetingDay: number | null, latest: string): number {
  if (meetingDay === null) return 0;
  const start = new Date(earliest + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Use whichever is later: today or the latest attendance date (handles future-dated records)
  const latestDate = new Date(latest + 'T00:00:00');
  const end = latestDate > today ? latestDate : today;
  let count = 0;
  const d = new Date(start);
  // Snap to the first matching day on or after start
  while (d.getDay() !== meetingDay) {
    d.setDate(d.getDate() + 1);
  }
  while (d <= end) {
    count++;
    d.setDate(d.getDate() + 7);
  }
  return count;
}

export default function PersonProfilePage() {
  const { personId } = useParams<{ personId: string }>();
  const navigate = useNavigate();
  useEscapeBack();
  const [loading, setLoading] = useState(true);
  const [person, setPerson] = useState<Person | null>(null);
  const [meetingStats, setMeetingStats] = useState<MeetingStat[]>([]);
  const [totalAttendances, setTotalAttendances] = useState(0);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; meetingId: string } | null>(null);
  const [notes, setNotes] = useState('');
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [customColor, setCustomColor] = useState<string>(
    () => localStorage.getItem('ryan-custom-hex') ?? '#7c3aed'
  );

  useEffect(() => {
    if (!personId) return;

    async function load() {
      const [personRes, meetingsRes, recordsRes, earliestRes] = await Promise.all([
        supabase.from('people').select('*').eq('id', personId).single(),
        supabase.from('meetings').select('*').order('display_order'),
        supabase
          .from('attendance_records')
          .select('id, meeting_id, date')
          .eq('person_id', personId)
          .order('date', { ascending: false }),
        supabase
          .from('attendance_records')
          .select('date')
          .eq('person_id', personId)
          .order('date', { ascending: true })
          .limit(1),
      ]);

      const personData = personRes.data as Person | null;
      const meetings = (meetingsRes.data ?? []) as Meeting[];
      const records = (recordsRes.data ?? []) as AttendanceRow[];
      const earliestDate = (earliestRes.data?.[0] as { date: string } | undefined)?.date;

      setPerson(personData);
      setNotes(personData?.notes ?? '');
      setTotalAttendances(records.length);

      // Build meeting map for names
      const meetingMap = new Map(meetings.map(m => [m.id, m]));

      // Build history rows
      setHistory(
        records.map(r => ({
          id: r.id,
          meeting_id: r.meeting_id,
          date: r.date,
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
        const latestMeetingDate = [...dates].sort().at(-1)!;

        let attendanceRate = 0;
        if (earliestDate) {
          const totalOccurrences = countOccurrencesSince(earliestDate, day, latestMeetingDate);
          if (totalOccurrences > 0) {
            attendanceRate = Math.round((timesAttended / totalOccurrences) * 100);
          }
        }

        stats.push({ meeting, timesAttended, longestStreak, currentStreak, attendanceRate });
      }
      setMeetingStats(stats);
      setLoading(false);
    }

    load();
  }, [personId]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { id, meetingId } = pendingDelete;
    setPendingDelete(null);

    setHistory(prev => prev.filter(r => r.id !== id));
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

  const isRyan = person?.full_name === 'Ryan Helou';

  function handleColorChange(hex: string) {
    setCustomColor(hex);
    localStorage.setItem('ryan-custom-hex', hex);
  }


  if (loading) return <Spinner />;
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
      className={`profile-page ${isRyan ? 'profile-themed' : ''}`}
      style={isRyan ? {
        '--ryan-accent':       customColor,
        '--ryan-accent-hover': hexDarken(customColor),
        '--ryan-accent-dark':  hexDarken(customColor, 0.55),
        '--ryan-accent-light': hexLighten(customColor, 0.4),
      } as React.CSSProperties : undefined}
    >
      <div className="profile-header">
        <button className="back-btn" onClick={() => navigate(-1)}>&larr;</button>
        <h1>
          {isRyan && <span className="profile-crown">👑</span>}
          {person.full_name}
        </h1>
        {isRyan && (
          <div className="ryan-color-picker">
            <button
              className="ryan-color-btn"
              style={{ background: customColor }}
              onClick={() => colorInputRef.current?.click()}
              title="Pick accent colour"
            >
              🎨
            </button>
            <input
              ref={colorInputRef}
              type="color"
              value={customColor}
              onChange={e => handleColorChange(e.target.value)}
              style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
            />
          </div>
        )}
      </div>

      <div className="profile-body">
      <div className="profile-total-card">
        <span className="profile-total-number">{totalAttendances}</span>
        <span className="profile-total-label">Total Attendances</span>
      </div>

      <textarea
        className="profile-notes-input"
        placeholder="Notes…"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        onBlur={saveNotes}
        rows={2}
      />

      {meetingStats.map(stat => (
        <div className="profile-meeting-card" key={stat.meeting.id}>
          <span className="profile-meeting-name">{stat.meeting.name}</span>
          <div className="profile-stat-row">
            <div className="profile-stat-item">
              <span className="profile-stat-value">{stat.timesAttended}</span>
              <span className="profile-stat-label">Attended</span>
            </div>
            <div className="profile-stat-divider" />
            <div className="profile-stat-item">
              <span className="profile-stat-value">{stat.longestStreak}</span>
              <span className="profile-stat-label">Best Streak</span>
            </div>
            <div className="profile-stat-divider" />
            <div className="profile-stat-item">
              <span className={`profile-stat-value${stat.currentStreak >= 2 ? ' profile-streak-active' : ''}`}>{stat.currentStreak}</span>
              <span className="profile-stat-label">Current</span>
            </div>
            <div className="profile-stat-divider" />
            <div className="profile-stat-item">
              <span className="profile-stat-value">{stat.attendanceRate}%</span>
              <span className="profile-stat-label">Rate</span>
            </div>
          </div>
        </div>
      ))}

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
