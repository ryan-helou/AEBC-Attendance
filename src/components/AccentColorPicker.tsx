import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { COLOR_PALETTE, type AccentColor } from '../hooks/useAccentColor';
import './AccentColorPicker.css';

interface AccentColorPickerProps {
  accent: AccentColor;
  setAccent: (color: AccentColor) => void;
  dark: boolean;
}

export default function AccentColorPicker({ accent, setAccent, dark }: AccentColorPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const swatchColor = (c: AccentColor) => (dark ? c.dark : c.light);

  return (
    <div className="accent-picker" ref={ref}>
      <button
        type="button"
        className="accent-picker-btn"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Change accent colour"
        title="Accent colour"
      >
        <span className="accent-picker-dot" style={{ background: swatchColor(accent) }} />
        <span className="accent-picker-text">Colour</span>
      </button>

      {open && (
        <div className="accent-picker-panel">
          <p className="accent-picker-label">Accent colour</p>
          <div className="accent-picker-swatches">
            {Array.from({ length: 5 }, (_, row) =>
              COLOR_PALETTE.map(col => {
                const color = col[row];
                return (
                  <button
                    key={color.name}
                    type="button"
                    className={
                      'accent-swatch' +
                      (row === 0 ? ' accent-swatch--base' : '') +
                      (accent.name === color.name ? ' is-active' : '')
                    }
                    style={{ background: swatchColor(color) } as CSSProperties}
                    title={color.name}
                    aria-label={color.name}
                    onClick={() => setAccent(color)}
                  />
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
