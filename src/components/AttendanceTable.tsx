import { useRef, useEffect } from 'react';
import type { AttendanceEntry } from '../types';
import './AttendanceTable.css';

interface AttendanceTableProps {
  entries: AttendanceEntry[];
  onRemove: (recordId: string) => void;
}

function formatTime(isoString: string) {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AttendanceTable({ entries, onRemove }: AttendanceTableProps) {
  const prevIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    prevIdsRef.current = new Set(entries.map(e => e.id));
  });

  if (entries.length === 0) {
    return <div className="attendance-empty">No one marked yet</div>;
  }

  return (
    <div className="attendance-table-wrapper">
      <table className="attendance-table">
        <thead>
          <tr>
            <th className="col-num">#</th>
            <th className="col-name">Name</th>
            <th className="col-time">Time</th>
            <th className="col-action"></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => {
            const isNew = !prevIdsRef.current.has(entry.id);
            return (
              <tr
                key={entry.id}
                className={isNew ? 'new-row' : ''}
              >
                <td className="col-num">{entries.length - i}</td>
                <td className="col-name">{entry.person.full_name}</td>
                <td className="col-time">{formatTime(entry.marked_at)}</td>
                <td className="col-action">
                  <button
                    className="remove-btn"
                    onClick={() => onRemove(entry.id)}
                    title="Remove"
                  >
                    &times;
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="attendance-table-footer">
        Total: {entries.length} present
      </div>
    </div>
  );
}
