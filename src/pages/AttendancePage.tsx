import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { usePeople } from '../hooks/usePeople';
import { useAttendance } from '../hooks/useAttendance';
import { useGuestAttendance } from '../hooks/useGuestAttendance';
import { useMusicianRoles } from '../hooks/useMusicianRoles';
import { parseDate, toDateStr, formatDate, getMeetingDay, shiftDate, getTodayDate, snapToValidDate } from '../lib/dateUtils';
import type { Meeting, Person, DisplayEntry } from '../types';
import AttendanceInput from '../components/AttendanceInput';
import { AttendanceSkeleton } from '../components/Skeleton';
import AnimatedNumber from '../components/AnimatedNumber';
import AttendanceTable from '../components/AttendanceTable';
import AddPersonModal from '../components/AddPersonModal';
import { useEscapeBack } from '../hooks/useEscapeBack';

import Confetti from '../components/Confetti';
import './AttendancePage.css';

export default function AttendancePage() {
  const { meetingId, date } = useParams<{ meetingId: string; date: string }>();
  const navigate = useNavigate();
  useEscapeBack();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [addModalName, setAddModalName] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [takenBy, setTakenBy] = useState('');
  const [manualCount, setManualCount] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [milestone, setMilestone] = useState<{ count: number } | null>(null);

  const { people, searchPeople, addPerson, isDuplicate, loading: peopleLoading } = usePeople();
  const {
    entries,
    markedPersonIds,
    loading: attendanceLoading,
    markAttendance,
    removeAttendance,
    updateMarkedAt,
    toggleFirstTime,
    pendingUndo,
    undoRemove,
    dismissUndo,
  } = useAttendance(meetingId!, date!);

  const {
    guests,
    loading: guestsLoading,
    addGuest,
    removeGuest,
    updateGuestMarkedAt,
    toggleGuestFirstTime,
  } = useGuestAttendance(meetingId!, date!);

  const { getRole, setRole, removeRole } = useMusicianRoles(meetingId!, date!);

  // Merge person entries and guest entries into a single sorted list
  const displayEntries: DisplayEntry[] = useMemo(() => {
    const personEntries: DisplayEntry[] = entries.map(e => ({ type: 'person', entry: e }));
    const guestEntries: DisplayEntry[] = guests.map(g => ({ type: 'guest', entry: g }));
    const merged = [...personEntries, ...guestEntries];
    merged.sort((a, b) => new Date(b.entry.marked_at).getTime() - new Date(a.entry.marked_at).getTime());
    return merged;
  }, [entries, guests]);

  const filteredEntries = useMemo(() => {
    if (!filterQuery.trim()) return displayEntries;
    const q = filterQuery.toLowerCase();
    const filtered = displayEntries.filter(item => {
      if (item.type === 'guest') {
        return `guest ${item.entry.guest_number}`.includes(q);
      }
      return item.entry.person.full_name.toLowerCase().includes(q);
    });
    // If nothing matches, show the full list (avoids blanking on easter eggs etc.)
    return filtered.length > 0 ? filtered : displayEntries;
  }, [displayEntries, filterQuery]);

  const totalCount = entries.length + guests.length;
  const firstTimerCount = useMemo(() =>
    displayEntries.filter(e => e.entry.first_time).length,
    [displayEntries]
  );

  const onTimePercent = useMemo(() => {
    if (!meeting) return null;
    const lower = meeting.name.toLowerCase();
    let cutoffMinutes: number | null = null;
    if (lower.includes('english') || lower.includes('sunday')) cutoffMinutes = 10 * 60 + 30; // 10:30 AM
    else if (lower.includes('saturday') || lower.includes('shabibeh')) cutoffMinutes = 19 * 60 + 30; // 7:30 PM
    if (cutoffMinutes === null || totalCount === 0) return null;

    const onTimeEntries = entries.filter(e => {
      const d = new Date(e.marked_at);
      return d.getHours() * 60 + d.getMinutes() <= cutoffMinutes!;
    });
    const onTimeGuests = guests.filter(g => {
      const d = new Date(g.marked_at);
      return d.getHours() * 60 + d.getMinutes() <= cutoffMinutes!;
    });
    return Math.round(((onTimeEntries.length + onTimeGuests.length) / totalCount) * 100);
  }, [meeting, entries, guests, totalCount]);

  const milestoneRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MILESTONES = [25, 50, 75, 100];

  const checkMilestone = useCallback((newCount: number) => {
    const crossed = MILESTONES.find(m => m === newCount);
    if (crossed) {
      if (milestoneRef.current) clearTimeout(milestoneRef.current);
      setMilestone({ count: crossed });
      milestoneRef.current = setTimeout(() => setMilestone(null), 5000);
    }
  }, []);

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

  useEffect(() => {
    async function loadNote() {
      setNote('');
      setTakenBy('');
      setManualCount('');
      const { data } = await supabase
        .from('meeting_notes')
        .select('note, taken_by, manual_count')
        .eq('meeting_id', meetingId!)
        .eq('date', date!)
        .maybeSingle();
      setNote(data?.note ?? '');
      setTakenBy(data?.taken_by ?? '');
      setManualCount(data?.manual_count ? String(data.manual_count) : '');
    }
    loadNote();
  }, [meetingId, date]);

  async function saveNoteFields() {
    const trimmedNote = note.trim();
    const trimmedTakenBy = takenBy.trim();
    const parsedManualCount = manualCount.trim() ? parseInt(manualCount.trim(), 10) : null;

    if (!trimmedNote && !trimmedTakenBy && !parsedManualCount) {
      await supabase.from('meeting_notes').delete().eq('meeting_id', meetingId!).eq('date', date!);
    } else {
      await supabase.from('meeting_notes').upsert(
        { meeting_id: meetingId, date, note: trimmedNote || '', taken_by: trimmedTakenBy || null, manual_count: parsedManualCount },
        { onConflict: 'meeting_id,date' }
      );
    }
  }

  const meetingDay = meeting ? getMeetingDay(meeting.name) : null;

  useEffect(() => {
    if (!meeting || meetingDay === null || !date) return;
    const d = parseDate(date);
    const currentDay = d.getDay();
    if (currentDay !== meetingDay) {
      let diff = currentDay - meetingDay;
      if (diff < 0) diff += 7;
      d.setDate(d.getDate() - diff);
      navigate(`/attendance/${meetingId}/${toDateStr(d)}`, { replace: true });
    }
  }, [meeting, meetingDay, date, meetingId, navigate]);

  const handleMark = useCallback(
    async (person: Person) => {
      const success = await markAttendance(person.id, person);
      if (success) checkMilestone(totalCount + 1);
      return success;
    },
    [markAttendance, checkMilestone, totalCount]
  );

  const handleAddNew = useCallback((name: string) => {
    setAddModalName(name);
  }, []);

  const handleSaveNewPerson = useCallback(
    async (name: string, notes?: string) => {
      const person = await addPerson(name, notes);
      if (person) {
        const success = await markAttendance(person.id, person);
        if (success) checkMilestone(totalCount + 1);
      }
      setAddModalName(null);
    },
    [addPerson, markAttendance, checkMilestone, totalCount]
  );

  const handleRemove = useCallback(
    (id: string, isGuest: boolean) => {
      if (isGuest) {
        removeGuest(id);
      } else {
        removeAttendance(id);
      }
    },
    [removeAttendance, removeGuest]
  );

  const handleToggleFirstTime = useCallback(
    (id: string, isGuest: boolean) => {
      if (isGuest) {
        toggleGuestFirstTime(id);
      } else {
        toggleFirstTime(id);
      }
    },
    [toggleFirstTime, toggleGuestFirstTime]
  );

  const handleConvertGuest = useCallback(
    async (guestId: string, guestEntry: any, name: string) => {
      // Try to find existing person first, otherwise create new
      let person: Person | null | undefined = people.find(
        p => p.full_name.toLowerCase() === name.trim().toLowerCase()
      );
      if (!person) {
        person = await addPerson(name);
      }
      if (!person) return;

      // Mark the person with the guest's marked_at time and first_time status
      await markAttendance(person.id, person, guestEntry.marked_at, guestEntry.first_time);

      // Remove the guest
      await removeGuest(guestId);
    },
    [people, addPerson, markAttendance, removeGuest]
  );

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newDate = e.target.value;
    if (!newDate) return;
    if (meetingDay !== null) {
      const d = parseDate(newDate);
      if (d.getDay() !== meetingDay) return;
    }
    navigate(`/attendance/${meetingId}/${newDate}`, { replace: true });
  }

  function goWeek(direction: -1 | 1) {
    const step = meetingDay !== null ? 7 : 1;
    navigate(`/attendance/${meetingId}/${shiftDate(date!, direction * step)}`, { replace: true });
  }

  const todayDate = snapToValidDate(getTodayDate(), meetingDay);
  const isToday = date === todayDate;

  function goToday() {
    navigate(`/attendance/${meetingId}/${todayDate}`, { replace: true });
  }

  if (peopleLoading || attendanceLoading || guestsLoading || !meeting) return <AttendanceSkeleton />;

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
          {!isToday && (
            <button className="today-btn" onClick={goToday}>Today</button>
          )}
          <button className="date-nav-btn" onClick={() => goWeek(1)}>&rsaquo;</button>
        </div>
      </div>

      <div className="attendance-body">
        <div className="attendance-input-row">
          <AttendanceInput
            searchPeople={searchPeople}
            markedPersonIds={markedPersonIds}
            onMark={handleMark}
            onAddNew={handleAddNew}
            onQueryChange={setFilterQuery}
          />
          <button className="add-guest-btn" onClick={() => { addGuest(); checkMilestone(totalCount + 1); }} title="Add guest">
            + Guest
          </button>
        </div>

        <div className="attendance-count">
          <AnimatedNumber value={totalCount} /> present
          {firstTimerCount > 0 && (
            <span className="first-timer-count"> · <AnimatedNumber value={firstTimerCount} /> new</span>
          )}
          {onTimePercent !== null && (
            <span className="on-time-count"> · <AnimatedNumber value={onTimePercent} suffix="%" /> on time</span>
          )}
        </div>

        <AttendanceTable
          entries={filteredEntries}
          meetingName={meeting?.name}
          onRemove={handleRemove}
          onUpdateTime={updateMarkedAt}
          onUpdateGuestTime={updateGuestMarkedAt}
          onToggleFirstTime={handleToggleFirstTime}
          onConvertGuest={handleConvertGuest}
          searchPeople={searchPeople}
          markedPersonIds={markedPersonIds}
          getMusicianRole={getRole}
          onSetMusicianRole={setRole}
          onRemoveMusicianRole={removeRole}
        />

        <div className="attendance-footer-fields">
          <input
            className="manual-count-input"
            type="number"
            placeholder="Manual count…"
            value={manualCount}
            onChange={e => setManualCount(e.target.value)}
            onBlur={saveNoteFields}
            min="0"
          />
          <textarea
            className="service-notes-input"
            placeholder="Service notes…"
            value={note}
            onChange={e => setNote(e.target.value)}
            onBlur={saveNoteFields}
            rows={2}
          />
        </div>
      </div>

      {addModalName !== null && (
        <AddPersonModal
          initialName={addModalName}
          onSave={handleSaveNewPerson}
          onCancel={() => setAddModalName(null)}
          isDuplicate={isDuplicate}
        />
      )}

      {pendingUndo && (
        <div className="undo-toast">
          <span>Removed <strong>{pendingUndo.person.full_name}</strong></span>
          <button className="undo-btn" onClick={undoRemove}>Undo</button>
          <button className="undo-dismiss" onClick={dismissUndo}>&times;</button>
        </div>
      )}

      {milestone && (
        <Confetti
          key={milestone.count}
          count={milestone.count}
        />
      )}
    </div>
  );
}
