import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getMeetingDay } from '../lib/dateUtils';
import type { Person, Meeting } from '../types';
import Spinner from '../components/Spinner';
import ConfirmDialog from '../components/ConfirmDialog';
import { useEscapeBack } from '../hooks/useEscapeBack';
import './PersonProfilePage.css';

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

function countOccurrencesSince(earliest: string, meetingDay: number | null): number {
  if (meetingDay === null) return 0;
  const start = new Date(earliest + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let count = 0;
  const d = new Date(start);
  // Snap to the first matching day on or after start
  while (d.getDay() !== meetingDay) {
    d.setDate(d.getDate() + 1);
  }
  while (d <= today) {
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
          .order('date', { ascending: true })
          .limit(1),
      ]);

      const personData = personRes.data as Person | null;
      const meetings = (meetingsRes.data ?? []) as Meeting[];
      const records = (recordsRes.data ?? []) as AttendanceRow[];
      const earliestDate = (earliestRes.data?.[0] as { date: string } | undefined)?.date;

      setPerson(personData);
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

        let attendanceRate = 0;
        if (earliestDate) {
          const totalOccurrences = countOccurrencesSince(earliestDate, day);
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

  const isRyan = person?.full_name === 'Ryan Helou';

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
    <div className={`profile-page ${isRyan ? 'profile-themed' : ''}`}>
      <div className="profile-header">
        <button className="back-btn" onClick={() => navigate(-1)}>&larr;</button>
        <h1>
          {isRyan && <span className="profile-crown">👑</span>}
          {person.full_name}
        </h1>
      </div>

      <div className="profile-body">
      <div className="profile-total-card">
        <span className="profile-total-number">{totalAttendances}</span>
        <span className="profile-total-label">Total Attendances</span>
      </div>

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
