import { useEffect, useRef } from 'react';
import type { SearchResult } from '../hooks/usePeople';
import './SuggestionList.css';

interface SuggestionListProps {
  results: SearchResult[];
  highlightedIndex: number;
  onSelect: (result: SearchResult) => void;
  query: string;
  onAddNew: () => void;
}

export default function SuggestionList({
  results,
  highlightedIndex,
  onSelect,
  query,
  onAddNew,
}: SuggestionListProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (listRef.current) {
      const highlighted = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlighted) {
        highlighted.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const showAddNew = query.trim().length > 0;
  const totalItems = results.length + (showAddNew ? 1 : 0);

  if (totalItems === 0) return null;

  return (
    <ul className="suggestion-list" ref={listRef} role="listbox">
      {results.map((result, i) => (
        <li
          key={result.person.id}
          className={
            'suggestion-item' +
            (i === highlightedIndex ? ' highlighted' : '') +
            (result.alreadyMarked ? ' already-marked' : '')
          }
          role="option"
          aria-selected={i === highlightedIndex}
          onMouseDown={e => {
            e.preventDefault();
            if (!result.alreadyMarked) onSelect(result);
          }}
        >
          <span className="suggestion-main">
            <span className="suggestion-name">{result.person.full_name}</span>
            {result.person.notes && (
              <span className="suggestion-notes">{result.person.notes}</span>
            )}
          </span>
          {result.alreadyMarked && (
            <span className="suggestion-badge">Already marked</span>
          )}
        </li>
      ))}
      {showAddNew && (
        <li
          className={
            'suggestion-item suggestion-add-new' +
            (highlightedIndex === results.length ? ' highlighted' : '')
          }
          role="option"
          aria-selected={highlightedIndex === results.length}
          onMouseDown={e => {
            e.preventDefault();
            onAddNew();
          }}
        >
          Add &ldquo;{query.trim()}&rdquo; as new person
        </li>
      )}
    </ul>
  );
}
