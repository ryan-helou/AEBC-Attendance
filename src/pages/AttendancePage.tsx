import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { usePeople } from '../hooks/usePeople';
import { useAttendance } from '../hooks/useAttendance';
import { useGuestAttendance } from '../hooks/useGuestAttendance';
import { useMusicianRoles } from '../hooks/useMusicianRoles';
import { parseDate, toDateStr, formatDate, getMeetingDay, shiftDate, getTodayDate, snapToValidDate, minutesSinceMidnightET, meetingCutoffMinutes, formatTimeET } from '../lib/dateUtils';
import { useMeetingCancellation } from '../hooks/useMeetingCancellation';
import type { Meeting, Person, DisplayEntry, Gender } from '../types';
import AttendanceInput from '../components/AttendanceInput';
import { AttendanceSkeleton } from '../components/Skeleton';
import AnimatedNumber from '../components/AnimatedNumber';
import AttendanceTable from '../components/AttendanceTable';
import AddPersonModal from '../components/AddPersonModal';
import ConfirmDialog from '../components/ConfirmDialog';
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

  const [showSettings, setShowSettings] = useState(false);
  const [confirmClearTimes, setConfirmClearTimes] = useState(false);
  const [clearingTimes, setClearingTimes] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [shiftMinutes, setShiftMinutes] = useState('');
  const [cutoffValue, setCutoffValue] = useState('');
  const [busy, setBusy] = useState(false);

  const { people, searchPeople, addPerson, isDuplicate, loading: peopleLoading } = usePeople();
  const {
    entries,
    markedPersonIds,
    loading: attendanceLoading,
    markAttendance,
    removeAttendance,
    updateMarkedAt,
    clearAllTimes,
    shiftAllTimes,
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
    clearAllGuestTimes,
    shiftAllGuestTimes,
    toggleGuestFirstTime,
  } = useGuestAttendance(meetingId!, date!);

  const { getRoles, toggleRole } = useMusicianRoles(meetingId!, date!);

  // Cancellation for this meeting/date, from the DB (settable in Service settings).
  const { cancellation, cancelService, restoreService } = useMeetingCancellation(meetingId!, date!);

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

  const genderPercents = useMemo(() => {
    let male = 0, female = 0;
    for (const e of entries) {
      if (e.person.gender === 'male') male++;
      else if (e.person.gender === 'female') female++;
    }
    const known = male + female;
    if (known === 0) return null;
    const malePct = Math.round((male / known) * 100);
    return { malePct, femalePct: 100 - malePct };
  }, [entries]);

  const onTimePercent = useMemo(() => {
    if (!meeting) return null;
    const cutoffMinutes = meetingCutoffMinutes(meeting);
    if (cutoffMinutes === null) return null;

    // Only records that actually carry a check-in time count toward the on-time
    // rate — records with the time removed are excluded from both sides.
    const timedEntries = entries.filter(e => e.marked_at);
    const timedGuests = guests.filter(g => g.marked_at);
    const timedCount = timedEntries.length + timedGuests.length;
    if (timedCount === 0) return null;

    const onTimeEntries = timedEntries.filter(e => minutesSinceMidnightET(e.marked_at)! <= cutoffMinutes!);
    const onTimeGuests = timedGuests.filter(g => minutesSinceMidnightET(g.marked_at)! <= cutoffMinutes!);
    return Math.round(((onTimeEntries.length + onTimeGuests.length) / timedCount) * 100);
  }, [meeting, entries, guests]);

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

      if (data) {
        setMeeting(data);
        const mins = (data as Meeting).on_time_cutoff_minutes;
        setCutoffValue(
          mins == null
            ? ''
            : `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`,
        );
      }
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
    async (name: string, notes?: string, gender?: Gender | null) => {
      const person = await addPerson(name, notes, gender);
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

  // How many check-ins on this service still carry a time — drives the
  // settings copy and disables the action when there's nothing to clear.
  const timedTimes = [
    ...entries.filter(e => e.marked_at).map(e => e.marked_at),
    ...guests.filter(g => g.marked_at).map(g => g.marked_at),
  ];
  const timedCount = timedTimes.length;

  // Earliest check-in, used to preview what a shift actually does so nobody has
  // to guess what "-30" means before committing to it.
  const earliestTime = timedCount > 0
    ? timedTimes.reduce((a, b) => (new Date(a).getTime() <= new Date(b).getTime() ? a : b))
    : null;
  const shiftDelta = parseInt(shiftMinutes, 10);
  const shiftValid = Number.isFinite(shiftDelta) && shiftDelta !== 0;
  const shiftPreview = earliestTime && shiftValid
    ? `${formatTimeET(earliestTime)} → ${formatTimeET(new Date(new Date(earliestTime).getTime() + shiftDelta * 60_000).toISOString())}`
    : null;

  // Is the cutoff explicitly stored, or still inheriting the name-based default?
  const storedCutoff = meeting?.on_time_cutoff_minutes ?? null;
  const effectiveCutoff = meetingCutoffMinutes(meeting);
  const cutoffInherited = storedCutoff === null && effectiveCutoff !== null;
  const cutoffAsInput = storedCutoff === null
    ? ''
    : `${String(Math.floor(storedCutoff / 60)).padStart(2, '0')}:${String(storedCutoff % 60).padStart(2, '0')}`;
  const cutoffDirty = cutoffValue !== cutoffAsInput;

  async function handleClearTimes() {
    setConfirmClearTimes(false);
    setClearingTimes(true);
    const [okPeople, okGuests] = await Promise.all([clearAllTimes(), clearAllGuestTimes()]);
    setClearingTimes(false);
    setSettingsMessage(
      okPeople && okGuests
        ? { text: `Removed ${timedCount} check-in ${timedCount === 1 ? 'time' : 'times'}. Everyone is still marked present.`, tone: 'ok' }
        : { text: "Couldn't remove the times. Check your connection and try again.", tone: 'error' },
    );
  }

  async function handleShiftTimes() {
    if (!shiftValid) return;
    setBusy(true);
    const [okPeople, okGuests] = await Promise.all([shiftAllTimes(shiftDelta), shiftAllGuestTimes(shiftDelta)]);
    setBusy(false);
    setShiftMinutes('');
    setSettingsMessage(
      okPeople && okGuests
        ? { text: `Shifted ${timedCount} check-in ${timedCount === 1 ? 'time' : 'times'} by ${shiftDelta > 0 ? '+' : ''}${shiftDelta} minutes.`, tone: 'ok' }
        : { text: "Couldn't shift the times. Check your connection and try again.", tone: 'error' },
    );
  }

  async function handleToggleCancelled() {
    const wasCancelled = !!cancellation;
    setBusy(true);
    const ok = wasCancelled ? await restoreService() : await cancelService(cancelReason);
    setBusy(false);
    setConfirmRestore(false);
    setCancelReason('');
    setSettingsMessage(
      ok
        ? { text: wasCancelled ? 'Service restored. It no longer shows as cancelled.' : 'Service marked cancelled. Attendance was kept.', tone: 'ok' }
        : { text: "Couldn't save that. If this is the first time, run the service-settings SQL migration.", tone: 'error' },
    );
  }

  async function handleSaveCutoff() {
    if (!meeting) return;
    const mins = cutoffValue
      ? parseInt(cutoffValue.slice(0, 2), 10) * 60 + parseInt(cutoffValue.slice(3, 5), 10)
      : null;
    setBusy(true);
    const { error } = await supabase
      .from('meetings')
      .update({ on_time_cutoff_minutes: mins })
      .eq('id', meeting.id);
    setBusy(false);
    if (error) {
      setSettingsMessage({ text: "Couldn't save the cutoff. If this is the first time, run the service-settings SQL migration.", tone: 'error' });
      return;
    }
    setMeeting({ ...meeting, on_time_cutoff_minutes: mins });
    setSettingsMessage(
      mins === null
        ? { text: `Cutoff cleared. ${meeting.name} falls back to the default for its name.`, tone: 'ok' }
        : { text: `On-time cutoff saved for ${meeting.name}, on every date.`, tone: 'ok' },
    );
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
          <button
            className={`settings-btn${showSettings ? ' is-active' : ''}`}
            onClick={() => { setShowSettings(s => !s); setSettingsMessage(null); }}
            aria-pressed={showSettings}
            aria-label="Service settings"
            title="Service settings"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="attendance-settings" role="region" aria-label="Service settings">
          <div className="settings-head">
            <div>
              <h2>Service settings</h2>
              <p>Changes here are grouped by what they affect.</p>
            </div>
            <button
              className="settings-close"
              onClick={() => { setShowSettings(false); setSettingsMessage(null); }}
              aria-label="Close settings"
            >
              &times;
            </button>
          </div>

          {settingsMessage && (
            <p className={`settings-message is-${settingsMessage.tone}`} role="status">
              {settingsMessage.text}
            </p>
          )}

          {/* Scope 1 — this one date only */}
          <section className="settings-scope settings-scope--service">
            <header className="scope-head">
              <span className="scope-eyebrow">This service</span>
              <span className="scope-target">{formatDate(date!)}</span>
              <span className="scope-note">Only this date</span>
            </header>

            <div className="settings-card">
              <div className="settings-field">
                <span className="field-label">Service status</span>
                <div className="status-toggle" role="group" aria-label="Service status">
                  <button
                    className={`status-option${!cancellation ? ' is-active' : ''}`}
                    onClick={() => cancellation && setConfirmRestore(true)}
                    disabled={busy}
                    aria-pressed={!cancellation}
                  >
                    Held
                  </button>
                  <button
                    className={`status-option status-option--off${cancellation ? ' is-active' : ''}`}
                    onClick={() => !cancellation && handleToggleCancelled()}
                    disabled={busy}
                    aria-pressed={!!cancellation}
                  >
                    Cancelled
                  </button>
                </div>
              </div>

              {cancellation ? (
                <p className="field-hint">
                  Showing as cancelled{cancellation.reason ? ` — “${cancellation.reason}”` : ''}. Attendance was kept.
                </p>
              ) : (
                <input
                  className="settings-input"
                  type="text"
                  placeholder="Reason, if you cancel it (optional)"
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                />
              )}
            </div>

            <div className="settings-card">
              <div className="settings-field">
                <span className="field-label">Check-in times</span>
                <span className={`field-stat${timedCount === 0 ? ' is-empty' : ''}`}>
                  {timedCount === 0 ? 'None recorded' : `${timedCount} recorded`}
                </span>
              </div>

              {timedCount === 0 ? (
                <p className="field-hint">
                  No check-ins on this service carry a time, so there's nothing to adjust.
                </p>
              ) : (
                <>
                  <div className="shift-row">
                    <div className="shift-presets" role="group" aria-label="Shift by">
                      {[-60, -30, -15, 15, 30, 60].map(m => (
                        <button
                          key={m}
                          className={`shift-preset${parseInt(shiftMinutes, 10) === m ? ' is-active' : ''}`}
                          onClick={() => setShiftMinutes(String(m))}
                          disabled={busy}
                        >
                          {m > 0 ? `+${m}` : m}
                        </button>
                      ))}
                    </div>
                    <input
                      className="settings-input settings-input--tight"
                      type="number"
                      placeholder="Custom"
                      aria-label="Shift by minutes"
                      value={shiftMinutes}
                      onChange={e => setShiftMinutes(e.target.value)}
                    />
                    <button
                      className="settings-btn-plain"
                      onClick={handleShiftTimes}
                      disabled={busy || !shiftValid}
                    >
                      Shift times
                    </button>
                  </div>

                  <p className="field-hint">
                    {shiftPreview
                      ? <>Earliest check-in moves <strong>{shiftPreview}</strong>. Minutes, negative to go earlier.</>
                      : <>Moves every time on this service. Use a negative number to go earlier.</>}
                  </p>

                  <div className="settings-danger-row">
                    <div>
                      <span className="field-label">Remove all times</span>
                      <p className="field-hint">
                        Clears every arrival time here. Everyone stays present; times show blank. Can't be undone.
                      </p>
                    </div>
                    <button
                      className="settings-btn-danger"
                      onClick={() => setConfirmClearTimes(true)}
                      disabled={clearingTimes}
                    >
                      {clearingTimes ? 'Removing…' : 'Remove times'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Scope 2 — the whole meeting, every date */}
          <section className="settings-scope settings-scope--meeting">
            <header className="scope-head">
              <span className="scope-eyebrow">This meeting</span>
              <span className="scope-target">{meeting.name}</span>
              <span className="scope-note scope-note--wide">Every date</span>
            </header>

            <div className="settings-card">
              <div className="settings-field">
                <span className="field-label">On-time cutoff</span>
                <div className="cutoff-controls">
                  <input
                    className="settings-input settings-input--tight"
                    type="time"
                    aria-label="On-time cutoff"
                    value={cutoffValue}
                    onChange={e => setCutoffValue(e.target.value)}
                  />
                  <button
                    className="settings-btn-plain"
                    onClick={handleSaveCutoff}
                    disabled={busy || !cutoffDirty}
                  >
                    {cutoffDirty ? 'Save cutoff' : 'Saved'}
                  </button>
                </div>
              </div>
              <p className="field-hint">
                Arrivals at or before this time count as on time.{' '}
                {cutoffInherited
                  ? <>Currently using the default for this meeting's name. Save a time to set it explicitly.</>
                  : storedCutoff === null
                    ? <>Not set, so the on-time stat is hidden.</>
                    : <>Leave blank and save to hide the on-time stat.</>}
              </p>
            </div>
          </section>
        </div>
      )}

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
          {genderPercents && (
            <span className="gender-count"> · <AnimatedNumber value={genderPercents.malePct} suffix="%" /> M · <AnimatedNumber value={genderPercents.femalePct} suffix="%" /> F</span>
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
          getMusicianRoles={getRoles}
          onToggleMusicianRole={toggleRole}
          cancelled={!!cancellation}
          cancelledReason={cancellation?.reason ?? undefined}
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

      {confirmClearTimes && (
        <ConfirmDialog
          confirmLabel="Remove times"
          message={`Remove the check-in time from all ${timedCount} ${timedCount === 1 ? 'record' : 'records'} on ${meeting.name} for ${formatDate(date!)}? Everyone stays marked present — only the times are cleared. This can't be undone.`}
          onConfirm={handleClearTimes}
          onCancel={() => setConfirmClearTimes(false)}
        />
      )}

      {confirmRestore && (
        <ConfirmDialog
          confirmLabel="Restore"
          message={`Restore ${meeting.name} on ${formatDate(date!)}? It will no longer show as cancelled.`}
          onConfirm={handleToggleCancelled}
          onCancel={() => setConfirmRestore(false)}
        />
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
