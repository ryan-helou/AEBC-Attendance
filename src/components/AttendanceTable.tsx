import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { DisplayEntry } from '../types';
import type { SearchResult } from '../hooks/usePeople';
import { MUSICIAN_ROLES } from '../hooks/useMusicianRoles';
import type { MusicianRole } from '../hooks/useMusicianRoles';
import SuggestionList from './SuggestionList';
import { formatTimeET, toTimeInputValueET, etWallClockToISO } from '../lib/dateUtils';
import { isBaby } from '../lib/babies';
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

function isAttendanceMinistryName(fullName: string) {
  return ATTENDANCE_MINISTRY.includes(fullName);
}

// Guests of honour (🏆). Shown only while taking attendance — the profile page
// uses 🏆 for the Champion streak badge, so keep this out of there.
const GUESTS_OF_HONOUR = [
  'Daniel Kaso-Jito',
];

function isGuestOfHonour(fullName: string) {
  return GUESTS_OF_HONOUR.includes(fullName);
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
  cancelled?: boolean;
  cancelledReason?: string;
}

export default function AttendanceTable({ entries, meetingName, onRemove, onUpdateTime, onUpdateGuestTime, onToggleFirstTime, onConvertGuest, searchPeople, markedPersonIds, getMusicianRoles, onToggleMusicianRole, cancelled, cancelledReason }: AttendanceTableProps) {
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
  const [rolePickerAnchor, setRolePickerAnchor] = useState<DOMRect | null>(null);

  const closeRolePicker = useCallback(() => {
    setRolePickerPersonId(null);
    setRolePickerAnchor(null);
  }, []);

  const toggleRolePicker = useCallback((personId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (rolePickerPersonId === personId) {
      closeRolePicker();
    } else {
      setRolePickerPersonId(personId);
      setRolePickerAnchor(e.currentTarget.getBoundingClientRect());
    }
  }, [rolePickerPersonId, closeRolePicker]);

  useEffect(() => {
    if (!rolePickerPersonId) return;
    // Close on any outside click, or on scroll/resize (the picker is fixed-positioned
    // and would otherwise detach from its anchor).
    window.addEventListener('click', closeRolePicker);
    window.addEventListener('scroll', closeRolePicker, true);
    window.addEventListener('resize', closeRolePicker);
    return () => {
      window.removeEventListener('click', closeRolePicker);
      window.removeEventListener('scroll', closeRolePicker, true);
      window.removeEventListener('resize', closeRolePicker);
    };
  }, [rolePickerPersonId, closeRolePicker]);

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
    setEditValue(toTimeInputValueET(item.entry.marked_at));
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
    const iso = etWallClockToISO(item.entry.date, h, m);
    if (item.type === 'guest') {
      onUpdateGuestTime?.(item.entry.id, iso);
    } else {
      onUpdateTime?.(item.entry.id, iso);
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

  if (cancelled) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">🚫</span>
        <p className="empty-state-title">Meeting cancelled</p>
        {cancelledReason && <p className="empty-state-note">{cancelledReason}</p>}
      </div>
    );
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
                        {isGuestOfHonour(item.entry.person.full_name) && <span className="guest-of-honour-emoji" title="Guest of Honour">🏆 </span>}
                        {item.entry.person.full_name}
                      </span>
                      {SHABIBEH_LEADERS.includes(item.entry.person.full_name) && !meetingName?.toLowerCase().includes('english') && (
                        <span className="shabibeh-leader-badge" title="Shabibeh Committee">COMMITTEE</span>
                      )}
                      {(getMusicianRoles?.(item.entry.person_id) || []).map(role => (
                        <span
                          key={role}
                          className="musician-role-badge"
                          onClick={e => toggleRolePicker(item.entry.person_id, e)}
                        >
                          {role}
                        </span>
                      ))}
                      <span
                        className="musician-role-add"
                        onClick={e => toggleRolePicker(item.entry.person_id, e)}
                        title="Assign role"
                      >
                        +
                      </span>
                      {item.entry.person.notes && (
                        <div className="person-note">{item.entry.person.notes}</div>
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
                      title={
                        formatTimeET(item.entry.marked_at)
                          ? undefined
                          : canEditTime(item)
                            ? 'No check-in time — tap to set one'
                            : 'No check-in time'
                      }
                    >
                      {/* A dash reads as "deliberately empty" where a blank cell
                          reads as broken — and gives the tap target something
                          to actually aim at. */}
                      {formatTimeET(item.entry.marked_at) || <span className="time-none">&mdash;</span>}
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
      {rolePickerPersonId && rolePickerAnchor && createPortal(
        (() => {
          const personId = rolePickerPersonId;
          const anchor = rolePickerAnchor;
          const GAP = 6;
          const PICKER_MAX_W = 288; // matches max-width: 18rem
          const left = Math.max(8, Math.min(anchor.left, window.innerWidth - PICKER_MAX_W - 8));
          // Flip above the trigger when there isn't room below (keeps it on-screen on mobile).
          const openUp = window.innerHeight - anchor.bottom < 220;
          const style: React.CSSProperties = openUp
            ? { left, bottom: window.innerHeight - anchor.top + GAP }
            : { left, top: anchor.bottom + GAP };
          const activeRoles = getMusicianRoles?.(personId) || [];
          return (
            <div className="role-picker" style={style} onClick={e => e.stopPropagation()}>
              {MUSICIAN_ROLES.map(role => (
                <button
                  key={role}
                  className={`role-picker-item${activeRoles.includes(role) ? ' active' : ''}`}
                  onClick={e => { e.stopPropagation(); onToggleMusicianRole?.(personId, role); }}
                >
                  {role}
                </button>
              ))}
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
}
