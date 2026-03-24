import { useNavigate } from 'react-router-dom';
import { useEscapeBack } from '../hooks/useEscapeBack';
import './GamesPage.css';

const GAMES = [
  { id: 'tetris', name: 'Tetris', emoji: '🧱', description: 'Classic block stacking', color: '#3730a3' },
  { id: 'breakout', name: 'Breakout', emoji: '🧱', description: 'Smash all the bricks', color: '#7c3aed' },
  { id: 'chess', name: 'Chess Puzzles', emoji: '♟️', description: 'Puzzle Rush', color: '#92400e' },
];

export default function GamesPage() {
  const navigate = useNavigate();
  useEscapeBack();

  return (
    <div className="games-page">
      <div className="games-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          &larr;
        </button>
        <div className="games-header-info">
          <h1>Games</h1>
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
              <span className="game-card-emoji">{game.emoji}</span>
              <span className="game-card-name">{game.name}</span>
              <span className="game-card-desc">{game.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
