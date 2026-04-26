import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getTodayDate, formatDate } from '../lib/dateUtils';
import { useAuth } from '../hooks/useAuth';
import { LandingSkeleton } from '../components/Skeleton';
import { useTheme } from '../hooks/useTheme';
import { useAccentColor, COLOR_PALETTE } from '../hooks/useAccentColor';
import type { Meeting } from '../types';
import MeetingCard from '../components/MeetingCard';
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
  const { accent, setAccent } = useAccentColor(dark);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();


  useEffect(() => {
    if (!showSettings) return;
    function handleClickOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'h' || e.key === 'H') {
        navigate('/history');
      } else if (e.key === 'd' || e.key === 'D') {
        navigate('/data');
      } else if (e.key === 'i' || e.key === 'I') {
        navigate('/ideas');
      } else if (e.key === '1' && meetings[0]) {
        navigate(`/attendance/${meetings[0].id}/${getTodayDate()}`);
      } else if (e.key === '2' && meetings[1]) {
        navigate(`/attendance/${meetings[1].id}/${getTodayDate()}`);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [meetings, navigate]);

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
        const [{ data: records }, { data: guestRecords }] = await Promise.all([
          supabase.from('attendance_records').select('meeting_id').eq('date', today),
          supabase.from('guest_attendance').select('meeting_id').eq('date', today),
        ]);

        const countMap: Record<string, number> = {};
        for (const r of records ?? []) {
          countMap[r.meeting_id] = (countMap[r.meeting_id] || 0) + 1;
        }
        for (const r of guestRecords ?? []) {
          countMap[r.meeting_id] = (countMap[r.meeting_id] || 0) + 1;
        }
        setCounts(countMap);
      }

      setLoading(false);
    }

    load();
  }, []);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  if (loading) return <LandingSkeleton />;

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
            <div className="settings-container" ref={settingsRef}>
              <button
                className="theme-toggle-btn"
                onClick={() => setShowSettings(s => !s)}
                title="Settings"
              >
                ⚙
              </button>
              {showSettings && (
                <div className="settings-panel">
                  <p className="settings-label">Accent Colour</p>
                  <div className="settings-swatches">
                    {Array.from({ length: 5 }, (_, row) =>
                      COLOR_PALETTE.map(col => {
                        const color = col[row];
                        return (
                          <button
                            key={color.name}
                            className={
                              'settings-swatch' +
                              (row === 0 ? ' settings-swatch-base' : '') +
                              (accent.name === color.name ? ' settings-swatch-active' : '')
                            }
                            style={{ background: color.light }}
                            title={color.name}
                            onClick={() => setAccent(color)}
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
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
      <div className="app-version">v{__APP_VERSION__}</div>
    </div>
  );
}
