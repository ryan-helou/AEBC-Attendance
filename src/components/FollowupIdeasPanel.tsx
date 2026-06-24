import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import ConfirmDialog from './ConfirmDialog';
import './FollowupIdeasPanel.css';

interface Idea {
  id: string;
  text: string;
  done: boolean;
  created_at: string;
}

/**
 * Self-contained ideas / to-do list for the follow-up committee, backed by its
 * own `followup_ideas` table (kept separate from the attendance-side ideas).
 */
export default function FollowupIdeasPanel() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [newIdea, setNewIdea] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from('followup_ideas').select('*').order('created_at');
      if (active && data) setIdeas(data as Idea[]);
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  async function addIdea() {
    const text = newIdea.trim();
    if (!text) return;
    const { data } = await supabase
      .from('followup_ideas')
      .insert({ text, done: false })
      .select()
      .single();
    if (data) setIdeas(prev => [...prev, data as Idea]);
    setNewIdea('');
    inputRef.current?.focus();
  }

  async function toggleIdea(id: string) {
    const idea = ideas.find(i => i.id === id);
    if (!idea) return;
    const done = !idea.done;
    await supabase.from('followup_ideas').update({ done }).eq('id', id);
    setIdeas(prev => prev.map(i => (i.id === id ? { ...i, done } : i)));
  }

  async function removeIdea(id: string) {
    await supabase.from('followup_ideas').delete().eq('id', id);
    setIdeas(prev => prev.filter(i => i.id !== id));
    setConfirmDelete(null);
  }

  const open = ideas.filter(i => !i.done);
  const done = ideas.filter(i => i.done);

  return (
    <div className="followup-members-panel followup-ideas-panel">
      <div className="members-head">
        <h2>Ideas</h2>
        <p>A shared to-do list for the follow-up committee.</p>
      </div>

      <div className="followup-members-add">
        <input
          ref={inputRef}
          type="text"
          placeholder="Add an idea"
          value={newIdea}
          onChange={e => setNewIdea(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addIdea(); }}
        />
        <button className="btn-primary" onClick={addIdea} disabled={!newIdea.trim()}>Add</button>
      </div>

      {loading ? (
        <p className="followup-members-empty">Loading ideas</p>
      ) : ideas.length === 0 ? (
        <p className="followup-members-empty">No ideas yet. Add the first one above.</p>
      ) : (
        <ul className="fi-list">
          {open.map(idea => (
            <li key={idea.id} className="fi-item">
              <button className="fi-check" onClick={() => toggleIdea(idea.id)} aria-label="Mark done" />
              <span className="fi-text">{idea.text}</span>
              <button className="fi-remove" onClick={() => setConfirmDelete(idea.id)} aria-label="Delete idea">&times;</button>
            </li>
          ))}
          {done.map(idea => (
            <li key={idea.id} className="fi-item fi-item-done">
              <button className="fi-check fi-check-done" onClick={() => toggleIdea(idea.id)} aria-label="Mark not done">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7" />
                </svg>
              </button>
              <span className="fi-text">{idea.text}</span>
              <button className="fi-remove" onClick={() => setConfirmDelete(idea.id)} aria-label="Delete idea">&times;</button>
            </li>
          ))}
        </ul>
      )}

      {confirmDelete && (
        <ConfirmDialog
          confirmLabel="Delete"
          message="Delete this idea?"
          onConfirm={() => removeIdea(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
