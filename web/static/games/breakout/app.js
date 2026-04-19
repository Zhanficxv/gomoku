/**
 * Breakout
 * - Multiple levels with hand-designed brick layouts
 * - Power-up drops: multi-ball, paddle expand, slow ball, laser, extra life,
 *                   paddle shrink (trap), fast ball (trap)
 * - Brick types: normal (1 hp), tough (2 hp), strong (3 hp), unbreakable
 * - Scoring + best score persistence
 */
(() => {
  'use strict';

  const W = 640, H = 480;

  const els = {
    canvas: document.getElementById('game'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlaySub: document.getElementById('overlay-sub'),
    overlayBtn: document.getElementById('overlay-btn'),
    score: document.getElementById('score'),
    level: document.getElementById('level'),
    lives: document.getElementById('lives'),
    best: document.getElementById('best'),
    powerups: document.getElementById('powerups'),
  };
  const ctx = els.canvas.getContext('2d');

  // ---------- Levels ----------
  // Each row is a string. Char map:
  //   '.' empty   '1' yellow (1 hp)   '2' green (2 hp)   '3' red (3 hp)
  //   '4' blue (1 hp, big score)  'X' unbreakable
  const LEVELS = [
    // Level 1 — gentle intro
    [
      '..............',
      '..1111111111..',
      '..1111111111..',
      '..2222222222..',
      '..............',
      '..............',
    ],
    // Level 2 — wave
    [
      '....111111....',
      '...11211211...',
      '..1122222211..',
      '...11211211...',
      '....111111....',
      '..............',
    ],
    // Level 3 — fortress
    [
      '..XX222222XX..',
      '..3322222233..',
      '..3322222233..',
      '..XX222222XX..',
      '..1111111111..',
      '..............',
    ],
    // Level 4 — checker
    [
      '.1.2.3.3.2.1..',
      '2.3.X.X.X.3.2.',
      '.3.X.4.4.X.3..',
      '2.3.X.X.X.3.2.',
      '.1.2.3.3.2.1..',
      '..............',
    ],
    // Level 5 — challenge
    [
      'XX1111111111XX',
      'XX2222222222XX',
      'XX3333333333XX',
      '..2222222222..',
      '..1111111111..',
      '..XX44XX44XX..',
    ],
  ];

  const BRICK_DEFS = {
    '1': { hp: 1, color: '#ffd966', score: 50 },
    '2': { hp: 2, color: '#7fe09a', score: 100 },
    '3': { hp: 3, color: '#ff7e8b', score: 150 },
    '4': { hp: 1, color: '#5cdcff', score: 250 },
    'X': { hp: Infinity, color: '#888', score: 0 },
  };

  // ---------- Game state ----------
  const state = {
    paddle: { x: W / 2 - 60, y: H - 30, w: 120, h: 12, baseW: 120 },
    balls: [],         // {x,y,vx,vy,r,stuck}
    bricks: [],        // {x,y,w,h,hp,maxHp,color,score,unbreakable}
    drops: [],         // {x,y,vy,kind,size}
    lasers: [],        // {x,y,vy}
    score: 0,
    lives: 3,
    level: 0,
    paused: false,
    over: false,
    won: false,
    state: 'ready',    // 'ready' | 'playing' | 'paused' | 'over' | 'levelclear'
    powerups: {        // active timed effects
      slow: 0,
      fast: 0,
      laser: 0,
      wide: 0,
      shrink: 0,
    },
    laserCooldownMs: 0,
    best: loadBest(),
  };

  function loadBest() {
    try { return parseInt(localStorage.getItem('breakout.best') || '0', 10) || 0; }
    catch { return 0; }
  }
  function saveBest() {
    try { localStorage.setItem('breakout.best', String(state.best)); } catch {}
  }

  // ---------- Level setup ----------
  function loadLevel(idx) {
    state.level = idx;
    const layout = LEVELS[idx];
    const cols = layout[0].length;
    const rows = layout.length;
    const padX = 30;
    const padY = 50;
    const innerW = W - padX * 2;
    const brickW = innerW / cols;
    const brickH = 18;

    state.bricks = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ch = layout[y][x];
        if (ch === '.' || !BRICK_DEFS[ch]) continue;
        const def = BRICK_DEFS[ch];
        state.bricks.push({
          x: padX + x * brickW + 1,
          y: padY + y * brickH + 1,
          w: brickW - 2,
          h: brickH - 2,
          hp: def.hp,
          maxHp: def.hp === Infinity ? 0 : def.hp,
          color: def.color,
          score: def.score,
          unbreakable: def.hp === Infinity,
        });
      }
    }

    // Reset paddle and ball
    resetPaddleAndBall();
    state.drops = [];
    state.lasers = [];
    Object.keys(state.powerups).forEach(k => state.powerups[k] = 0);
    updateHud();
  }

  function resetPaddleAndBall() {
    state.paddle.w = state.paddle.baseW;
    state.paddle.x = W / 2 - state.paddle.w / 2;
    state.balls = [{
      x: state.paddle.x + state.paddle.w / 2,
      y: state.paddle.y - 8,
      vx: 0,
      vy: 0,
      r: 7,
      stuck: true,
    }];
  }

  function nextLevel() {
    if (state.level + 1 >= LEVELS.length) {
      state.state = 'over';
      state.won = true;
      showOverlay('🎉 全部通关！', `最终得分 ${state.score}`, '再玩一次');
      maybeUpdateBest();
      return;
    }
    state.state = 'levelclear';
    showOverlay(`第 ${state.level + 1} 关通过！`, '准备进入下一关', '继续');
    state.pendingLevelLoad = state.level + 1;
  }

  // ---------- Game loop ----------
  let lastTime = 0;
  function loop(t) {
    if (!lastTime) lastTime = t;
    const dt = Math.min(64, t - lastTime);
    lastTime = t;
    if (state.state === 'playing') update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    // Decay timed powerups
    for (const k of Object.keys(state.powerups)) {
      if (state.powerups[k] > 0) {
        state.powerups[k] -= dt;
        if (state.powerups[k] <= 0) {
          state.powerups[k] = 0;
          if (k === 'wide' || k === 'shrink') {
            state.paddle.w = state.paddle.baseW;
            // Keep paddle on-screen
            if (state.paddle.x + state.paddle.w > W) state.paddle.x = W - state.paddle.w;
          }
        }
      }
    }
    state.laserCooldownMs = Math.max(0, state.laserCooldownMs - dt);

    // Move paddle (target = mouse / touch / keyboard)
    if (paddleTargetX !== null) {
      const target = paddleTargetX - state.paddle.w / 2;
      const diff = target - state.paddle.x;
      const max = 12;
      state.paddle.x += Math.max(-max, Math.min(max, diff));
    }
    if (keys.left) state.paddle.x -= 8;
    if (keys.right) state.paddle.x += 8;
    state.paddle.x = Math.max(0, Math.min(W - state.paddle.w, state.paddle.x));

    // Stuck balls follow paddle
    for (const b of state.balls) {
      if (b.stuck) {
        b.x = state.paddle.x + state.paddle.w / 2;
        b.y = state.paddle.y - b.r - 1;
      }
    }

    // Move balls
    const speedFactor = state.powerups.slow > 0 ? 0.55 : (state.powerups.fast > 0 ? 1.5 : 1.0);
    for (const b of state.balls) {
      if (b.stuck) continue;
      const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * speedFactor / 4));
      const sx = b.vx * speedFactor / steps;
      const sy = b.vy * speedFactor / steps;
      for (let s = 0; s < steps; s++) {
        b.x += sx;
        b.y += sy;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
        // Paddle collision
        if (b.vy > 0 &&
            b.y + b.r >= state.paddle.y &&
            b.y - b.r <= state.paddle.y + state.paddle.h &&
            b.x >= state.paddle.x && b.x <= state.paddle.x + state.paddle.w) {
          b.y = state.paddle.y - b.r;
          // Reflect with angle based on hit position (-60° .. +60°)
          const rel = (b.x - (state.paddle.x + state.paddle.w / 2)) / (state.paddle.w / 2);
          const speed = Math.hypot(b.vx, b.vy);
          const angle = rel * Math.PI / 3; // -60..60 deg from straight up
          b.vx = speed * Math.sin(angle);
          b.vy = -Math.abs(speed * Math.cos(angle));
        }
        // Brick collision
        for (const br of state.bricks) {
          if (br.hp === 0) continue;
          if (b.x + b.r > br.x && b.x - b.r < br.x + br.w &&
              b.y + b.r > br.y && b.y - b.r < br.y + br.h) {
            // Determine bounce side via overlap
            const overlapL = (b.x + b.r) - br.x;
            const overlapR = (br.x + br.w) - (b.x - b.r);
            const overlapT = (b.y + b.r) - br.y;
            const overlapB = (br.y + br.h) - (b.y - b.r);
            const minH = Math.min(overlapL, overlapR);
            const minV = Math.min(overlapT, overlapB);
            if (minH < minV) {
              b.vx = overlapL < overlapR ? -Math.abs(b.vx) : Math.abs(b.vx);
            } else {
              b.vy = overlapT < overlapB ? -Math.abs(b.vy) : Math.abs(b.vy);
            }
            if (!br.unbreakable) {
              br.hp--;
              if (br.hp <= 0) {
                state.score += br.score;
                maybeDropPowerup(br.x + br.w / 2, br.y + br.h / 2);
              }
            }
            break;
          }
        }
      }
    }
    // Remove dead bricks
    state.bricks = state.bricks.filter(b => b.unbreakable || b.hp > 0);

    // Remove fallen balls
    const aliveBalls = state.balls.filter(b => b.y - b.r < H);
    if (aliveBalls.length === 0 && !state.balls.some(b => b.stuck)) {
      state.lives--;
      if (state.lives <= 0) {
        state.state = 'over';
        showOverlay('游戏结束', `最终得分 ${state.score}`, '再来一局');
        maybeUpdateBest();
      } else {
        resetPaddleAndBall();
      }
    } else {
      state.balls = aliveBalls;
    }

    // Move drops
    for (const d of state.drops) d.y += d.vy;
    state.drops = state.drops.filter(d => {
      if (d.y > H) return false;
      // Catch by paddle?
      if (d.y + d.size >= state.paddle.y &&
          d.y <= state.paddle.y + state.paddle.h &&
          d.x + d.size >= state.paddle.x &&
          d.x <= state.paddle.x + state.paddle.w) {
        applyPowerup(d.kind);
        return false;
      }
      return true;
    });

    // Lasers
    for (const l of state.lasers) l.y += l.vy;
    state.lasers = state.lasers.filter(l => {
      if (l.y < 0) return false;
      // Hit a brick?
      for (const br of state.bricks) {
        if (br.hp === 0) continue;
        if (l.x >= br.x && l.x <= br.x + br.w && l.y >= br.y && l.y <= br.y + br.h) {
          if (!br.unbreakable) {
            br.hp--;
            if (br.hp <= 0) {
              state.score += br.score;
              maybeDropPowerup(br.x + br.w / 2, br.y + br.h / 2);
            }
          }
          return false;
        }
      }
      return true;
    });
    state.bricks = state.bricks.filter(b => b.unbreakable || b.hp > 0);

    // Auto-fire laser
    if (state.powerups.laser > 0 && (keys.fire || autoFireHeld) && state.laserCooldownMs <= 0) {
      state.lasers.push({ x: state.paddle.x + 14, y: state.paddle.y, vy: -10 });
      state.lasers.push({ x: state.paddle.x + state.paddle.w - 14, y: state.paddle.y, vy: -10 });
      state.laserCooldownMs = 200;
    }

    // Win check (any breakable bricks left?)
    const anyBreakable = state.bricks.some(b => !b.unbreakable && b.hp > 0);
    if (!anyBreakable) {
      nextLevel();
    }

    updateHud();
  }

  function maybeDropPowerup(x, y) {
    // ~22% chance to drop something; 75% beneficial, 25% trap
    if (Math.random() > 0.22) return;
    const goodKinds = ['multi', 'wide', 'slow', 'laser', 'life'];
    const badKinds  = ['shrink', 'fast'];
    const isGood = Math.random() < 0.78;
    const pool = isGood ? goodKinds : badKinds;
    const kind = pool[Math.floor(Math.random() * pool.length)];
    state.drops.push({ x: x - 12, y, vy: 2.5, kind, size: 24 });
  }

  function applyPowerup(kind) {
    switch (kind) {
      case 'multi': {
        const newBalls = [];
        for (const b of state.balls) {
          if (b.stuck) continue;
          const sp = Math.hypot(b.vx, b.vy);
          for (const dAng of [-0.4, 0.4]) {
            const ang = Math.atan2(b.vy, b.vx) + dAng;
            newBalls.push({ x: b.x, y: b.y, vx: sp * Math.cos(ang), vy: sp * Math.sin(ang), r: b.r, stuck: false });
          }
        }
        state.balls.push(...newBalls);
        if (state.balls.length > 12) state.balls.length = 12;
        break;
      }
      case 'wide':
        state.powerups.wide = 12000;
        state.powerups.shrink = 0;
        state.paddle.w = state.paddle.baseW * 1.6;
        break;
      case 'shrink':
        state.powerups.shrink = 8000;
        state.powerups.wide = 0;
        state.paddle.w = state.paddle.baseW * 0.6;
        break;
      case 'slow':
        state.powerups.slow = 9000;
        state.powerups.fast = 0;
        break;
      case 'fast':
        state.powerups.fast = 6000;
        state.powerups.slow = 0;
        break;
      case 'laser':
        state.powerups.laser = 10000;
        break;
      case 'life':
        state.lives = Math.min(9, state.lives + 1);
        break;
    }
    if (state.paddle.x + state.paddle.w > W) state.paddle.x = W - state.paddle.w;
  }

  function maybeUpdateBest() {
    if (state.score > state.best) {
      state.best = state.score;
      saveBest();
    }
  }

  // ---------- Drawing ----------
  function dpr() { return window.devicePixelRatio || 1; }
  function fitCanvas() {
    const cssW = els.canvas.clientWidth;
    const cssH = els.canvas.clientHeight;
    const ratio = dpr();
    const targetW = Math.round(cssW * ratio);
    const targetH = Math.round(cssH * ratio);
    if (els.canvas.width !== targetW || els.canvas.height !== targetH) {
      els.canvas.width = targetW;
      els.canvas.height = targetH;
    }
    ctx.setTransform(targetW / W, 0, 0, targetH / H, 0, 0);
  }

  function draw() {
    fitCanvas();
    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d0822');
    bg.addColorStop(1, '#06030f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle starfield
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let i = 0; i < 60; i++) {
      const sx = (i * 97 + state.score * 0.01) % W;
      const sy = (i * 53) % H;
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Bricks
    for (const br of state.bricks) {
      drawBrick(br);
    }

    // Paddle
    drawPaddle();

    // Balls
    for (const b of state.balls) drawBall(b);

    // Drops
    for (const d of state.drops) drawDrop(d);

    // Lasers
    ctx.strokeStyle = '#ffd966';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(255, 217, 102, 0.6)';
    ctx.shadowBlur = 6;
    for (const l of state.lasers) {
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x, l.y + 12);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // HUD overlay text on canvas (level + score)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = 'bold 14px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`关卡 ${state.level + 1}/${LEVELS.length}`, 12, 22);
    ctx.textAlign = 'right';
    ctx.fillText(`分数 ${state.score}`, W - 12, 22);
    ctx.textAlign = 'left';
  }

  function drawBrick(br) {
    let color = br.color;
    if (!br.unbreakable && br.maxHp > 1) {
      const lightness = 0.55 + 0.45 * (br.hp / br.maxHp);
      color = mix(br.color, '#ffffff', 1 - lightness);
    }
    if (br.unbreakable) color = '#666';
    ctx.fillStyle = color;
    ctx.fillRect(br.x, br.y, br.w, br.h);

    // shine
    const grad = ctx.createLinearGradient(br.x, br.y, br.x, br.y + br.h);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = grad;
    ctx.fillRect(br.x, br.y, br.w, br.h);

    if (br.unbreakable) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(br.x + 4, br.y + 4);
      ctx.lineTo(br.x + br.w - 4, br.y + br.h - 4);
      ctx.moveTo(br.x + br.w - 4, br.y + 4);
      ctx.lineTo(br.x + 4, br.y + br.h - 4);
      ctx.stroke();
    }
  }

  function drawPaddle() {
    const p = state.paddle;
    let color = '#9aa6c8';
    if (state.powerups.laser > 0) color = '#ffd966';
    else if (state.powerups.wide > 0) color = '#7fe09a';
    else if (state.powerups.shrink > 0) color = '#ff7e8b';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    roundRect(ctx, p.x, p.y, p.w, p.h, 6, true);
    ctx.shadowBlur = 0;

    if (state.powerups.laser > 0) {
      // Laser cannons
      ctx.fillStyle = '#ffe06b';
      ctx.fillRect(p.x + 8, p.y - 6, 6, 6);
      ctx.fillRect(p.x + p.w - 14, p.y - 6, 6, 6);
    }
  }

  function drawBall(b) {
    const sp = Math.hypot(b.vx, b.vy);
    const trail = state.powerups.fast > 0 || sp > 7;
    if (trail) {
      ctx.fillStyle = 'rgba(110, 168, 255, 0.18)';
      ctx.beginPath();
      ctx.arc(b.x - b.vx * 0.5, b.y - b.vy * 0.5, b.r * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    const grad = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, '#dbe6ff');
    grad.addColorStop(1, '#7d9bff');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDrop(d) {
    const colors = {
      multi: ['#5cdcff', '×3'],
      wide:  ['#7fe09a', '▭'],
      slow:  ['#ffd27d', '⏳'],
      laser: ['#ffe06b', '⚡'],
      life:  ['#ff7e8b', '♥'],
      shrink:['#b08aff', '▫'],
      fast:  ['#ff7e8b', '⏩'],
    };
    const [col, label] = colors[d.kind] || ['#fff', '?'];
    ctx.fillStyle = col;
    roundRect(ctx, d.x, d.y, d.size, d.size, 6, true);
    ctx.fillStyle = '#0d0822';
    ctx.font = 'bold 14px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, d.x + d.size / 2, d.y + d.size / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function roundRect(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
  }

  function mix(a, b, t) {
    const pa = parseHex(a), pb = parseHex(b);
    const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
    const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
    const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
    return `rgb(${r}, ${g}, ${bl})`;
  }
  function parseHex(s) {
    const m = s.replace('#', '');
    return [parseInt(m.slice(0,2),16), parseInt(m.slice(2,4),16), parseInt(m.slice(4,6),16)];
  }

  function updateHud() {
    els.score.textContent = state.score.toLocaleString();
    els.level.textContent = `${state.level + 1} / ${LEVELS.length}`;
    els.lives.textContent = state.lives;
    els.best.textContent = state.best.toLocaleString();

    // Powerup chips
    const order = ['multi','wide','laser','slow','life','shrink','fast'];
    const labels = {
      wide: ['桨加宽', 'p-wide'],
      laser:['激光', 'p-laser'],
      slow: ['慢速', 'p-slow'],
      shrink:['桨变窄', 'p-shrink'],
      fast: ['快速', 'p-fast'],
    };
    const active = order
      .filter(k => state.powerups[k] > 0)
      .map(k => {
        const [name] = labels[k];
        const sec = (state.powerups[k] / 1000).toFixed(1);
        return `<span class="power-chip">${name} <span class="timer">${sec}s</span></span>`;
      });
    els.powerups.innerHTML = active.length
      ? active.join('')
      : `<span class="muted small">没有激活的道具</span>`;
  }

  // ---------- Input ----------
  let paddleTargetX = null;
  const keys = { left: false, right: false, fire: false };
  let autoFireHeld = false;

  els.canvas.addEventListener('mousemove', (e) => {
    const r = els.canvas.getBoundingClientRect();
    paddleTargetX = (e.clientX - r.left) * (W / r.width);
  });
  els.canvas.addEventListener('mouseleave', () => { paddleTargetX = null; });

  els.canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 0) return;
    const r = els.canvas.getBoundingClientRect();
    paddleTargetX = (e.touches[0].clientX - r.left) * (W / r.width);
    autoFireHeld = true;
  }, { passive: true });
  els.canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 0) return;
    e.preventDefault();
    const r = els.canvas.getBoundingClientRect();
    paddleTargetX = (e.touches[0].clientX - r.left) * (W / r.width);
  }, { passive: false });
  els.canvas.addEventListener('touchend', () => {
    autoFireHeld = false;
    // Tap launches stuck balls
    launchStuckBalls();
  });

  els.canvas.addEventListener('click', () => {
    launchStuckBalls();
  });

  function launchStuckBalls() {
    if (state.state !== 'playing') return;
    let launched = false;
    for (const b of state.balls) {
      if (b.stuck) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.4;
        b.vx = 5 * Math.cos(angle);
        b.vy = 5 * Math.sin(angle);
        b.stuck = false;
        launched = true;
      }
    }
    return launched;
  }

  document.addEventListener('keydown', (e) => {
    if (state.state === 'over' && e.key !== 'r' && e.key !== 'R' && e.key !== 'Enter') return;
    switch (e.key) {
      case 'ArrowLeft': keys.left = true; e.preventDefault(); break;
      case 'ArrowRight': keys.right = true; e.preventDefault(); break;
      case ' ': case 'ArrowUp':
        e.preventDefault();
        if (state.state === 'ready' || state.state === 'levelclear') {
          beginPlay();
        } else {
          launchStuckBalls();
          keys.fire = true;
        }
        break;
      case 'p': case 'P':
        e.preventDefault();
        if (state.state === 'playing') { state.state = 'paused'; showOverlay('已暂停', '按 P 继续', '继续'); }
        else if (state.state === 'paused') { state.state = 'playing'; hideOverlay(); }
        break;
      case 'r': case 'R':
        e.preventDefault();
        restartFromBeginning();
        break;
      case 'Enter':
        e.preventDefault();
        beginPlay();
        break;
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'ArrowRight') keys.right = false;
    if (e.key === ' ' || e.key === 'ArrowUp') keys.fire = false;
  });

  // ---------- Overlay & flow ----------
  function showOverlay(title, sub, btnText) {
    els.overlay.classList.remove('hidden');
    els.overlayTitle.textContent = title;
    els.overlaySub.textContent = sub;
    els.overlayBtn.textContent = btnText;
  }
  function hideOverlay() { els.overlay.classList.add('hidden'); }

  els.overlayBtn.addEventListener('click', beginPlay);

  function beginPlay() {
    if (state.state === 'over') {
      restartFromBeginning();
      return;
    }
    if (state.state === 'levelclear') {
      loadLevel(state.pendingLevelLoad ?? state.level + 1);
      state.state = 'playing';
      hideOverlay();
      return;
    }
    state.state = 'playing';
    hideOverlay();
  }

  function restartFromBeginning() {
    state.score = 0;
    state.lives = 3;
    state.over = false;
    state.won = false;
    loadLevel(0);
    state.state = 'ready';
    showOverlay('准备开始', '点击或按 Space / ↑ 发射小球', '开始游戏');
  }

  // ---------- Boot ----------
  loadLevel(0);
  state.state = 'ready';
  showOverlay('准备开始', '点击或按 Space / ↑ 发射小球', '开始游戏');
  requestAnimationFrame(loop);
})();
