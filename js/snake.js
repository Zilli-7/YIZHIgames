/**
 * 贪吃蛇 —— Canvas 渲染，吃食物增长，撞墙/撞自己结束，随分数加速
 */
(function () {
  const GRID = 20; // 20×20 格
  const CELL = 22; // 每格像素

  // 四档速度：base 为起步间隔(ms)，min 为最快下限(ms)；均随分数加快
  const SPEEDS = {
    slow:   { label: '慢',   base: 260, min: 140 },
    medium: { label: '适中', base: 220, min: 100 },
    fast:   { label: '快速', base: 180, min: 70 },
    super:  { label: '超快', base: 130, min: 50 }
  };
  const ACCEL = 4; // 每 10 分加快 4ms

  function init(container) {
    container.innerHTML = '';
    let snake = [], dir = 'right', nextDir = 'right';
    let food = null, score = 0, alive = true, paused = false, started = false;
    let loopTimer = null;
    let gameOverMessage = '';
    let speedLevel = 'fast'; // 当前速度档，默认「快速」（即原有速度）
    let gridColor = GameHub.getTheme().accentSoft;

    const canvas = document.createElement('canvas');
    canvas.width = GRID * CELL;
    canvas.height = GRID * CELL;
    canvas.style.cssText = 'display:block;margin:0 auto;max-width:100%;height:auto;aspect-ratio:1;background:var(--board-bg);border-radius:10px;border:2px solid ' + gridColor + ';touch-action:none;';
    const ctx = canvas.getContext('2d');

    const root = document.createElement('div');
    root.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
    const bar = document.createElement('div');
    bar.className = 'game-toolbar';
    bar.style.cssText = 'width:100%;justify-content:center;';
    bar.innerHTML =
      '<span class="stat">🏆 分数 <b id="sn-score">0</b></span>' +
      '<span class="stat">🔝 最高 <b id="sn-best">0</b></span>' +
      '<label class="stat" style="display:flex;align-items:center;gap:4px;">⚡ 速度' +
        '<select id="sn-speed" style="padding:4px 8px;">' +
          '<option value="slow">慢</option>' +
          '<option value="medium">适中</option>' +
          '<option value="fast" selected>快速</option>' +
          '<option value="super">超快</option>' +
        '</select>' +
      '</label>' +
      '<label class="stat" style="display:flex;align-items:center;gap:6px;cursor:pointer;">🎨 网格颜色' +
        '<input id="sn-color" type="color" value="' + gridColor + '" style="width:32px;height:26px;border:none;background:none;padding:0;cursor:pointer;" title="调色盘选择边框与格子颜色">' +
      '</label>' +
      '<button class="btn btn-sm btn-primary" id="sn-start" type="button">开始</button>' +
      '<button class="btn btn-sm" id="sn-pause" type="button">暂停</button>';
    root.appendChild(bar);
    root.appendChild(canvas);
    const touchControls = document.createElement('div');
    touchControls.className = 'snake-touch-controls';
    touchControls.setAttribute('aria-label', '贪吃蛇方向控制');
    touchControls.innerHTML =
      '<button type="button" data-direction="up" aria-label="向上">▲</button>' +
      '<button type="button" data-direction="left" aria-label="向左">◀</button>' +
      '<button type="button" data-direction="down" aria-label="向下">▼</button>' +
      '<button type="button" data-direction="right" aria-label="向右">▶</button>';
    root.appendChild(touchControls);

    const hint = document.createElement('div');
    hint.className = 'hint-text';
    hint.style.textAlign = 'center';
    hint.textContent = '方向键 / WASD、滑动棋盘或触摸方向键控制 · 吃到食物增长 · 撞墙或撞到自己结束';
    root.appendChild(hint);

    container.appendChild(root);
    const scoreEl = root.querySelector('#sn-score');
    const bestEl = root.querySelector('#sn-best');
    const startBtn = root.querySelector('#sn-start');
    const pauseBtn = root.querySelector('#sn-pause');
    const speedSel = root.querySelector('#sn-speed');
    const colorSel = root.querySelector('#sn-color');
    bestEl.textContent = GameHub.loadBest('snake-score');

    function reset() {
      snake = [
        { x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }
      ];
      dir = 'right'; nextDir = 'right';
      score = 0; alive = true; paused = false; started = false;
      gameOverMessage = '';
      scoreEl.textContent = '0';
      spawnFood();
      draw();
      startBtn.textContent = '开始';
      pauseBtn.textContent = '暂停';
    }

    function spawnFood() {
      let pos;
      do {
        pos = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
      } while (snake.some(s => s.x === pos.x && s.y === pos.y));
      food = pos;
    }

    function speed() {
      const s = SPEEDS[speedLevel];
      return Math.max(s.min, s.base - score * ACCEL);
    }

    function step() {
      if (!alive || paused || !started) return;
      dir = nextDir;
      const head = { x: snake[0].x, y: snake[0].y };
      if (dir === 'right') head.x++;
      else if (dir === 'left') head.x--;
      else if (dir === 'up') head.y--;
      else if (dir === 'down') head.y++;

      // 撞墙
      if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
        gameOver(); return;
      }
      // 撞自己（尾巴会移动，若吃不到食物则尾部不算）
      const willEat = food && head.x === food.x && head.y === food.y;
      const bodyToCheck = willEat ? snake : snake.slice(0, -1);
      if (bodyToCheck.some(s => s.x === head.x && s.y === head.y)) {
        gameOver(); return;
      }

      snake.unshift(head);
      if (willEat) {
        score += 10;
        scoreEl.textContent = score;
        spawnFood();
      } else {
        snake.pop();
      }
      draw();
      clearInterval(loopTimer);
      loopTimer = setInterval(step, speed());
    }

    function gameOver() {
      alive = false;
      clearInterval(loopTimer);
      loopTimer = null;
      started = false;
      const isNew = GameHub.saveBest('snake-score', score);
      gameOverMessage = '得分 ' + score + (isNew ? ' · 新纪录！' : '');
      bestEl.textContent = GameHub.loadBest('snake-score');
      draw();
      draw();
      startBtn.textContent = '再来一局';
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // 虚线网格背景
      ctx.strokeStyle = gridColor;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      for (let i = 0; i <= GRID; i++) {
        ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(canvas.width, i * CELL); ctx.stroke();
      }
      ctx.setLineDash([]); // 恢复实线，避免影响食物/蛇
      // 食物
      if (food) {
        ctx.fillStyle = GameHub.getTheme().danger;
        ctx.beginPath();
        ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // 蛇
      snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? GameHub.getTheme().accentSoft : GameHub.getTheme().accent;
        roundRect(ctx, s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2, 5);
        ctx.fill();
      });
      if (!alive) {
        ctx.fillStyle = 'rgba(0,0,0,.65)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = GameHub.getTheme().text;
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('游戏结束', canvas.width / 2, canvas.height / 2 - 10);
        ctx.font = '16px sans-serif';
        ctx.fillText(gameOverMessage, canvas.width / 2, canvas.height / 2 + 20);
      }
    }

    function roundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    function start() {
      reset();
      started = true;
      clearInterval(loopTimer);
      loopTimer = setInterval(step, speed());
      startBtn.textContent = '重新开始';
    }

    function togglePause() {
      if (!started) return;
      paused = !paused;
      pauseBtn.textContent = paused ? '继续' : '暂停';
    }

    function changeDirection(direction) {
      if (!started || paused || !alive) return;
      const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
      if (opposite[direction] === dir) return;
      nextDir = direction;
    }

    function onKey(e) {
      const map = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right'
      };
      const d = map[e.key];
      if (!d) return;
      e.preventDefault();
      changeDirection(d);
    }

    let touchStart = null;
    function onPointerDown(e) {
      if (e.pointerType !== 'touch') return;
      touchStart = { x: e.clientX, y: e.clientY };
    }

    function onPointerUp(e) {
      if (e.pointerType !== 'touch' || !touchStart) return;
      const dx = e.clientX - touchStart.x;
      const dy = e.clientY - touchStart.y;
      touchStart = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      changeDirection(Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down' : 'up'));
    }

    function onPointerCancel() {
      touchStart = null;
    }

    function onSpeedChange() {
      speedLevel = speedSel.value;
      // 若游戏正在进行，立即按新速度重启循环
      if (started && !paused && alive) {
        clearInterval(loopTimer);
        loopTimer = setInterval(step, speed());
      }
    }

    function onColorChange() {
      gridColor = colorSel.value;
      canvas.style.borderColor = gridColor; // 同步边框颜色
      draw();                              // 立即重绘虚线格子
    }

    function onThemeChange(e) {
      gridColor = e.detail.accentSoft;
      colorSel.value = gridColor;
      canvas.style.borderColor = gridColor;
      draw();
    }

    document.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    touchControls.addEventListener('click', e => {
      const button = e.target.closest('[data-direction]');
      if (button) changeDirection(button.dataset.direction);
    });
    window.addEventListener('gamehub-theme-change', onThemeChange);
    startBtn.addEventListener('click', start);
    pauseBtn.addEventListener('click', togglePause);
    speedSel.addEventListener('change', onSpeedChange);
    colorSel.addEventListener('input', onColorChange);

    reset();

    return function cleanup() {
      clearInterval(loopTimer);
      document.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('gamehub-theme-change', onThemeChange);
    };
  }

  GameHub.register({
    id: 'snake',
    title: '贪吃蛇',
    icon: '🐍',
    desc: '经典贪吃蛇，四档速度 + 虚线格子 + 调色盘自定义颜色',
    badge: '街机',
    rules: [
      '点击“开始”后，可用方向键、WASD、棋盘滑动或触摸方向键控制蛇移动；点击“暂停”可暂停或继续。',
      '吃到食物后蛇身增长并获得分数，蛇会随得分逐渐加速。',
      '撞到棋盘边界或自己的身体时游戏结束。',
      '可随时调整速度档位，并使用调色盘自定义网格颜色。'
    ],
    init
  });
})();
