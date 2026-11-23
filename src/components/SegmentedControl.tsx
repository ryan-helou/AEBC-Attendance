import './SegmentedControl.css';

export interface SegmentedOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  value: string;
  options: SegmentedOption[];
  onChange: (value: string) => void;
  /** Describes what's being picked, e.g. "Ministry" — the group has no visible label. */
  ariaLabel: string;
  className?: string;
}

/**
 * A row of pills where one is always chosen. Use it instead of a <select>
 * whenever the options are few and short: every choice stays visible and is one
 * tap away, which matters on a phone at the door where a native select opens an
 * OS picker over the whole screen.
 *
 * Not for long or open-ended lists (people, assignees) — those still want a
 * dropdown, see Dropdown.tsx.
 */
export default function SegmentedControl({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: SegmentedControlProps) {
  return (
    <div className={`segmented${className ? ` ${className}` : ''}`} role="tablist" aria-label={ariaLabel}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`segmented-option${active ? ' segmented-option-active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
