import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { supabase } from '../lib/supabase';
import './GamesPage.css';

const GAMES = [
  {
    id: 'tetris',
    name: 'Tetris',
    description: 'Classic block stacking',
    gradient: 'linear-gradient(135deg, #1a237e, #3949ab)',
    icon: '⬜⬜\n⬜⬜',
    dbGame: 'tetris',
    scoreLabel: 'Top Score',
  },
  {
    id: 'breakout',
    name: 'Breakout',
    description: 'Smash all the bricks',
    gradient: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
    icon: '🏓',
    dbGame: 'breakout',
    scoreLabel: 'Top Score',
  },
  {
    id: 'chess',
    name: 'Puzzle Rush',
    description: 'Find the best move',
    gradient: 'linear-gradient(135deg, #78350f, #d97706)',
    icon: '♟',
    dbGame: 'chess',
    scoreLabel: 'Best Run',
  },
  {
    id: 'wordle',
    name: 'Wordle',
    description: 'Guess the 5-letter word',
    gradient: 'linear-gradient(135deg, #15803d, #16a34a)',
    icon: '🟩',
    dbGame: 'wordle',
    scoreLabel: 'Top Streak',
  },
];

export default function GamesPage() {
  const navigate = useNavigate();
  useEscapeBack();
  const [topScores, setTopScores] = useState<Record<string, { name: string; score: number }>>({});

  useEffect(() => {
    async function fetchTopScores() {
      for (const game of GAMES) {
        try {
          const { data } = await supabase
            .from('game_scores')
            .select('player_name, score')
            .eq('game', game.dbGame)
            .order('score', { ascending: false })
            .limit(1);
          if (data && data.length > 0) {
            setTopScores(prev => ({
              ...prev,
              [game.id]: { name: data[0].player_name, score: data[0].score },
            }));
          }
        } catch { /* ignore */ }
      }
    }
    fetchTopScores();
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
          {GAMES.map(game => {
            const top = topScores[game.id];
            return (
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
                {top && (
                  <div className="game-card-score">
                    <span className="game-card-score-value">{top.score.toLocaleString()}</span>
                    <span className="game-card-score-label">{top.name}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
