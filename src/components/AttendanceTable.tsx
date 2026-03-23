import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AttendanceEntry } from '../types';
import './AttendanceTable.css';

interface AttendanceTableProps {
  entries: AttendanceEntry[];
  onRemove: (recordId: string) => void;
  onUpdateTime?: (recordId: string, newMarkedAt: string) => void;
}

function formatTime(isoString: string) {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toTimeInputValue(isoString: string) {
  const d = new Date(isoString);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export default function AttendanceTable({ entries, onRemove, onUpdateTime }: AttendanceTableProps) {
  const navigate = useNavigate();
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    prevIdsRef.current = new Set(entries.map(e => e.id));
  });

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  function startEdit(entry: AttendanceEntry) {
    if (!onUpdateTime) return;
    setEditingId(entry.id);
    setEditValue(toTimeInputValue(entry.marked_at));
  }

  function commitEdit(entry: AttendanceEntry) {
    if (!onUpdateTime || !editValue) {
      setEditingId(null);
      return;
    }
    const [h, m] = editValue.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) {
      setEditingId(null);
      return;
    }
    // Use the meeting date as the base, not the original marked_at date
    // (handles retroactively added entries whose marked_at is on a different day)
    const d = new Date(entry.date + 'T00:00:00');
    d.setHours(h, m, 0, 0);
    onUpdateTime(entry.id, d.toISOString());
    setEditingId(null);
  }

  if (entries.length === 0) {
    return <div className="attendance-empty">No one marked yet</div>;
  }

  return (
    <div className="attendance-table-wrapper">
      <table className="attendance-table">
        <thead>
          <tr>
            <th className="col-num">#</th>
            <th className="col-name">Name</th>
            <th className="col-time">Time</th>
            <th className="col-action"></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => {
            const isNew = !prevIdsRef.current.has(entry.id);
            return (
              <tr
                key={entry.id}
                className={isNew ? 'new-row' : ''}
              >
                <td className="col-num">{entries.length - i}</td>
                <td className="col-name">
                  <span className="name-tap" onClick={() => navigate(`/person/${entry.person_id}`)}>
                    {entry.person.full_name}
                  </span>
                  {entry.person.notes && (
                    <span className="person-note">{entry.person.notes}</span>
                  )}
                </td>
                <td className="col-time">
                  {editingId === entry.id ? (
                    <input
                      ref={editInputRef}
                      type="time"
                      className="time-edit-input"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(entry)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitEdit(entry);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                  ) : (
                    <span
                      className={onUpdateTime ? 'time-tap' : ''}
                      onClick={() => startEdit(entry)}
                    >
                      {formatTime(entry.marked_at)}
                    </span>
                  )}
                </td>
                <td className="col-action">
                  <button
                    className="remove-btn"
                    onClick={() => onRemove(entry.id)}
                    title="Remove"
                  >
                    &times;
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="attendance-table-footer">
        Total: {entries.length} present
      </div>
    </div>
  );
}
