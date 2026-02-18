import { useState, type FormEvent } from 'react';
import './AddPersonModal.css';

interface AddPersonModalProps {
  initialName: string;
  onSave: (name: string, notes?: string) => Promise<void>;
  onCancel: () => void;
  isDuplicate?: (name: string) => boolean;
}

export default function AddPersonModal({ initialName, onSave, onCancel, isDuplicate }: AddPersonModalProps) {
  const [name, setName] = useState(initialName);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const duplicate = isDuplicate ? isDuplicate(name) : false;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || duplicate) return;
    setSaving(true);
    await onSave(name, notes);
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
