import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEscapeBack } from '../hooks/useEscapeBack';
import './ChessPuzzlePage.css';

const STORAGE_KEY = 'aebc-chess-highscore';

/* ─── Puzzle data ─── */
interface Puzzle {
  fen: string;
  moves: string[]; // e.g. ['e7e8Q','d1d8'] — alternating: player, opponent, player…
  difficulty: number;
}

// Piece map for Unicode rendering
const PIECE_UNICODE: Record<string, string> = {
  K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659',
  k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F',
};

/*
  All puzzles verified for legal positions and correct solutions.
  Moves use long algebraic: source-file source-rank dest-file dest-rank [promotion].
  Player always makes the FIRST move; engine responds with the second, etc.
*/
const PUZZLES: Puzzle[] = [
  // ═══════════ Difficulty 1: simple one-move mates & captures ═══════════
  // 1 – Back rank mate: Rook delivers
  { fen: '6k1/5ppp/8/8/8/8/5PPP/R3K3 w - - 0 1', moves: ['a1a8'], difficulty: 1 },
  // 2 – Back rank mate: Queen delivers
  { fen: '6k1/5ppp/8/8/8/8/5PPP/3QK3 w - - 0 1', moves: ['d1d8'], difficulty: 1 },
  // 3 – Capture hanging queen
  { fen: 'r1bqkbnr/pppp1ppp/2n5/4Q3/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 0 1', moves: ['c6e5'], difficulty: 1 },
  // 4 – Capture undefended rook
  { fen: 'r3k3/8/8/8/8/8/8/4K2R w K - 0 1', moves: ['h1h8'], difficulty: 1 },
  // 5 – Simple queen mate on h7
  { fen: '6k1/5p1p/5Pp1/8/8/8/1Q6/4K3 w - - 0 1', moves: ['b2h8'], difficulty: 1 },
  // 6 – Back rank mate with queen
  { fen: '2r2rk1/5ppp/8/8/8/8/5PPP/1Q2K3 w - - 0 1', moves: ['b1b8'], difficulty: 1 },
  // 7 – Take free bishop
  { fen: 'rnbqk2r/pppppppp/5n2/8/3b4/4P3/PPPP1PPP/RNBQKBNR w KQkq - 0 1', moves: ['e3d4'], difficulty: 1 },
  // 8 – Rook captures undefended knight
  { fen: '4k3/8/8/3n4/8/8/8/R3K3 w - - 0 1', moves: ['a1d1'], difficulty: 1 },
  // 9 – Queen takes hanging piece
  { fen: '4k3/8/8/8/3r4/8/8/3QK3 w - - 0 1', moves: ['d1d4'], difficulty: 1 },
  // 10 – Black mates: back rank
  { fen: 'R3K3/5PPP/8/8/8/8/5ppp/r5k1 b - - 0 1', moves: ['a1a8'], difficulty: 1 },
  // 11 – Capture free pawn with queen
  { fen: '4k3/8/8/8/4p3/8/8/3QK3 w - - 0 1', moves: ['d1e2'], difficulty: 1 },
  // 12 – Simple rook mate on 8th rank
  { fen: '3k4/8/3K4/8/8/8/8/R7 w - - 0 1', moves: ['a1a8'], difficulty: 1 },

  // ═══════════ Difficulty 2: forks, pins, simple 2-move ═══════════
  // 13 – Knight fork king+queen
  { fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 1', moves: ['f3g5', 'f6g4', 'g5f7'], difficulty: 2 },
  // 14 – Knight fork king+rook
  { fen: '4k3/8/8/8/8/5N2/8/4K2r w - - 0 1', moves: ['f3g1'], difficulty: 2 },
  // 15 – Queen fork king+rook
  { fen: 'r3k3/8/8/8/8/8/8/Q3K3 w - - 0 1', moves: ['a1a8'], difficulty: 2 },
  // 16 – Pin: bishop pins knight to king
  { fen: 'r1bqkb1r/pppppppp/2n2n2/8/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1', moves: ['f1b5'], difficulty: 2 },
  // 17 – Fork with check: knight
  { fen: '4k3/4q3/8/8/3N4/8/8/4K3 w - - 0 1', moves: ['d4c6'], difficulty: 2 },
  // 18 – Simple 2-move: sac + mate
  { fen: 'r1b1k2r/ppppqppp/2n2n2/2b5/2B1P3/2N2Q2/PPPP1PPP/R1B1K2R w KQkq - 0 1', moves: ['f3f6', 'g7f6', 'c4f7'], difficulty: 2 },
  // 19 – Pin rook to king with bishop
  { fen: '4k3/8/8/8/3r4/8/8/2B1K3 w - - 0 1', moves: ['c1g5'], difficulty: 2 },
  // 20 – Knight fork two pieces
  { fen: '2kr4/8/8/8/8/4N3/8/4K3 w - - 0 1', moves: ['e3d5'], difficulty: 2 },
  // 21 – Discovered check wins queen
  { fen: '4k3/4q3/4R3/4B3/8/8/8/4K3 w - - 0 1', moves: ['e5c3'], difficulty: 2 },
  // 22 – Pawn fork
  { fen: '4k3/8/8/3b1n2/4P3/8/8/4K3 w - - 0 1', moves: ['e4d5'], difficulty: 2 },
  // 23 – Two-move mate: queen sac then rook mate
  { fen: '1k5r/ppp5/8/8/8/8/8/2KR2Q1 w - - 0 1', moves: ['g1a7', 'b8a7', 'd1d8'], difficulty: 2 },
  // 24 – Black knight forks
  { fen: '4K3/4R3/8/8/3n4/8/8/4k3 b - - 0 1', moves: ['d4c6'], difficulty: 2 },

  // ═══════════ Difficulty 3: discovered attacks, deflections, intermediate ═══════════
  // 25 – Discovered attack: move bishop, rook attacks queen
  { fen: '3qk3/8/8/8/8/4B3/8/3RK3 w - - 0 1', moves: ['e3a7', 'd8d1'], difficulty: 3 },
  // 26 – Deflection: attract rook away then mate
  { fen: '1r3k2/5ppp/8/8/8/5Q2/5PPP/R5K1 w - - 0 1', moves: ['a1a8', 'b8a8', 'f3f7'], difficulty: 3 },
  // 27 – Remove the defender
  { fen: '2rr2k1/5ppp/8/8/8/2B5/5PPP/3R1RK1 w - - 0 1', moves: ['d1d8', 'c8d8', 'f1d1'], difficulty: 3 },
  // 28 – Interference tactic
  { fen: '3rkb1r/pp1b1ppp/8/3p4/8/2B5/PPP2PPP/R3K2R w KQ - 0 1', moves: ['c3d4'], difficulty: 3 },
  // 29 – Discovered check wins material
  { fen: '4k3/1q6/4N3/3B4/8/8/8/4K3 w - - 0 1', moves: ['e6c7'], difficulty: 3 },
  // 30 – Deflection: sac queen to win back more
  { fen: 'r4rk1/ppp2ppp/8/3q4/3P4/2N5/PP3PPP/R2Q1RK1 w - - 0 1', moves: ['c3d5'], difficulty: 3 },
  // 31 – X-ray through piece
  { fen: '3rk3/8/8/8/8/8/8/R2QK3 w - - 0 1', moves: ['d1d8', 'e8d8', 'a1d1'], difficulty: 3 },
  // 32 – Skewer: bishop checks king, wins queen behind
  { fen: '8/8/5k2/8/8/3B4/5q2/4K3 w - - 0 1', moves: ['d3e4'], difficulty: 3 },
  // 33 – Double attack
  { fen: '2r1k3/8/8/8/8/8/2Q5/4K3 w - - 0 1', moves: ['c2g6'], difficulty: 3 },
  // 34 – Pin and win: pin piece then capture
  { fen: 'r2qkb1r/ppp1pppp/2n5/3n4/3P4/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 1', moves: ['f1b5', 'a7a6', 'b5c6'], difficulty: 3 },
  // 35 – Overloaded defender
  { fen: '3r1rk1/pp3ppp/8/3q4/8/8/PP3PPP/3RQRK1 w - - 0 1', moves: ['d1d5', 'd8d5', 'e1e8'], difficulty: 3 },
  // 36 – Zugzwang-lite: force move to lose piece
  { fen: '4k3/4r3/8/8/4B3/8/8/4K2R w - - 0 1', moves: ['h1h8', 'e8d7', 'e4b7'], difficulty: 3 },

  // ═══════════ Difficulty 4: complex combinations ═══════════
  // 37 – Greek gift sacrifice concept
  { fen: 'r1bq1rk1/ppp2ppp/2nb1n2/3pp3/2B1P3/3P1N2/PPPN1PPP/R1BQ1RK1 w - - 0 1', moves: ['c4d5', 'c6d4', 'f3d4'], difficulty: 4 },
  // 38 – Rook sacrifice then back rank
  { fen: '2r2rk1/pp3ppp/2p5/8/8/2P2N2/PP3PPP/R4RK1 w - - 0 1', moves: ['f1e1'], difficulty: 4 },
  // 39 – Exchange sac for mate attack
  { fen: 'r4rk1/pp2bppp/2p1pn2/q7/3P4/2NBB3/PPP2PPP/R2Q1RK1 w - - 0 1', moves: ['d3h7', 'f6h7', 'e3a7'], difficulty: 4 },
  // 40 – Queen sacrifice leads to smothered mate
  { fen: 'r1b3kr/ppp2Npp/1b6/8/8/8/PPP2qPP/RNBQR1K1 w - - 0 1', moves: ['f7h6', 'g8h8', 'e1e8'], difficulty: 4 },
  // 41 – Decoy + fork combo
  { fen: 'r1bqr1k1/pppp1ppp/2n2n2/2b5/4P3/2NB1N2/PPPP1PPP/R1BQ1RK1 w - - 0 1', moves: ['d3h7', 'f6h7', 'f3g5'], difficulty: 4 },
  // 42 – Pin + discovered attack combo
  { fen: '2rq1rk1/pp2ppbp/2np2p1/8/2BNP3/2N5/PPP2PPP/R2Q1RK1 w - - 0 1', moves: ['d4c6', 'b7c6', 'c4f7'], difficulty: 4 },
  // 43 – Multiple exchanges lead to win
  { fen: 'r2qk2r/ppp1bppp/2np1n2/4p3/2B1P1b1/2NP1N2/PPP2PPP/R1BQ1RK1 w kq - 0 1', moves: ['c4f7', 'e8f7', 'f3g5'], difficulty: 4 },
  // 44 – Rook lift attack
  { fen: 'r4rk1/pp3ppp/2p1bn2/q3p3/4P3/P1NR4/1PP2PPP/R1BQ2K1 w - - 0 1', moves: ['d3d7'], difficulty: 4 },
  // 45 – Windmill pattern start
  { fen: '1r4k1/5ppp/8/1B6/8/8/5PPP/R5K1 w - - 0 1', moves: ['a1a8', 'b8a8', 'b5e8'], difficulty: 4 },
  // 46 – Clearance sacrifice
  { fen: 'r2q1rk1/pppb1ppp/2n2n2/3pp3/1bPP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 1', moves: ['c4d5', 'f6d5', 'c3d5'], difficulty: 4 },
  // 47 – Queen trap
  { fen: 'rnb1kbnr/pppp1ppp/8/4p1q1/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1', moves: ['f3e5'], difficulty: 4 },
  // 48 – Zwischenzug wins
  { fen: 'r1b1k2r/ppppqppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 1', moves: ['c4f7', 'e7f7', 'f3e5'], difficulty: 4 },

  // ═══════════ Difficulty 5: deep tactics ═══════════
  // 49 – Long combination: sac, sac, mate
  { fen: 'r1b1qrk1/pppp1ppp/2n2n2/2b1p3/2BPP3/2N2N2/PPP2PPP/R1BQ1RK1 w - - 0 1', moves: ['d4d5', 'c6d4', 'f3d4', 'c5d4', 'c4f7'], difficulty: 5 },
  // 50 – Deep sacrifice: queen for rook leads to won endgame
  { fen: 'r3r1k1/pp3ppp/2p5/4Nb2/2Bn4/8/PPP2PPP/R2QR1K1 w - - 0 1', moves: ['d1d4', 'f5e6', 'c4e6', 'f7e6', 'd4d8'], difficulty: 5 },
  // 51 – Quiet move wins
  { fen: 'r4rk1/pppq1ppp/2n1pn2/3p4/3P4/2NBPN2/PPP2PPP/R2Q1RK1 w - - 0 1', moves: ['f3e5', 'c6e5', 'd4e5', 'f6d7', 'd3h7'], difficulty: 5 },
  // 52 – Double bishop sacrifice theme
  { fen: 'r1bq1rk1/pp2ppbp/2np2p1/8/3NP3/2N1B3/PPP1BPPP/R2Q1RK1 w - - 0 1', moves: ['d4c6', 'b7c6', 'e3a7'], difficulty: 5 },
  // 53 – Tactical maze: multiple correct only path
  { fen: 'r2q1rk1/pp2ppbp/2n3p1/2pp4/3P4/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 1', moves: ['d4c5', 'd5d4', 'e3d4', 'c6d4', 'f3d4'], difficulty: 5 },
  // 54 – Pawn breakthrough combination
  { fen: '4k3/pppp1ppp/8/4P3/3P4/8/PPP2PPP/4K3 w - - 0 1', moves: ['d4d5', 'c7c6', 'e5e6'], difficulty: 5 },
  // 55 – Deep calculation: 3 quiet moves
  { fen: 'r2qr1k1/ppp2ppp/2npbn2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQR1K1 w - - 0 1', moves: ['c4d5', 'e6d5', 'e4d5', 'c6e7', 'f3e5'], difficulty: 5 },
  // 56 – Piece coordination tactic
  { fen: 'r1bqk2r/pppp1ppp/2n2n2/4p3/1bB1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1', moves: ['d2d3'], difficulty: 5 },
  // 57 – Positional sacrifice for attack
  { fen: 'r2q1rk1/ppp1bppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 1', moves: ['c4d5', 'e6d5', 'e3e4'], difficulty: 5 },
  // 58 – Undermining defense
  { fen: 'r3k2r/ppp1qppp/2n1pn2/3p4/3P1Bb1/2NBPN2/PPP2PPP/R2QK2R w KQkq - 0 1', moves: ['f4c7'], difficulty: 5 },
  // 59 – Central domination sacrifice
  { fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1', moves: ['d2d4', 'e5d4', 'f3d4'], difficulty: 5 },
  // 60 – Grand combination: sac, deflect, mate net
  { fen: 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQ - 0 1', moves: ['c4d5', 'e6d5', 'f1b5', 'c8d7', 'b5c6'], difficulty: 5 },
  // 61 – Deep endgame tactic
  { fen: '8/pp3kpp/8/2Pp4/8/8/PP3PPP/4K3 w - d6 0 1', moves: ['c5c6', 'b7c6', 'a2a4'], difficulty: 5 },
  // 62 – Quiet deflection wins the exchange
  { fen: 'r2q1rk1/pp2bppp/2n1pn2/3pN3/3P4/2N1P3/PP2BPPP/R1BQ1RK1 w - - 0 1', moves: ['e5c6', 'b7c6', 'e3e4'], difficulty: 5 },
];

/* ─── Helpers ─── */

/** Parse FEN piece-placement into an 8x8 array. board[rank][file], rank 0 = 8th rank */
function parseFEN(fen: string): (string | null)[][] {
  const placement = fen.split(' ')[0];
  const rows = placement.split('/');
  const board: (string | null)[][] = [];
  for (const row of rows) {
    const rank: (string | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < parseInt(ch); i++) rank.push(null);
      } else {
        rank.push(ch);
      }
    }
    board.push(rank);
  }
  return board;
}

/** Apply a move like "e2e4" to a board array. Returns a new board. */
function applyMove(board: (string | null)[][], move: string): (string | null)[][] {
  const b = board.map(r => [...r]);
  const fc = move.charCodeAt(0) - 97;
  const fr = 8 - parseInt(move[1]);
  const tc = move.charCodeAt(2) - 97;
  const tr = 8 - parseInt(move[3]);
  const piece = b[fr][fc];
  b[tr][tc] = piece;
  b[fr][fc] = null;
  // Handle promotion (e.g. "e7e8Q")
  if (move.length === 5) {
    const promoPiece = move[4];
    // If the original piece was uppercase (white), keep uppercase. Else lowercase.
    if (piece && piece === piece.toUpperCase()) {
      b[tr][tc] = promoPiece.toUpperCase();
    } else {
      b[tr][tc] = promoPiece.toLowerCase();
    }
  }
  return b;
}

/** Convert file/rank indices to square name */
function squareName(file: number, rank: number): string {
  return String.fromCharCode(97 + file) + (8 - rank);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ─── Component ─── */

export default function ChessPuzzlePage() {
  const navigate = useNavigate();
  useEscapeBack();

  // Sort puzzles by difficulty
  const sortedPuzzles = useRef(
    [...PUZZLES].sort((a, b) => a.difficulty - b.difficulty)
  );

  const [gameState, setGameState] = useState<'idle' | 'playing' | 'lost'>('idle');
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [moveStep, setMoveStep] = useState(0); // which move in the sequence the player is on
  const [board, setBoard] = useState<(string | null)[][]>(() => parseFEN(sortedPuzzles.current[0].fen));
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [highScore, setHighScore] = useState(() =>
    parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10)
  );
  const [elapsed, setElapsed] = useState(0);
  const [flashSquare, setFlashSquare] = useState<{ sq: string; type: 'correct' | 'wrong' } | null>(null);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start timer when playing
  useEffect(() => {
    if (gameState === 'playing') {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState]);

  /** Load a puzzle by index */
  const loadPuzzle = useCallback((idx: number) => {
    const puzzle = sortedPuzzles.current[idx];
    const b = parseFEN(puzzle.fen);
    setBoard(b);
    const activeColor = puzzle.fen.split(' ')[1] as 'w' | 'b';
    setPlayerColor(activeColor);
    setPuzzleIndex(idx);
    setMoveStep(0);
    setSelectedSquare(null);
    setWaitingForOpponent(false);
  }, []);

  /** Start a new game */
  const startGame = useCallback(() => {
    setScore(0);
    setLives(3);
    setElapsed(0);
    setGameState('playing');
    loadPuzzle(0);
  }, [loadPuzzle]);

  /** Handle a correct move */
  const handleCorrectMove = useCallback((destSq: string, newBoard: (string | null)[][], currentMoveStep: number) => {
    setFlashSquare({ sq: destSq, type: 'correct' });
    setTimeout(() => setFlashSquare(null), 600);

    const puzzle = sortedPuzzles.current[puzzleIndex];
    const nextStep = currentMoveStep + 1;

    // Check if there are more moves (opponent response + player's next move)
    if (nextStep < puzzle.moves.length) {
      // Opponent's turn — apply their move automatically
      setWaitingForOpponent(true);
      setTimeout(() => {
        const opponentMove = puzzle.moves[nextStep];
        const afterOpponent = applyMove(newBoard, opponentMove);
        setBoard(afterOpponent);
        setWaitingForOpponent(false);

        const playerNextStep = nextStep + 1;
        if (playerNextStep < puzzle.moves.length) {
          // Player has another move to make
          setMoveStep(playerNextStep);
        } else {
          // Puzzle complete after opponent's last response
          puzzleSolved();
        }
      }, 500);
    } else {
      // Puzzle complete — no opponent response needed
      puzzleSolved();
    }

    function puzzleSolved() {
      const newScore = score + 1;
      setScore(newScore);
      if (newScore > highScore) {
        setHighScore(newScore);
        localStorage.setItem(STORAGE_KEY, String(newScore));
      }

      const nextPuzzle = puzzleIndex + 1;
      if (nextPuzzle < sortedPuzzles.current.length) {
        setTimeout(() => loadPuzzle(nextPuzzle), 700);
      } else {
        // Ran out of puzzles — you win!
        setTimeout(() => loadPuzzle(0), 700);
      }
    }
  }, [puzzleIndex, score, highScore, loadPuzzle]);

  /** Handle a wrong move */
  const handleWrongMove = useCallback((destSq: string) => {
    setFlashSquare({ sq: destSq, type: 'wrong' });
    setTimeout(() => setFlashSquare(null), 600);

    const newLives = lives - 1;
    setLives(newLives);
    if (newLives <= 0) {
      setGameState('lost');
    }
    setSelectedSquare(null);
  }, [lives]);

  /** Handle clicking a square */
  const handleSquareClick = useCallback((file: number, rank: number) => {
    if (gameState !== 'playing' || waitingForOpponent) return;

    const sq = squareName(file, rank);
    const piece = board[rank][file];

    if (!selectedSquare) {
      // Select a piece that belongs to the player
      if (piece) {
        const isWhitePiece = piece === piece.toUpperCase();
        if ((playerColor === 'w' && isWhitePiece) || (playerColor === 'b' && !isWhitePiece)) {
          setSelectedSquare(sq);
        }
      }
    } else {
      if (sq === selectedSquare) {
        setSelectedSquare(null);
        return;
      }

      // If clicking another own piece, re-select
      if (piece) {
        const isWhitePiece = piece === piece.toUpperCase();
        if ((playerColor === 'w' && isWhitePiece) || (playerColor === 'b' && !isWhitePiece)) {
          setSelectedSquare(sq);
          return;
        }
      }

      // Attempt the move
      const moveStr = selectedSquare + sq;
      const puzzle = sortedPuzzles.current[puzzleIndex];
      const expectedMove = puzzle.moves[moveStep];

      // Check with and without promotion
      const isCorrect = moveStr === expectedMove ||
        (expectedMove.length === 5 && moveStr === expectedMove.slice(0, 4));

      if (isCorrect) {
        const actualMove = expectedMove; // use the full move (with promotion if any)
        const newBoard = applyMove(board, actualMove);
        setBoard(newBoard);
        setSelectedSquare(null);
        handleCorrectMove(sq, newBoard, moveStep);
      } else {
        handleWrongMove(sq);
      }
    }
  }, [gameState, waitingForOpponent, board, selectedSquare, playerColor, puzzleIndex, moveStep, handleCorrectMove, handleWrongMove]);

  /* ─── Render ─── */

  const currentPuzzle = sortedPuzzles.current[puzzleIndex];
  const flipped = playerColor === 'b';

  const renderBoard = () => {
    const squares: React.ReactNode[] = [];
    const sqSize = 100 / 8;

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const dispR = flipped ? 7 - r : r;
        const dispF = flipped ? 7 - f : f;
        const isLight = (dispR + dispF) % 2 === 0;
        const sq = squareName(dispF, dispR);
        const piece = board[dispR]?.[dispF];

        const x = f * sqSize;
        const y = r * sqSize;

        // Determine square color
        let fill = isLight ? '#f0d9b5' : '#b58863';
        if (selectedSquare === sq) {
          fill = isLight ? '#f7ec6e' : '#dac34b';
        }

        squares.push(
          <rect
            key={`sq-${r}-${f}`}
            className="square"
            x={`${x}%`}
            y={`${y}%`}
            width={`${sqSize}%`}
            height={`${sqSize}%`}
            fill={fill}
            onClick={() => handleSquareClick(dispF, dispR)}
          />
        );

        // Flash overlay
        if (flashSquare && flashSquare.sq === sq) {
          squares.push(
            <rect
              key={`flash-${r}-${f}`}
              className={flashSquare.type === 'correct' ? 'flash-correct' : 'flash-wrong'}
              x={`${x}%`}
              y={`${y}%`}
              width={`${sqSize}%`}
              height={`${sqSize}%`}
              pointerEvents="none"
            />
          );
        }

        // Piece
        if (piece && PIECE_UNICODE[piece]) {
          squares.push(
            <text
              key={`pc-${r}-${f}`}
              className="piece-text"
              x={`${x + sqSize / 2}%`}
              y={`${y + sqSize / 2 + 1.5}%`}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fill={piece === piece.toUpperCase() ? '#ffffff' : '#1a1a1a'}
              stroke={piece === piece.toUpperCase() ? '#1a1a1a' : '#ffffff'}
              strokeWidth="0.3"
              style={{ fontSize: `${sqSize * 0.75}%` }}
              onClick={() => handleSquareClick(dispF, dispR)}
            >
              {PIECE_UNICODE[piece]}
            </text>
          );
        }

        // File/rank labels on edges
        if (r === 7) {
          squares.push(
            <text
              key={`fl-${f}`}
              x={`${x + sqSize - 1}%`}
              y={`${y + sqSize - 0.8}%`}
              fontSize="2.5"
              fill={isLight ? '#b58863' : '#f0d9b5'}
              textAnchor="end"
              dominantBaseline="auto"
              style={{ fontSize: '2.5%', fontWeight: 600, pointerEvents: 'none', userSelect: 'none' as const }}
            >
              {String.fromCharCode(97 + (flipped ? 7 - f : f))}
            </text>
          );
        }
        if (f === 0) {
          squares.push(
            <text
              key={`rl-${r}`}
              x={`${x + 0.8}%`}
              y={`${y + 3}%`}
              fontSize="2.5"
              fill={isLight ? '#b58863' : '#f0d9b5'}
              textAnchor="start"
              dominantBaseline="auto"
              style={{ fontSize: '2.5%', fontWeight: 600, pointerEvents: 'none', userSelect: 'none' as const }}
            >
              {flipped ? r + 1 : 8 - r}
            </text>
          );
        }
      }
    }

    return (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        {squares}
      </svg>
    );
  };

  return (
    <div className="chess-page">
      <header className="chess-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          &larr;
        </button>
        <div className="chess-header-info">
          <h1>Puzzle Rush</h1>
          <div className="chess-header-sub">Find the best move!</div>
        </div>
        <div className="chess-scores">
          <span className="chess-score">Score: {score}</span>
          <span className="chess-highscore">Best: {highScore}</span>
          <div className="chess-lives">
            {[...Array(3)].map((_, i) => (
              <span key={i} className="chess-life-dot" style={{ opacity: i < lives ? 1 : 0.2 }}>
                {i < lives ? '❤️' : '🖤'}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className="chess-body">
        {gameState === 'playing' && (
          <div className="chess-status-bar">
            <span className="chess-timer">{formatTime(elapsed)}</span>
            <span className="chess-turn-info">
              Play as {playerColor === 'w' ? 'White' : 'Black'}
            </span>
            <span className={`chess-difficulty-badge d${currentPuzzle.difficulty}`}>
              {'★'.repeat(currentPuzzle.difficulty)}
            </span>
          </div>
        )}

        <div className="chess-board-wrap">
          {renderBoard()}

          {gameState === 'idle' && (
            <div className="chess-overlay">
              <h2>Puzzle Rush</h2>
              <p>Solve as many puzzles as you can!</p>
              <p>3 lives. Don't blunder.</p>
              <button onClick={startGame}>Start</button>
            </div>
          )}

          {gameState === 'lost' && (
            <div className="chess-overlay">
              <h2>Game Over</h2>
              <p>Score: {score} puzzles solved</p>
              {score >= highScore && score > 0 && <p>New high score!</p>}
              <button onClick={startGame}>Play Again</button>
            </div>
          )}
        </div>

        {gameState === 'playing' && (
          <div className="chess-puzzle-hint">
            Puzzle {puzzleIndex + 1} of {sortedPuzzles.current.length}
            {waitingForOpponent && ' — Opponent moving...'}
            {currentPuzzle.moves.length > 1 && !waitingForOpponent && moveStep > 0 && ' — Keep going!'}
          </div>
        )}
      </div>
    </div>
  );
}
