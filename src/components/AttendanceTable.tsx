import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DisplayEntry } from '../types';
import type { SearchResult } from '../hooks/usePeople';
import { MUSICIAN_ROLES } from '../hooks/useMusicianRoles';
import type { MusicianRole } from '../hooks/useMusicianRoles';
import SuggestionList from './SuggestionList';
import './AttendanceTable.css';

const SHABIBEH_LEADERS = [
  'Andrew Helou',
  'Shayla Achkar',
  'Chloe Nasrallah',
  'James Helou',
  'Jessica Sebali',
  'Michael Nasrallah',
  'Patricia Mangalo',
];

const ATTENDANCE_MINISTRY = [
  'Julia Sebali',
  'Aly Achkar',
  'Holy Abdelmessih',
  'Ryan Helou',
  'Jona Safadi',
];

const BABIES = [
  'William Sarnouk',
  'Ella Alabras',
  'Alba',
];

function isAttendanceMinistryName(fullName: string) {
  return ATTENDANCE_MINISTRY.includes(fullName);
}

function isBaby(fullName: string) {
  return BABIES.includes(fullName);
}

interface AttendanceTableProps {
  entries: DisplayEntry[];
  meetingName?: string;
  onRemove: (id: string, isGuest: boolean) => void;
  onUpdateTime?: (recordId: string, newMarkedAt: string) => void;
  onUpdateGuestTime?: (guestId: string, newMarkedAt: string) => void;
  onToggleFirstTime?: (id: string, isGuest: boolean) => void;
  onConvertGuest?: (guestId: string, guestEntry: any, name: string) => Promise<void>;
  searchPeople?: (query: string, markedIds: Set<string>) => SearchResult[];
  markedPersonIds?: Set<string>;
  getMusicianRoles?: (personId: string) => MusicianRole[];
  onToggleMusicianRole?: (personId: string, role: MusicianRole) => void;
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

export default function AttendanceTable({ entries, meetingName, onRemove, onUpdateTime, onUpdateGuestTime, onToggleFirstTime, onConvertGuest, searchPeople, markedPersonIds, getMusicianRoles, onToggleMusicianRole }: AttendanceTableProps) {
  const navigate = useNavigate();
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [guestNameValue, setGuestNameValue] = useState('');
  const [guestSuggestions, setGuestSuggestions] = useState<SearchResult[]>([]);
  const [guestHighlightedIndex, setGuestHighlightedIndex] = useState(0);
  const [showGuestSuggestions, setShowGuestSuggestions] = useState(false);
  const guestNameInputRef = useRef<HTMLInputElement>(null);
  const [rolePickerPersonId, setRolePickerPersonId] = useState<string | null>(null);

  useEffect(() => {
    if (!rolePickerPersonId) return;
    function handleClick() { setRolePickerPersonId(null); }
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [rolePickerPersonId]);

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
    setGuestSuggestions([]);
    setGuestHighlightedIndex(0);
    setShowGuestSuggestions(false);
  }

  function handleGuestNameChange(value: string) {
    setGuestNameValue(value);
    if (searchPeople && markedPersonIds && value.trim()) {
      const results = searchPeople(value, markedPersonIds);
      setGuestSuggestions(results);
      setGuestHighlightedIndex(0);
      setShowGuestSuggestions(true);
    } else {
      setGuestSuggestions([]);
      setShowGuestSuggestions(false);
    }
  }

  const selectGuestSuggestion = useCallback(
    async (result: SearchResult, item: DisplayEntry) => {
      if (result.alreadyMarked) return;
      setEditingGuestId(null);
      setShowGuestSuggestions(false);
      await onConvertGuest?.(item.entry.id, item.entry, result.person.full_name);
    },
    [onConvertGuest]
  );

  async function commitGuestConversion(item: DisplayEntry) {
    const trimmedName = guestNameValue.trim();
    if (!trimmedName) {
      setEditingGuestId(null);
      setShowGuestSuggestions(false);
      return;
    }
    setEditingGuestId(null);
    setShowGuestSuggestions(false);
    await onConvertGuest?.(item.entry.id, item.entry, trimmedName);
  }

  if (entries.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">📋</span>
        <p className="empty-state-title">No one marked yet</p>
        <p className="empty-state-desc">Start typing a name above to mark attendance</p>
      </div>
    );
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
                className={`${isNew ? 'new-row' : 'stagger-item'} ${isGuest ? 'guest-row' : ''}`}
                style={{ '--i': Math.min(i, 15) } as React.CSSProperties}
              >
                <td className="col-num">{entries.length - i}</td>
                <td className="col-name">
                  {isGuest ? (
                    editingGuestId === item.entry.id ? (
                      <div className="guest-name-edit-wrapper">
                        <input
                          ref={guestNameInputRef}
                          type="text"
                          className="guest-name-edit-input"
                          placeholder="Enter name…"
                          value={guestNameValue}
                          onChange={e => handleGuestNameChange(e.target.value)}
                          onBlur={() => {
                            setTimeout(() => {
                              setShowGuestSuggestions(false);
                              commitGuestConversion(item);
                            }, 150);
                          }}
                          onKeyDown={e => {
                            if (showGuestSuggestions && guestSuggestions.length > 0) {
                              const totalItems = guestSuggestions.length + (guestNameValue.trim() ? 1 : 0);
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setGuestHighlightedIndex(prev => (prev + 1) % totalItems);
                                return;
                              }
                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setGuestHighlightedIndex(prev => (prev - 1 + totalItems) % totalItems);
                                return;
                              }
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (guestHighlightedIndex < guestSuggestions.length) {
                                  selectGuestSuggestion(guestSuggestions[guestHighlightedIndex], item);
                                } else {
                                  commitGuestConversion(item);
                                }
                                return;
                              }
                            } else if (e.key === 'Enter') {
                              commitGuestConversion(item);
                              return;
                            }
                            if (e.key === 'Escape') {
                              setEditingGuestId(null);
                              setShowGuestSuggestions(false);
                            }
                          }}
                          autoComplete="off"
                        />
                        {showGuestSuggestions && (
                          <SuggestionList
                            results={guestSuggestions}
                            highlightedIndex={guestHighlightedIndex}
                            onSelect={(result) => selectGuestSuggestion(result, item)}
                            query={guestNameValue}
                            onAddNew={() => commitGuestConversion(item)}
                          />
                        )}
                      </div>
                    ) : (
                      <span className="guest-name-tap" onClick={() => startEditGuestName(item.entry.id)}>Guest {item.entry.guest_number}</span>
                    )
                  ) : (
                    <div className="name-cell-wrapper">
                      <span className="name-tap" onClick={() => navigate(`/person/${item.entry.person_id}`)}>
                        {isAttendanceMinistryName(item.entry.person.full_name) && <span className="attendance-ministry-emoji">⭐ </span>}
                        {isBaby(item.entry.person.full_name) && <span className="baby-emoji">👶 </span>}
                        {item.entry.person.full_name}
                      </span>
                      {SHABIBEH_LEADERS.includes(item.entry.person.full_name) && !meetingName?.toLowerCase().includes('english') && (
                        <span className="shabibeh-leader-badge" title="Shabibeh Committee">COMMITTEE</span>
                      )}
                      {(getMusicianRoles?.(item.entry.person_id) || []).map(role => (
                        <span
                          key={role}
                          className="musician-role-badge"
                          onClick={e => { e.stopPropagation(); setRolePickerPersonId(rolePickerPersonId === item.entry.person_id ? null : item.entry.person_id); }}
                        >
                          {role}
                        </span>
                      ))}
                      <span
                        className="musician-role-add"
                        onClick={e => { e.stopPropagation(); setRolePickerPersonId(rolePickerPersonId === item.entry.person_id ? null : item.entry.person_id); }}
                        title="Assign role"
                      >
                        +
                      </span>
                      {item.entry.person.notes && (
                        <div className="person-note">{item.entry.person.notes}</div>
                      )}
                      {rolePickerPersonId === item.entry.person_id && (
                        <div className="role-picker" onClick={e => e.stopPropagation()}>
                          {MUSICIAN_ROLES.map(role => (
                            <button
                              key={role}
                              className={`role-picker-item${(getMusicianRoles?.(item.entry.person_id) || []).includes(role) ? ' active' : ''}`}
                              onClick={e => {
                                e.stopPropagation();
                                onToggleMusicianRole?.(item.entry.person_id, role);
                              }}
                            >
                              {role}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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
