import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getMeetingDay } from '../lib/dateUtils';
import type { Person, Meeting } from '../types';
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
  const scrolled = useScrolledDown();
  const [loading, setLoading] = useState(true);
  const [person, setPerson] = useState<Person | null>(null);
  const [meetingStats, setMeetingStats] = useState<MeetingStat[]>([]);
  const [totalAttendances, setTotalAttendances] = useState(0);
  const [history, setHistory] = useState<HistoryRow[]>([]);
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
      const [personRes, meetingsRes, recordsRes] = await Promise.all([
        supabase.from('people').select('*').eq('id', personId).single(),
        supabase.from('meetings').select('*').order('display_order'),
        supabase
          .from('attendance_records')
          .select('id, meeting_id, date, marked_at')
          .eq('person_id', personId)
          .order('date', { ascending: false }),
      ]);

      const personData = personRes.data as Person | null;
      const meetings = (meetingsRes.data ?? []) as Meeting[];
      const records = (recordsRes.data ?? []) as AttendanceRow[];

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
        const latestMeetingDate = [...dates].sort().at(-1)!;

        let attendanceRate = 0;
        {
          const APP_START_DATE = '2026-03-14';
          const totalOccurrences = countOccurrencesSince(APP_START_DATE, day, latestMeetingDate);
          if (totalOccurrences > 0) {
            attendanceRate = Math.round((timesAttended / totalOccurrences) * 100);
          }
        }

        // Compute average arrival time (time-of-day only)
        const times = meetingRecords.map(r => {
          const d = new Date(r.marked_at);
          return d.getHours() * 60 + d.getMinutes();
        });
        const avgMinutes = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        const avgH = Math.floor(avgMinutes / 60);
        const avgM = avgMinutes % 60;
        const period = avgH >= 12 ? 'PM' : 'AM';
        const displayH = avgH % 12 || 12;
        const avgArrivalTime = `${displayH}:${avgM.toString().padStart(2, '0')} ${period}`;

        stats.push({ meeting, timesAttended, longestStreak, currentStreak, attendanceRate, avgArrivalTime });
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
                <span className="profile-shabibeh-leader" title="Shabibeh Leader">LEADER</span>
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
      </div>

      <textarea
        className="profile-notes-input"
        placeholder="Notes…"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        onBlur={saveNotes}
        rows={2}
      />

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
                    {new Date(row.marked_at).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
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
