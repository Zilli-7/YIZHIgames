/**
 * 2048 —— 经典滑动合并
 * 方向键 / WASD / 触摸滑动；相同数字合并；达成 2048 提示，无法移动则结束。
 * 支持 4×4 / 5×5 / 6×6 三种棋盘，滑动动画速度四档（关闭 / 慢 / 适中 / 快）。
 */
(function () {
  const CELL_MAP = { 4: 70, 5: 60, 6: 52 };
  const GAP = 8;
  const PAD = 8;
  const ANIM_MS = { off: 0, slow: 300, medium: 160, fast: 80 };

  const PALETTE = {
    2: 'var(--tile-1)', 4: 'var(--tile-2)', 8: 'var(--tile-3)', 16: 'var(--tile-4)',
    32: 'var(--tile-5)', 64: 'var(--tile-6)', 128: 'var(--tile-1)', 256: 'var(--tile-2)',
    512: 'var(--tile-3)', 1024: 'var(--tile-4)', 2048: 'var(--tile-5)', 4096: 'var(--tile-6)',
    8192: 'var(--tile-1)', 16384: 'var(--tile-2)', 32768: 'var(--tile-3)', 65536: 'var(--tile-4)'
  };

  function parseColor(value) {
    const hex = value.match(/^#([\da-f]{6})$/i);
    if (hex) {
      const number = parseInt(hex[1], 16);
      return { r: number >> 16, g: (number >> 8) & 255, b: number & 255 };
    }
    const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
    throw new Error('无法解析 2048 方块主题色：' + value);
  }

  function toHsl(color) {
    const r = color.r / 255, g = color.g / 255, b = color.b / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    const l = (max + min) / 2;
    let s = 0;
    if (delta !== 0) {
      s = delta / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s };
  }

  function fromHsl(h, s, l) {
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
    const match = l - chroma / 2;
    let rgb;
    if (h < 60) rgb = [chroma, x, 0];
    else if (h < 120) rgb = [x, chroma, 0];
    else if (h < 180) rgb = [0, chroma, x];
    else if (h < 240) rgb = [0, x, chroma];
    else if (h < 300) rgb = [x, 0, chroma];
    else rgb = [chroma, 0, x];
    return rgb.map(channel => Math.round((channel + match) * 255));
  }

  function relativeLuminance(color) {
    const channels = [color.r, color.g, color.b].map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }

  function contrastRatio(a, b) {
    const values = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (values[0] + 0.05) / (values[1] + 0.05);
  }

  function init(container) {
    container.innerHTML = '';
    let SIZE = 4;               // 棋盘尺寸
    let CELL = CELL_MAP[SIZE];
    let animSpeed = 'fast';     // 动画速度档
    let tiles = [];             // { id, value, row, col, isNew, justMerged }
    let nextId = 1;
    const domMap = new Map();   // id -> 元素
    let score = 0, over = false, won = false;
    let touchStart = null;
    let lastMoveTime = 0;

    // ---------- 构建 UI ----------
    const root = document.createElement('div');
    root.style.cssText = 'display:flex;flex-direction:column;align-items:center;';

    const bar = document.createElement('div');
    bar.className = 'game-toolbar';
    bar.style.cssText = 'width:100%;justify-content:center;';
    bar.innerHTML =
      '<span class="stat">🏆 分数 <b id="g2-score">0</b></span>' +
      '<span class="stat">🔝 最高 <b id="g2-best">0</b></span>' +
      '<label class="stat" style="display:flex;align-items:center;gap:4px;">📐 棋盘' +
        '<select id="g2-size" style="padding:4px 8px;">' +
          '<option value="4" selected>4×4</option>' +
          '<option value="5">5×5</option>' +
          '<option value="6">6×6</option>' +
        '</select>' +
      '</label>' +
      '<label class="stat" style="display:flex;align-items:center;gap:4px;">🎞 动画' +
        '<select id="g2-anim" style="padding:4px 8px;">' +
          '<option value="off">关闭</option>' +
          '<option value="slow">慢</option>' +
          '<option value="medium">适中</option>' +
          '<option value="fast" selected>快</option>' +
        '</select>' +
      '</label>' +
      '<button class="btn btn-sm btn-primary" id="g2-new" type="button">新游戏</button>';
    root.appendChild(bar);

    const boardEl = document.createElement('div');
    boardEl.style.cssText =
      'position:relative;display:grid;gap:' + GAP + 'px;padding:' + PAD + 'px;' +
      'background:var(--board-bg);border:2px dashed var(--text);border-radius:12px;touch-action:none;max-width:100%;';
    root.appendChild(boardEl);

    const hint = document.createElement('div');
    hint.className = 'hint-text';
    hint.textContent = '方向键 / WASD / 滑动屏幕移动，合并相同数字，挑战 2048！';
    root.appendChild(hint);

    const msgEl = document.createElement('div');
    msgEl.className = 'msg';
    msgEl.style.textAlign = 'center';
    root.appendChild(msgEl);

    container.appendChild(root);

    const scoreEl = bar.querySelector('#g2-score');
    const bestEl = bar.querySelector('#g2-best');
    const sizeSel = bar.querySelector('#g2-size');
    const animSel = bar.querySelector('#g2-anim');

    function bestKey() { return 'g2048-score-' + SIZE; }
    bestEl.textContent = GameHub.loadBest(bestKey());

    // ---------- 方块辅助 ----------
    function tileX(t) { return PAD + t.col * (CELL + GAP); }
    function tileY(t) { return PAD + t.row * (CELL + GAP); }
    function fontSize(v) {
      if (v >= 10000) return Math.round(CELL * 0.28);
      if (v >= 1000) return Math.round(CELL * 0.34);
      if (v >= 100) return Math.round(CELL * 0.4);
      return Math.round(CELL * 0.5);
    }

    function readThemePalette() {
      const styles = getComputedStyle(document.documentElement);
      return Array.from({ length: 6 }, (_, index) => {
        const value = styles.getPropertyValue('--tile-' + (index + 1)).trim();
        if (!value) throw new Error('缺少 2048 方块主题色：--tile-' + (index + 1));
        return parseColor(value);
      });
    }

    let themePalette = readThemePalette();

    function themedTileColor(v) {
      const level = Math.max(0, Math.round(Math.log2(v)) - 1);
      const paletteIndex = level % themePalette.length;
      const shade = Math.floor(level / themePalette.length);
      const lightness = shade % 2 === 0
        ? (shade === 0 ? 0.90 : 0.95) - paletteIndex * 0.105
        : 0.25 + paletteIndex * 0.105;
      const hsl = toHsl(themePalette[paletteIndex]);
      const saturation = Math.min(0.62, Math.max(hsl.s, 0.38));
      const darkInk = { r: 32, g: 37, b: 31 };
      const lightInk = { r: 247, g: 244, b: 232 };
      let adjustedLightness = lightness;
      let rgb = fromHsl(hsl.h, saturation, adjustedLightness);
      let background = { r: rgb[0], g: rgb[1], b: rgb[2] };
      let darkContrast = contrastRatio(darkInk, background);
      let lightContrast = contrastRatio(lightInk, background);
      for (let attempt = 0; Math.max(darkContrast, lightContrast) < 4.5 && attempt < 40; attempt++) {
        adjustedLightness += darkContrast >= lightContrast ? 0.01 : -0.01;
        rgb = fromHsl(hsl.h, saturation, adjustedLightness);
        background = { r: rgb[0], g: rgb[1], b: rgb[2] };
        darkContrast = contrastRatio(darkInk, background);
        lightContrast = contrastRatio(lightInk, background);
      }
      return {
        background: 'rgb(' + rgb.join(', ') + ')',
        ink: darkContrast >= lightContrast ? '#20251F' : '#F7F4E8'
      };
    }

    function paint(el, v) {
      if (document.documentElement.dataset.theme === 'classic-light' ||
          document.documentElement.dataset.theme === 'classic-dark') {
        el.style.background = PALETTE[v] || 'var(--tile-4)';
        el.style.color = 'var(--tile-ink)';
      } else {
        const tileColor = themedTileColor(v);
        el.style.background = tileColor.background;
        el.style.color = tileColor.ink;
      }
      el.style.fontSize = fontSize(v) + 'px';
    }

    function onThemeChange() {
      themePalette = readThemePalette();
      for (const tile of tiles) {
        const el = domMap.get(tile.id);
        if (el) paint(el, tile.value);
      }
    }
    window.addEventListener('gamehub-theme-change', onThemeChange);

    function valueAt(r, c) {
      const t = tiles.find(t => t.row === r && t.col === c);
      return t ? t.value : 0;
    }
    function emptyCells() {
      const occ = new Set(tiles.map(t => t.row * SIZE + t.col));
      const out = [];
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
          if (!occ.has(r * SIZE + c)) out.push([r, c]);
      return out;
    }
    function canMove() {
      if (tiles.length < SIZE * SIZE) return true;
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) {
          const v = valueAt(r, c);
          if (r + 1 < SIZE && valueAt(r + 1, c) === v) return true;
          if (c + 1 < SIZE && valueAt(r, c + 1) === v) return true;
        }
      return false;
    }
    function removeTile(t) {
      const i = tiles.indexOf(t);
      if (i >= 0) tiles.splice(i, 1);
    }
    function spawnTile() {
      const cells = emptyCells();
      if (!cells.length) return;
      const [r, c] = cells[Math.floor(Math.random() * cells.length)];
      tiles.push({ id: nextId++, value: Math.random() < 0.9 ? 2 : 4, row: r, col: c, isNew: true, justMerged: false });
    }

    // ---------- 渲染（方块定位 + 滑动动画） ----------
    function makeTile(t) {
      const el = document.createElement('div');
      const dur = ANIM_MS[animSpeed];
      el.style.cssText =
        'position:absolute;width:' + CELL + 'px;height:' + CELL + 'px;' +
        'display:flex;align-items:center;justify-content:center;font-weight:700;border-radius:8px;' +
        'left:' + tileX(t) + 'px;top:' + tileY(t) + 'px;' +
        'transition:' + (dur > 0 ? 'left ' + dur + 'ms ease, top ' + dur + 'ms ease' : 'none') + ';' +
        'transform:scale(0);transform-origin:center;';
      el._v = t.value;
      el.textContent = t.value;
      paint(el, t.value);
      return el;
    }

    function renderTiles() {
      const dur = ANIM_MS[animSpeed];
      const active = new Set();

      for (const t of tiles) {
        active.add(t.id);
        let el = domMap.get(t.id);
        if (!el) {
          el = makeTile(t);
          domMap.set(t.id, el);
          boardEl.appendChild(el);
          // 新方块弹出
          if (dur > 0) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
              el.style.transform = 'scale(1)';
            }));
          } else {
            el.style.transform = 'scale(1)';
          }
          continue;
        }
        // 已有元素：更新过渡 + 位置（触发滑动动画）
        el.style.transition = dur > 0 ? 'left ' + dur + 'ms ease, top ' + dur + 'ms ease, transform 110ms ease' : 'none';
        el.style.left = tileX(t) + 'px';
        el.style.top = tileY(t) + 'px';
        if (el._v !== t.value) {
          el._v = t.value;
          el.textContent = t.value;
          paint(el, t.value);
          if (t.justMerged && dur > 0) {
            el.style.transform = 'scale(1.18)';
            requestAnimationFrame(() => { el.style.transform = 'scale(1)'; });
          }
        }
      }

      // 移除已消失的方块
      for (const [id, el] of domMap) {
        if (!active.has(id)) { el.remove(); domMap.delete(id); }
      }
      // 清除一次性标记
      tiles.forEach(t => { t.isNew = false; t.justMerged = false; });
    }

    function buildBoard() {
      // 清空旧方块
      domMap.forEach(el => el.remove());
      domMap.clear();
      // 重建背景格
      boardEl.style.gridTemplateColumns = 'repeat(' + SIZE + ', ' + CELL + 'px)';
      boardEl.querySelectorAll('.g2-bg').forEach(el => el.remove());
      for (let i = 0; i < SIZE * SIZE; i++) {
        const bg = document.createElement('div');
        bg.className = 'g2-bg';
        bg.style.cssText = 'width:' + CELL + 'px;height:' + CELL + 'px;border-radius:8px;background:var(--board-cell);';
        boardEl.appendChild(bg);
      }
      tiles = [];
      nextId = 1;
      spawnTile(); spawnTile();
      renderTiles();
    }

    function fitCellToWidth() {
      const styles = getComputedStyle(container);
      const availableWidth = container.clientWidth -
        parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
      return Math.max(28, Math.min(CELL_MAP[SIZE],
        Math.floor((availableWidth - GAP * (SIZE - 1) - PAD * 2 - 4) / SIZE)));
    }

    function resizeBoard() {
      const fittedCell = fitCellToWidth();
      if (fittedCell === CELL) return;
      CELL = fittedCell;
      boardEl.querySelectorAll('.g2-bg').forEach(el => {
        el.style.width = CELL + 'px';
        el.style.height = CELL + 'px';
      });
      boardEl.style.gridTemplateColumns = 'repeat(' + SIZE + ', ' + CELL + 'px)';
      renderTiles();
    }

    function newGame() {
      score = 0; over = false; won = false;
      scoreEl.textContent = '0';
      msgEl.textContent = ''; msgEl.className = 'msg';
      buildBoard();
    }

    function changeSize() {
      SIZE = parseInt(sizeSel.value, 10);
      CELL = fitCellToWidth();
      bestEl.textContent = GameHub.loadBest(bestKey());
      newGame();
    }

    // ---------- 移动逻辑 ----------
    function move(dir) {
      if (over) return;
      const dur = ANIM_MS[animSpeed];
      if (Date.now() - lastMoveTime < dur) return; // 动画进行中，忽略输入

      tiles.forEach(t => { t.justMerged = false; });
      let moved = false;
      let gained = 0;

      for (let i = 0; i < SIZE; i++) {
        const line = tiles.filter(t => (dir === 'left' || dir === 'right') ? t.row === i : t.col === i);
        line.sort((a, b) => {
          if (dir === 'left') return a.col - b.col;
          if (dir === 'right') return b.col - a.col;
          if (dir === 'up') return a.row - b.row;
          return b.row - a.row; // down
        });
        let target = 0;
        let last = null;
        for (const t of line) {
          let nr, nc;
          if (last && last.value === t.value) {
            // 合并到 last 的位置
            nr = last.row; nc = last.col;
            t.value *= 2;
            gained += t.value;
            t.justMerged = true;
            if (t.value === 2048) won = true;
            removeTile(last);
            last = null;
          } else {
            if (dir === 'left') { nr = i; nc = target; }
            else if (dir === 'right') { nr = i; nc = SIZE - 1 - target; }
            else if (dir === 'up') { nr = target; nc = i; }
            else { nr = SIZE - 1 - target; nc = i; }
            last = t;
            target++;
          }
          if (t.row !== nr || t.col !== nc) { t.row = nr; t.col = nc; moved = true; }
        }
      }

      if (moved) {
        lastMoveTime = Date.now();
        score += gained;
        const isNew = GameHub.saveBest(bestKey(), score);
        bestEl.textContent = GameHub.loadBest(bestKey());
        spawnTile();
        if (won && !over) {
          msgEl.textContent = '🎉 达成 2048！继续挑战更高分吧！' + (isNew ? ' 新纪录！' : '');
          msgEl.className = 'msg ok';
        }
        if (!canMove()) {
          over = true;
          msgEl.textContent = '💥 无法移动，游戏结束！得分 ' + score;
          msgEl.className = 'msg danger';
        }
        renderTiles();
        scoreEl.textContent = score;
      }
    }

    // ---------- 输入 ----------
    function onKey(e) {
      const map = {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
        a: 'left', d: 'right', w: 'up', s: 'down'
      };
      const dir = map[e.key];
      if (dir) { e.preventDefault(); move(dir); }
    }
    function onTouchStart(e) {
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }
    function onTouchEnd(e) {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
      else move(dy > 0 ? 'down' : 'up');
    }

    document.addEventListener('keydown', onKey);
    boardEl.addEventListener('touchstart', onTouchStart, { passive: true });
    boardEl.addEventListener('touchend', onTouchEnd, { passive: true });
    root.querySelector('#g2-new').addEventListener('click', newGame);
    sizeSel.addEventListener('change', changeSize);
    animSel.addEventListener('change', () => { animSpeed = animSel.value; });
    window.addEventListener('resize', resizeBoard);

    CELL = fitCellToWidth();
    newGame();

    return function cleanup() {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('gamehub-theme-change', onThemeChange);
      window.removeEventListener('resize', resizeBoard);
    };
  }

  GameHub.register({
    id: 'g2048',
    title: '2048',
    icon: '🔲',
    desc: '滑动合并数字，4×4/5×5/6×6 三档棋盘 + 可调动画',
    badge: '数字',
    rules: [
      '使用方向键、WASD 或在棋盘上滑动，让所有数字方块向同一方向移动。',
      '两个相同数字相撞时会合并为它们的和；一次移动中合并后的方块不能再次合并。',
      '每次有效移动后会出现新的数字方块；选择 4×4、5×5 或 6×6 棋盘挑战。',
      '合成 2048 即达成目标，之后仍可继续挑战更高分；棋盘无法移动时游戏结束。'
    ],
    init
  });
})();
