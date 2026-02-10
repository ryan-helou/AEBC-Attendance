import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Person } from '../types';
import Spinner from '../components/Spinner';
import './DataPage.css';

export default function DataPage() {
  const navigate = useNavigate();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ full_name: '', phone: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('people')
        .select('*')
        .order('full_name');

      if (data) setPeople(data);
      setLoading(false);
    }
    load();
  }, []);

  function startEdit(person: Person) {
    setEditingId(person.id);
    setEditValues({
      full_name: person.full_name,
      phone: person.phone || '',
      notes: person.notes || '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    if (!editValues.full_name.trim()) return;
    setSaving(true);

    const { error } = await supabase
      .from('people')
      .update({
        full_name: editValues.full_name.trim(),
        phone: editValues.phone.trim() || null,
        notes: editValues.notes.trim() || null,
      })
      .eq('id', id);

    if (!error) {
      setPeople(prev =>
        prev
          .map(p =>
            p.id === id
              ? {
                  ...p,
                  full_name: editValues.full_name.trim(),
                  phone: editValues.phone.trim() || null,
                  notes: editValues.notes.trim() || null,
                }
              : p
          )
          .sort((a, b) => a.full_name.localeCompare(b.full_name))
      );
      setEditingId(null);
    }

    setSaving(false);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('people').delete().eq('id', deleteId);
    if (!error) {
      setPeople(prev => prev.filter(p => p.id !== deleteId));
    }
    setDeleteId(null);
  }

  async function handleImport() {
    const names = importText
      .split(',')
      .map(n => n.trim())
      .filter(n => n.length > 0);

    if (names.length === 0) return;
    setImporting(true);
    setImportStatus('');

    const existingNames = new Set(people.map(p => p.full_name.toLowerCase()));
    const unique = [...new Set(names)].filter(n => !existingNames.has(n.toLowerCase()));

    if (unique.length === 0) {
      setImportStatus('All names already exist.');
      setImporting(false);
      return;
    }

    const rows = unique.map(name => ({ full_name: name }));
    const { data, error } = await supabase
      .from('people')
      .insert(rows)
      .select();

    if (!error && data) {
      setPeople(prev =>
        [...prev, ...data].sort((a, b) => a.full_name.localeCompare(b.full_name))
      );
      const skipped = names.length - unique.length;
      setImportStatus(
        `Added ${data.length} people${skipped > 0 ? `, skipped ${skipped} duplicate${skipped > 1 ? 's' : ''}` : ''}.`
      );
      setImportText('');
    }

    setImporting(false);
  }

  if (loading) return <Spinner />;

  return (
    <div className="data-page">
      <div className="data-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          &larr;
        </button>
        <h1>All People ({people.length})</h1>
        <button className="import-toggle-btn" onClick={() => setShowImport(v => !v)}>
          {showImport ? 'Cancel' : 'Import'}
        </button>
      </div>

      {showImport && (
        <div className="import-section">
          <textarea
            className="import-textarea"
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder="Enter names separated by commas, e.g. John Smith, Jane Doe, Mark Wilson"
            rows={3}
          />
          <button
            className="import-submit-btn"
            onClick={handleImport}
            disabled={importing || !importText.trim()}
          >
            {importing ? 'Adding...' : 'Add All'}
          </button>
          {importStatus && <p className="import-status">{importStatus}</p>}
        </div>
      )}

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Notes</th>
              <th className="col-action"></th>
            </tr>
          </thead>
          <tbody>
            {people.map((person, i) => (
              <tr key={person.id}>
                <td className="col-num">{i + 1}</td>

                {editingId === person.id ? (
                  <>
                    <td>
                      <input
                        className="data-edit-input"
                        value={editValues.full_name}
                        onChange={e => setEditValues(v => ({ ...v, full_name: e.target.value }))}
                        autoFocus
                      />
                    </td>
                    <td>
                      <input
                        className="data-edit-input"
                        value={editValues.phone}
                        onChange={e => setEditValues(v => ({ ...v, phone: e.target.value }))}
                        placeholder="Phone"
                      />
                    </td>
                    <td>
                      <input
                        className="data-edit-input"
                        value={editValues.notes}
                        onChange={e => setEditValues(v => ({ ...v, notes: e.target.value }))}
                        placeholder="Notes"
                      />
                    </td>
                    <td className="col-action">
                      <button
                        className="data-save-btn"
                        onClick={() => saveEdit(person.id)}
                        disabled={saving}
                      >
                        Save
                      </button>
                      <button className="data-cancel-btn" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{person.full_name}</td>
                    <td className="data-secondary">{person.phone || '—'}</td>
                    <td className="data-secondary">{person.notes || '—'}</td>
                    <td className="col-action">
                      <button className="data-edit-btn" onClick={() => startEdit(person)}>
                        Edit
                      </button>
                      <button className="data-delete-btn" onClick={() => setDeleteId(person.id)}>
                        Delete
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deleteId && (
        <div className="confirm-overlay" onClick={() => setDeleteId(null)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <p>Are you sure you want to delete this person?</p>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => setDeleteId(null)}>
                Cancel
              </button>
              <button className="confirm-delete" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
