/**
 * 合数 —— 6×6 合并消消乐（方块对象 + 绝对定位，支持动画）
 * 规则：
 *  - 初始数字范围 1~6；点击方块使其 +1。
 *  - 仅当点击方块所在的上下左右连通同值方块达到 3 个时，合并为更大数字。
 *  - 合并结果留在点击位置；各列上方方块下落，列顶空位再补入随机数字。
 *  - 每次点击消耗 1 步，自动连锁合并返还步数。
 * 动画：逐步展示数字升级、合并、下落和列顶补块，速度可调。
 * 配色：数字块使用当前主题色卡，并按数值映射到不同明暗层级。
 */
(function () {
  const SIZE = 6;
  const DIFFICULTY_STEPS = { hard: 5, easy: 15, medium: 10 };
  let CELL = 48;
  const GAP = 6, PAD = 14;

  const ANIM_MS = { off: 0, fast: 360, medium: 520, slow: 760 };
  const ANIM_EASING = 'cubic-bezier(.22,.61,.36,1)';

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function tileX(col) { return PAD + col * (CELL + GAP); }
  function tileY(row) { return PAD + row * (CELL + GAP); }

  function parseColor(value) {
    const hex = value.match(/^#([\da-f]{6})$/i);
    if (hex) {
      const number = parseInt(hex[1], 16);
      return { r: number >> 16, g: (number >> 8) & 255, b: number & 255 };
    }
    const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
    throw new Error('无法解析合数方块主题色：' + value);
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
    return { h, s, l };
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
    const availableWidth = Math.min(container.clientWidth || 720, 720);
    CELL = Math.max(32, Math.min(48, Math.floor(
      (availableWidth - GAP * (SIZE - 1) - PAD * 2 - 4) / SIZE
    )));
    let tiles = [];       // { id, value, row, col, isNew, justMerged }
    let nextId = 1;
    const domMap = new Map();
    let stepLimit = DIFFICULTY_STEPS.medium;
    let steps = stepLimit;
    let score = 0;
    let bestScore = GameHub.loadBest('heshu-score');
    let gameOver = false;
    let animating = false;
    let queuedClicks = [];
    let turnId = 0;
    let animSpeed = 'medium';

    // ---------- UI ----------
    const root = document.createElement('div');
    root.style.cssText = 'display:flex;flex-direction:column;align-items:center;';

    const bar = document.createElement('div');
    bar.className = 'game-toolbar';
    bar.style.cssText = 'width:100%;justify-content:center;';
    bar.innerHTML =
      '<span class="stat">👣 步数 <b id="hs-steps">' + stepLimit + '</b></span>' +
      '<label class="stat" style="display:flex;align-items:center;gap:4px;">难度' +
        '<select id="hs-difficulty" style="padding:4px 8px;">' +
          '<option value="easy">易 · 15 步</option>' +
          '<option value="medium" selected>中 · 10 步</option>' +
          '<option value="hard">难 · 5 步</option>' +
        '</select>' +
      '</label>' +
      '<span class="stat">🏆 分数 <b id="hs-score">0</b></span>' +
      '<span class="stat">🔝 最高分 <b id="hs-max">' + bestScore + '</b></span>' +
      '<label class="stat" style="display:flex;align-items:center;gap:4px;">🎞 动画' +
        '<select id="hs-anim" style="padding:4px 8px;">' +
          '<option value="off">关闭</option>' +
          '<option value="fast">快</option>' +
          '<option value="medium" selected>适中</option>' +
          '<option value="slow">慢</option>' +
        '</select>' +
      '</label>' +
      '<button class="btn btn-sm btn-primary" id="hs-new" type="button">新游戏</button>';
    root.appendChild(bar);

    const boardEl = document.createElement('div');
    const boardSize = SIZE * CELL + (SIZE - 1) * GAP + PAD * 2 + 4;
    boardEl.style.cssText =
      'position:relative;display:grid;grid-template-columns:repeat(' + SIZE + ',' + CELL + 'px);' +
      'gap:' + GAP + 'px;padding:' + PAD + 'px;width:' + boardSize + 'px;height:' + boardSize + 'px;' +
      'box-sizing:border-box;background:var(--board-bg);border:2px dashed var(--text);border-radius:12px;';
    const gridEl = document.createElement('div');
    gridEl.style.cssText =
      'position:absolute;left:' + PAD + 'px;top:' + PAD + 'px;display:grid;' +
      'grid-template-columns:repeat(' + SIZE + ',' + CELL + 'px);grid-template-rows:repeat(' + SIZE + ',' + CELL + 'px);' +
      'gap:' + GAP + 'px;pointer-events:none;';
    for (let i = 0; i < SIZE * SIZE; i++) {
      const cell = document.createElement('div');
      cell.style.cssText = 'border:1px dashed var(--text);border-radius:9px;opacity:.38;';
      gridEl.appendChild(cell);
    }
    boardEl.appendChild(gridEl);
    root.appendChild(boardEl);

    const hint = document.createElement('div');
    hint.className = 'hint-text';
    hint.style.textAlign = 'center';
    hint.textContent = '点击方块使数字 +1；相邻同值方块连成 3 个及以上时合并升级，上方方块下落，顶部空位补入新数字。';
    root.appendChild(hint);

    const msgEl = document.createElement('div');
    msgEl.className = 'msg';
    msgEl.style.textAlign = 'center';
    root.appendChild(msgEl);

    container.appendChild(root);

    const stepsEl = bar.querySelector('#hs-steps');
    const scoreEl = bar.querySelector('#hs-score');
    const maxEl = bar.querySelector('#hs-max');
    const difficultySel = bar.querySelector('#hs-difficulty');
    const animSel = bar.querySelector('#hs-anim');

    function animMs() { return ANIM_MS[animSpeed]; }

    // ---------- 方块辅助 ----------
    function tileAt(r, c) {
      return tiles.find(t => t.row === r && t.col === c) || null;
    }

    function findGroup(start) {
      const visited = new Set();
      const group = [start];
      visited.add(start.id);
      for (let i = 0; i < group.length; i++) {
        const current = group[i];
        const neighbors = [
          tileAt(current.row - 1, current.col),
          tileAt(current.row + 1, current.col),
          tileAt(current.row, current.col - 1),
          tileAt(current.row, current.col + 1)
        ];
        for (const neighbor of neighbors) {
          if (neighbor && !visited.has(neighbor.id) && neighbor.value === start.value) {
            visited.add(neighbor.id);
            group.push(neighbor);
          }
        }
      }
      return group;
    }

    function findGroups() {
      const visited = new Set();
      const groups = [];
      for (const tile of tiles) {
        if (visited.has(tile.id)) continue;
        const group = findGroup(tile);
        group.forEach(member => visited.add(member.id));
        if (group.length >= 3) groups.push(group);
      }
      return groups;
    }

    function applyGravity() {
      for (let col = 0; col < SIZE; col++) {
        const column = tiles
          .filter(tile => tile.col === col)
          .sort((a, b) => a.row - b.row);
        const firstRow = SIZE - column.length;
        column.forEach((tile, index) => {
          tile.row = firstRow + index;
        });
      }
    }

    function refillTop() {
      const occupied = new Set(tiles.map(tile => tile.row * SIZE + tile.col));
      for (let col = 0; col < SIZE; col++) {
        for (let row = 0; row < SIZE; row++) {
          const position = row * SIZE + col;
          if (occupied.has(position)) continue;
          tiles.push({
            id: nextId++,
            value: randInt(1, SIZE),
            row,
            col,
            isNew: true,
            justMerged: false
          });
          occupied.add(position);
        }
      }
    }

    function readThemePalette() {
      const styles = getComputedStyle(document.documentElement);
      return Array.from({ length: 6 }, (_, index) => {
        const value = styles.getPropertyValue('--tile-' + (index + 1)).trim();
        if (!value) throw new Error('缺少合数方块主题色：--tile-' + (index + 1));
        return parseColor(value);
      });
    }

    let themePalette = readThemePalette();

    function color(v) {
      const value = Math.max(1, Math.floor(v));
      const paletteIndex = (value - 1) % themePalette.length;
      const shade = Math.floor((value - 1) / themePalette.length);
      const level = paletteIndex;
      const lightness = shade % 2 === 0
        ? (shade === 0 ? 0.90 : 0.95) - level * 0.105
        : 0.25 + level * 0.105;
      const hsl = toHsl(themePalette[paletteIndex]);
      const saturation = Math.min(0.62, Math.max(hsl.s, 0.38));
      const rgb = fromHsl(hsl.h, saturation, lightness);
      return {
        background: 'rgb(' + rgb.join(', ') + ')',
        ink: contrastRatio({ r: 32, g: 37, b: 31 }, { r: rgb[0], g: rgb[1], b: rgb[2] }) >=
          contrastRatio({ r: 247, g: 244, b: 232 }, { r: rgb[0], g: rgb[1], b: rgb[2] })
          ? '#20251F'
          : '#F7F4E8'
      };
    }

    function paint(el, v) {
      const tileColor = color(v);
      el.style.background = tileColor.background;
      el.style.color = tileColor.ink;
      el.style.fontSize = (v >= 10 ? '1.1rem' : '1.3rem');
    }

    function onThemeChange() {
      themePalette = readThemePalette();
      for (const tile of tiles) {
        const el = domMap.get(tile.id);
        if (el) paint(el, tile.value);
      }
    }
    window.addEventListener('gamehub-theme-change', onThemeChange);

    function makeTile(t) {
      const el = document.createElement('div');
      el.style.cssText =
        'position:absolute;width:' + CELL + 'px;height:' + CELL + 'px;' +
        'display:flex;align-items:center;justify-content:center;font-weight:700;border-radius:10px;' +
        'left:0;top:0;cursor:pointer;will-change:transform;transform:translate3d(' +
        tileX(t.col) + 'px,' + tileY(t.row) + 'px,0) scale(1);';
      el._v = t.value;
      const label = document.createElement('span');
      label.textContent = t.value;
      label.style.willChange = 'transform';
      el._label = label;
      el.appendChild(label);
      paint(el, t.value);
      el.addEventListener('click', () => onTileClick(t));
      return el;
    }

    // ---------- 渲染（合成层位移 + 淡入/淡出动画） ----------
    function renderTiles() {
      const dur = animMs();
      const active = new Set();

      for (const t of tiles) {
        active.add(t.id);
        let el = domMap.get(t.id);
        if (!el) {
          el = makeTile(t);
          domMap.set(t.id, el);
          boardEl.appendChild(el);
          if (t.isNew && dur > 0) {
            el.style.transition = 'none';
            el.style.opacity = '0';
            el.style.transform = 'translate3d(' + tileX(t.col) + 'px,' +
              (tileY(t.row) - CELL - GAP) + 'px,0) scale(.88)';
            requestAnimationFrame(() => requestAnimationFrame(() => {
              el.style.transition = 'transform ' + dur + 'ms ' + ANIM_EASING +
                ', opacity ' + Math.min(220, dur) + 'ms ease-out';
              el.style.opacity = '1';
              el.style.transform = 'translate3d(' + tileX(t.col) + 'px,' + tileY(t.row) + 'px,0) scale(1)';
            }));
          }
          continue;
        }
        const valueChanged = el._v !== t.value;
        el.style.transition = dur > 0
          ? 'transform ' + dur + 'ms ' + ANIM_EASING
          : 'none';
        if (valueChanged) {
          el._v = t.value;
          el._label.textContent = t.value;
          paint(el, t.value);
          if (dur > 0) {
            el._label.animate(
              [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
              { duration: Math.min(360, dur), easing: ANIM_EASING }
            );
          }
        }
        el.style.transform = 'translate3d(' + tileX(t.col) + 'px,' + tileY(t.row) + 'px,0) scale(1)';
      }

      for (const [id, el] of domMap) {
        if (!active.has(id)) {
          el.style.pointerEvents = 'none';
          el.style.transition = 'opacity 180ms ease-out, transform 180ms ease-out';
          el.style.opacity = '0';
          el.style.transform += ' scale(.72)';
          setTimeout(() => { el.remove(); domMap.delete(id); }, 190);
        }
      }

      tiles.forEach(t => { t.isNew = false; t.justMerged = false; });

      stepsEl.textContent = steps;
      scoreEl.textContent = score;
      if (score > bestScore) {
        GameHub.saveBest('heshu-score', score);
        bestScore = score;
      }
      maxEl.textContent = bestScore;
    }

    // ---------- 游戏流程 ----------
    function waitForAnimation(dur) {
      return dur > 0 ? new Promise(resolve => setTimeout(resolve, dur + 24)) : Promise.resolve();
    }

    function newGame() {
      turnId++;
      animating = false;
      queuedClicks = [];
      tiles = [];
      nextId = 1;
      domMap.forEach(el => el.remove());
      domMap.clear();

      let clean = false;
      let guard = 0;
      while (!clean && guard++ < 5000) {
        const vals = [];
        for (let v = 1; v <= SIZE; v++) vals.push(v);
        while (vals.length < SIZE * SIZE) vals.push(randInt(1, SIZE));
        shuffle(vals);
        tiles = vals.map((v, i) => ({
          id: nextId++, value: v, row: Math.floor(i / SIZE), col: i % SIZE, isNew: false, justMerged: false
        }));
        clean = tiles.every(t => findGroup(t).length < 3);
      }

      steps = stepLimit;
      score = 0;
      gameOver = false;
      msgEl.textContent = '';
      msgEl.className = 'msg';
      renderTiles();
    }

    async function onTileClick(tile) {
      if (gameOver) return;
      if (!tiles.includes(tile)) return;
      if (animating) {
        queuedClicks.push({ row: tile.row, col: tile.col });
        return;
      }

      const dur = animMs();
      animating = true;
      const currentTurn = ++turnId;

      tile.value += 1;
      steps = Math.max(0, steps - 1);
      renderTiles();
      await waitForAnimation(dur);
      if (currentTurn !== turnId) return;

      let direct = false;
      let chains = 0;

      // 每轮先展示合并，再展示下落和补数，最后扫描新棋盘以触发连锁。
      for (let guard = 0; guard < 500; guard++) {
        if (currentTurn !== turnId) return;
        const groups = findGroups();
        if (groups.length === 0) break;

        for (const group of groups) {
          const target = group.includes(tile) ? tile : group[0];
          if (target === tile && !direct) direct = true;
          else {
            chains++;
            steps = Math.min(stepLimit, steps + 1);
          }

          const mergedValue = target.value + 1;
          score += target.value * group.length;
          for (const member of group) {
            if (member === target) continue;
            const index = tiles.indexOf(member);
            if (index >= 0) tiles.splice(index, 1);
          }
          target.value = mergedValue;
          target.justMerged = true;
        }
        renderTiles();
        await waitForAnimation(dur);
        if (currentTurn !== turnId) return;

        applyGravity();
        refillTop();
        renderTiles();
        await waitForAnimation(dur);
      }

      if (currentTurn !== turnId) return;

      if (steps <= 0) {
        steps = 0;
        gameOver = true;
        const best = GameHub.loadBest('heshu-score');
        const isNew = GameHub.saveBest('heshu-score', score);
        msgEl.textContent = '💥 步数耗尽，游戏结束！得分 ' + score + (isNew ? ' 🎉 新纪录！' : (best ? '（最高 ' + best + '）' : ''));
        msgEl.className = 'msg danger';
      } else {
        msgEl.textContent = direct
          ? (chains ? '✨ 直接合并 + 连锁 ' + chains + ' 次，补步数！' : '✅ 合并成功')
          : '❌ 未合并，步数 -1';
        msgEl.className = 'msg ' + (direct ? 'ok' : 'warn');
      }

      animating = false;
      if (gameOver) {
        queuedClicks = [];
        return;
      }
      const nextClick = queuedClicks.shift();
      if (nextClick) {
        const nextTile = tileAt(nextClick.row, nextClick.col);
        if (nextTile) void onTileClick(nextTile);
      }
    }

    root.querySelector('#hs-new').addEventListener('click', newGame);
    difficultySel.addEventListener('change', () => {
      stepLimit = DIFFICULTY_STEPS[difficultySel.value];
      newGame();
    });
    animSel.addEventListener('change', () => { animSpeed = animSel.value; });

    newGame();

    return function cleanup() {
      window.removeEventListener('gamehub-theme-change', onThemeChange);
    };
  }

  GameHub.register({
    id: 'heshu',
    title: '合数',
    icon: '🧩',
    desc: '6×6 合并消消乐：点击升级数字，合并后下落补位并触发连锁',
    badge: '合并',
    rules: [
      '棋盘为 6×6，点击任意方块可使它的数字加 1。',
      '若点击方块与上下左右连通的同值方块达到 3 个或以上，它们会合并升级，结果留在点击位置。',
      '合并后上方方块下落，顶部补入随机数字；补充后扫描全盘，所有新形成的 3 个及以上连通同值方块都会自动合并。',
      '难度分为难（5 步）、易（15 步）、中（10 步）；每次点击消耗 1 步，每组自动连锁合并返还 1 步，步数不超过所选难度上限。步数耗尽时游戏结束，尽可能提高分数。'
    ],
    init
  });
})();
