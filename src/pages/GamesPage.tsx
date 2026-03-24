import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEscapeBack } from '../hooks/useEscapeBack';
import './GamesPage.css';

const GAMES = [
  {
    id: 'tetris',
    name: 'Tetris',
    description: 'Classic block stacking',
    gradient: 'linear-gradient(135deg, #1a237e, #3949ab)',
    icon: '⬜⬜\n⬜⬜',
    scoreKey: 'aebc-tetris-highscore',
    scoreLabel: 'High Score',
  },
  {
    id: 'breakout',
    name: 'Breakout',
    description: 'Smash all the bricks',
    gradient: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
    icon: '🏓',
    scoreKey: 'aebc-breakout-highscore',
    scoreLabel: 'High Score',
  },
  {
    id: 'chess',
    name: 'Puzzle Rush',
    description: 'Find the best move',
    gradient: 'linear-gradient(135deg, #78350f, #d97706)',
    icon: '♟',
    scoreKey: 'aebc-chess-highscore',
    scoreLabel: 'Best Run',
  },
  {
    id: 'wordle',
    name: 'Wordle',
    description: 'Guess the 5-letter word',
    gradient: 'linear-gradient(135deg, #15803d, #16a34a)',
    icon: '🟩',
    scoreKey: 'aebc-wordle-stats',
    scoreLabel: 'Win %',
    customScore: true,
  },
];

export default function GamesPage() {
  const navigate = useNavigate();
  useEscapeBack();
  const [scores, setScores] = useState<Record<string, number>>({});

  useEffect(() => {
    const s: Record<string, number> = {};
    for (const game of GAMES) {
      const val = localStorage.getItem(game.scoreKey);
      if (!val) continue;
      if ('customScore' in game && game.customScore) {
        try {
          const stats = JSON.parse(val);
          if (stats.gamesPlayed > 0) {
            s[game.id] = Math.round((stats.gamesWon / stats.gamesPlayed) * 100);
          }
        } catch { /* ignore */ }
      } else {
        s[game.id] = parseInt(val, 10);
      }
    }
    setScores(s);
  }, []);

  return (
    <div className="games-page">
      <div className="games-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          &larr;
        </button>
        <div className="games-header-info">
          <h1>Arcade</h1>
        </div>
      </div>

      <div className="games-body">
        <div className="games-grid">
          {GAMES.map(game => (
            <button
              key={game.id}
              className="game-card"
              onClick={() => navigate(`/games/${game.id}`)}
            >
              <div className="game-card-icon" style={{ background: game.gradient }}>
                <span>{game.icon}</span>
              </div>
              <div className="game-card-text">
                <span className="game-card-name">{game.name}</span>
                <span className="game-card-desc">{game.description}</span>
              </div>
              {scores[game.id] != null && scores[game.id] > 0 && (
                <div className="game-card-score">
                  <span className="game-card-score-value">{scores[game.id].toLocaleString()}</span>
                  <span className="game-card-score-label">{game.scoreLabel}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
