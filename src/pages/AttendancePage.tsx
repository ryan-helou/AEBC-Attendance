import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { usePeople } from '../hooks/usePeople';
import { useAttendance } from '../hooks/useAttendance';
import type { Meeting, Person } from '../types';
import AttendanceInput from '../components/AttendanceInput';
import AttendanceTable from '../components/AttendanceTable';
import AddPersonModal from '../components/AddPersonModal';
import Spinner from '../components/Spinner';
import { useEscapeBack } from '../hooks/useEscapeBack';
import './AttendancePage.css';

function parseDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

function formatDate(dateStr: string) {
  const d = parseDate(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Returns the required day of week (0=Sun, 6=Sat) based on meeting name, or null if unrestricted
function getMeetingDay(name: string): number | null {
  const lower = name.toLowerCase();
  if (lower.includes('sunday')) return 0;
  if (lower.includes('saturday') || lower.includes('shabibeh')) return 6;
  return null;
}

function shiftDate(dateStr: string, days: number) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export default function AttendancePage() {
  const { meetingId, date } = useParams<{ meetingId: string; date: string }>();
  const navigate = useNavigate();
  useEscapeBack();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [addModalName, setAddModalName] = useState<string | null>(null);

  const { searchPeople, addPerson, loading: peopleLoading } = usePeople();
  const {
    entries,
    markedPersonIds,
    loading: attendanceLoading,
    markAttendance,
    removeAttendance,
    pendingUndo,
    undoRemove,
    dismissUndo,
  } = useAttendance(meetingId!, date!);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', meetingId!)
        .single();

      if (data) setMeeting(data);
    }
    load();
  }, [meetingId]);

  const meetingDay = meeting ? getMeetingDay(meeting.name) : null;

  // If the current date doesn't match the meeting's required day, snap to the nearest valid one
  useEffect(() => {
    if (!meeting || meetingDay === null || !date) return;
    const d = parseDate(date);
    const currentDay = d.getDay();
    if (currentDay !== meetingDay) {
      // Snap back to the most recent valid day
      let diff = currentDay - meetingDay;
      if (diff < 0) diff += 7;
      d.setDate(d.getDate() - diff);
      navigate(`/attendance/${meetingId}/${toDateStr(d)}`, { replace: true });
    }
  }, [meeting, meetingDay, date, meetingId, navigate]);

  const handleMark = useCallback(
    async (person: Person) => {
      return markAttendance(person.id, person);
    },
    [markAttendance]
  );

  const handleAddNew = useCallback((name: string) => {
    setAddModalName(name);
  }, []);

  const handleSaveNewPerson = useCallback(
    async (name: string, phone?: string, notes?: string) => {
      const person = await addPerson(name, phone, notes);
      if (person) {
        await markAttendance(person.id, person);
      }
      setAddModalName(null);
    },
    [addPerson, markAttendance]
  );

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newDate = e.target.value;
    if (!newDate) return;
    if (meetingDay !== null) {
      const d = parseDate(newDate);
      if (d.getDay() !== meetingDay) return; // ignore invalid day selection
    }
    navigate(`/attendance/${meetingId}/${newDate}`, { replace: true });
  }

  function goWeek(direction: -1 | 1) {
    const step = meetingDay !== null ? 7 : 1;
    navigate(`/attendance/${meetingId}/${shiftDate(date!, direction * step)}`, { replace: true });
  }

  if (peopleLoading || attendanceLoading || !meeting) return <Spinner />;

  return (
    <div className="attendance-page">
      <div className="attendance-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          &larr;
        </button>
        <div className="attendance-header-info">
          <h1>{meeting.name}</h1>
          <p className="attendance-header-date">{formatDate(date!)}</p>
        </div>
        <div className="attendance-date-controls">
          <button className="date-nav-btn" onClick={() => goWeek(-1)}>&lsaquo;</button>
          <input
            type="date"
            className="attendance-date-picker"
            value={date}
            onChange={handleDateChange}
          />
          <button className="date-nav-btn" onClick={() => goWeek(1)}>&rsaquo;</button>
        </div>
      </div>

      <div className="attendance-body">
        <AttendanceInput
          searchPeople={searchPeople}
          markedPersonIds={markedPersonIds}
          onMark={handleMark}
          onAddNew={handleAddNew}
        />

        <div className="attendance-count">{entries.length} present</div>

        <AttendanceTable entries={entries} onRemove={removeAttendance} />
      </div>

      {addModalName !== null && (
        <AddPersonModal
          initialName={addModalName}
          onSave={handleSaveNewPerson}
          onCancel={() => setAddModalName(null)}
        />
      )}

      {pendingUndo && (
        <div className="undo-toast">
          <span>Removed <strong>{pendingUndo.person.full_name}</strong></span>
          <button className="undo-btn" onClick={undoRemove}>Undo</button>
          <button className="undo-dismiss" onClick={dismissUndo}>&times;</button>
        </div>
      )}
    </div>
  );
}
