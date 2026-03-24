import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEscapeBack } from '../hooks/useEscapeBack';
import './TetrisPage.css';

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;

const COLORS: Record<string, string> = {
  I: '#00f0f0',
  O: '#f0f000',
  T: '#a000f0',
  S: '#00f000',
  Z: '#f00000',
  J: '#0000f0',
  L: '#f0a000',
};

const GHOST_COLORS: Record<string, string> = {
  I: 'rgba(0,240,240,0.2)',
  O: 'rgba(240,240,0,0.2)',
  T: 'rgba(160,0,240,0.2)',
  S: 'rgba(0,240,0,0.2)',
  Z: 'rgba(240,0,0,0.2)',
  J: 'rgba(0,0,240,0.2)',
  L: 'rgba(240,160,0,0.2)',
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

function randomPiece(): Piece {
  const type = PIECE_NAMES[Math.floor(Math.random() * PIECE_NAMES.length)];
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

function ghostY(board: Board, piece: Piece): number {
  let dy = 0;
  while (!collides(board, piece, 0, dy + 1)) dy++;
  return piece.y + dy;
}

function getSpeed(level: number): number {
  const speeds = [800, 720, 630, 550, 470, 380, 300, 220, 140, 100, 80, 70, 60, 50, 40];
  return speeds[Math.min(level, speeds.length - 1)];
}

const SCORE_TABLE = [0, 100, 300, 500, 800];

const LS_KEY = 'aebc-tetris-highscore';

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
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem(LS_KEY);
    return saved ? parseInt(saved, 10) : 0;
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const board = boardRef.current;
    const piece = pieceRef.current;

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * BLOCK_SIZE);
      ctx.lineTo(COLS * BLOCK_SIZE, r * BLOCK_SIZE);
      ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * BLOCK_SIZE, 0);
      ctx.lineTo(c * BLOCK_SIZE, ROWS * BLOCK_SIZE);
      ctx.stroke();
    }

    // Board cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]) {
          drawBlock(ctx, c, r, COLORS[board[r][c]!]);
        }
      }
    }

    if (!gameOverRef.current && startedRef.current) {
      // Ghost piece
      const gy = ghostY(board, piece);
      for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
          if (!piece.shape[r][c]) continue;
          const px = piece.x + c;
          const py = gy + r;
          if (py >= 0) {
            ctx.fillStyle = GHOST_COLORS[piece.type];
            ctx.fillRect(px * BLOCK_SIZE + 1, py * BLOCK_SIZE + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
            ctx.strokeStyle = COLORS[piece.type];
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 1;
            ctx.strokeRect(px * BLOCK_SIZE + 1, py * BLOCK_SIZE + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
            ctx.globalAlpha = 1;
          }
        }
      }

      // Current piece
      for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
          if (!piece.shape[r][c]) continue;
          const px = piece.x + c;
          const py = piece.y + r;
          if (py >= 0) {
            drawBlock(ctx, px, py, COLORS[piece.type]);
          }
        }
      }
    }

    // Game over overlay
    if (gameOverRef.current) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('Press Space or Enter to restart', canvas.width / 2, canvas.height / 2 + 15);
    }

    // Not started overlay
    if (!startedRef.current && !gameOverRef.current) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TETRIS', canvas.width / 2, canvas.height / 2 - 30);
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('Click or press Space to start', canvas.width / 2, canvas.height / 2 + 5);
    }

    // Draw preview
    drawPreview();
  }, []);

  function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    const bx = x * BLOCK_SIZE;
    const by = y * BLOCK_SIZE;
    ctx.fillStyle = color;
    ctx.fillRect(bx + 1, by + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(bx + 1, by + 1, BLOCK_SIZE - 2, 3);
    ctx.fillRect(bx + 1, by + 1, 3, BLOCK_SIZE - 2);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(bx + 1, by + BLOCK_SIZE - 4, BLOCK_SIZE - 2, 3);
    ctx.fillRect(bx + BLOCK_SIZE - 4, by + 1, 3, BLOCK_SIZE - 2);
  }

  function drawPreview() {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const next = nextPieceRef.current;
    const previewBlockSize = 20;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const shape = next.shape;
    const offsetX = (canvas.width - shape[0].length * previewBlockSize) / 2;
    const offsetY = (canvas.height - shape.length * previewBlockSize) / 2;

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const bx = offsetX + c * previewBlockSize;
        const by = offsetY + r * previewBlockSize;
        ctx.fillStyle = COLORS[next.type];
        ctx.fillRect(bx + 1, by + 1, previewBlockSize - 2, previewBlockSize - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(bx + 1, by + 1, previewBlockSize - 2, 2);
        ctx.fillRect(bx + 1, by + 1, 2, previewBlockSize - 2);
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

        // High score
        const saved = localStorage.getItem(LS_KEY);
        const hs = saved ? parseInt(saved, 10) : 0;
        if (scoreRef.current > hs) {
          localStorage.setItem(LS_KEY, String(scoreRef.current));
          setHighScore(scoreRef.current);
        }
      }

      // Next piece
      pieceRef.current = nextPieceRef.current;
      nextPieceRef.current = randomPiece();

      // Check game over
      if (collides(boardRef.current, pieceRef.current)) {
        gameOverRef.current = true;
        setGameOver(true);
        if (dropTimerRef.current) clearTimeout(dropTimerRef.current);
        // Final high score check
        const saved = localStorage.getItem(LS_KEY);
        const hs = saved ? parseInt(saved, 10) : 0;
        if (scoreRef.current > hs) {
          localStorage.setItem(LS_KEY, String(scoreRef.current));
          setHighScore(scoreRef.current);
        }
      }
    }
    draw();
  }

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (gameOverRef.current) {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        resetGame();
      }
      return;
    }
    if (!startedRef.current) {
      if (e.code === 'Space') {
        e.preventDefault();
        resetGame();
      }
      return;
    }

    const piece = pieceRef.current;
    const board = boardRef.current;

    switch (e.code) {
      case 'ArrowLeft':
        e.preventDefault();
        if (!collides(board, piece, -1, 0)) {
          piece.x -= 1;
          draw();
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (!collides(board, piece, 1, 0)) {
          piece.x += 1;
          draw();
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!collides(board, piece, 0, 1)) {
          piece.y += 1;
          scoreRef.current += 1;
          setScore(scoreRef.current);
          draw();
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        {
          const rotated = rotateMatrix(piece.shape);
          if (!collides(board, piece, 0, 0, rotated)) {
            piece.shape = rotated;
          } else if (!collides(board, piece, 1, 0, rotated)) {
            piece.x += 1;
            piece.shape = rotated;
          } else if (!collides(board, piece, -1, 0, rotated)) {
            piece.x -= 1;
            piece.shape = rotated;
          } else if (!collides(board, piece, 2, 0, rotated)) {
            piece.x += 2;
            piece.shape = rotated;
          } else if (!collides(board, piece, -2, 0, rotated)) {
            piece.x -= 2;
            piece.shape = rotated;
          }
          draw();
        }
        break;
      case 'Space':
        e.preventDefault();
        // Hard drop
        while (!collides(board, piece, 0, 1)) {
          piece.y += 1;
          scoreRef.current += 2;
        }
        setScore(scoreRef.current);
        drop();
        // Reset drop timer
        scheduleDrop();
        break;
    }
  }, [draw, resetGame, scheduleDrop]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    draw();
    return () => {
      window.removeEventListener('keydown', handleKey);
      if (dropTimerRef.current) clearTimeout(dropTimerRef.current);
    };
  }, [handleKey, draw]);

  function handleCanvasClick() {
    if (!startedRef.current && !gameOverRef.current) {
      resetGame();
    }
  }

  return (
    <div className="tetris-page">
      <header className="tetris-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          ←
        </button>
        <h1>Tetris</h1>
        <div className="tetris-header-stats">
          <span>Score: {score.toLocaleString()}</span>
          <span>Hi: {highScore.toLocaleString()}</span>
        </div>
      </header>

      <div className="tetris-body">
        <div className="tetris-game-area">
          <div className="tetris-sidebar">
            <div className="tetris-info-box">
              <label>Next</label>
              <canvas
                ref={previewCanvasRef}
                width={100}
                height={80}
                className="tetris-preview"
              />
            </div>
            <div className="tetris-info-box">
              <label>Level</label>
              <span className="tetris-stat-value">{level}</span>
            </div>
            <div className="tetris-info-box">
              <label>Lines</label>
              <span className="tetris-stat-value">{lines}</span>
            </div>
            <div className="tetris-info-box">
              <label>Score</label>
              <span className="tetris-stat-value">{score.toLocaleString()}</span>
            </div>
          </div>
          <canvas
            ref={canvasRef}
            width={COLS * BLOCK_SIZE}
            height={ROWS * BLOCK_SIZE}
            className="tetris-canvas"
            onClick={handleCanvasClick}
          />
        </div>

        <div className="tetris-controls-hint">
          <span>← → Move</span>
          <span>↑ Rotate</span>
          <span>↓ Soft Drop</span>
          <span>Space Hard Drop</span>
        </div>
      </div>
    </div>
  );
}
