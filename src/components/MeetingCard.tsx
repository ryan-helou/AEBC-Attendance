import { useNavigate } from 'react-router-dom';
import { latestMeetingDate, relativeDayLabel } from '../lib/dateUtils';
import type { Meeting } from '../types';
import './MeetingCard.css';

interface MeetingCardProps {
  meeting: Meeting;
  count: number;
}

export default function MeetingCard({ meeting, count }: MeetingCardProps) {
  const navigate = useNavigate();

  // A meeting that doesn't meet today shows its last service instead of a
  // meaningless zero — Shabibeh on a Sunday is "present yesterday".
  const date = latestMeetingDate(meeting.name);

  return (
    <button
      className="meeting-card"
      onClick={() => navigate(`/attendance/${meeting.id}/${date}`)}
    >
      <span className="meeting-card-name">{meeting.name}</span>
      <span className="meeting-card-count">
        {count} present {relativeDayLabel(date)}
      </span>
    </button>
  );
}
