import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { useScrolledDown } from '../hooks/useScrolledDown';
import ConfirmDialog from '../components/ConfirmDialog';
import './IdeasPage.css';

interface Idea {
  id: string;
  text: string;
  done: boolean;
  created_at: string;
}

export default function IdeasPage() {
  const navigate = useNavigate();
  useEscapeBack();
  const scrolled = useScrolledDown();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [newIdea, setNewIdea] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('ideas')
        .select('*')
        .order('created_at');
      if (data) setIdeas(data);
      setLoading(false);
    }
    load();
  }, []);

  async function addIdea() {
    const text = newIdea.trim();
    if (!text) return;
    const { data } = await supabase
      .from('ideas')
      .insert({ text, done: false })
      .select()
      .single();
    if (data) setIdeas(prev => [...prev, data]);
    setNewIdea('');
    inputRef.current?.focus();
  }

  async function toggleIdea(id: string) {
    const idea = ideas.find(i => i.id === id);
    if (!idea) return;
    const done = !idea.done;
    await supabase.from('ideas').update({ done }).eq('id', id);
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, done } : i));
  }

  async function removeIdea(id: string) {
    await supabase.from('ideas').delete().eq('id', id);
    setIdeas(prev => prev.filter(i => i.id !== id));
    setConfirmDelete(null);
  }

  function startEdit(idea: Idea) {
    setEditingId(idea.id);
    setEditText(idea.text);
  }

  async function saveEdit(id: string) {
    const text = editText.trim();
    if (!text) return;
    await supabase.from('ideas').update({ text }).eq('id', id);
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, text } : i));
    setEditingId(null);
  }

  async function clearDone() {
    const doneIds = ideas.filter(i => i.done).map(i => i.id);
    await supabase.from('ideas').delete().in('id', doneIds);
    setIdeas(prev => prev.filter(i => !i.done));
  }

  const openIdeas = ideas.filter(i => !i.done);
  const doneIdeas = ideas.filter(i => i.done);

  return (
    <div className="ideas-page">
      <div className={`ideas-header${scrolled ? ' header-compact' : ''}`}>
        <button className="back-btn" onClick={() => navigate(-1)}>&larr;</button>
        <h1>Ideas {!loading && `(${openIdeas.length})`}</h1>
        {doneIdeas.length > 0 && (
          <button className="ideas-clear-done" onClick={clearDone}>
            Clear done
          </button>
        )}
      </div>

      <div className="ideas-body">
        <div className="ideas-input-row">
          <input
            ref={inputRef}
            className="ideas-input"
            type="text"
            placeholder="Add an idea..."
            value={newIdea}
            onChange={e => setNewIdea(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addIdea(); }}
            autoFocus
          />
          <button className="ideas-add-btn" onClick={addIdea} disabled={!newIdea.trim()}>+</button>
        </div>

        {loading ? (
          <p className="ideas-empty">Loading...</p>
        ) : ideas.length === 0 ? (
          <p className="ideas-empty">No ideas yet — add one above!</p>
        ) : (
          <ul className="ideas-list">
            {openIdeas.map(idea => (
              <li key={idea.id} className="ideas-item">
                <button className="ideas-check" onClick={() => toggleIdea(idea.id)} />
                {editingId === idea.id ? (
                  <input
                    className="ideas-edit-input"
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onBlur={() => saveEdit(idea.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveEdit(idea.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                  />
                ) : (
                  <span className="ideas-text" onClick={() => startEdit(idea)}>{idea.text}</span>
                )}
                <button className="ideas-remove" onClick={() => setConfirmDelete(idea.id)}>&times;</button>
              </li>
            ))}
            {doneIdeas.map(idea => (
              <li key={idea.id} className="ideas-item ideas-item-done">
                <button className="ideas-check ideas-check-done" onClick={() => toggleIdea(idea.id)}>✓</button>
                <span className="ideas-text">{idea.text}</span>
                <button className="ideas-remove" onClick={() => setConfirmDelete(idea.id)}>&times;</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          message="Delete this idea?"
          onConfirm={() => removeIdea(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
