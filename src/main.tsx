import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ACCENT_COLORS, applyAccentColor } from './hooks/useAccentColor'

// Set theme before render to prevent flash
const _isDark = localStorage.getItem('theme') === 'dark';
document.documentElement.setAttribute('data-theme', _isDark ? 'dark' : 'light');

// Apply saved accent color before render to prevent flash
const _savedAccent = localStorage.getItem('accent-color') ?? 'Blue';
const _accent = ACCENT_COLORS.find(c => c.name === _savedAccent) ?? ACCENT_COLORS[0];
applyAccentColor(_accent, _isDark);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
