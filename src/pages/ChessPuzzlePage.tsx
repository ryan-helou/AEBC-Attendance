import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { supabase } from '../lib/supabase';
import './ChessPuzzlePage.css';

const STORAGE_KEY = 'aebc-chess-highscore';

/* ─── Types ─── */
interface Puzzle {
  fen: string;
  moves: string[];
  difficulty: number;
}

interface LeaderboardEntry {
  player_name: string;
  score: number;
}

/* ─── Puzzle Data ─── */
const PUZZLES: Puzzle[] = [
  // Difficulty 1
  { fen: '6k1/5ppp/8/8/8/8/5PPP/R3K3 w - - 0 1', moves: ['a1a8'], difficulty: 1 },
  { fen: '6k1/5ppp/8/8/8/8/5PPP/3QK3 w - - 0 1', moves: ['d1d8'], difficulty: 1 },
  { fen: 'r1bqkbnr/pppp1ppp/2n5/4Q3/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 0 1', moves: ['c6e5'], difficulty: 1 },
  { fen: 'r3k3/8/8/8/8/8/8/4K2R w K - 0 1', moves: ['h1h8'], difficulty: 1 },
  { fen: '6k1/5p1p/5Pp1/8/8/8/1Q6/4K3 w - - 0 1', moves: ['b2h8'], difficulty: 1 },
  { fen: '2r2rk1/5ppp/8/8/8/8/5PPP/1Q2K3 w - - 0 1', moves: ['b1b8'], difficulty: 1 },
  { fen: 'rnbqk2r/pppppppp/5n2/8/3b4/4P3/PPPP1PPP/RNBQKBNR w KQkq - 0 1', moves: ['e3d4'], difficulty: 1 },
  { fen: '4k3/8/8/3n4/8/8/8/R3K3 w - - 0 1', moves: ['a1d1'], difficulty: 1 },
  { fen: '4k3/8/8/8/3r4/8/8/3QK3 w - - 0 1', moves: ['d1d4'], difficulty: 1 },
  { fen: 'R3K3/5PPP/8/8/8/8/5ppp/r5k1 b - - 0 1', moves: ['a1a8'], difficulty: 1 },
  { fen: '4k3/8/8/8/4p3/8/8/3QK3 w - - 0 1', moves: ['d1e2'], difficulty: 1 },
  { fen: '3k4/8/3K4/8/8/8/8/R7 w - - 0 1', moves: ['a1a8'], difficulty: 1 },
  // Difficulty 2
  { fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 1', moves: ['f3g5', 'f6g4', 'g5f7'], difficulty: 2 },
  { fen: '4k3/8/8/8/8/5N2/8/4K2r w - - 0 1', moves: ['f3g1'], difficulty: 2 },
  { fen: 'r3k3/8/8/8/8/8/8/Q3K3 w - - 0 1', moves: ['a1a8'], difficulty: 2 },
  { fen: 'r1bqkb1r/pppppppp/2n2n2/8/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1', moves: ['f1b5'], difficulty: 2 },
  { fen: '4k3/4q3/8/8/3N4/8/8/4K3 w - - 0 1', moves: ['d4c6'], difficulty: 2 },
  { fen: 'r1b1k2r/ppppqppp/2n2n2/2b5/2B1P3/2N2Q2/PPPP1PPP/R1B1K2R w KQkq - 0 1', moves: ['f3f6', 'g7f6', 'c4f7'], difficulty: 2 },
  { fen: '4k3/8/8/8/3r4/8/8/2B1K3 w - - 0 1', moves: ['c1g5'], difficulty: 2 },
  { fen: '2kr4/8/8/8/8/4N3/8/4K3 w - - 0 1', moves: ['e3d5'], difficulty: 2 },
  { fen: '4k3/4q3/4R3/4B3/8/8/8/4K3 w - - 0 1', moves: ['e5c3'], difficulty: 2 },
  { fen: '4k3/8/8/3b1n2/4P3/8/8/4K3 w - - 0 1', moves: ['e4d5'], difficulty: 2 },
  { fen: '1k5r/ppp5/8/8/8/8/8/2KR2Q1 w - - 0 1', moves: ['g1a7', 'b8a7', 'd1d8'], difficulty: 2 },
  { fen: '4K3/4R3/8/8/3n4/8/8/4k3 b - - 0 1', moves: ['d4c6'], difficulty: 2 },
  // Difficulty 3
  { fen: '3qk3/8/8/8/8/4B3/8/3RK3 w - - 0 1', moves: ['e3a7', 'd8d1'], difficulty: 3 },
  { fen: '1r3k2/5ppp/8/8/8/5Q2/5PPP/R5K1 w - - 0 1', moves: ['a1a8', 'b8a8', 'f3f7'], difficulty: 3 },
  { fen: '2rr2k1/5ppp/8/8/8/2B5/5PPP/3R1RK1 w - - 0 1', moves: ['d1d8', 'c8d8', 'f1d1'], difficulty: 3 },
  { fen: '3rkb1r/pp1b1ppp/8/3p4/8/2B5/PPP2PPP/R3K2R w KQ - 0 1', moves: ['c3d4'], difficulty: 3 },
  { fen: '4k3/1q6/4N3/3B4/8/8/8/4K3 w - - 0 1', moves: ['e6c7'], difficulty: 3 },
  { fen: 'r4rk1/ppp2ppp/8/3q4/3P4/2N5/PP3PPP/R2Q1RK1 w - - 0 1', moves: ['c3d5'], difficulty: 3 },
  { fen: '3rk3/8/8/8/8/8/8/R2QK3 w - - 0 1', moves: ['d1d8', 'e8d8', 'a1d1'], difficulty: 3 },
  { fen: '8/8/5k2/8/8/3B4/5q2/4K3 w - - 0 1', moves: ['d3e4'], difficulty: 3 },
  { fen: '2r1k3/8/8/8/8/8/2Q5/4K3 w - - 0 1', moves: ['c2g6'], difficulty: 3 },
  { fen: 'r2qkb1r/ppp1pppp/2n5/3n4/3P4/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 1', moves: ['f1b5', 'a7a6', 'b5c6'], difficulty: 3 },
  { fen: '3r1rk1/pp3ppp/8/3q4/8/8/PP3PPP/3RQRK1 w - - 0 1', moves: ['d1d5', 'd8d5', 'e1e8'], difficulty: 3 },
  { fen: '4k3/4r3/8/8/4B3/8/8/4K2R w - - 0 1', moves: ['h1h8', 'e8d7', 'e4b7'], difficulty: 3 },
  // Difficulty 4
  { fen: 'r1bq1rk1/ppp2ppp/2nb1n2/3pp3/2B1P3/3P1N2/PPPN1PPP/R1BQ1RK1 w - - 0 1', moves: ['c4d5', 'c6d4', 'f3d4'], difficulty: 4 },
  { fen: '2r2rk1/pp3ppp/2p5/8/8/2P2N2/PP3PPP/R4RK1 w - - 0 1', moves: ['f1e1'], difficulty: 4 },
  { fen: 'r4rk1/pp2bppp/2p1pn2/q7/3P4/2NBB3/PPP2PPP/R2Q1RK1 w - - 0 1', moves: ['d3h7', 'f6h7', 'e3a7'], difficulty: 4 },
  { fen: 'r1b3kr/ppp2Npp/1b6/8/8/8/PPP2qPP/RNBQR1K1 w - - 0 1', moves: ['f7h6', 'g8h8', 'e1e8'], difficulty: 4 },
  { fen: 'r1bqr1k1/pppp1ppp/2n2n2/2b5/4P3/2NB1N2/PPPP1PPP/R1BQ1RK1 w - - 0 1', moves: ['d3h7', 'f6h7', 'f3g5'], difficulty: 4 },
  { fen: '2rq1rk1/pp2ppbp/2np2p1/8/2BNP3/2N5/PPP2PPP/R2Q1RK1 w - - 0 1', moves: ['d4c6', 'b7c6', 'c4f7'], difficulty: 4 },
  { fen: 'r2qk2r/ppp1bppp/2np1n2/4p3/2B1P1b1/2NP1N2/PPP2PPP/R1BQ1RK1 w kq - 0 1', moves: ['c4f7', 'e8f7', 'f3g5'], difficulty: 4 },
  { fen: 'r4rk1/pp3ppp/2p1bn2/q3p3/4P3/P1NR4/1PP2PPP/R1BQ2K1 w - - 0 1', moves: ['d3d7'], difficulty: 4 },
  { fen: '1r4k1/5ppp/8/1B6/8/8/5PPP/R5K1 w - - 0 1', moves: ['a1a8', 'b8a8', 'b5e8'], difficulty: 4 },
  { fen: 'r2q1rk1/pppb1ppp/2n2n2/3pp3/1bPP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 1', moves: ['c4d5', 'f6d5', 'c3d5'], difficulty: 4 },
  { fen: 'rnb1kbnr/pppp1ppp/8/4p1q1/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1', moves: ['f3e5'], difficulty: 4 },
  { fen: 'r1b1k2r/ppppqppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 1', moves: ['c4f7', 'e7f7', 'f3e5'], difficulty: 4 },
  // Difficulty 5
  { fen: 'r1b1qrk1/pppp1ppp/2n2n2/2b1p3/2BPP3/2N2N2/PPP2PPP/R1BQ1RK1 w - - 0 1', moves: ['d4d5', 'c6d4', 'f3d4', 'c5d4', 'c4f7'], difficulty: 5 },
  { fen: 'r3r1k1/pp3ppp/2p5/4Nb2/2Bn4/8/PPP2PPP/R2QR1K1 w - - 0 1', moves: ['d1d4', 'f5e6', 'c4e6', 'f7e6', 'd4d8'], difficulty: 5 },
  { fen: 'r4rk1/pppq1ppp/2n1pn2/3p4/3P4/2NBPN2/PPP2PPP/R2Q1RK1 w - - 0 1', moves: ['f3e5', 'c6e5', 'd4e5', 'f6d7', 'd3h7'], difficulty: 5 },
  { fen: 'r1bq1rk1/pp2ppbp/2np2p1/8/3NP3/2N1B3/PPP1BPPP/R2Q1RK1 w - - 0 1', moves: ['d4c6', 'b7c6', 'e3a7'], difficulty: 5 },
  { fen: 'r2q1rk1/pp2ppbp/2n3p1/2pp4/3P4/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 1', moves: ['d4c5', 'd5d4', 'e3d4', 'c6d4', 'f3d4'], difficulty: 5 },
  { fen: '4k3/pppp1ppp/8/4P3/3P4/8/PPP2PPP/4K3 w - - 0 1', moves: ['d4d5', 'c7c6', 'e5e6'], difficulty: 5 },
  { fen: 'r2qr1k1/ppp2ppp/2npbn2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQR1K1 w - - 0 1', moves: ['c4d5', 'e6d5', 'e4d5', 'c6e7', 'f3e5'], difficulty: 5 },
  { fen: 'r1bqk2r/pppp1ppp/2n2n2/4p3/1bB1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1', moves: ['d2d3'], difficulty: 5 },
  { fen: 'r2q1rk1/ppp1bppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 1', moves: ['c4d5', 'e6d5', 'e3e4'], difficulty: 5 },
  { fen: 'r3k2r/ppp1qppp/2n1pn2/3p4/3P1Bb1/2NBPN2/PPP2PPP/R2QK2R w KQkq - 0 1', moves: ['f4c7'], difficulty: 5 },
  { fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1', moves: ['d2d4', 'e5d4', 'f3d4'], difficulty: 5 },
  { fen: 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQ - 0 1', moves: ['c4d5', 'e6d5', 'f1b5', 'c8d7', 'b5c6'], difficulty: 5 },
  { fen: '8/pp3kpp/8/2Pp4/8/8/PP3PPP/4K3 w - d6 0 1', moves: ['c5c6', 'b7c6', 'a2a4'], difficulty: 5 },
  { fen: 'r2q1rk1/pp2bppp/2n1pn2/3pN3/3P4/2N1P3/PP2BPPP/R1BQ1RK1 w - - 0 1', moves: ['e5c6', 'b7c6', 'e3e4'], difficulty: 5 },
];

/* ─── SVG Chess Pieces ─── */
// CBurnett-style SVG piece paths. Each returns an SVG group meant to be placed in a viewBox of "0 0 45 45".
function PieceSVG({ piece, x, y, size }: { piece: string; x: number; y: number; size: number }) {
  const isWhite = piece === piece.toUpperCase();
  const type = piece.toLowerCase();
  const fill = isWhite ? '#fff' : '#333';
  const stroke = isWhite ? '#333' : '#fff';
  const sw = 1.5;

  // Scale factor: pieces designed in 45x45 box, we place them at (x,y) with given size
  const scale = size / 45;
  const pad = size * 0.1; // 10% padding
  const actualScale = (size - pad * 2) / 45;
  const tx = x + pad;
  const ty = y + pad;

  const transform = `translate(${tx}, ${ty}) scale(${actualScale})`;

  switch (type) {
    case 'k': // King
      return (
        <g transform={transform}>
          <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
            {/* Cross on top */}
            <path d="M 22.5 11.63 V 6" strokeWidth={sw} />
            <path d="M 20 8 h 5" strokeWidth={sw} />
            {/* Crown body */}
            <path d="M 22.5 25 c 0 0 4.5 -7.5 3 -10.5 c 0 0 -1.23 -1.5 -3 -0.5 c -1.77 -1 -3 0.5 -3 0.5 c -1.5 3 3 10.5 3 10.5" />
            <path d="M 12.5 37 c 5.5 3.5 14.5 3.5 20 0 v -7 c 0 0 9 -4.5 6 -10.5 c -1.5 -3 -12.5 -2.5 -16 -3.5 c -3.5 1 -14.5 0.5 -16 3.5 c -3 6 6 10.5 6 10.5 v 7" />
            <path d="M 12.5 30 c 5.5 -3 14.5 -3 20 0" fill="none" />
            <path d="M 12.5 33.5 c 5.5 -3 14.5 -3 20 0" fill="none" />
            <path d="M 12.5 37 c 5.5 -3 14.5 -3 20 0" fill="none" />
          </g>
        </g>
      );
    case 'q': // Queen
      return (
        <g transform={transform}>
          <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
            {/* Crown points */}
            <circle cx="6" cy="12" r="2.75" />
            <circle cx="14" cy="9" r="2.75" />
            <circle cx="22.5" cy="8" r="2.75" />
            <circle cx="31" cy="9" r="2.75" />
            <circle cx="39" cy="12" r="2.75" />
            {/* Body */}
            <path d="M 9 26 c 8.5 -1.5 21 -1.5 27 0 l 2.5 -12.5 -7.5 -1 -5.5 6 -5 -8 -5 8 -5.5 -6 -7.5 1 L 9 26 z" />
            <path d="M 9 26 c 0 2 1.5 2 2.5 4 1 1.5 1 1 0.5 3.5 -1.5 1 -2.5 2.5 -2.5 2.5 h 26 c 0 0 -1 -1.5 -2.5 -2.5 -0.5 -2.5 -0.5 -2 0.5 -3.5 1 -2 2.5 -2 2.5 -4 -8.5 -1.5 -18.5 -1.5 -27 0 z" />
            <path d="M 11.5 30 c 3.5 -1 18.5 -1 22 0" fill="none" />
            <path d="M 12 33.5 c 6 -1 15 -1 21 0" fill="none" />
          </g>
        </g>
      );
    case 'r': // Rook
      return (
        <g transform={transform}>
          <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
            <path d="M 9 39 h 27 v -3 H 9 v 3 z" />
            <path d="M 12.5 32 l 1.5 -2.5 h 17 l 1.5 2.5 h -20 z" />
            <path d="M 12 36 v -4 h 21 v 4 H 12 z" />
            <path d="M 14 29.5 v -13 h 17 v 13 H 14 z" />
            <path d="M 14 16.5 L 11 14 h 4 V 9 h 4 v 5 h 7 V 9 h 4 v 5 h 4 l -3 2.5 H 14 z" />
            {!isWhite && (
              <>
                <path d="M 14 29.5 v -13 h 17 v 13 H 14 z" fill="none" stroke={stroke} strokeWidth={0.75} />
              </>
            )}
          </g>
        </g>
      );
    case 'b': // Bishop
      return (
        <g transform={transform}>
          <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
            <path d="M 9 36 c 3.39 -0.97 10.11 0.43 13.5 -2 c 3.39 2.43 10.11 1.03 13.5 2 c 0 0 1.65 0.54 3 2 c -0.68 0.97 -1.65 0.99 -3 0.5 c -3.39 -0.97 -10.11 0.46 -13.5 -1 c -3.39 1.46 -10.11 0.03 -13.5 1 c -1.354 0.49 -2.323 0.47 -3 -0.5 c 1.354 -1.94 3 -2 3 -2 z" />
            <path d="M 15 32 c 2.5 2.5 12.5 2.5 15 0 c 0.5 -1.5 0 -2 0 -2 c 0 -2.5 -2.5 -4 -2.5 -4 c 5.5 -1.5 6 -11.5 -5 -15.5 c -11 4 -10.5 14 -5 15.5 c 0 0 -2.5 1.5 -2.5 4 c 0 0 -0.5 0.5 0 2 z" />
            <circle cx="22.5" cy="8" r="2.5" />
            <path d="M 17.5 26 h 10 M 15 30 h 15" fill="none" stroke={stroke} strokeWidth={sw * 0.67} />
          </g>
        </g>
      );
    case 'n': // Knight
      return (
        <g transform={transform}>
          <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
            <path d="M 22 10 c 10.5 1 16.5 8 16 29 H 7 c 0 -13 5 -15.5 6 -21 c 0 0 1.5 -7 5 -4.5 c 0 0 0.5 1.5 1 2 c -2.5 5.5 -0.7 10.2 4 10.5 c 2.3 0.1 5.1 -3.4 4 -7" />
            <path d="M 9.5 25.5 c 0 0 2 -1 3.5 -1 c 2.5 0 6 1.5 6 1.5" fill="none" />
            <circle cx="14.5" cy="15.5" r="1" fill={stroke} stroke="none" />
            <path d="M 24.55 10.4 l -0.45 1.45 c 0 0 -2.2 -1.7 -3.5 -1 c -1.3 0.7 -0.2 2.1 0 2.5 c 0.2 0.4 -1.7 1 -2 3 l -1.5 1.5" fill="none" stroke={stroke} strokeWidth={sw * 0.5} />
          </g>
        </g>
      );
    case 'p': // Pawn
      return (
        <g transform={transform}>
          <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
            <path d="M 22.5 9 c -2.21 0 -4 1.79 -4 4 c 0 0.89 0.29 1.71 0.78 2.38 C 17.33 16.5 16 18.59 16 21 c 0 2.03 0.94 3.84 2.41 5.03 C 15.41 27.09 11 31.58 11 39.5 h 23 c 0 -7.92 -4.41 -12.41 -7.41 -13.47 C 28.06 24.84 29 23.03 29 21 c 0 -2.41 -1.33 -4.5 -3.28 -5.62 c 0.49 -0.67 0.78 -1.49 0.78 -2.38 c 0 -2.21 -1.79 -4 -4 -4 z" />
          </g>
        </g>
      );
    default:
      return null;
  }
}

/* ─── Board Helpers ─── */
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

function applyMove(board: (string | null)[][], move: string): (string | null)[][] {
  const b = board.map(r => [...r]);
  const fc = move.charCodeAt(0) - 97;
  const fr = 8 - parseInt(move[1]);
  const tc = move.charCodeAt(2) - 97;
  const tr = 8 - parseInt(move[3]);
  const piece = b[fr][fc];
  b[tr][tc] = piece;
  b[fr][fc] = null;
  if (move.length === 5) {
    const promoPiece = move[4];
    if (piece && piece === piece.toUpperCase()) {
      b[tr][tc] = promoPiece.toUpperCase();
    } else {
      b[tr][tc] = promoPiece.toLowerCase();
    }
  }
  return b;
}

function squareName(file: number, rank: number): string {
  return String.fromCharCode(97 + file) + (8 - rank);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ─── Pseudo-legal move generation ─── */
function isOwn(piece: string, color: 'w' | 'b'): boolean {
  return color === 'w' ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
}

function isEnemy(piece: string, color: 'w' | 'b'): boolean {
  return color === 'w' ? piece === piece.toLowerCase() : piece === piece.toUpperCase();
}

function inBounds(r: number, f: number): boolean {
  return r >= 0 && r < 8 && f >= 0 && f < 8;
}

function getLegalMoves(board: (string | null)[][], fromFile: number, fromRank: number, playerColor: 'w' | 'b'): string[] {
  const piece = board[fromRank]?.[fromFile];
  if (!piece) return [];
  if (!isOwn(piece, playerColor)) return [];

  const type = piece.toLowerCase();
  const moves: string[] = [];
  const fromSq = squareName(fromFile, fromRank);

  const addIfValid = (r: number, f: number, captureOnly = false, moveOnly = false) => {
    if (!inBounds(r, f)) return false;
    const target = board[r][f];
    if (target && isOwn(target, playerColor)) return false; // blocked by own piece
    if (captureOnly && (!target || !isEnemy(target, playerColor))) return false;
    if (moveOnly && target) return false;
    moves.push(fromSq + squareName(f, r));
    return !target; // return true if square was empty (can continue sliding)
  };

  const slide = (dr: number, df: number) => {
    for (let i = 1; i < 8; i++) {
      const r = fromRank + dr * i;
      const f = fromFile + df * i;
      if (!inBounds(r, f)) break;
      const target = board[r][f];
      if (target && isOwn(target, playerColor)) break;
      moves.push(fromSq + squareName(f, r));
      if (target) break; // captured enemy, stop sliding
    }
  };

  switch (type) {
    case 'p': {
      const dir = playerColor === 'w' ? -1 : 1;
      const startRank = playerColor === 'w' ? 6 : 1;
      // Forward 1
      if (inBounds(fromRank + dir, fromFile) && !board[fromRank + dir][fromFile]) {
        addIfValid(fromRank + dir, fromFile, false, true);
        // Forward 2 from starting rank
        if (fromRank === startRank && !board[fromRank + dir * 2][fromFile]) {
          addIfValid(fromRank + dir * 2, fromFile, false, true);
        }
      }
      // Diagonal captures
      addIfValid(fromRank + dir, fromFile - 1, true);
      addIfValid(fromRank + dir, fromFile + 1, true);
      break;
    }
    case 'n': {
      const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr, df] of knightMoves) {
        addIfValid(fromRank + dr, fromFile + df);
      }
      break;
    }
    case 'b':
      slide(-1, -1); slide(-1, 1); slide(1, -1); slide(1, 1);
      break;
    case 'r':
      slide(-1, 0); slide(1, 0); slide(0, -1); slide(0, 1);
      break;
    case 'q':
      slide(-1, -1); slide(-1, 1); slide(1, -1); slide(1, 1);
      slide(-1, 0); slide(1, 0); slide(0, -1); slide(0, 1);
      break;
    case 'k': {
      const kingMoves = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
      for (const [dr, df] of kingMoves) {
        addIfValid(fromRank + dr, fromFile + df);
      }
      break;
    }
  }

  return moves;
}

/* ─── Component ─── */
export default function ChessPuzzlePage() {
  const navigate = useNavigate();
  useEscapeBack();

  const sortedPuzzles = useRef(
    [...PUZZLES].sort((a, b) => a.difficulty - b.difficulty)
  );

  const [gameState, setGameState] = useState<'idle' | 'playing' | 'lost'>('idle');
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [moveStep, setMoveStep] = useState(0);
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
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Compute legal moves for selected piece
  const legalMoves = useMemo(() => {
    if (!selectedSquare || gameState !== 'playing') return [];
    const file = selectedSquare.charCodeAt(0) - 97;
    const rank = 8 - parseInt(selectedSquare[1]);
    return getLegalMoves(board, file, rank, playerColor);
  }, [selectedSquare, board, playerColor, gameState]);

  // Timer
  useEffect(() => {
    if (gameState === 'playing') {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState]);

  // Fetch leaderboard on game over
  useEffect(() => {
    if (gameState === 'lost') {
      fetchLeaderboard();
    }
  }, [gameState]);

  const fetchLeaderboard = async () => {
    try {
      const { data } = await supabase
        .from('game_scores')
        .select('*')
        .eq('game', 'chess')
        .order('score', { ascending: false })
        .limit(5);
      if (data) {
        setLeaderboard(data.map((d: any) => ({ player_name: d.player_name, score: d.score })));
      }
    } catch {
      // silently fail
    }
  };

  const submitScore = async () => {
    const trimmed = playerName.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await supabase.from('game_scores').insert({ game: 'chess', player_name: trimmed, score });
      setNameSubmitted(true);
      await fetchLeaderboard();
    } catch {
      // silently fail
    }
    setSubmitting(false);
  };

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
    setLastMove(null);
  }, []);

  const startGame = useCallback(() => {
    setScore(0);
    setLives(3);
    setElapsed(0);
    setGameState('playing');
    setPlayerName('');
    setNameSubmitted(false);
    setLeaderboard([]);
    loadPuzzle(0);
  }, [loadPuzzle]);

  const handleCorrectMove = useCallback((move: string, newBoard: (string | null)[][], currentMoveStep: number) => {
    const destSq = move.slice(2, 4);
    const fromSq = move.slice(0, 2);
    setFlashSquare({ sq: destSq, type: 'correct' });
    setLastMove({ from: fromSq, to: destSq });
    setTimeout(() => setFlashSquare(null), 600);

    const puzzle = sortedPuzzles.current[puzzleIndex];
    const nextStep = currentMoveStep + 1;

    if (nextStep < puzzle.moves.length) {
      setWaitingForOpponent(true);
      setTimeout(() => {
        const opponentMove = puzzle.moves[nextStep];
        const afterOpponent = applyMove(newBoard, opponentMove);
        setBoard(afterOpponent);
        setLastMove({ from: opponentMove.slice(0, 2), to: opponentMove.slice(2, 4) });
        setWaitingForOpponent(false);

        const playerNextStep = nextStep + 1;
        if (playerNextStep < puzzle.moves.length) {
          setMoveStep(playerNextStep);
        } else {
          puzzleSolved();
        }
      }, 400);
    } else {
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
        setTimeout(() => loadPuzzle(0), 700);
      }
    }
  }, [puzzleIndex, score, highScore, loadPuzzle]);

  const handleWrongMove = useCallback((destSq: string) => {
    setFlashSquare({ sq: destSq, type: 'wrong' });
    setTimeout(() => setFlashSquare(null), 600);
    const newLives = lives - 1;
    setLives(newLives);
    if (newLives <= 0) {
      setGameState('lost');
      if (score > highScore) {
        setHighScore(score);
        localStorage.setItem(STORAGE_KEY, String(score));
      }
    }
    setSelectedSquare(null);
  }, [lives, score, highScore]);

  const handleSquareClick = useCallback((file: number, rank: number) => {
    if (gameState !== 'playing' || waitingForOpponent) return;

    const sq = squareName(file, rank);
    const piece = board[rank][file];

    if (!selectedSquare) {
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

      // Re-select own piece
      if (piece) {
        const isWhitePiece = piece === piece.toUpperCase();
        if ((playerColor === 'w' && isWhitePiece) || (playerColor === 'b' && !isWhitePiece)) {
          setSelectedSquare(sq);
          return;
        }
      }

      // Check if it's a legal move visually
      const moveStr = selectedSquare + sq;
      const isLegalVisual = legalMoves.includes(moveStr);

      if (!isLegalVisual) {
        // Clicked non-legal empty square -> deselect
        setSelectedSquare(null);
        return;
      }

      // Attempt the move
      const puzzle = sortedPuzzles.current[puzzleIndex];
      const expectedMove = puzzle.moves[moveStep];

      const isCorrect = moveStr === expectedMove ||
        (expectedMove.length === 5 && moveStr === expectedMove.slice(0, 4));

      if (isCorrect) {
        const actualMove = expectedMove;
        const newBoard = applyMove(board, actualMove);
        setBoard(newBoard);
        setSelectedSquare(null);
        handleCorrectMove(actualMove, newBoard, moveStep);
      } else {
        handleWrongMove(sq);
      }
    }
  }, [gameState, waitingForOpponent, board, selectedSquare, playerColor, puzzleIndex, moveStep, legalMoves, handleCorrectMove, handleWrongMove]);

  /* ─── Render ─── */
  const currentPuzzle = sortedPuzzles.current[puzzleIndex];
  const flipped = playerColor === 'b';

  const renderBoard = () => {
    const elements: React.ReactNode[] = [];
    const sqSize = 100 / 8;

    // Build set of legal move destination squares for quick lookup
    const legalDestSet = new Set<string>();
    const legalCaptureSet = new Set<string>();
    for (const m of legalMoves) {
      const dest = m.slice(2, 4);
      const destFile = dest.charCodeAt(0) - 97;
      const destRank = 8 - parseInt(dest[1]);
      const target = board[destRank]?.[destFile];
      if (target && isEnemy(target, playerColor)) {
        legalCaptureSet.add(dest);
      } else {
        legalDestSet.add(dest);
      }
    }

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const dispR = flipped ? 7 - r : r;
        const dispF = flipped ? 7 - f : f;
        const isLight = (dispR + dispF) % 2 === 0;
        const sq = squareName(dispF, dispR);
        const piece = board[dispR]?.[dispF];

        const x = f * sqSize;
        const y = r * sqSize;

        // Square color
        let fill = isLight ? '#EBECD0' : '#739552';
        const isSelected = selectedSquare === sq;
        const isLastMoveFrom = lastMove?.from === sq;
        const isLastMoveTo = lastMove?.to === sq;

        if (isSelected) {
          fill = isLight ? '#F5F682' : '#B9CA43';
        } else if (isLastMoveFrom || isLastMoveTo) {
          fill = isLight ? '#F5F6A0' : '#BBCC44';
        }

        // Square rect
        elements.push(
          <rect
            key={`sq-${r}-${f}`}
            className="square"
            x={x}
            y={y}
            width={sqSize}
            height={sqSize}
            fill={fill}
            onClick={() => handleSquareClick(dispF, dispR)}
          />
        );

        // Flash overlay
        if (flashSquare && flashSquare.sq === sq) {
          elements.push(
            <rect
              key={`flash-${r}-${f}`}
              className={flashSquare.type === 'correct' ? 'flash-correct' : 'flash-wrong'}
              x={x}
              y={y}
              width={sqSize}
              height={sqSize}
              fill={flashSquare.type === 'correct' ? '#22c55e' : '#ef4444'}
              pointerEvents="none"
            />
          );
        }

        // Piece SVG
        if (piece) {
          elements.push(
            <g
              key={`pc-${r}-${f}`}
              className="piece-group"
              onClick={() => handleSquareClick(dispF, dispR)}
            >
              <PieceSVG piece={piece} x={x} y={y} size={sqSize} />
            </g>
          );
        }

        // Legal move indicators
        if (legalDestSet.has(sq)) {
          // Small dot for empty squares
          elements.push(
            <circle
              key={`dot-${r}-${f}`}
              className="move-dot"
              cx={x + sqSize / 2}
              cy={y + sqSize / 2}
              r={sqSize * 0.14}
              fill="rgba(0,0,0,0.15)"
              onClick={() => handleSquareClick(dispF, dispR)}
              style={{ cursor: 'pointer', pointerEvents: 'all' }}
            />
          );
        }

        if (legalCaptureSet.has(sq)) {
          // Ring around capturable enemies
          elements.push(
            <circle
              key={`cap-${r}-${f}`}
              className="capture-ring"
              cx={x + sqSize / 2}
              cy={y + sqSize / 2}
              r={sqSize * 0.43}
              fill="none"
              stroke="rgba(0,0,0,0.15)"
              strokeWidth={sqSize * 0.08}
              onClick={() => handleSquareClick(dispF, dispR)}
              style={{ cursor: 'pointer', pointerEvents: 'all' }}
            />
          );
        }

        // File labels (bottom row)
        if (r === 7) {
          elements.push(
            <text
              key={`fl-${f}`}
              className="board-label"
              x={x + sqSize - 0.6}
              y={y + sqSize - 0.5}
              fontSize={1.8}
              fill={isLight ? '#739552' : '#EBECD0'}
              textAnchor="end"
              dominantBaseline="auto"
              fontWeight={700}
            >
              {String.fromCharCode(97 + (flipped ? 7 - f : f))}
            </text>
          );
        }

        // Rank labels (left column)
        if (f === 0) {
          elements.push(
            <text
              key={`rl-${r}`}
              className="board-label"
              x={x + 0.6}
              y={y + 2.2}
              fontSize={1.8}
              fill={isLight ? '#739552' : '#EBECD0'}
              textAnchor="start"
              dominantBaseline="auto"
              fontWeight={700}
            >
              {flipped ? r + 1 : 8 - r}
            </text>
          );
        }
      }
    }

    return (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        {elements}
      </svg>
    );
  };

  return (
    <div className="chess-page">
      <header className="chess-header">
        <button className="back-btn" onClick={() => navigate('/games')}>
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
            {[0, 1, 2].map(i => (
              <span key={i} className={`chess-life${i >= lives ? ' lost' : ''}`}>
                {i < lives ? '\u2764\uFE0F' : '\u{1F5A4}'}
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
            <span className="chess-difficulty-stars">
              {[1, 2, 3, 4, 5].map(i => (
                <span key={i} className={i <= currentPuzzle.difficulty ? 'star-filled' : 'star-empty'}>
                  {'\u2605'}
                </span>
              ))}
            </span>
          </div>
        )}

        <div className="chess-board-container">
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
                <div className="final-score">{score}</div>
                <p>puzzles solved in {formatTime(elapsed)}</p>
                {score >= highScore && score > 0 && <p className="new-hs">New high score!</p>}

                {!nameSubmitted && (
                  <div className="chess-name-form">
                    <input
                      type="text"
                      placeholder="Your name"
                      value={playerName}
                      onChange={e => setPlayerName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && submitScore()}
                      maxLength={20}
                      autoFocus
                    />
                    <button onClick={submitScore} disabled={submitting || !playerName.trim()}>
                      {submitting ? '...' : 'Save'}
                    </button>
                  </div>
                )}

                {nameSubmitted && (
                  <>
                    <p style={{ color: '#22c55e', fontSize: '0.85rem' }}>Score saved!</p>

                    {leaderboard.length > 0 && (
                      <div className="chess-leaderboard">
                        <h3>Leaderboard</h3>
                        <ul className="chess-leaderboard-list">
                          {leaderboard.map((entry, i) => (
                            <li key={i}>
                              <span className="lb-rank">{i + 1}.</span>
                              <span className="lb-name">{entry.player_name}</span>
                              <span className="lb-score">{entry.score}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <button onClick={startGame}>Play Again</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {gameState === 'playing' && (
          <div className="chess-puzzle-hint">
            Puzzle {puzzleIndex + 1} of {sortedPuzzles.current.length}
            {waitingForOpponent && ' \u2014 Opponent moving...'}
            {currentPuzzle.moves.length > 1 && !waitingForOpponent && moveStep > 0 && ' \u2014 Keep going!'}
          </div>
        )}
      </div>
    </div>
  );
}
