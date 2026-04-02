import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { supabase } from '../lib/supabase';
import './TetrisPage.css';

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 28;

// NES Tetris level 0 color palette — each piece gets a unique color
// inspired by the classic NES palette
const COLORS: Record<string, string> = {
  I: '#00fbfb', // cyan
  O: '#fcfcfc', // white
  T: '#a800a8', // purple
  S: '#00a800', // green
  Z: '#f83800', // red
  J: '#0058f8', // blue
  L: '#f87858', // orange/salmon
};

// NES-style block inner highlight colors
const HIGHLIGHT: Record<string, string> = {
  I: '#88fbfb',
  O: '#fcfcfc',
  T: '#f878f8',
  S: '#58f858',
  Z: '#f87858',
  J: '#6888fc',
  L: '#fcb8a8',
};

type Shape = number[][];

const SHAPES: Record<string, Shape> = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
};

const PIECE_NAMES = ['I','O','T','S','Z','J','L'] as const;

interface Piece {
  type: string;
  shape: Shape;
  x: number;
  y: number;
}

function rotateMatrix(matrix: Shape): Shape {
  const n = matrix.length;
  const result: Shape = Array.from({ length: n }, () => Array(n).fill(0));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      result[c][n - 1 - r] = matrix[r][c];
    }
  }
  return result;
}

// NES Tetris random: pick random, if same as last piece, re-roll once
let lastPieceType = '';
function randomPiece(): Piece {
  let type = PIECE_NAMES[Math.floor(Math.random() * PIECE_NAMES.length)];
  if (type === lastPieceType) {
    type = PIECE_NAMES[Math.floor(Math.random() * PIECE_NAMES.length)];
  }
  lastPieceType = type;
  const shape = SHAPES[type].map(row => [...row]);
  return { type, shape, x: Math.floor((COLS - shape[0].length) / 2), y: 0 };
}

type Board = (string | null)[][];

function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function collides(board: Board, piece: Piece, dx = 0, dy = 0, shape?: Shape): boolean {
  const s = shape || piece.shape;
  for (let r = 0; r < s.length; r++) {
    for (let c = 0; c < s[r].length; c++) {
      if (!s[r][c]) continue;
      const nx = piece.x + c + dx;
      const ny = piece.y + r + dy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function lockPiece(board: Board, piece: Piece): Board {
  const newBoard = board.map(row => [...row]);
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      const ny = piece.y + r;
      const nx = piece.x + c;
      if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
        newBoard[ny][nx] = piece.type;
      }
    }
  }
  return newBoard;
}

function clearLines(board: Board): { board: Board; cleared: number } {
  const remaining = board.filter(row => row.some(cell => !cell));
  const cleared = ROWS - remaining.length;
  const empty = Array.from({ length: cleared }, () => Array(COLS).fill(null) as (string | null)[]);
  return { board: [...empty, ...remaining], cleared };
}

// NES Tetris speed table (frames per gridcell at ~60fps, converted to ms)
function getSpeed(level: number): number {
  if (level <= 0) return 800;
  if (level === 1) return 717;
  if (level === 2) return 633;
  if (level === 3) return 550;
  if (level === 4) return 467;
  if (level === 5) return 383;
  if (level === 6) return 300;
  if (level === 7) return 217;
  if (level === 8) return 133;
  if (level === 9) return 100;
  if (level <= 12) return 83;
  if (level <= 15) return 67;
  if (level <= 18) return 50;
  if (level <= 28) return 33;
  return 17; // level 29+ "kill screen"
}

// NES Tetris scoring
const SCORE_TABLE = [0, 40, 100, 300, 1200];

