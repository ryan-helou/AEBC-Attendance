import { useState, useEffect, type FormEvent } from 'react';
import type { Gender } from '../types';
import './AddPersonModal.css';

interface AddPersonModalProps {
  initialName: string;
  onSave: (name: string, notes?: string, gender?: Gender | null) => Promise<void>;
  onCancel: () => void;
  isDuplicate?: (name: string, notes?: string) => boolean;
}

export default function AddPersonModal({ initialName, onSave, onCancel, isDuplicate }: AddPersonModalProps) {
  const [name, setName] = useState(initialName);
  const [notes, setNotes] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [saving, setSaving] = useState(false);

  const duplicate = isDuplicate ? isDuplicate(name, notes) : false;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || duplicate) return;
    setSaving(true);
    await onSave(name, notes, gender);
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <form
        className="modal-card"
        onSubmit={handleSubmit}
        onMouseDown={e => e.stopPropagation()}
      >
        <h2>Add New Person</h2>
        <label>
          Name *
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            required
          />
          {duplicate && (
            <span className="modal-duplicate-warning">This person already exists</span>
          )}
        </label>
        <label>
          Notes
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </label>
        <div className="gender-field">
          <span className="gender-label">Gender</span>
          <div className="gender-options">
            <button
              type="button"
              className={`gender-option${gender === 'male' ? ' gender-option-active' : ''}`}
              onClick={() => setGender(g => (g === 'male' ? null : 'male'))}
            >
              Male
            </button>
            <button
              type="button"
              className={`gender-option${gender === 'female' ? ' gender-option-active' : ''}`}
              onClick={() => setGender(g => (g === 'female' ? null : 'female'))}
            >
              Female
            </button>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} className="modal-cancel">
            Cancel
          </button>
          <button type="submit" disabled={saving || !name.trim() || duplicate} className="modal-save">
            {saving ? 'Saving...' : 'Save & Mark Present'}
          </button>
        </div>
      </form>
    </div>
  );
}
