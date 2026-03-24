import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEscapeBack } from '../hooks/useEscapeBack';
import './BreakoutPage.css';

const STORAGE_KEY = 'aebc-breakout-highscore';
const COLS = 10;
const ROWS = 6;
const BRICK_GAP = 3;
const BALL_RADIUS = 5;
const PADDLE_HEIGHT = 10;
const PADDLE_WIDTH = 70;
const BALL_SPEED = 4;

const ROW_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];

interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  alive: boolean;
  color: string;
  row: number;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export default function BreakoutPage() {
  const navigate = useNavigate();
  useEscapeBack();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() =>
    parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10)
  );
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'won' | 'lost'>('idle');

  const gameRef = useRef({
    paddle: { x: 0, w: PADDLE_WIDTH },
    ball: { x: 0, y: 0, vx: BALL_SPEED * 0.7, vy: -BALL_SPEED } as Ball,
    bricks: [] as Brick[],
    score: 0,
    lives: 3,
    animId: 0,
    canvasW: 0,
    canvasH: 0,
    launched: false,
  });

  const mouseXRef = useRef<number | null>(null);

  const initBricks = useCallback((cw: number, ch: number): Brick[] => {
    const brickTop = 40;
    const brickH = 16;
    const totalGapX = BRICK_GAP * (COLS + 1);
    const brickW = (cw - totalGapX) / COLS;
    const bricks: Brick[] = [];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        bricks.push({
          x: BRICK_GAP + c * (brickW + BRICK_GAP),
          y: brickTop + r * (brickH + BRICK_GAP),
          w: brickW,
          h: brickH,
          alive: true,
          color: ROW_COLORS[r % ROW_COLORS.length],
          row: r,
        });
      }
    }
    return bricks;
  }, []);

  const resetBall = useCallback((g: typeof gameRef.current) => {
    g.ball.x = g.paddle.x + g.paddle.w / 2;
    g.ball.y = g.canvasH - PADDLE_HEIGHT - BALL_RADIUS - 2;
    g.ball.vx = BALL_SPEED * (Math.random() > 0.5 ? 0.7 : -0.7);
    g.ball.vy = -BALL_SPEED;
    g.launched = false;
  }, []);

  const initGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const g = gameRef.current;
    g.canvasW = cw;
    g.canvasH = ch;
    g.paddle.x = cw / 2 - PADDLE_WIDTH / 2;
    g.paddle.w = PADDLE_WIDTH;
    g.bricks = initBricks(cw, ch);
    g.score = 0;
    g.lives = 3;
    g.launched = false;
    resetBall(g);
    setScore(0);
    setLives(3);
  }, [initBricks, resetBall]);

  // Resize canvas to container
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    function resize() {
      const rect = container!.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(Math.min(rect.width * 1.2, window.innerHeight - 120));
      canvas!.width = w;
      canvas!.height = h;
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Init on mount
  useEffect(() => {
    initGame();
  }, [initGame]);

  // Mouse / touch tracking
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseXRef.current = e.clientX - rect.left;
    }
    function handleTouchMove(e: TouchEvent) {
      e.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      mouseXRef.current = e.touches[0].clientX - rect.left;
    }

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  // Click/tap to launch or restart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleClick() {
      const g = gameRef.current;
      if (gameState === 'idle') {
        setGameState('playing');
        return;
      }
      if (gameState === 'won' || gameState === 'lost') {
        initGame();
        setGameState('playing');
        return;
      }
      if (!g.launched) {
        g.launched = true;
      }
    }

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchstart', handleClick, { passive: true });
    return () => {
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('touchstart', handleClick);
    };
  }, [gameState, initGame]);

  // Space/Enter to launch or restart
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        const g = gameRef.current;
        if (gameState === 'idle') {
          setGameState('playing');
          return;
        }
        if (gameState === 'won' || gameState === 'lost') {
          initGame();
          setGameState('playing');
          return;
        }
        if (!g.launched) {
          g.launched = true;
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [gameState, initGame]);

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const g = gameRef.current;

    function update() {
      const cw = canvas!.width;
      const ch = canvas!.height;

      // Update paddle position
      if (mouseXRef.current !== null) {
        g.paddle.x = Math.max(0, Math.min(cw - g.paddle.w, mouseXRef.current - g.paddle.w / 2));
      }

      if (!g.launched) {
        g.ball.x = g.paddle.x + g.paddle.w / 2;
        g.ball.y = ch - PADDLE_HEIGHT - BALL_RADIUS - 2;
      } else {
        // Move ball
        g.ball.x += g.ball.vx;
        g.ball.y += g.ball.vy;

        // Wall collisions
        if (g.ball.x - BALL_RADIUS <= 0) {
          g.ball.x = BALL_RADIUS;
          g.ball.vx = Math.abs(g.ball.vx);
        }
        if (g.ball.x + BALL_RADIUS >= cw) {
          g.ball.x = cw - BALL_RADIUS;
          g.ball.vx = -Math.abs(g.ball.vx);
        }
        if (g.ball.y - BALL_RADIUS <= 0) {
          g.ball.y = BALL_RADIUS;
          g.ball.vy = Math.abs(g.ball.vy);
        }

        // Paddle collision
        const paddleTop = ch - PADDLE_HEIGHT;
        if (
          g.ball.vy > 0 &&
          g.ball.y + BALL_RADIUS >= paddleTop &&
          g.ball.y + BALL_RADIUS <= paddleTop + PADDLE_HEIGHT + 4 &&
          g.ball.x >= g.paddle.x &&
          g.ball.x <= g.paddle.x + g.paddle.w
        ) {
          g.ball.y = paddleTop - BALL_RADIUS;
          // Angle based on where ball hits paddle
          const hitPos = (g.ball.x - g.paddle.x) / g.paddle.w; // 0 to 1
          const angle = (hitPos - 0.5) * Math.PI * 0.7; // -63° to 63°
          const speed = Math.sqrt(g.ball.vx ** 2 + g.ball.vy ** 2);
          g.ball.vx = speed * Math.sin(angle);
          g.ball.vy = -speed * Math.cos(angle);
        }

        // Ball lost
        if (g.ball.y - BALL_RADIUS > ch) {
          g.lives--;
          setLives(g.lives);
          if (g.lives <= 0) {
            setGameState('lost');
            return;
          }
          resetBall(g);
        }

        // Brick collisions
        for (const brick of g.bricks) {
          if (!brick.alive) continue;
          if (
            g.ball.x + BALL_RADIUS > brick.x &&
            g.ball.x - BALL_RADIUS < brick.x + brick.w &&
            g.ball.y + BALL_RADIUS > brick.y &&
            g.ball.y - BALL_RADIUS < brick.y + brick.h
          ) {
            brick.alive = false;
            g.score += (ROWS - brick.row) * 10;
            setScore(g.score);

            // Update high score
            if (g.score > parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10)) {
              localStorage.setItem(STORAGE_KEY, String(g.score));
              setHighScore(g.score);
            }

            // Determine bounce direction
            const overlapLeft = g.ball.x + BALL_RADIUS - brick.x;
            const overlapRight = brick.x + brick.w - (g.ball.x - BALL_RADIUS);
            const overlapTop = g.ball.y + BALL_RADIUS - brick.y;
            const overlapBottom = brick.y + brick.h - (g.ball.y - BALL_RADIUS);
            const minOverlapX = Math.min(overlapLeft, overlapRight);
            const minOverlapY = Math.min(overlapTop, overlapBottom);

            if (minOverlapX < minOverlapY) {
              g.ball.vx = -g.ball.vx;
            } else {
              g.ball.vy = -g.ball.vy;
            }
            break; // one brick per frame
          }
        }

        // Win check
        if (g.bricks.every(b => !b.alive)) {
          setGameState('won');
          return;
        }
      }
    }

    function draw() {
      const cw = canvas!.width;
      const ch = canvas!.height;
      ctx.clearRect(0, 0, cw, ch);

      // Background
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim() || '#ffffff';
      ctx.fillRect(0, 0, cw, ch);

      // Bricks
      for (const brick of g.bricks) {
        if (!brick.alive) continue;
        ctx.fillStyle = brick.color;
        ctx.beginPath();
        ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 3);
        ctx.fill();
      }

      // Paddle
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim() || '#1e293b';
      ctx.beginPath();
      ctx.roundRect(g.paddle.x, ch - PADDLE_HEIGHT, g.paddle.w, PADDLE_HEIGHT, 5);
      ctx.fill();

      // Ball
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#2563eb';
      ctx.beginPath();
      ctx.arc(g.ball.x, g.ball.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Lives indicator
      for (let i = 0; i < g.lives; i++) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(cw - 15 - i * 20, ch - 25, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function loop() {
      update();
      draw();
      g.animId = requestAnimationFrame(loop);
    }

    g.animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(g.animId);
  }, [gameState, resetBall]);

  // Draw idle/end state
  useEffect(() => {
    if (gameState === 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const cw = canvas.width;
    const ch = canvas.height;
    const g = gameRef.current;

    // Draw current state
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim() || '#ffffff';
    ctx.fillRect(0, 0, cw, ch);

    // Draw bricks
    for (const brick of g.bricks) {
      if (!brick.alive) continue;
      ctx.fillStyle = brick.color;
      ctx.beginPath();
      ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 3);
      ctx.fill();
    }

    // Draw paddle
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim() || '#1e293b';
    ctx.beginPath();
    ctx.roundRect(g.paddle.x, ch - PADDLE_HEIGHT, g.paddle.w, PADDLE_HEIGHT, 5);
    ctx.fill();

    // Ball
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#2563eb';
    ctx.beginPath();
    ctx.arc(g.ball.x, g.ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, cw, ch);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';

    if (gameState === 'idle') {
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('Click or press Space to start', cw / 2, ch / 2);
      ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('Move mouse to control paddle', cw / 2, ch / 2 + 28);
    } else if (gameState === 'won') {
      ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('You Win!', cw / 2, ch / 2 - 20);
      ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(`Score: ${g.score}`, cw / 2, ch / 2 + 14);
      if (g.score >= parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10)) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText('New High Score!', cw / 2, ch / 2 + 40);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('Click or press Space to play again', cw / 2, ch / 2 + 68);
    } else if (gameState === 'lost') {
      ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('Game Over', cw / 2, ch / 2 - 20);
      ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(`Score: ${g.score}`, cw / 2, ch / 2 + 14);
      if (g.score >= parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) && g.score > 0) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText('New High Score!', cw / 2, ch / 2 + 40);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('Click or press Space to try again', cw / 2, ch / 2 + 68);
    }
  }, [gameState]);

  return (
    <div className="breakout-page">
      <div className="breakout-header">
        <button className="back-btn" onClick={() => navigate('/games')}>
          &larr;
        </button>
        <div className="breakout-header-info">
          <h1>Breakout</h1>
        </div>
        <div className="breakout-scores">
          <span className="breakout-lives">
            {Array.from({ length: lives }).map((_, i) => (
              <span key={i} className="breakout-life-dot" />
            ))}
          </span>
          <span className="breakout-score">Score: {score}</span>
          <span className="breakout-highscore">Best: {highScore}</span>
        </div>
      </div>

      <div className="breakout-body">
        <div className="breakout-board" ref={containerRef}>
          <canvas ref={canvasRef} className="breakout-canvas" />
        </div>
      </div>
    </div>
  );
}
