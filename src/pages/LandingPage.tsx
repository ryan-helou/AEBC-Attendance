import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import type { Meeting } from '../types';
import MeetingCard from '../components/MeetingCard';
import Spinner from '../components/Spinner';
import './LandingPage.css';

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

function formatDisplayDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function LandingPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      const { data: meetingsData } = await supabase
        .from('meetings')
        .select('*')
        .order('display_order');

      if (meetingsData) {
        setMeetings(meetingsData);

        const today = getTodayDate();
        const { data: records } = await supabase
          .from('attendance_records')
          .select('meeting_id')
          .eq('date', today);

        if (records) {
          const countMap: Record<string, number> = {};
          for (const r of records) {
            countMap[r.meeting_id] = (countMap[r.meeting_id] || 0) + 1;
          }
          setCounts(countMap);
        }
      }

      setLoading(false);
    }

    load();
  }, []);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  if (loading) return <Spinner />;

  return (
    <div className="landing-page">
      <div className="landing-header">
        <div>
          <h1>AEBC Attendance</h1>
          <p className="landing-date">{formatDisplayDate()}</p>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>
      <div className="landing-meetings">
        {meetings.map(meeting => (
          <MeetingCard
            key={meeting.id}
            meeting={meeting}
            count={counts[meeting.id] || 0}
          />
        ))}
      </div>
    </div>
  );
}
