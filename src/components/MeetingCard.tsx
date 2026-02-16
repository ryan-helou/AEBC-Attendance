import { useNavigate } from 'react-router-dom';
import { getTodayDate } from '../lib/dateUtils';
import type { Meeting } from '../types';
import './MeetingCard.css';

interface MeetingCardProps {
  meeting: Meeting;
  count: number;
}

export default function MeetingCard({ meeting, count }: MeetingCardProps) {
  const navigate = useNavigate();

  return (
    <button
      className="meeting-card"
      onClick={() => navigate(`/attendance/${meeting.id}/${getTodayDate()}`)}
    >
      <span className="meeting-card-name">{meeting.name}</span>
      <span className="meeting-card-count">
        {count} present today
      </span>
    </button>
  );
}
