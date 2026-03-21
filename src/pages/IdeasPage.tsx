import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { useScrolledDown } from '../hooks/useScrolledDown';
import ConfirmDialog from '../components/ConfirmDialog';
import './IdeasPage.css';

interface Idea {
  id: string;
  text: string;
  done: boolean;
}

function loadIdeas(): Idea[] {
  try { return JSON.parse(localStorage.getItem('aebc-ideas') || '[]'); }
  catch { return []; }
}

export default function IdeasPage() {
  const navigate = useNavigate();
  useEscapeBack();
  const scrolled = useScrolledDown();
  const [ideas, setIdeas] = useState<Idea[]>(loadIdeas);
  const [newIdea, setNewIdea] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function save(next: Idea[]) {
    setIdeas(next);
    localStorage.setItem('aebc-ideas', JSON.stringify(next));
  }

  function addIdea() {
    const text = newIdea.trim();
    if (!text) return;
    save([...ideas, { id: Date.now().toString(), text, done: false }]);
    setNewIdea('');
    inputRef.current?.focus();
  }

  function toggleIdea(id: string) {
    save(ideas.map(i => i.id === id ? { ...i, done: !i.done } : i));
  }

  function removeIdea(id: string) {
    save(ideas.filter(i => i.id !== id));
    setConfirmDelete(null);
  }

  function startEdit(idea: Idea) {
    setEditingId(idea.id);
    setEditText(idea.text);
  }

  function saveEdit(id: string) {
    const text = editText.trim();
    if (!text) return;
    save(ideas.map(i => i.id === id ? { ...i, text } : i));
    setEditingId(null);
  }

  const openIdeas = ideas.filter(i => !i.done);
  const doneIdeas = ideas.filter(i => i.done);

  return (
    <div className="ideas-page">
      <div className={`ideas-header${scrolled ? ' header-compact' : ''}`}>
        <button className="back-btn" onClick={() => navigate(-1)}>&larr;</button>
        <h1>Ideas ({openIdeas.length})</h1>
        {doneIdeas.length > 0 && (
          <button className="ideas-clear-done" onClick={() => save(openIdeas)}>
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

        {ideas.length === 0 ? (
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
