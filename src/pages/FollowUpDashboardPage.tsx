import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useFollowUps } from '../hooks/useFollowUps';
import FollowUpDetailModal from '../components/FollowUpDetailModal';
import ConfirmDialog from '../components/ConfirmDialog';
import Dropdown from '../components/Dropdown';
import { initials, hueFromName, awaySeverity, AWAY_CAP_WEEKS } from '../lib/followupVisuals';
import type { FollowupMember, WatchListEntry } from '../types';
import './FollowUpDashboardPage.css';

const CUTOFF_OPTIONS = [2, 3, 4, 6, 8];
type SortKey = 'away' | 'name' | 'visits';

export default function FollowUpDashboardPage() {
  const navigate = useNavigate();
  const { logout } = useAuth('followup');
  const { dark, toggle: toggleTheme } = useTheme();

  const [cutoffWeeks, setCutoffWeeks] = useState(3);
  const {
    loading, watchList, members, memberById, notesByPerson,
    toggleNeedsFollowup, setAssignee, setDismissed, addNote, addMember, removeMember,
  } = useFollowUps(cutoffWeeks);

  const [filterMode, setFilterMode] = useState<'all' | 'needs' | 'removed'>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('away');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const [showMembers, setShowMembers] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [memberToRemove, setMemberToRemove] = useState<FollowupMember | null>(null);
  const [personToRemove, setPersonToRemove] = useState<WatchListEntry | null>(null);

  const rows = useMemo(() => {
    // "Removed" shows dismissed people; the others hide them.
    let list = filterMode === 'removed'
      ? watchList.filter(e => e.dismissed)
      : watchList.filter(e => !e.dismissed && (filterMode !== 'needs' || e.needs_followup));
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(e => e.person_name.toLowerCase().includes(q));

    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name': return a.person_name.localeCompare(b.person_name);
        case 'visits': return b.totalAttendances - a.totalAttendances;
        default: return b.weeksSinceLast - a.weeksSinceLast; // longest away first
      }
    });
  }, [watchList, filterMode, search, sortKey]);

  const selected = selectedPersonId ? watchList.find(e => e.person_id === selectedPersonId) ?? null : null;

  const assigneeOptions = useMemo(
    () => [{ value: '', label: 'Unassigned' }, ...members.map(m => ({ value: m.id, label: m.name }))],
    [members],
  );

  const stats = useMemo(() => {
    const active = watchList.filter(e => !e.dismissed);
    const flagged = active.filter(e => e.needs_followup);
    return {
      total: active.length,
      flagged: flagged.length,
      unassigned: flagged.filter(e => !e.assigned_to).length,
      removed: watchList.filter(e => e.dismissed).length,
    };
  }, [watchList]);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  async function handleAddMember() {
    const name = newMemberName.trim();
    if (!name) return;
    await addMember(name);
    setNewMemberName('');
  }

  return (
    <div className="followup-page">
      <header className="followup-header">
        <div className="followup-header-inner">
          <img src="/logo_small.png" alt="AEBC" className="followup-logo" />
          <div className="followup-header-text">
            <span className="followup-eyebrow">Follow-up committee</span>
            <h1>Who needs a check-in</h1>
          </div>
          <div className="followup-header-actions">
            <button className="followup-ghost-btn" onClick={toggleTheme}>{dark ? 'Light' : 'Dark'}</button>
            <button className="followup-ghost-btn" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </header>

      <main className="followup-body">
        <div className="followup-statline" aria-label="Summary">
          <span className="stat-chip">
            <span className="stat-dot dot-neutral" />
            <b>{stats.total}</b> on the watch list
          </span>
          <span className="stat-sep" />
          <span className="stat-chip">
            <span className="stat-dot dot-flag" />
            <b>{stats.flagged}</b> flagged for follow-up
          </span>
          <span className="stat-sep" />
          <span className="stat-chip">
            <span className="stat-dot dot-open" />
            <b>{stats.unassigned}</b> still need someone
          </span>
        </div>

        <div className="followup-toolbar">
          <div className="tool-group">
            <span className="tool-label">Away for</span>
            <div className="followup-pills">
              {CUTOFF_OPTIONS.map(w => (
                <button
                  key={w}
                  className={`followup-pill${cutoffWeeks === w ? ' is-active' : ''}`}
                  onClick={() => setCutoffWeeks(w)}
                >
                  {w}w
                </button>
              ))}
            </div>
          </div>

          <div className="followup-segmented" role="tablist" aria-label="Filter">
            <button
              role="tab"
              aria-selected={filterMode === 'all'}
              className={`seg-option${filterMode === 'all' ? ' is-active' : ''}`}
              onClick={() => setFilterMode('all')}
            >
              Everyone
            </button>
            <button
              role="tab"
              aria-selected={filterMode === 'needs'}
              className={`seg-option${filterMode === 'needs' ? ' is-active' : ''}`}
              onClick={() => setFilterMode('needs')}
            >
              Needs follow-up{stats.flagged > 0 ? ` · ${stats.flagged}` : ''}
            </button>
            <button
              role="tab"
              aria-selected={filterMode === 'removed'}
              className={`seg-option${filterMode === 'removed' ? ' is-active' : ''}`}
              onClick={() => setFilterMode('removed')}
            >
              Removed{stats.removed > 0 ? ` · ${stats.removed}` : ''}
            </button>
          </div>

          <div className="tool-spacer" />

          <input
            className="followup-search"
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <Dropdown
            className="sort-dd"
            ariaLabel="Sort"
            align="right"
            value={sortKey}
            options={[
              { value: 'away', label: 'Longest away' },
              { value: 'name', label: 'Name (A–Z)' },
              { value: 'visits', label: 'Most visits' },
            ]}
            onChange={v => setSortKey(v as SortKey)}
          />
          <button className="followup-ghost-btn followup-ghost-btn--dark" onClick={() => setShowMembers(s => !s)}>
            {showMembers ? 'Done' : 'Members'}
          </button>
        </div>

        {showMembers && (
          <div className="followup-members-panel">
            <div className="members-head">
              <h2>Committee members</h2>
              <p>People who can be assigned follow-ups and leave comments.</p>
            </div>
            <div className="followup-members-add">
              <input
                type="text"
                placeholder="Add a member…"
                value={newMemberName}
                onChange={e => setNewMemberName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddMember(); }}
              />
              <button className="btn-primary" onClick={handleAddMember} disabled={!newMemberName.trim()}>Add</button>
            </div>
            {members.length === 0 ? (
              <p className="followup-members-empty">No members yet — add the first one above.</p>
            ) : (
              <ul className="followup-members-list">
                {members.map(m => (
                  <li key={m.id} style={{ '--mono-h': hueFromName(m.name) } as React.CSSProperties}>
                    <span className="member-mono">{initials(m.name)}</span>
                    <span className="member-name">{m.name}</span>
                    <button
                      className="member-remove"
                      onClick={() => setMemberToRemove(m)}
                      aria-label={`Remove ${m.name}`}
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {loading ? (
          <ul className="followup-roster" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="care-row care-row--skeleton">
                <span className="care-monogram skeleton-block" />
                <div className="care-identity">
                  <span className="skeleton-line skeleton-line--name" />
                  <span className="skeleton-line skeleton-line--meta" />
                </div>
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <div className="followup-empty">
            <span className="followup-empty-icon">
              {filterMode === 'needs' ? '🕊️' : filterMode === 'removed' ? '🗂️' : '☕'}
            </span>
            <p className="followup-empty-title">
              {filterMode === 'needs'
                ? 'Nobody is flagged right now'
                : filterMode === 'removed'
                  ? 'Nothing removed'
                  : "Everyone's been around"}
            </p>
            <p className="followup-empty-desc">
              {filterMode === 'needs'
                ? 'Flag someone from “Everyone” to start keeping track of them.'
                : filterMode === 'removed'
                  ? 'People you remove from the watch list show up here, ready to restore.'
                  : `No one has been away for ${cutoffWeeks}+ weeks. Try a shorter window above.`}
            </p>
          </div>
        ) : (
          <ul className="followup-roster">
            {rows.map((entry, i) => {
              const sev = awaySeverity(entry.weeksSinceLast);
              const fillPct = Math.min(entry.weeksSinceLast / AWAY_CAP_WEEKS, 1) * 100;
              return (
                <li
                  key={entry.person_id}
                  className={`care-row${entry.needs_followup ? ' is-flagged' : ''}`}
                  style={{ '--mono-h': hueFromName(entry.person_name), '--row-i': i } as React.CSSProperties}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open follow-up details for ${entry.person_name}`}
                  onClick={() => setSelectedPersonId(entry.person_id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedPersonId(entry.person_id); }
                  }}
                >
                  <span className="care-monogram">{initials(entry.person_name)}</span>

                  <div className="care-identity">
                    <span className="care-name">{entry.person_name}</span>
                    <span className="care-meta">
                      {entry.totalAttendances} {entry.totalAttendances === 1 ? 'visit' : 'visits'}
                      {entry.lastSeenDate
                        ? <> · last seen {entry.weeksSinceLast}w ago</>
                        : <> · never marked present</>}
                    </span>
                  </div>

                  <div className="care-away">
                    {entry.isInactiveByCutoff ? (
                      <>
                        <div className="away-track">
                          <span className={`away-fill away-${sev}`} style={{ width: `${fillPct}%` }} />
                        </div>
                        <span className={`away-weeks away-${sev}`}>{entry.weeksSinceLast}w away</span>
                      </>
                    ) : entry.lastSeenDate ? (
                      <span className="care-returned">↩ back recently</span>
                    ) : (
                      <span className="care-novisits">no visits yet</span>
                    )}
                  </div>

                  <div className="care-assignee" onClick={e => e.stopPropagation()}>
                    <Dropdown
                      className={`assignee-dd${entry.assigned_to ? ' is-assigned' : ''}`}
                      ariaLabel={`Assign ${entry.person_name}`}
                      align="right"
                      value={entry.assigned_to ?? ''}
                      options={assigneeOptions}
                      onChange={v => setAssignee(entry.person_id, v || null)}
                    />
                  </div>

                  <div className="care-actions" onClick={e => e.stopPropagation()}>
                    {filterMode === 'removed' ? (
                      <button
                        className="care-action care-restore"
                        onClick={() => setDismissed(entry.person_id, false)}
                        title="Restore to watch list"
                        aria-label={`Restore ${entry.person_name} to the watch list`}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                          <path d="M3 3v5h5" />
                        </svg>
                      </button>
                    ) : (
                      <>
                        <button
                          className={`care-action care-flag${entry.needs_followup ? ' is-on' : ''}`}
                          onClick={() => toggleNeedsFollowup(entry.person_id, !entry.needs_followup)}
                          aria-pressed={entry.needs_followup}
                          title={entry.needs_followup ? 'Flagged for follow-up' : 'Flag for follow-up'}
                        >
                          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 12.5l4.5 4.5L19 7" />
                          </svg>
                        </button>
                        <button
                          className="care-action care-remove"
                          onClick={() => setPersonToRemove(entry)}
                          title="Remove from watch list"
                          aria-label={`Remove ${entry.person_name} from the watch list`}
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {selected && (
        <FollowUpDetailModal
          entry={selected}
          notes={notesByPerson.get(selected.person_id) ?? []}
          members={members}
          memberById={memberById}
          onClose={() => setSelectedPersonId(null)}
          onToggleNeedsFollowup={value => toggleNeedsFollowup(selected.person_id, value)}
          onSetAssignee={memberId => setAssignee(selected.person_id, memberId)}
          onAddNote={(authorId, body) => addNote(selected.person_id, authorId, body)}
        />
      )}

      {memberToRemove && (
        <ConfirmDialog
          confirmLabel="Remove"
          message={`Remove ${memberToRemove.name} from the committee? Their past comments stay, but they'll be unassigned from anyone they're following up with.`}
          onConfirm={() => { removeMember(memberToRemove.id); setMemberToRemove(null); }}
          onCancel={() => setMemberToRemove(null)}
        />
      )}

      {personToRemove && (
        <ConfirmDialog
          confirmLabel="Remove"
          message={`Remove ${personToRemove.person_name} from the watch list? You can restore them anytime from the Removed tab.`}
          onConfirm={() => { setDismissed(personToRemove.person_id, true); setPersonToRemove(null); }}
          onCancel={() => setPersonToRemove(null)}
        />
      )}

      <div className="app-version">v{__APP_VERSION__}</div>
    </div>
  );
}
