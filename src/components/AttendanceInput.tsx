import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import type { SearchResult } from '../hooks/usePeople';
import type { Person } from '../types';
import SuggestionList from './SuggestionList';
import './AttendanceInput.css';

interface AttendanceInputProps {
  searchPeople: (query: string, markedIds: Set<string>) => SearchResult[];
  markedPersonIds: Set<string>;
  onMark: (person: Person) => Promise<boolean>;
  onAddNew: (name: string) => void;
}

export default function AttendanceInput({
  searchPeople,
  markedPersonIds,
  onMark,
  onAddNew,
}: AttendanceInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateResults = useCallback(
    (q: string) => {
      const r = searchPeople(q, markedPersonIds);
      setResults(r);
      setHighlightedIndex(0);
      setShowDropdown(q.trim().length > 0);
    },
    [searchPeople, markedPersonIds]
  );

  function handleChange(value: string) {
    setQuery(value);
    updateResults(value);
  }

  async function selectPerson(result: SearchResult) {
    if (result.alreadyMarked) return;

    const success = await onMark(result.person);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    inputRef.current?.focus();

    if (success) {
      setFlash(true);
      setTimeout(() => setFlash(false), 600);
    }
  }

  function handleAddNew() {
    onAddNew(query.trim());
    setQuery('');
    setResults([]);
    setShowDropdown(false);
  }

  function handleKeyDown(e: KeyboardEvent) {
    const totalItems = results.length + (query.trim().length > 0 ? 1 : 0);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + totalItems) % totalItems);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!showDropdown || totalItems === 0) return;

      if (highlightedIndex < results.length) {
        const result = results[highlightedIndex];
        if (!result.alreadyMarked) {
          selectPerson(result);
        }
      } else {
        handleAddNew();
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  }

  return (
    <div className={'attendance-input-wrapper' + (flash ? ' flash' : '')}>
      <input
        ref={inputRef}
        type="text"
        className="attendance-input"
        placeholder="Type a name..."
        value={query}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (query.trim()) updateResults(query);
        }}
        onBlur={() => setShowDropdown(false)}
        autoFocus
        autoComplete="off"
      />
      {showDropdown && (
        <SuggestionList
          results={results}
          highlightedIndex={highlightedIndex}
          onSelect={selectPerson}
          query={query}
          onAddNew={handleAddNew}
        />
      )}
    </div>
  );
}
