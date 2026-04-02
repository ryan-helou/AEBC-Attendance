import { useState } from 'react';
import './Confetti.css';

interface ConfettiPiece {
  id: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
  wobble: number;
  color: string;
  rotation: number;
}

const MILESTONE_COLORS: Record<number, string[]> = {
  25:  ['#2196f3', '#64b5f6', '#42a5f5', '#1e88e5', '#90caf9'],
  50:  ['#9c27b0', '#ce93d8', '#ab47bc', '#8e24aa', '#e1bee7'],
  75:  ['#ff9800', '#ffb74d', '#ffa726', '#fb8c00', '#ffe0b2'],
  100: ['#f44336', '#ffeb3b', '#ff9800', '#e91e63', '#ffc107', '#ff5722', '#4caf50', '#2196f3'],
};

interface ConfettiProps {
  count: number;
}

export default function Confetti({ count }: ConfettiProps) {
  const colors = MILESTONE_COLORS[count] || MILESTONE_COLORS[25];

  const [pieces] = useState<ConfettiPiece[]>(() =>
    Array.from({ length: 300 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 0.9 + Math.random() * 1.2,
      delay: Math.random() * 1.5,
      duration: 2.5 + Math.random() * 2,
      wobble: (Math.random() - 0.5) * 80,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: (Math.random() - 0.5) * 40,
    }))
  );

  return (
    <div className="confetti-overlay" aria-hidden="true">
      {pieces.map(p => (
        <span
          key={p.id}
          className="confetti-number"
          style={{
            left: `${p.left}%`,
            fontSize: `${p.size}rem`,
            color: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            '--wobble': `${p.wobble}px`,
            '--rotation': `${p.rotation}deg`,
          } as React.CSSProperties}
        >
          {count}
        </span>
      ))}
    </div>
  );
}
