import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { WORDS, VALID_GUESSES } from '../data/words';
import './WordlePage.css';

const MAX_GUESSES = 6;
const WORD_LENGTH = 5;
const ALL_VALID = new Set([...WORDS, ...VALID_GUESSES]);

const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','BACK'],
];

type TileState = 'empty' | 'tbd' | 'correct' | 'present' | 'absent';

interface Stats {
  gamesPlayed: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  guessDistribution: number[];
}

function getDefaultStats(): Stats {
  return {
    gamesPlayed: 0,
    wins: 0,
    currentStreak: 0,
    maxStreak: 0,
    guessDistribution: [0, 0, 0, 0, 0, 0],
  };
}

function loadStats(): Stats {
  try {
    const raw = localStorage.getItem('aebc-wordle-stats');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return getDefaultStats();
}

function saveStats(stats: Stats) {
  localStorage.setItem('aebc-wordle-stats', JSON.stringify(stats));
}

function loadUsedWords(): string[] {
  try {
    const raw = localStorage.getItem('aebc-wordle-used');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveUsedWords(used: string[]) {
  localStorage.setItem('aebc-wordle-used', JSON.stringify(used));
}

function pickWord(): string {
  const used = new Set(loadUsedWords());
  const available = WORDS.filter(w => !used.has(w));
  // If all words used, reset
  const pool = available.length > 0 ? available : WORDS;
  if (available.length === 0) {
    saveUsedWords([]);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function evaluateGuess(guess: string, answer: string): TileState[] {
  const result: TileState[] = Array(WORD_LENGTH).fill('absent');
  const answerChars = answer.split('');
  const guessChars = guess.split('');
  const used = Array(WORD_LENGTH).fill(false);

  // First pass: correct positions
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guessChars[i] === answerChars[i]) {
      result[i] = 'correct';
      used[i] = true;
      guessChars[i] = '#'; // mark as used
    }
  }

  // Second pass: present but wrong position
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === 'correct') continue;
    for (let j = 0; j < WORD_LENGTH; j++) {
      if (!used[j] && guessChars[i] === answerChars[j]) {
        result[i] = 'present';
        used[j] = true;
        break;
      }
    }
  }

  return result;
}

export default function WordlePage() {
  useEscapeBack();
  const navigate = useNavigate();

  const [answer, setAnswer] = useState(() => pickWord());
  const [guesses, setGuesses] = useState<string[]>([]);
  const [evaluations, setEvaluations] = useState<TileState[][]>([]);
  const [currentGuess, setCurrentGuess] = useState('');
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [shakeRow, setShakeRow] = useState(-1);
  const [revealingRow, setRevealingRow] = useState(-1);
  const [toasts, setToasts] = useState<string[]>([]);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState<Stats>(loadStats);
  const [lastGuessIndex, setLastGuessIndex] = useState(-1);

  const gameOverRef = useRef(gameOver);
  gameOverRef.current = gameOver;

  const showToast = useCallback((msg: string, duration = 1500) => {
    setToasts(prev => [...prev, msg]);
    setTimeout(() => {
      setToasts(prev => prev.slice(1));
    }, duration);
  }, []);

  // Keyboard color map
  const keyColors = useCallback(() => {
    const map: Record<string, TileState> = {};
    const priority: Record<TileState, number> = {
      empty: 0, tbd: 0, absent: 1, present: 2, correct: 3,
    };
    guesses.forEach((guess, gi) => {
      const eval_ = evaluations[gi];
      if (!eval_) return;
      for (let i = 0; i < WORD_LENGTH; i++) {
        const letter = guess[i];
        const state = eval_[i];
        const current = map[letter];
        if (!current || priority[state] > priority[current]) {
          map[letter] = state;
        }
      }
    });
    return map;
  }, [guesses, evaluations]);

  const submitGuess = useCallback(() => {
    if (gameOverRef.current) return;
    if (currentGuess.length !== WORD_LENGTH) {
      setShakeRow(guesses.length);
      showToast('Not enough letters');
      setTimeout(() => setShakeRow(-1), 600);
      return;
    }
    if (!ALL_VALID.has(currentGuess)) {
      setShakeRow(guesses.length);
      showToast('Not in word list');
      setTimeout(() => setShakeRow(-1), 600);
      return;
    }

    const evaluation = evaluateGuess(currentGuess, answer);
    const newGuesses = [...guesses, currentGuess];
    const newEvaluations = [...evaluations, evaluation];
    const rowIndex = guesses.length;

    setGuesses(newGuesses);
    setEvaluations(newEvaluations);
    setCurrentGuess('');
    setRevealingRow(rowIndex);
    setLastGuessIndex(rowIndex);

    // Wait for reveal animation to finish
    const revealDuration = WORD_LENGTH * 300 + 300;
    setTimeout(() => {
      setRevealingRow(-1);

      const isWin = currentGuess === answer;
      const isLoss = !isWin && newGuesses.length >= MAX_GUESSES;

      if (isWin || isLoss) {
        setGameOver(true);
        setWon(isWin);

        const newStats = { ...loadStats() };
        newStats.gamesPlayed++;
        if (isWin) {
          newStats.wins++;
          newStats.currentStreak++;
          newStats.maxStreak = Math.max(newStats.maxStreak, newStats.currentStreak);
          newStats.guessDistribution[rowIndex]++;
          showToast(['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'][rowIndex], 2000);
        } else {
          newStats.currentStreak = 0;
          showToast(answer, 3000);
        }
        saveStats(newStats);
        setStats(newStats);

        // Mark word as used
        const used = loadUsedWords();
        used.push(answer);
        saveUsedWords(used);

        // Show stats modal after a brief delay
        setTimeout(() => setShowStats(true), isWin ? 1500 : 2500);
      }
    }, revealDuration);
  }, [currentGuess, guesses, evaluations, answer, showToast]);

  const handleKey = useCallback((key: string) => {
    if (gameOverRef.current) return;
    if (revealingRow >= 0) return;

    if (key === 'ENTER') {
      submitGuess();
    } else if (key === 'BACK' || key === 'BACKSPACE') {
      setCurrentGuess(prev => prev.slice(0, -1));
    } else if (/^[A-Z]$/.test(key) && currentGuess.length < WORD_LENGTH) {
      setCurrentGuess(prev => prev + key);
    }
  }, [currentGuess, submitGuess, revealingRow]);

  // Physical keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Don't intercept Escape (handled by useEscapeBack)
      if (e.key === 'Escape') return;
      if (e.key === 'Enter') {
        e.preventDefault();
        handleKey('ENTER');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleKey('BACK');
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        handleKey(e.key.toUpperCase());
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleKey]);

  const startNewGame = useCallback(() => {
    setAnswer(pickWord());
    setGuesses([]);
    setEvaluations([]);
    setCurrentGuess('');
    setGameOver(false);
    setWon(false);
    setShakeRow(-1);
    setRevealingRow(-1);
    setToasts([]);
    setShowStats(false);
    setLastGuessIndex(-1);
  }, []);

  const winPct = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;
  const maxDist = Math.max(...stats.guessDistribution, 1);

  const colors = keyColors();

  return (
    <div className="wordle-page">
      <header className="wordle-header">
        <button className="back-btn" onClick={() => navigate('/games')}>&larr;</button>
        <h1>Wordle</h1>
        <div className="wordle-header-actions">
          <button className="wordle-stats-btn" onClick={() => setShowStats(true)}>
            📊
          </button>
        </div>
      </header>

      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="wordle-toast-container">
          {toasts.map((t, i) => (
            <div key={i} className="wordle-toast">{t}</div>
          ))}
        </div>
      )}

      <div className="wordle-content">
        {/* Board */}
        <div className="wordle-board">
          {Array.from({ length: MAX_GUESSES }).map((_, rowIdx) => {
            const isGuessed = rowIdx < guesses.length;
            const isCurrent = rowIdx === guesses.length && !gameOver;
            const word = isGuessed ? guesses[rowIdx] : isCurrent ? currentGuess : '';
            const eval_ = isGuessed ? evaluations[rowIdx] : undefined;
            const isRevealing = revealingRow === rowIdx;
            const isShaking = shakeRow === rowIdx;

            return (
              <div
                key={rowIdx}
                className={`wordle-row${isShaking ? ' shake' : ''}`}
              >
                {Array.from({ length: WORD_LENGTH }).map((_, colIdx) => {
                  const letter = word[colIdx] || '';
                  const state = eval_ ? eval_[colIdx] : (letter ? 'tbd' : 'empty');
                  const isRevealed = isGuessed && !isRevealing;
                  const isAnimating = isRevealing && isGuessed;

                  let className = 'wordle-tile';
                  if (letter && !isGuessed) className += ' filled';
                  if (isRevealed) {
                    className += ' revealed';
                    if (state === 'correct') className += ' correct';
                    else if (state === 'present') className += ' present';
                    else if (state === 'absent') className += ' absent';
                  }

                  const style: React.CSSProperties = {};
                  if (isAnimating) {
                    const delay = colIdx * 0.3;
                    className += ' revealed';
                    if (state === 'correct') className += ' correct';
                    else if (state === 'present') className += ' present';
                    else if (state === 'absent') className += ' absent';
                    style.animationDelay = `${delay}s`;
                  }

                  return (
                    <div
                      key={colIdx}
                      className={className}
                      style={style}
                    >
                      {letter}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* New Game button */}
        {gameOver && (
          <button className="wordle-new-game" onClick={startNewGame}>
            New Game
          </button>
        )}

        {/* Keyboard */}
        <div className="wordle-keyboard">
          {KEYBOARD_ROWS.map((row, rowIdx) => (
            <div key={rowIdx} className="wordle-keyboard-row">
              {row.map(key => {
                let className = 'wordle-key';
                if (key === 'ENTER' || key === 'BACK') className += ' wide';
                const color = colors[key];
                if (color === 'correct') className += ' correct';
                else if (color === 'present') className += ' present';
                else if (color === 'absent') className += ' absent';

                return (
                  <button
                    key={key}
                    className={className}
                    onClick={() => handleKey(key)}
                  >
                    {key === 'BACK' ? '⌫' : key}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Stats Modal */}
      {showStats && (
        <div className="wordle-modal-overlay" onClick={() => setShowStats(false)}>
          <div className="wordle-modal" onClick={e => e.stopPropagation()}>
            <button className="wordle-modal-close" onClick={() => setShowStats(false)}>
              &times;
            </button>
            <h2>Statistics</h2>

            <div className="wordle-stats-row">
              <div className="wordle-stat">
                <div className="wordle-stat-value">{stats.gamesPlayed}</div>
                <div className="wordle-stat-label">Played</div>
              </div>
              <div className="wordle-stat">
                <div className="wordle-stat-value">{winPct}</div>
                <div className="wordle-stat-label">Win %</div>
              </div>
              <div className="wordle-stat">
                <div className="wordle-stat-value">{stats.currentStreak}</div>
                <div className="wordle-stat-label">Current Streak</div>
              </div>
              <div className="wordle-stat">
                <div className="wordle-stat-value">{stats.maxStreak}</div>
                <div className="wordle-stat-label">Max Streak</div>
              </div>
            </div>

            <div className="wordle-distribution">
              <h3>Guess Distribution</h3>
              {stats.guessDistribution.map((count, i) => (
                <div key={i} className="wordle-dist-row">
                  <div className="wordle-dist-label">{i + 1}</div>
                  <div
                    className={`wordle-dist-bar${won && lastGuessIndex === i ? ' highlight' : ''}`}
                    style={{ width: `${Math.max((count / maxDist) * 100, 7)}%` }}
                  >
                    {count}
                  </div>
                </div>
              ))}
            </div>

            {gameOver && (
              <div className="wordle-modal-actions">
                <button className="wordle-new-game" onClick={startNewGame}>
                  New Game
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
