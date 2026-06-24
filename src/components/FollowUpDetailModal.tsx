import { useState, useEffect, type FormEvent, type CSSProperties } from 'react';
import type { FollowupMember, FollowupNote, WatchListEntry } from '../types';
import { formatDate, formatTimeET } from '../lib/dateUtils';
import { initials, hueFromName, awaySeverity, AWAY_CAP_WEEKS } from '../lib/followupVisuals';
import Dropdown from './Dropdown';
import ConfirmDialog from './ConfirmDialog';
import './AddPersonModal.css'; // shared .modal-overlay / .modal-card / .modal-save base
import './FollowUpDetailModal.css';

interface FollowUpDetailModalProps {
  entry: WatchListEntry;
  notes: FollowupNote[]; // newest first
  members: FollowupMember[];
  memberById: Map<string, string>;
  onClose: () => void;
  onToggleNeedsFollowup: (value: boolean) => void;
  onSetAssignee: (memberId: string | null) => void;
  onAddNote: (authorId: string | null, body: string) => Promise<void>;
  onDeleteNote: (noteId: string) => void;
}

function authorLabel(authorId: string | null, memberById: Map<string, string>): string {
  if (!authorId) return 'Removed member';
  return memberById.get(authorId) ?? 'Removed member';
}

export default function FollowUpDetailModal({
  entry,
  notes,
  members,
  memberById,
  onClose,
  onToggleNeedsFollowup,
  onSetAssignee,
  onAddNote,
  onDeleteNote,
}: FollowUpDetailModalProps) {
  // Default the comment author to whoever this person is assigned to, if anyone.
  const [authorId, setAuthorId] = useState<string>(entry.assigned_to ?? '');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleAddNote(e: FormEvent) {
    e.preventDefault();
    if (!authorId || !body.trim()) return;
    setSaving(true);
    await onAddNote(authorId, body);
    setSaving(false);
    setBody('');
  }

  const sev = awaySeverity(entry.weeksSinceLast);
  const fillPct = Math.min(entry.weeksSinceLast / AWAY_CAP_WEEKS, 1) * 100;
  const memberOptions = members.map(m => ({ value: m.id, label: m.name }));
  const assigneeOptions = [{ value: '', label: 'Unassigned' }, ...memberOptions];

  return (
    <>
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-card followup-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="fu-modal-head">
          <span className="fu-modal-mono" style={{ '--mono-h': hueFromName(entry.person_name) } as CSSProperties}>
            {initials(entry.person_name)}
          </span>
          <div className="fu-modal-id">
            <h2>{entry.person_name}</h2>
            <p className="fu-modal-sub">
              {entry.lastSeenDate
                ? <>Last seen {formatDate(entry.lastSeenDate, { month: 'short', day: 'numeric', year: 'numeric' })} · {entry.totalAttendances} {entry.totalAttendances === 1 ? 'visit' : 'visits'}</>
                : <>No visits recorded yet</>}
            </p>
          </div>
          <button type="button" className="fu-modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        {entry.isInactiveByCutoff && (
          <div className="fu-away-row">
            <div className="away-track">
              <span className={`away-fill away-${sev}`} style={{ width: `${fillPct}%` }} />
            </div>
            <span className={`away-weeks away-${sev}`}>Away {entry.weeksSinceLast} weeks</span>
          </div>
        )}

        <div className="fu-controls">
          <button
            type="button"
            className={`fu-toggle${entry.needs_followup ? ' is-on' : ''}`}
            onClick={() => onToggleNeedsFollowup(!entry.needs_followup)}
            aria-pressed={entry.needs_followup}
          >
            <span className="fu-toggle-dot" />
            {entry.needs_followup ? 'Flagged for follow-up' : 'Flag for follow-up'}
          </button>
          <div className="fu-assign">
            <span>Assigned to</span>
            <Dropdown
              className="fu-assign-dd"
              ariaLabel="Assigned to"
              align="right"
              value={entry.assigned_to ?? ''}
              options={assigneeOptions}
              onChange={v => onSetAssignee(v || null)}
            />
          </div>
        </div>

        <form className="fu-add-note" onSubmit={handleAddNote}>
          <Dropdown
            className="fu-author-dd"
            ariaLabel="Note author"
            placeholder="Who's leaving this note?"
            value={authorId}
            options={memberOptions}
            onChange={setAuthorId}
            disabled={members.length === 0}
          />
          <textarea
            className="fu-note-input"
            placeholder={members.length === 0 ? 'Add a committee member first to leave notes' : 'How did the follow-up go?'}
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={3}
            disabled={members.length === 0}
          />
          <div className="fu-note-actions">
            <button type="submit" className="modal-save" disabled={saving || !authorId || !body.trim()}>
              {saving ? 'Saving…' : 'Add comment'}
            </button>
          </div>
        </form>

        <div className="fu-history">
          <h3>Follow-up history</h3>
          {notes.length === 0 ? (
            <p className="fu-history-empty">No comments yet. The first follow-up note will show up here.</p>
          ) : (
            <ul className="fu-thread">
              {notes.map(note => {
                const author = authorLabel(note.author_id, memberById);
                return (
                  <li key={note.id} className="fu-thread-item">
                    <span className="fu-thread-mono" style={{ '--mono-h': hueFromName(author) } as CSSProperties}>
                      {initials(author)}
                    </span>
                    <div className="fu-thread-body">
                      <div className="fu-thread-meta">
                        <span className="fu-thread-author">{author}</span>
                        <span className="fu-thread-meta-right">
                          <span className="fu-thread-date">
                            {formatDate(note.created_at.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}
                            {' · '}{formatTimeET(note.created_at)}
                          </span>
                          <button
                            type="button"
                            className="fu-thread-delete"
                            onClick={() => setNoteToDelete(note.id)}
                            title="Delete comment"
                            aria-label="Delete comment"
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 6h18" />
                              <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                              <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
                            </svg>
                          </button>
                        </span>
                      </div>
                      <p className="fu-thread-text">{note.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
    {noteToDelete && (
      <ConfirmDialog
        confirmLabel="Delete"
        message="Delete this comment? This cannot be undone."
        onConfirm={() => { onDeleteNote(noteToDelete); setNoteToDelete(null); }}
        onCancel={() => setNoteToDelete(null)}
      />
    )}
    </>
  );
}
