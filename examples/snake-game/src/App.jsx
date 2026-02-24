/**
 * Snake — NoVoice Community App
 * Uses window.NoVoice.storage for persistent high score.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';

const COLS = 20;
const ROWS = 20;
const CELL = 20;
const SPEED = 120; // ms per tick

const DIR = {
  UP:    { x: 0, y: -1 },
  DOWN:  { x: 0, y:  1 },
  LEFT:  { x: -1, y: 0 },
  RIGHT: { x:  1, y: 0 },
};

function randomFood(snake) {
  const occupied = new Set(snake.map((s) => `${s.x},${s.y}`));
  let cell;
  do {
    cell = {
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS),
    };
  } while (occupied.has(`${cell.x},${cell.y}`));
  return cell;
}

const INIT_SNAKE = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
const INIT_FOOD  = { x: 15, y: 10 };

export default function SnakeApp() {
  const [snake, setSnake]       = useState(INIT_SNAKE);
  const [food, setFood]         = useState(INIT_FOOD);
  const [phase, setPhase]       = useState('idle'); // idle | playing | dead
  const [score, setScore]       = useState(0);
  const [highScore, setHighScore] = useState(0);

  // Refs for the game loop — avoid stale closures
  const snakeR    = useRef(INIT_SNAKE);
  const foodR     = useRef(INIT_FOOD);
  const dirR      = useRef(DIR.RIGHT);
  const nextDirR  = useRef(DIR.RIGHT);
  const phaseR    = useRef('idle');
  const scoreR    = useRef(0);

  // Load high score from NoVoice storage once
  useEffect(() => {
    const hs = window.NoVoice?.storage.get('hs');
    if (typeof hs === 'number') setHighScore(hs);
  }, []);

  // Keyboard controls
  useEffect(() => {
    function onKey(e) {
      const keyMap = {
        ArrowUp: DIR.UP,    w: DIR.UP,
        ArrowDown: DIR.DOWN, s: DIR.DOWN,
        ArrowLeft: DIR.LEFT,  a: DIR.LEFT,
        ArrowRight: DIR.RIGHT, d: DIR.RIGHT,
      };

      if (e.key === ' ' || e.key === 'Enter') {
        if (phaseR.current !== 'playing') startGame();
        return;
      }

      const d = keyMap[e.key];
      if (!d) return;
      e.preventDefault();

      // Prevent 180° reverse
      const cur = dirR.current;
      if (d.x === -cur.x && d.y === -cur.y) return;
      nextDirR.current = d;
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const startGame = useCallback(() => {
    const s = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    const f = randomFood(s);
    snakeR.current   = s;
    foodR.current    = f;
    dirR.current     = DIR.RIGHT;
    nextDirR.current = DIR.RIGHT;
    scoreR.current   = 0;
    phaseR.current   = 'playing';
    setSnake([...s]);
    setFood({ ...f });
    setScore(0);
    setPhase('playing');
  }, []);

  // Game loop
  useEffect(() => {
    if (phase !== 'playing') return;

    const timer = setInterval(() => {
      dirR.current = nextDirR.current;
      const s = snakeR.current;
      const f = foodR.current;
      const d = dirR.current;

      const head = { x: s[0].x + d.x, y: s[0].y + d.y };

      // Wall collision
      if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
        return endGame();
      }
      // Self collision
      if (s.some((seg) => seg.x === head.x && seg.y === head.y)) {
        return endGame();
      }

      const ate = head.x === f.x && head.y === f.y;
      const newSnake = ate ? [head, ...s] : [head, ...s.slice(0, -1)];
      snakeR.current = newSnake;

      if (ate) {
        const newFood = randomFood(newSnake);
        foodR.current = newFood;
        scoreR.current += 10;
        setFood({ ...newFood });
        setScore(scoreR.current);
      }

      setSnake([...newSnake]);
    }, SPEED);

    return () => clearInterval(timer);
  }, [phase]);

  function endGame() {
    phaseR.current = 'dead';
    setPhase('dead');
    const sc = scoreR.current;
    const hs = window.NoVoice?.storage.get('hs') ?? 0;
    if (sc > hs) {
      window.NoVoice?.storage.set('hs', sc);
      setHighScore(sc);
    }
  }

  const isNewHigh = phase === 'dead' && score > 0 && score === highScore;
  const W = COLS * CELL;
  const H = ROWS * CELL;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%',
      background: '#0d0d0f', userSelect: 'none',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Score bar */}
      <div style={{ display: 'flex', gap: 40, marginBottom: 14, fontSize: 13 }}>
        <span style={{ color: '#636366' }}>
          Score <strong style={{ color: '#fff', marginLeft: 5 }}>{score}</strong>
        </span>
        <span style={{ color: '#636366' }}>
          Best <strong style={{ color: '#32d74b', marginLeft: 5 }}>{highScore}</strong>
        </span>
      </div>

      {/* Board */}
      <div style={{
        position: 'relative', width: W, height: H,
        background: '#141416', borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.07)',
        overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        {/* Food */}
        <div style={{
          position: 'absolute',
          left: food.x * CELL + 3, top: food.y * CELL + 3,
          width: CELL - 6, height: CELL - 6,
          background: '#ff453a', borderRadius: '50%',
          boxShadow: '0 0 10px #ff453a55',
        }} />

        {/* Snake segments */}
        {snake.map((seg, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: seg.x * CELL + 1, top: seg.y * CELL + 1,
            width: CELL - 2, height: CELL - 2,
            background: i === 0
              ? '#32d74b'
              : `hsl(135, 60%, ${26 + (1 - i / snake.length) * 14}%)`,
            borderRadius: i === 0 ? 6 : 3,
          }} />
        ))}

        {/* Overlay (idle / dead) */}
        {phase !== 'playing' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.75)', gap: 10,
          }}>
            {phase === 'idle' && (
              <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#fff' }}>🐍 Snake</p>
            )}
            {phase === 'dead' && (
              <>
                <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#ff453a' }}>Game Over</p>
                <p style={{ margin: 0, fontSize: 14, color: '#8e8e93' }}>Score: {score}</p>
                {isNewHigh && (
                  <p style={{ margin: 0, fontSize: 12, color: '#32d74b' }}>🏆 New High Score!</p>
                )}
              </>
            )}

            <button
              onClick={startGame}
              style={{
                marginTop: 10, padding: '9px 28px',
                background: '#32d74b', color: '#000',
                border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 2px 12px #32d74b33',
              }}
            >
              {phase === 'dead' ? 'Play Again' : 'Start Game'}
            </button>

            <p style={{ margin: 0, fontSize: 11, color: '#3a3a3e' }}>
              Arrow keys or WASD · Space to start
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
