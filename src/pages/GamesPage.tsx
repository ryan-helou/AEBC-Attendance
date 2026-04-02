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
    dbGame: 'tetris',
    scoreLabel: 'Top Score',
    symbol: '⠶',
  },
  {
    id: 'breakout',
    name: 'Breakout',
    description: 'Smash all the bricks',
    dbGame: 'breakout',
    scoreLabel: 'Top Score',
    symbol: '◎',
  },
  {
    id: 'chess',
    name: 'Puzzle Rush',
    description: 'Find the best move',
    dbGame: 'chess',
    scoreLabel: 'Best Run',
    symbol: '♞',
  },
  {
    id: 'wordle',
    name: 'Wordle',
    description: 'Guess the 5-letter word',
    dbGame: 'wordle',
    scoreLabel: 'Top Streak',
    symbol: 'W',
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
          <h1>ARCADE</h1>
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
                style={{}}
                onClick={() => navigate(`/games/${game.id}`)}
              >
                <div className="game-card-symbol">{game.symbol}</div>
                <div className="game-card-content">
                  <span className="game-card-name">{game.name}</span>
                  <span className="game-card-desc">{game.description}</span>
                  {top && (
                    <div className="game-card-leader">
                      <span className="game-card-trophy">🏆</span>
                      <span className="game-card-leader-name">{top.name}</span>
                      <span className="game-card-leader-score">{top.score.toLocaleString()}</span>
                    </div>
                  )}
                </div>
                <div className="game-card-arrow">&rsaquo;</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