export default function TetrisPage() {
  const navigate = useNavigate();
  useEscapeBack();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<Board>(emptyBoard());
  const pieceRef = useRef<Piece>(randomPiece());
  const nextPieceRef = useRef<Piece>(randomPiece());
  const scoreRef = useRef(0);
  const linesRef = useRef(0);
  const levelRef = useRef(0);
  const gameOverRef = useRef(false);
  const startedRef = useRef(false);
  const dropTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{player_name: string; score: number}[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchLeaderboard = async () => {
    try {
      const { data } = await supabase.from('game_scores').select('*').eq('game', 'tetris').order('score', { ascending: false }).limit(5);
      if (data) setLeaderboard(data.map((d: any) => ({ player_name: d.player_name, score: d.score })));
    } catch {}
  };

  const submitScore = async () => {
    const trimmed = playerName.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await supabase.from('game_scores').insert({ game: 'tetris', player_name: trimmed, score });
      setNameSubmitted(true);
      await fetchLeaderboard();
    } catch {}
    setSubmitting(false);
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const board = boardRef.current;
    const piece = pieceRef.current;

    // Pure black background like NES
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Board cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]) {
          drawBlock(ctx, c, r, board[r][c]!);
        }
      }
    }

    // No ghost piece — NES Tetris doesn't have one
    if (!gameOverRef.current && startedRef.current) {
      // Current piece
      for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
          if (!piece.shape[r][c]) continue;
          const px = piece.x + c;
          const py = piece.y + r;
          if (py >= 0) {
            drawBlock(ctx, px, py, piece.type);
          }
        }
      }
    }

    // Draw preview
    drawPreview();
  }, []);

  // NES-style block: solid color with a bright inner square highlight
  function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, type: string) {
    const bx = x * BLOCK_SIZE;
    const by = y * BLOCK_SIZE;
    const color = COLORS[type];
    const highlight = HIGHLIGHT[type];

    // Dark border/outline
    ctx.fillStyle = '#000';
    ctx.fillRect(bx, by, BLOCK_SIZE, BLOCK_SIZE);

    // Main block color
    ctx.fillStyle = color;
    ctx.fillRect(bx + 1, by + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);

    // NES-style: brighter inner square (top-left portion)
    ctx.fillStyle = highlight;
    ctx.fillRect(bx + 2, by + 2, BLOCK_SIZE - 8, BLOCK_SIZE - 8);

    // Dark bottom-right inner edge for depth
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(bx + BLOCK_SIZE - 6, by + 2, 5, BLOCK_SIZE - 3);
    ctx.fillRect(bx + 2, by + BLOCK_SIZE - 6, BLOCK_SIZE - 3, 5);
  }

  function drawPreview() {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const next = nextPieceRef.current;
    const previewBlockSize = 18;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const shape = next.shape;
    const offsetX = (canvas.width - shape[0].length * previewBlockSize) / 2;
    const offsetY = (canvas.height - shape.length * previewBlockSize) / 2;

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const bx = offsetX + c * previewBlockSize;
        const by = offsetY + r * previewBlockSize;
        const color = COLORS[next.type];
        const highlight = HIGHLIGHT[next.type];

        ctx.fillStyle = '#000';
        ctx.fillRect(bx, by, previewBlockSize, previewBlockSize);
        ctx.fillStyle = color;
        ctx.fillRect(bx + 1, by + 1, previewBlockSize - 2, previewBlockSize - 2);
        ctx.fillStyle = highlight;
        ctx.fillRect(bx + 2, by + 2, previewBlockSize - 6, previewBlockSize - 6);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(bx + previewBlockSize - 5, by + 2, 4, previewBlockSize - 3);
        ctx.fillRect(bx + 2, by + previewBlockSize - 5, previewBlockSize - 3, 4);
      }
    }
  }

  const scheduleDrop = useCallback(() => {
    if (dropTimerRef.current) clearTimeout(dropTimerRef.current);
    dropTimerRef.current = setTimeout(() => {
      drop();
      scheduleDrop();
    }, getSpeed(levelRef.current));
  }, []);

  const resetGame = useCallback(() => {
    lastPieceType = '';
    boardRef.current = emptyBoard();
    pieceRef.current = randomPiece();
    nextPieceRef.current = randomPiece();
    scoreRef.current = 0;
    linesRef.current = 0;
    levelRef.current = 0;
    gameOverRef.current = false;
    startedRef.current = true;
    setScore(0);
    setLines(0);
    setLevel(0);
    setGameOver(false);
    setStarted(true);
    setPlayerName('');
    setNameSubmitted(false);
    setLeaderboard([]);
    draw();
    scheduleDrop();
  }, [draw, scheduleDrop]);

  function drop() {
    if (gameOverRef.current || !startedRef.current) return;
    const piece = pieceRef.current;
    const board = boardRef.current;

    if (!collides(board, piece, 0, 1)) {
      piece.y += 1;
    } else {
      // Lock
      boardRef.current = lockPiece(board, piece);
      const { board: clearedBoard, cleared } = clearLines(boardRef.current);
      boardRef.current = clearedBoard;

      if (cleared > 0) {
        linesRef.current += cleared;
        scoreRef.current += SCORE_TABLE[cleared] * (levelRef.current + 1);
        levelRef.current = Math.floor(linesRef.current / 10);
        setScore(scoreRef.current);
        setLines(linesRef.current);
        setLevel(levelRef.current);
      }

      // Next piece
      pieceRef.current = nextPieceRef.current;
      nextPieceRef.current = randomPiece();

      // Check game over
      if (collides(boardRef.current, pieceRef.current)) {
        gameOverRef.current = true;
        setGameOver(true);
        if (dropTimerRef.current) clearTimeout(dropTimerRef.current);
        fetchLeaderboard();
      }
    }
    draw();
  }

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (gameOverRef.current) {
      return;
    }
    if (!startedRef.current) {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        resetGame();
      }
      return;
    }

    const piece = pieceRef.current;
    const board = boardRef.current;

    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        e.preventDefault();
        if (!collides(board, piece, -1, 0)) {
          piece.x -= 1;
          draw();
        }
        break;
      case 'ArrowRight':
      case 'KeyD':
        e.preventDefault();
        if (!collides(board, piece, 1, 0)) {
          piece.x += 1;
          draw();
        }
        break;
      case 'ArrowDown':
      case 'KeyS':
        e.preventDefault();
        // Soft drop — NES Tetris gives 1 point per cell
        if (!collides(board, piece, 0, 1)) {
          piece.y += 1;
          scoreRef.current += 1;
          setScore(scoreRef.current);
          draw();
        }
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'KeyX':
        e.preventDefault();
        {
          // NES Tetris: NO wall kicks. If rotation collides, just don't rotate.
          const rotated = rotateMatrix(piece.shape);
          if (!collides(board, piece, 0, 0, rotated)) {
            piece.shape = rotated;
          }
          draw();
        }
        break;
      case 'KeyZ':
        e.preventDefault();
        {
          // Counter-clockwise rotation (rotate 3 times = CCW)
          let rotated = piece.shape;
          for (let i = 0; i < 3; i++) rotated = rotateMatrix(rotated);
          if (!collides(board, piece, 0, 0, rotated)) {
            piece.shape = rotated;
          }
          draw();
        }
        break;
      // No hard drop — NES Tetris doesn't have it
    }
  }, [draw, resetGame]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    draw();
    return () => {
      window.removeEventListener('keydown', handleKey);
      if (dropTimerRef.current) clearTimeout(dropTimerRef.current);
    };
  }, [handleKey, draw]);

  return (
    <div className="tetris-page">
      <header className="tetris-header">
        <button className="back-btn" onClick={() => navigate('/games')}>
          &larr;
        </button>
        <h1>TETRIS</h1>
      </header>

      <div className="tetris-body">
        <div className="tetris-game-area">
          <div className="tetris-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={COLS * BLOCK_SIZE}
              height={ROWS * BLOCK_SIZE}
              className="tetris-canvas"
            />

            {!started && !gameOver && (
              <div className="tetris-overlay">
                <div className="tetris-title">TETRIS</div>
                <div className="tetris-start-hint">Press START</div>
                <button onClick={resetGame}>START</button>
              </div>
            )}

            {gameOver && (
              <div className="tetris-overlay">
                <div className="tetris-gameover-text">GAME OVER</div>
                <div className="tetris-final-score">{score.toLocaleString()}</div>
                <p>LEVEL {level} — {lines} LINES</p>

                {!nameSubmitted && (
                  <div className="tetris-name-form">
                    <input type="text" placeholder="YOUR NAME" value={playerName}
                      onChange={e => setPlayerName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && submitScore()}
                      maxLength={20} autoFocus />
                    <button onClick={submitScore} disabled={submitting || !playerName.trim()}>
                      {submitting ? '...' : 'SAVE'}
                    </button>
                  </div>
                )}

                {nameSubmitted && (
                  <>
                    <p className="tetris-saved">SCORE SAVED!</p>
                    {leaderboard.length > 0 && (
                      <div className="tetris-leaderboard">
                        <h3>TOP SCORES</h3>
                        <ul>
                          {leaderboard.map((entry, i) => (
                            <li key={i}>
                              <span className="lb-rank">{i + 1}.</span>
                              <span className="lb-name">{entry.player_name}</span>
                              <span className="lb-score">{entry.score.toLocaleString()}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <button onClick={resetGame}>PLAY AGAIN</button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="tetris-sidebar">
            <div className="tetris-info-box">
              <label>NEXT</label>
              <canvas
                ref={previewCanvasRef}
                width={90}
                height={72}
                className="tetris-preview"
              />
            </div>
            <div className="tetris-info-box">
              <label>SCORE</label>
              <span className="tetris-stat-value">{score.toLocaleString()}</span>
            </div>
            <div className="tetris-info-box">
              <label>LEVEL</label>
              <span className="tetris-stat-value">{level}</span>
            </div>
            <div className="tetris-info-box">
              <label>LINES</label>
              <span className="tetris-stat-value">{lines}</span>
            </div>
          </div>
        </div>

        <div className="tetris-controls-hint">
          <span>← → / A D MOVE</span>
          <span>↑ / W ROTATE</span>
          <span>↓ / S DROP</span>
          <span>Z/X ROTATE</span>
        </div>
      </div>
    </div>
  );
}
