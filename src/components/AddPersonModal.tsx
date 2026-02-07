import { useState, type FormEvent } from 'react';
import './AddPersonModal.css';

interface AddPersonModalProps {
  initialName: string;
  onSave: (name: string, phone?: string, notes?: string) => Promise<void>;
  onCancel: () => void;
}

export default function AddPersonModal({ initialName, onSave, onCancel }: AddPersonModalProps) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSave(name, phone, notes);
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
        </label>
        <label>
          Phone
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="Optional"
          />
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
          <button type="submit" disabled={saving || !name.trim()} className="modal-save">
            {saving ? 'Saving...' : 'Save & Mark Present'}
          </button>
        </div>
      </form>
    </div>
  );
}
