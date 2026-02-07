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
import './AttendancePage.css';

function formatDisplayDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function AttendancePage() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [addModalName, setAddModalName] = useState<string | null>(null);

  const { searchPeople, addPerson, loading: peopleLoading } = usePeople();
  const {
    entries,
    markedPersonIds,
    loading: attendanceLoading,
    markAttendance,
    removeAttendance,
  } = useAttendance(meetingId!);

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

  if (peopleLoading || attendanceLoading || !meeting) return <Spinner />;

  return (
    <div className="attendance-page">
      <div className="attendance-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          &larr;
        </button>
        <div className="attendance-header-info">
          <h1>{meeting.name}</h1>
          <p className="attendance-header-date">{formatDisplayDate()}</p>
        </div>
      </div>

      <AttendanceInput
        searchPeople={searchPeople}
        markedPersonIds={markedPersonIds}
        onMark={handleMark}
        onAddNew={handleAddNew}
      />

      <div className="attendance-count">{entries.length} present</div>

      <AttendanceTable entries={entries} onRemove={removeAttendance} />

      {addModalName !== null && (
        <AddPersonModal
          initialName={addModalName}
          onSave={handleSaveNewPerson}
          onCancel={() => setAddModalName(null)}
        />
      )}
    </div>
  );
}
