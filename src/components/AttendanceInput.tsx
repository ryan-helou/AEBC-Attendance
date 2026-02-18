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

interface CrossItem {
  id: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
  wobble: number;
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
  const [crosses, setCrosses] = useState<CrossItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const crossTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function triggerCrossShower() {
    if (crossTimerRef.current) clearTimeout(crossTimerRef.current);
    const newCrosses: CrossItem[] = Array.from({ length: 80 }, (_, i) => ({
      id: i,
      left: 5 + Math.random() * 90,
      size: 1.4 + Math.random() * 2.8,
      delay: Math.random() * 2,
      duration: 3.5 + Math.random() * 2,
      wobble: (Math.random() - 0.5) * 60,
    }));
    setCrosses(newCrosses);
    crossTimerRef.current = setTimeout(() => setCrosses([]), 7000);
  }

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
    if (value.toLowerCase() === 'amen') {
      triggerCrossShower();
      setQuery('');
      setResults([]);
      setShowDropdown(false);
      return;
    }
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
    <>
      {crosses.length > 0 && (
        <div className="cross-shower-overlay" aria-hidden="true">
          {crosses.map(c => (
            <span
              key={c.id}
              className="cross-item"
              style={{
                left: `${c.left}%`,
                fontSize: `${c.size}rem`,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.duration}s`,
                '--wobble': `${c.wobble}px`,
              } as React.CSSProperties}
            >
              ✝
            </span>
          ))}
        </div>
      )}
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
    </>
  );
}
