import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useAccentColor } from '../hooks/useAccentColor';
import { useFollowUps } from '../hooks/useFollowUps';
import { usePeople } from '../hooks/usePeople';
import FollowUpDetailModal from '../components/FollowUpDetailModal';
import ConfirmDialog from '../components/ConfirmDialog';
import Dropdown from '../components/Dropdown';
import AccentColorPicker from '../components/AccentColorPicker';
import FollowupIdeasPanel from '../components/FollowupIdeasPanel';
import { initials, hueFromName, awaySeverity, AWAY_CAP_WEEKS } from '../lib/followupVisuals';
import type { FollowupMember, WatchListEntry, Person } from '../types';
import './FollowUpDashboardPage.css';

const CUTOFF_OPTIONS = [2, 3, 4, 6, 8];
type SortKey = 'away' | 'name' | 'visits';

export default function FollowUpDashboardPage() {
  const navigate = useNavigate();
  const { logout } = useAuth('followup');
  const { dark, toggle: toggleTheme } = useTheme();
  const { accent, setAccent } = useAccentColor(dark);

  const [cutoffWeeks, setCutoffWeeks] = useState(3);
  const {
    loading, watchList, members, memberById, notesByPerson,
    toggleNeedsFollowup, setAssignee, setDismissed, addToWatchList, addNote, deleteNote, addMember, removeMember,
  } = useFollowUps(cutoffWeeks);
  const { searchPeople, addPerson } = usePeople();

  const [filterMode, setFilterMode] = useState<'all' | 'needs' | 'removed'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('away');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const [activePanel, setActivePanel] = useState<'members' | 'ideas' | 'add' | null>(null);
  const [newMemberName, setNewMemberName] = useState('');
  const [memberToRemove, setMemberToRemove] = useState<FollowupMember | null>(null);
  const [personToRemove, setPersonToRemove] = useState<WatchListEntry | null>(null);

  const [addQuery, setAddQuery] = useState('');
  const [justAddedName, setJustAddedName] = useState<string | null>(null);

  // "Add a brand-new person" sub-form inside the add panel.
  const [creating, setCreating] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonNotes, setNewPersonNotes] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const rows = useMemo(() => {
    // "Removed" shows dismissed people; the others hide them.
    let list = filterMode === 'removed'
      ? watchList.filter(e => e.dismissed)
      : watchList.filter(e => !e.dismissed && (filterMode !== 'needs' || e.needs_followup));
    if (assigneeFilter === 'unassigned') list = list.filter(e => !e.assigned_to);
    else if (assigneeFilter !== 'all') list = list.filter(e => e.assigned_to === assigneeFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(e => e.person_name.toLowerCase().includes(q));

    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name': return a.person_name.localeCompare(b.person_name);
        case 'visits': return b.totalAttendances - a.totalAttendances;
        default: return b.weeksSinceLast - a.weeksSinceLast; // longest away first
      }
    });
  }, [watchList, filterMode, assigneeFilter, search, sortKey]);

  const selected = selectedPersonId ? watchList.find(e => e.person_id === selectedPersonId) ?? null : null;

  const assigneeOptions = useMemo(
    () => [{ value: '', label: 'Unassigned' }, ...members.map(m => ({ value: m.id, label: m.name }))],
    [members],
  );

  const assigneeFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'All assignees' },
      { value: 'unassigned', label: 'Unassigned' },
      ...members.map(m => ({ value: m.id, label: m.name })),
    ],
    [members],
  );

  const assigneeFilterActive = assigneeFilter !== 'all';
  const assigneeFilterLabel =
    assigneeFilter === 'unassigned'
      ? 'unassigned'
      : `assigned to ${members.find(m => m.id === assigneeFilter)?.name ?? 'them'}`;

  // If the member being filtered on gets removed, fall back to showing everyone.
  useEffect(() => {
    if (assigneeFilter !== 'all' && assigneeFilter !== 'unassigned' && !members.some(m => m.id === assigneeFilter)) {
      setAssigneeFilter('all');
    }
  }, [members, assigneeFilter]);

  // People already actively on the watch list — shown as "On the list" in the
  // add panel so they can't be added twice. Dismissed people are omitted so
  // re-adding restores them.
  const onWatchListIds = useMemo(
    () => new Set(watchList.filter(e => !e.dismissed).map(e => e.person_id)),
    [watchList],
  );

  const addResults = useMemo(
    () => (addQuery.trim() ? searchPeople(addQuery, onWatchListIds) : []),
    [addQuery, onWatchListIds, searchPeople],
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

  async function handleAddToWatchList(person: Person) {
    await addToWatchList(person.id, person.full_name);
    setJustAddedName(person.full_name);
  }

  // Open the create form, pre-filling whatever was typed in the search box.
  function openCreate() {
    setNewPersonName(addQuery.trim());
    setNewPersonNotes('');
    setCreateError(null);
    setJustAddedName(null);
    setCreating(true);
  }

  function cancelCreate() {
    setCreating(false);
    setNewPersonName('');
    setNewPersonNotes('');
    setCreateError(null);
  }

  // Create a brand-new person, then put them straight on the watch list.
  async function handleCreateAndAdd() {
    const name = newPersonName.trim();
    if (!name) return;
    const person = await addPerson(name, newPersonNotes.trim() || undefined);
    if (!person) {
      setCreateError(`"${name}" already exists in the directory — search for them above instead.`);
      return;
    }
    await addToWatchList(person.id, person.full_name);
    setJustAddedName(person.full_name);
    setAddQuery('');
    cancelCreate();
  }

  return (
    <div className="followup-page">
      <header className="followup-header">
        <div className="followup-header-inner">
          <img src="/logo_icon.png" alt="AEBC" className="followup-logo" />
          <div className="followup-header-text">
            <span className="followup-eyebrow">Follow-up committee</span>
            <h1>Who needs a check-in</h1>
          </div>
          <div className="followup-header-actions">
            <AccentColorPicker accent={accent} setAccent={setAccent} dark={dark} />
            <button className="followup-ghost-btn" onClick={toggleTheme}>{dark ? 'Light' : 'Dark'}</button>
            <button className="followup-ghost-btn" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </header>

      <main className="followup-body">
        <div className="followup-summary" aria-label="Summary">
          <div className="summary-cell">
            <span className="summary-value">{stats.total}</span>
            <span className="summary-label"><span className="summary-dot dot-neutral" />On the watch list</span>
          </div>
          <div className="summary-cell">
            <span className="summary-value">{stats.flagged}</span>
            <span className="summary-label"><span className="summary-dot dot-flag" />Flagged for follow-up</span>
          </div>
          <div className="summary-cell">
            <span className="summary-value">{stats.unassigned}</span>
            <span className="summary-label"><span className="summary-dot dot-open" />Awaiting an assignee</span>
          </div>
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

          <div className="followup-search-wrap">
            <svg className="followup-search-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              className="followup-search"
              type="search"
              placeholder="Search by name"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Dropdown
            className="assignee-filter-dd"
            ariaLabel="Filter by assignee"
            align="right"
            value={assigneeFilter}
            options={assigneeFilterOptions}
            onChange={setAssigneeFilter}
          />
          <Dropdown
            className="sort-dd"
            ariaLabel="Sort"
            align="right"
            value={sortKey}
            options={[
              { value: 'away', label: 'Longest away' },
              { value: 'name', label: 'Name (A to Z)' },
              { value: 'visits', label: 'Most visits' },
            ]}
            onChange={v => setSortKey(v as SortKey)}
          />
          <button
            className={`followup-ghost-btn followup-ghost-btn--dark${activePanel === 'add' ? ' is-active' : ''}`}
            onClick={() => { cancelCreate(); setActivePanel(p => (p === 'add' ? null : 'add')); }}
          >
            Add to list
          </button>
          <button
            className={`followup-ghost-btn followup-ghost-btn--dark${activePanel === 'ideas' ? ' is-active' : ''}`}
            onClick={() => setActivePanel(p => (p === 'ideas' ? null : 'ideas'))}
          >
            Ideas
          </button>
          <button
            className={`followup-ghost-btn followup-ghost-btn--dark${activePanel === 'members' ? ' is-active' : ''}`}
            onClick={() => setActivePanel(p => (p === 'members' ? null : 'members'))}
          >
            Members
          </button>
        </div>

        {activePanel === 'add' && (
          <div className="followup-members-panel followup-add-panel">
            <div className="members-head">
              <h2>Add someone to the watch list</h2>
              <p>Search the directory to start keeping an eye on someone — they'll be flagged for follow-up. Not in the directory yet? Add them as a new person.</p>
            </div>

            {creating ? (
              <div className="addp-create">
                <label className="addp-field">
                  <span className="addp-field-label">Name</span>
                  <input
                    className="addp-field-input"
                    type="text"
                    placeholder="Full name"
                    value={newPersonName}
                    autoFocus
                    onChange={e => { setNewPersonName(e.target.value); setCreateError(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateAndAdd(); }}
                  />
                </label>
                <label className="addp-field">
                  <span className="addp-field-label">Notes <span className="addp-optional">(optional)</span></span>
                  <textarea
                    className="addp-field-input addp-field-textarea"
                    placeholder="Anything helpful for following up — how you know them, context, etc."
                    rows={3}
                    value={newPersonNotes}
                    onChange={e => setNewPersonNotes(e.target.value)}
                  />
                </label>
                {createError && <p className="addp-error">{createError}</p>}
                <div className="addp-create-actions">
                  <button className="followup-ghost-btn" onClick={cancelCreate}>Cancel</button>
                  <button className="btn-primary" onClick={handleCreateAndAdd} disabled={!newPersonName.trim()}>
                    Add to list
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="addp-search-wrap">
                  <svg className="addp-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <input
                    className="addp-search"
                    type="search"
                    placeholder="Search by name…"
                    value={addQuery}
                    autoFocus
                    onChange={e => { setAddQuery(e.target.value); setJustAddedName(null); }}
                  />
                </div>

                {justAddedName && (
                  <p className="addp-confirm">Added <strong>{justAddedName}</strong> to the watch list.</p>
                )}

                {addQuery.trim() === '' ? (
                  <p className="followup-members-empty">Start typing a name to find them in the directory.</p>
                ) : addResults.length === 0 ? (
                  <div className="addp-noresult">
                    <p className="followup-members-empty">No one matches “{addQuery.trim()}”.</p>
                    <button className="btn-primary addp-create-cta" onClick={openCreate}>
                      + Add “{addQuery.trim()}” as a new person
                    </button>
                  </div>
                ) : (
                  <>
                    <ul className="addp-results">
                      {addResults.map(({ person, alreadyMarked }) => (
                        <li
                          key={person.id}
                          className="addp-result"
                          style={{ '--mono-h': hueFromName(person.full_name) } as React.CSSProperties}
                        >
                          <span className="member-mono">{initials(person.full_name)}</span>
                          <span className="addp-info">
                            <span className="addp-name">{person.full_name}</span>
                          </span>
                          {alreadyMarked ? (
                            <span className="addp-on">On the list</span>
                          ) : (
                            <button className="btn-primary addp-add-btn" onClick={() => handleAddToWatchList(person)}>
                              Add
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    <button className="addp-create-link" onClick={openCreate}>
                      Not who you're looking for? Add a new person
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {activePanel === 'members' && (
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
              <p className="followup-members-empty">No members yet. Add the first one above.</p>
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

        {activePanel === 'ideas' && <FollowupIdeasPanel />}

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
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {filterMode === 'needs' ? (
                  <>
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                  </>
                ) : filterMode === 'removed' ? (
                  <>
                    <rect x="3" y="4" width="18" height="4" rx="1" />
                    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
                    <path d="M10 12h4" />
                  </>
                ) : (
                  <>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
                  </>
                )}
              </svg>
            </span>
            <p className="followup-empty-title">
              {assigneeFilterActive
                ? 'No one matches this assignee'
                : filterMode === 'needs'
                  ? 'Nobody is flagged right now'
                  : filterMode === 'removed'
                    ? 'Nothing removed'
                    : 'Everyone has been around'}
            </p>
            <p className="followup-empty-desc">
              {assigneeFilterActive
                ? `No one on this tab is ${assigneeFilterLabel}. Try “All assignees” above.`
                : filterMode === 'needs'
                  ? 'Flag someone from the Everyone tab to start keeping track of them.'
                  : filterMode === 'removed'
                    ? 'People you remove from the watch list appear here, ready to restore.'
                    : `No one has been away for ${cutoffWeeks} or more weeks. Try a shorter window above.`}
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
                    {entry.lastSeenDate && entry.weeksSinceLast >= cutoffWeeks ? (
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
                        className="care-pill care-restore-pill"
                        onClick={() => setDismissed(entry.person_id, false)}
                        title="Restore to watch list"
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                          <path d="M3 3v5h5" />
                        </svg>
                        Restore
                      </button>
                    ) : (
                      <>
                        <button
                          className={`care-pill care-followup-pill${entry.needs_followup ? ' is-on' : ''}`}
                          onClick={() => toggleNeedsFollowup(entry.person_id, !entry.needs_followup)}
                          aria-pressed={entry.needs_followup}
                        >
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 12.5l4.5 4.5L19 7" />
                          </svg>
                          {entry.needs_followup ? 'Flagged' : 'Follow up'}
                        </button>
                        <button
                          className="care-pill care-remove-pill"
                          onClick={() => setPersonToRemove(entry)}
                          title="Remove from watch list"
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                          Remove
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
          onDeleteNote={noteId => deleteNote(noteId)}
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
