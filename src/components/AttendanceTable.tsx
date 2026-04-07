import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DisplayEntry } from '../types';
import './AttendanceTable.css';

const SHABIBEH_LEADERS = [
  'Andrew Helou',
  'Shayla Achkar',
  'Chloe Nasrallah',
  'James Helou',
  'Jessica Sebali',
  'Michael Nasrallah',
];

const ATTENDANCE_MINISTRY = ['Holy', 'Aly', 'Julia'];

interface AttendanceTableProps {
  entries: DisplayEntry[];
  onRemove: (id: string, isGuest: boolean) => void;
  onUpdateTime?: (recordId: string, newMarkedAt: string) => void;
  onUpdateGuestTime?: (guestId: string, newMarkedAt: string) => void;
  onToggleFirstTime?: (id: string, isGuest: boolean) => void;
  onConvertGuest?: (guestId: string, guestEntry: any, name: string) => Promise<void>;
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

export default function AttendanceTable({ entries, onRemove, onUpdateTime, onUpdateGuestTime, onToggleFirstTime, onConvertGuest }: AttendanceTableProps) {
  const navigate = useNavigate();
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [guestNameValue, setGuestNameValue] = useState('');
  const guestNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    prevIdsRef.current = new Set(entries.map(e => e.entry.id));
  });

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (editingGuestId && guestNameInputRef.current) {
      guestNameInputRef.current.focus();
      guestNameInputRef.current.select();
    }
  }, [editingGuestId]);

  function canEditTime(item: DisplayEntry) {
    return item.type === 'guest' ? !!onUpdateGuestTime : !!onUpdateTime;
  }

  function startEdit(item: DisplayEntry) {
    if (!canEditTime(item)) return;
    setEditingId(item.entry.id);
    setEditValue(toTimeInputValue(item.entry.marked_at));
  }

  function commitEdit(item: DisplayEntry) {
    if (!editValue) {
      setEditingId(null);
      return;
    }
    const [h, m] = editValue.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) {
      setEditingId(null);
      return;
    }
    const d = new Date(item.entry.date + 'T00:00:00');
    d.setHours(h, m, 0, 0);
    if (item.type === 'guest') {
      onUpdateGuestTime?.(item.entry.id, d.toISOString());
    } else {
      onUpdateTime?.(item.entry.id, d.toISOString());
    }
    setEditingId(null);
  }

  function startEditGuestName(guestId: string) {
    setEditingGuestId(guestId);
    setGuestNameValue('');
  }

  async function commitGuestConversion(item: DisplayEntry) {
    const trimmedName = guestNameValue.trim();
    if (!trimmedName) {
      setEditingGuestId(null);
      return;
    }
    setEditingGuestId(null);
    await onConvertGuest?.(item.entry.id, item.entry, trimmedName);
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
            <th className="col-first">1st</th>
            <th className="col-time">Time</th>
            <th className="col-action"></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((item, i) => {
            const isNew = !prevIdsRef.current.has(item.entry.id);
            const isGuest = item.type === 'guest';
            return (
              <tr
                key={item.entry.id}
                className={`${isNew ? 'new-row' : ''} ${isGuest ? 'guest-row' : ''}`}
              >
                <td className="col-num">{entries.length - i}</td>
                <td className="col-name">
                  {isGuest ? (
                    editingGuestId === item.entry.id ? (
                      <input
                        ref={guestNameInputRef}
                        type="text"
                        className="guest-name-edit-input"
                        placeholder="Enter name…"
                        value={guestNameValue}
                        onChange={e => setGuestNameValue(e.target.value)}
                        onBlur={() => commitGuestConversion(item)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitGuestConversion(item);
                          if (e.key === 'Escape') setEditingGuestId(null);
                        }}
                      />
                    ) : (
                      <span className="guest-name-tap" onClick={() => startEditGuestName(item.entry.id)}>Guest {item.entry.guest_number}</span>
                    )
                  ) : (
                    <>
                      <span className="name-tap" onClick={() => navigate(`/person/${item.entry.person_id}`)}>
                        {ATTENDANCE_MINISTRY.some(n => item.entry.person.full_name.startsWith(n)) && <span className="attendance-ministry-emoji">⭐ </span>}
                        {item.entry.person.full_name}
                      </span>
                      {SHABIBEH_LEADERS.includes(item.entry.person.full_name) && (
                        <span className="shabibeh-leader-badge" title="Shabibeh Leader">LEADER</span>
                      )}
                      {item.entry.person.notes && (
                        <span className="person-note"> — {item.entry.person.notes}</span>
                      )}
                    </>
                  )}
                </td>
                <td className="col-first">
                  <button
                    className={`first-time-btn${item.entry.first_time ? ' is-first' : ''}`}
                    onClick={() => onToggleFirstTime?.(item.entry.id, isGuest)}
                    title={item.entry.first_time ? 'Remove first-time mark' : 'Mark as first time'}
                  >
                    {item.entry.first_time ? '\u2713' : ''}
                  </button>
                </td>
                <td className="col-time">
                  {editingId === item.entry.id ? (
                    <input
                      ref={editInputRef}
                      type="time"
                      className="time-edit-input"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(item)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitEdit(item);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                  ) : (
                    <span
                      className={canEditTime(item) ? 'time-tap' : ''}
                      onClick={() => startEdit(item)}
                    >
                      {formatTime(item.entry.marked_at)}
                    </span>
                  )}
                </td>
                <td className="col-action">
                  <button
                    className="remove-btn"
                    onClick={() => onRemove(item.entry.id, isGuest)}
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
