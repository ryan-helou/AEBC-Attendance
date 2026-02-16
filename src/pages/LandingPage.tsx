import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getTodayDate, formatDate } from '../lib/dateUtils';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import type { Meeting } from '../types';
import MeetingCard from '../components/MeetingCard';
import Spinner from '../components/Spinner';
import verses from '../data/verses';
import './LandingPage.css';

export default function LandingPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [verseIndex, setVerseIndex] = useState(() => Math.floor(Math.random() * verses.length));
  const [verseFading, setVerseFading] = useState(false);
  const { logout } = useAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(() => {
      setVerseFading(true);
      setTimeout(() => {
        setVerseIndex(prev => (prev + 1) % verses.length);
        setVerseFading(false);
      }, 400);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

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
      <header className="landing-header">
        <div className="landing-header-inner">
          <img src="/logo.png" alt="AEBC" className="landing-logo" />
          <div className="landing-header-center">
            <h1>AEBC Attendance</h1>
            <p className="landing-date">{formatDate(getTodayDate())}</p>
          </div>
          <div className="landing-header-actions">
            <button className="theme-toggle-btn" onClick={toggleTheme}>
              {dark ? 'Light' : 'Dark'}
            </button>
            <button className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="landing-body">
        <div className="landing-meetings">
          {meetings.map(meeting => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              count={counts[meeting.id] || 0}
            />
          ))}
        </div>

        <button className="landing-history-btn" onClick={() => navigate('/history')}>
          Attendance History
        </button>
      </div>

      <div className="landing-verse-container">
        <div className={`landing-verse ${verseFading ? 'verse-fade-out' : 'verse-fade-in'}`}>
          <p className="verse-text">{verses[verseIndex].text}</p>
          <p className="verse-ref">{verses[verseIndex].ref}</p>
        </div>
      </div>
    </div>
  );
}
