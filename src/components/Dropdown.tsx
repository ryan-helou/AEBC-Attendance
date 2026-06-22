import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import './Dropdown.css';

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  align?: 'left' | 'right';
  disabled?: boolean;
}

/**
 * A fully styled select replacement. The native <select> popup is OS-rendered
 * and can't be themed, so we render our own button + menu instead.
 */
export default function Dropdown({
  value, options, onChange, placeholder = 'Select…',
  ariaLabel, className = '', align = 'left', disabled = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocPointer);
    return () => document.removeEventListener('mousedown', onDocPointer);
  }, [open]);

  function choose(i: number) {
    const opt = options[i];
    if (opt) onChange(opt.value);
    setOpen(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
        setActiveIndex(Math.max(0, options.findIndex(o => o.value === value)));
      }
      return;
    }
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(activeIndex);
    }
  }

  return (
    <div className={`dd-root ${className}`} ref={rootRef}>
      <button
        type="button"
        className={`dd-trigger${selected ? ' has-value' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={e => { e.stopPropagation(); if (!disabled) setOpen(o => !o); }}
        onKeyDown={handleKeyDown}
      >
        <span className={`dd-value${selected ? '' : ' is-placeholder'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className={`dd-caret${open ? ' is-open' : ''}`} viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul className={`dd-menu dd-menu--${align}`} role="listbox" aria-label={ariaLabel}>
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`dd-option${o.value === value ? ' is-selected' : ''}${i === activeIndex ? ' is-active' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={e => { e.stopPropagation(); choose(i); }}
            >
              <svg className="dd-option-check" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                {o.value === value && (
                  <path d="M2 6.5l2.5 2.5L10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
              <span className="dd-option-label">{o.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
