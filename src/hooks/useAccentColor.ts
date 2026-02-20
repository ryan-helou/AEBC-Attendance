import { useState, useEffect } from 'react';

export interface AccentColor {
  name: string;
  light: string; lightHover: string; lightBg: string;
  dark: string;  darkHover: string;  darkBg: string;
}

function ac(name: string, light: string, lightHover: string, dark: string, darkHover: string): AccentColor {
  const [lr, lg, lb] = [parseInt(light.slice(1,3),16), parseInt(light.slice(3,5),16), parseInt(light.slice(5,7),16)];
  const [dr, dg, db] = [parseInt(dark.slice(1,3),16),  parseInt(dark.slice(3,5),16),  parseInt(dark.slice(5,7),16)];
  return { name, light, lightHover, lightBg: `rgba(${lr},${lg},${lb},0.08)`, dark, darkHover, darkBg: `rgba(${dr},${dg},${db},0.12)` };
}

// COLOR_PALETTE[column][row]
// Row 0: base (vivid)  Row 1: 400-level (lighter)  Row 2: 300-level (lightest)
// Row 3: 700-level (darker)  Row 4: 900-level (darkest)
export const COLOR_PALETTE: AccentColor[][] = [
  [ // Blue
    ac('Blue',        '#2563eb', '#1d4ed8', '#3b82f6', '#60a5fa'),
    ac('Blue-400',    '#60a5fa', '#3b82f6', '#93c5fd', '#60a5fa'),
    ac('Blue-300',    '#93c5fd', '#60a5fa', '#bfdbfe', '#93c5fd'),
    ac('Blue-700',    '#1d4ed8', '#1e40af', '#2563eb', '#3b82f6'),
    ac('Blue-900',    '#1e3a8a', '#1e3a8a', '#1d4ed8', '#2563eb'),
  ],
  [ // Indigo
    ac('Indigo',      '#4f46e5', '#4338ca', '#6366f1', '#818cf8'),
    ac('Indigo-400',  '#818cf8', '#6366f1', '#a5b4fc', '#818cf8'),
    ac('Indigo-300',  '#a5b4fc', '#818cf8', '#c7d2fe', '#a5b4fc'),
    ac('Indigo-700',  '#4338ca', '#3730a3', '#4f46e5', '#6366f1'),
    ac('Indigo-900',  '#312e81', '#312e81', '#3730a3', '#4338ca'),
  ],
  [ // Purple
    ac('Purple',      '#7c3aed', '#6d28d9', '#8b5cf6', '#a78bfa'),
    ac('Purple-400',  '#a78bfa', '#8b5cf6', '#c4b5fd', '#a78bfa'),
    ac('Purple-300',  '#c4b5fd', '#a78bfa', '#ddd6fe', '#c4b5fd'),
    ac('Purple-700',  '#6d28d9', '#5b21b6', '#7c3aed', '#8b5cf6'),
    ac('Purple-900',  '#4c1d95', '#4c1d95', '#5b21b6', '#6d28d9'),
  ],
  [ // Fuchsia
    ac('Fuchsia',     '#a21caf', '#86198f', '#d946ef', '#e879f9'),
    ac('Fuchsia-400', '#e879f9', '#d946ef', '#f0abfc', '#e879f9'),
    ac('Fuchsia-300', '#f0abfc', '#e879f9', '#f5d0fe', '#f0abfc'),
    ac('Fuchsia-700', '#86198f', '#701a75', '#a21caf', '#c026d3'),
    ac('Fuchsia-900', '#701a75', '#701a75', '#86198f', '#a21caf'),
  ],
  [ // Pink
    ac('Pink',        '#db2777', '#be185d', '#ec4899', '#f472b6'),
    ac('Pink-400',    '#f472b6', '#ec4899', '#f9a8d4', '#f472b6'),
    ac('Pink-300',    '#f9a8d4', '#f472b6', '#fbcfe8', '#f9a8d4'),
    ac('Pink-700',    '#be185d', '#9d174d', '#db2777', '#ec4899'),
    ac('Pink-900',    '#831843', '#831843', '#9d174d', '#be185d'),
  ],
  [ // Rose
    ac('Rose',        '#e11d48', '#be123c', '#f43f5e', '#fb7185'),
    ac('Rose-400',    '#fb7185', '#f43f5e', '#fda4af', '#fb7185'),
    ac('Rose-300',    '#fda4af', '#fb7185', '#fecdd3', '#fda4af'),
    ac('Rose-700',    '#be123c', '#9f1239', '#e11d48', '#f43f5e'),
    ac('Rose-900',    '#881337', '#881337', '#9f1239', '#be123c'),
  ],
  [ // Red
    ac('Red',         '#dc2626', '#b91c1c', '#ef4444', '#f87171'),
    ac('Red-400',     '#f87171', '#ef4444', '#fca5a5', '#f87171'),
    ac('Red-300',     '#fca5a5', '#f87171', '#fecaca', '#fca5a5'),
    ac('Red-700',     '#b91c1c', '#991b1b', '#dc2626', '#ef4444'),
    ac('Red-900',     '#7f1d1d', '#7f1d1d', '#991b1b', '#b91c1c'),
  ],
  [ // Orange
    ac('Orange',      '#ea580c', '#c2410c', '#f97316', '#fb923c'),
    ac('Orange-400',  '#fb923c', '#f97316', '#fdba74', '#fb923c'),
    ac('Orange-300',  '#fdba74', '#fb923c', '#fed7aa', '#fdba74'),
    ac('Orange-700',  '#c2410c', '#9a3412', '#ea580c', '#f97316'),
    ac('Orange-900',  '#7c2d12', '#7c2d12', '#9a3412', '#c2410c'),
  ],
  [ // Amber
    ac('Amber',       '#d97706', '#b45309', '#f59e0b', '#fbbf24'),
    ac('Amber-400',   '#fbbf24', '#f59e0b', '#fcd34d', '#fbbf24'),
    ac('Amber-300',   '#fcd34d', '#fbbf24', '#fde68a', '#fcd34d'),
    ac('Amber-700',   '#b45309', '#92400e', '#d97706', '#f59e0b'),
    ac('Amber-900',   '#78350f', '#78350f', '#92400e', '#b45309'),
  ],
  [ // Green
    ac('Green',       '#16a34a', '#15803d', '#22c55e', '#4ade80'),
    ac('Green-400',   '#4ade80', '#22c55e', '#86efac', '#4ade80'),
    ac('Green-300',   '#86efac', '#4ade80', '#bbf7d0', '#86efac'),
    ac('Green-700',   '#15803d', '#166534', '#16a34a', '#22c55e'),
    ac('Green-900',   '#14532d', '#14532d', '#166534', '#15803d'),
  ],
  [ // Teal
    ac('Teal',        '#0d9488', '#0f766e', '#14b8a6', '#2dd4bf'),
    ac('Teal-400',    '#2dd4bf', '#14b8a6', '#5eead4', '#2dd4bf'),
    ac('Teal-300',    '#5eead4', '#2dd4bf', '#99f6e4', '#5eead4'),
    ac('Teal-700',    '#0f766e', '#115e59', '#0d9488', '#14b8a6'),
    ac('Teal-900',    '#134e4a', '#134e4a', '#115e59', '#0f766e'),
  ],
  [ // Cyan
    ac('Cyan',        '#0891b2', '#0e7490', '#06b6d4', '#22d3ee'),
    ac('Cyan-400',    '#22d3ee', '#06b6d4', '#67e8f9', '#22d3ee'),
    ac('Cyan-300',    '#67e8f9', '#22d3ee', '#a5f3fc', '#67e8f9'),
    ac('Cyan-700',    '#0e7490', '#155e75', '#0891b2', '#06b6d4'),
    ac('Cyan-900',    '#164e63', '#164e63', '#155e75', '#0e7490'),
  ],
  [ // Grey
    ac('Grey',        '#52525b', '#3f3f46', '#a1a1aa', '#d4d4d8'),
    ac('Grey-400',    '#a1a1aa', '#71717a', '#d4d4d8', '#a1a1aa'),
    ac('Grey-300',    '#d4d4d8', '#a1a1aa', '#e4e4e7', '#d4d4d8'),
    ac('Grey-700',    '#3f3f46', '#27272a', '#52525b', '#71717a'),
    ac('Grey-900',    '#18181b', '#18181b', '#27272a', '#3f3f46'),
  ],
];

export const ACCENT_COLORS: AccentColor[] = COLOR_PALETTE.flat();

export function applyAccentColor(color: AccentColor, isDark: boolean) {
  const root = document.documentElement;
  root.style.setProperty('--color-primary',       isDark ? color.dark       : color.light);
  root.style.setProperty('--color-primary-hover', isDark ? color.darkHover  : color.lightHover);
  root.style.setProperty('--color-primary-light', isDark ? color.darkBg     : color.lightBg);
}

export function useAccentColor(isDark: boolean) {
  const [accentName, setAccentName] = useState<string>(
    () => localStorage.getItem('accent-color') ?? 'Blue'
  );

  const accent = ACCENT_COLORS.find(c => c.name === accentName) ?? ACCENT_COLORS[0];

  useEffect(() => {
    applyAccentColor(accent, isDark);
  }, [accent, isDark]);

  function setAccent(color: AccentColor) {
    localStorage.setItem('accent-color', color.name);
    setAccentName(color.name);
  }

  return { accent, setAccent };
}
