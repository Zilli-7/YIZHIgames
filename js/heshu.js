(function () {
  const ANIM_MS = { off: 0, fast: 360, medium: 520, slow: 760 };
  const ANIM_EASING = 'cubic-bezier(.22,.61,.36,1)';
  const CLASSIC_DIFFICULTY = {
    easy: { label: '易', steps: 15 },
    medium: { label: '中', steps: 10 },
    hard: { label: '难', steps: 5 }
  };

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

  let themeTilePalette = [];

  function readThemeTilePalette() {
    const styles = getComputedStyle(document.documentElement);
    return Array.from({ length: 6 }, (_, index) => {
      const value = styles.getPropertyValue('--tile-' + (index + 1)).trim();
      if (!value) throw new Error('缺少合数方块主题色：--tile-' + (index + 1));
      return parseColor(value);
    });
  }

  function themedTileColor(value) {
    const tileValue = Math.max(1, Math.floor(value));
    const level = tileValue - 1;
    const paletteIndex = level % themeTilePalette.length;
    const shade = Math.floor(level / themeTilePalette.length);
    const hsl = toHsl(themeTilePalette[paletteIndex]);
    const saturation = Math.min(0.62, Math.max(hsl.s, 0.38));
    const lightness = shade % 2 === 0
      ? (shade === 0 ? 0.90 : 0.95) - paletteIndex * 0.105
      : 0.25 + paletteIndex * 0.105;
    const darkInk = { r: 32, g: 37, b: 31 };
    const lightInk = { r: 247, g: 244, b: 232 };
    let adjustedLightness = lightness;
    let rgb = fromHsl(hsl.h, saturation, adjustedLightness);
    let background = { r: rgb[0], g: rgb[1], b: rgb[2] };
    let darkContrast = contrastRatio(darkInk, background);
    let lightContrast = contrastRatio(lightInk, background);
    for (let attempt = 0; Math.max(darkContrast, lightContrast) < 4.5 && attempt < 40; attempt++) {
      adjustedLightness += darkContrast >= lightContrast ? 0.01 : -0.01;
      adjustedLightness = Math.max(0, Math.min(1, adjustedLightness));
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

  function themedTileFontSize(value) {
    return value >= 10 ? '1.1rem' : '1.3rem';
  }

  function paintTile(element, value) {
    const color = themedTileColor(value);
    element.style.background = color.background;
    element.style.color = color.ink;
    element.style.fontSize = themedTileFontSize(value);
    element.style.fontWeight = '700';
  }

  function buildClassicGame() {
    return function init(container) {
      const SIZE = 6;
      const GAP = 6;
      const PAD = 14;
      let CELL = 48;
      let tiles = [];
      let nextId = 1;
      let steps = 0;
      let score = 0;
      let stepLimit = CLASSIC_DIFFICULTY.medium.steps;
      let turnId = 0;
      let animating = false;
      let queuedClicks = [];
      let gameOver = false;
      let settled = false;
      let selectedDifficulty = 'medium';
      let animSpeed = 'medium';
      const domMap = new Map();
      themeTilePalette = readThemeTilePalette();
      const root = document.createElement('div');
      root.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:100%;';

      const bar = document.createElement('div');
      bar.className = 'game-toolbar';
      bar.style.cssText = 'width:100%;justify-content:center;';
      bar.innerHTML =
        '<span class="stat">👣 步数 <b id="hs-steps">0</b></span>' +
        '<span class="stat">🏆 分数 <b id="hs-score">0</b></span>' +
        '<span class="stat">🔝 最高分 <b id="hs-max">0</b></span>' +
        '<label class="stat" style="display:flex;align-items:center;gap:4px;">🎯 难度' +
          '<select id="hs-difficulty">' +
            '<option value="easy">易</option>' +
            '<option value="medium" selected>中</option>' +
            '<option value="hard">难</option>' +
          '</select>' +
        '</label>' +
        '<label class="stat" style="display:flex;align-items:center;gap:4px;">🎞 动画' +
          '<select id="hs-anim">' +
            '<option value="off">关闭</option>' +
            '<option value="fast">快</option>' +
            '<option value="medium" selected>适中</option>' +
            '<option value="slow">慢</option>' +
          '</select>' +
        '</label>' +
        '<button class="btn btn-sm btn-primary" id="hs-new" type="button">新游戏</button>';
      root.appendChild(bar);

      const boardEl = document.createElement('div');
      function boardSize() { return SIZE * CELL + (SIZE - 1) * GAP + PAD * 2 + 4; }
      boardEl.style.cssText = 'position:relative;display:grid;grid-template-columns:repeat(' + SIZE + ',' + CELL + 'px);gap:' + GAP + 'px;padding:' + PAD + 'px;width:' + boardSize() + 'px;height:' + boardSize() + 'px;max-width:100%;box-sizing:border-box;background:var(--board-bg);border:2px dashed var(--text);border-radius:12px;';
      const gridEl = document.createElement('div');
      gridEl.style.cssText = 'position:absolute;left:' + PAD + 'px;top:' + PAD + 'px;display:grid;grid-template-columns:repeat(' + SIZE + ',' + CELL + 'px);grid-template-rows:repeat(' + SIZE + ',' + CELL + 'px);gap:' + GAP + 'px;pointer-events:none;';
      for (let i = 0; i < SIZE * SIZE; i++) {
        const cell = document.createElement('div');
        cell.style.cssText = 'border:1px dashed var(--text);border-radius:9px;opacity:.38;';
        gridEl.appendChild(cell);
      }
      boardEl.appendChild(gridEl);
      root.appendChild(boardEl);

      const hint = document.createElement('div');
      hint.className = 'hint-text';
      hint.textContent = '点击数字使其 +1；三个及以上同值相连会自动合并，并支持连锁。';
      root.appendChild(hint);

      const msgEl = document.createElement('div');
      msgEl.className = 'msg';
      msgEl.style.textAlign = 'center';
      root.appendChild(msgEl);

      const stepsEl = bar.querySelector('#hs-steps');
      const scoreEl = bar.querySelector('#hs-score');
      const maxEl = bar.querySelector('#hs-max');
      const diffSel = bar.querySelector('#hs-difficulty');
      const animSel = bar.querySelector('#hs-anim');
      const newBtn = bar.querySelector('#hs-new');

      function tileX(col) { return PAD + col * (CELL + GAP); }
      function tileY(row) { return PAD + row * (CELL + GAP); }
      function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
      function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      }

      function tileAt(row, col) {
        return tiles.find(tile => tile.row === row && tile.col === col) || null;
      }

      function animMs() { return ANIM_MS[animSpeed]; }

      function waitForAnimation() {
        const duration = animMs();
        return duration > 0 ? new Promise(resolve => setTimeout(resolve, duration + 24)) : Promise.resolve();
      }

      function groupKey(tile) { return tile.row + ':' + tile.col; }

      function findGroup(start, visited = new Set()) {
        const queue = [start];
        const group = [];
        visited.add(groupKey(start));
        while (queue.length) {
          const current = queue.pop();
          group.push(current);
          const neighbors = [
            tileAt(current.row - 1, current.col),
            tileAt(current.row + 1, current.col),
            tileAt(current.row, current.col - 1),
            tileAt(current.row, current.col + 1)
          ];
          for (const neighbor of neighbors) {
            if (!neighbor || visited.has(groupKey(neighbor)) || neighbor.value !== start.value) continue;
            visited.add(groupKey(neighbor));
            queue.push(neighbor);
          }
        }
        return group;
      }

      function findGroups() {
        const visited = new Set();
        const groups = [];
        for (const tile of tiles) {
          if (visited.has(groupKey(tile))) continue;
          const group = findGroup(tile, visited);
          if (group.length >= 3) groups.push(group);
        }
        return groups;
      }

      function newGame() {
        tiles = [];
        nextId = 1;
        gameOver = false;
        settled = false;
        animating = false;
        queuedClicks = [];
        score = 0;
        steps = stepLimit;
        msgEl.textContent = '';
        msgEl.className = 'msg';
        domMap.forEach(el => el.remove());
        domMap.clear();
        let clean = false;
        let guard = 0;
        while (!clean && guard++ < 5000) {
          const values = [];
          for (let i = 1; i <= 6; i++) values.push(i);
          while (values.length < SIZE * SIZE) values.push(randInt(1, 6));
          shuffle(values);
          tiles = values.map((value, index) => ({
            id: nextId++, value, row: Math.floor(index / SIZE), col: index % SIZE, isNew: false
          }));
          clean = findGroups().length === 0;
        }
        renderTiles();
      }

      function renderTiles() {
        const duration = animMs();
        const active = new Set();
        for (const tile of tiles) {
          active.add(tile.id);
          let el = domMap.get(tile.id);
          let isNew = false;
          if (!el) {
            el = document.createElement('div');
            el.style.cssText = 'position:absolute;width:' + CELL + 'px;height:' + CELL + 'px;display:flex;align-items:center;justify-content:center;border-radius:10px;left:0;top:0;cursor:pointer;will-change:transform;';
            const label = document.createElement('span');
            label.textContent = tile.value;
            label.style.willChange = 'transform';
            el.appendChild(label);
            el.addEventListener('click', () => onTileClick(tile));
            domMap.set(tile.id, el);
            boardEl.appendChild(el);
            isNew = true;
          }

          const label = el.querySelector('span');
          const valueChanged = label.textContent !== String(tile.value);
          if (isNew && tile.isNew && duration > 0) {
            el.style.transition = 'none';
            el.style.opacity = '0';
            el.style.transform = 'translate3d(' + tileX(tile.col) + 'px,' +
              (tileY(tile.row) - CELL - GAP) + 'px,0) scale(.88)';
          } else {
            el.style.transition = duration > 0
              ? 'transform ' + duration + 'ms ' + ANIM_EASING
              : 'none';
          }
          paintTile(el, tile.value);
          el.style.transform = 'translate3d(' + tileX(tile.col) + 'px,' + tileY(tile.row) + 'px,0) scale(1)';
          if (valueChanged) {
            label.textContent = tile.value;
            if (duration > 0) {
              label.animate(
                [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
                { duration: Math.min(360, duration), easing: ANIM_EASING }
              );
            }
          }
          if (isNew && tile.isNew && duration > 0) {
            el.style.transform = 'translate3d(' + tileX(tile.col) + 'px,' +
              (tileY(tile.row) - CELL - GAP) + 'px,0) scale(.88)';
            requestAnimationFrame(() => requestAnimationFrame(() => {
              el.style.transition = 'transform ' + duration + 'ms ' + ANIM_EASING +
                ', opacity ' + Math.min(220, duration) + 'ms ease-out';
              el.style.opacity = '1';
              el.style.transform = 'translate3d(' + tileX(tile.col) + 'px,' +
                tileY(tile.row) + 'px,0) scale(1)';
            }));
          }
        }
        for (const [id, el] of domMap) {
          if (!active.has(id)) {
            el.style.pointerEvents = 'none';
            el.style.transition = 'opacity 180ms ease-out, transform 180ms ease-out';
            el.style.opacity = '0';
            el.style.transform += ' scale(.72)';
            setTimeout(() => {
              if (!tiles.some(tile => tile.id === id)) {
                el.remove();
                domMap.delete(id);
              }
            }, 190);
          }
        }
        tiles.forEach(tile => { tile.isNew = false; });
        stepsEl.textContent = steps;
        scoreEl.textContent = score;
        maxEl.textContent = GameHub.loadBest('heshu-score');
      }

      function onThemeChange() {
        themeTilePalette = readThemeTilePalette();
        for (const tile of tiles) {
          const el = domMap.get(tile.id);
          if (el) paintTile(el, tile.value);
        }
      }

      function applyGravity() {
        for (let col = 0; col < SIZE; col++) {
          const column = tiles.filter(tile => tile.col === col).sort((a, b) => a.row - b.row);
          for (let row = SIZE - 1; row >= 0; row--) {
            const target = column.find(tile => tile.row === row);
            if (target) continue;
            const moving = column.filter(tile => tile.row < row).sort((a, b) => b.row - a.row)[0];
            if (moving) moving.row = row;
          }
        }
      }

      function refillTop() {
        for (let col = 0; col < SIZE; col++) {
          for (let row = 0; row < SIZE; row++) {
            if (!tiles.some(tile => tile.row === row && tile.col === col)) {
              tiles.push({ id: nextId++, value: randInt(1, 6), row, col, isNew: true });
            }
          }
        }
      }

      async function resolveBoard(currentTurn, directTile) {
        let direct = false;
        let chains = 0;
        for (let guard = 0; guard < 500; guard++) {
          if (currentTurn !== turnId) return { direct, chains };
          const groups = findGroups();
          if (!groups.length) break;
          for (const group of groups) {
            const isDirect = directTile && !direct && group.includes(directTile);
            const target = isDirect ? directTile : group[0];
            if (isDirect) direct = true;
            else {
              chains += 1;
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
          }
          renderTiles();
          await waitForAnimation();
          if (currentTurn !== turnId) return { direct, chains };
          applyGravity();
          refillTop();
          renderTiles();
          await waitForAnimation();
        }
        return { direct, chains };
      }

      function finishGame() {
        if (settled) return;
        settled = true;
        gameOver = true;
        steps = 0;
        const oldBest = GameHub.loadBest('heshu-score');
        const isNew = GameHub.saveBest('heshu-score', score);
        msgEl.textContent = '⏱ 步数耗尽，得分 ' + score + (isNew ? ' · 新纪录！' : '');
        msgEl.className = 'msg danger';
        maxEl.textContent = Math.max(oldBest || 0, score);
      }

      async function performAction(action, currentTurn) {
        if (steps <= 0 || gameOver) return;
        const target = tiles.find(tile => tile.id === action.tileId);
        if (!target) return;
        steps = Math.max(0, steps - 1);
        target.value += 1;
        renderTiles();
        await waitForAnimation();
        if (currentTurn !== turnId) return;
        const { direct, chains } = await resolveBoard(currentTurn, target);
        if (currentTurn !== turnId) return;
        if (steps <= 0) {
          finishGame();
        } else {
          msgEl.textContent = direct
            ? (chains ? '✨ 直接合并 + 连锁 ' + chains + ' 次，补步数！' : '✅ 合并成功')
            : chains ? '✨ 自动连锁 ' + chains + ' 次，补步数！' : '❌ 未合并，步数 -1';
          msgEl.className = 'msg ' + (direct || chains ? 'ok' : 'warn');
        }
        renderTiles();
      }

      async function processQueue() {
        if (animating || gameOver) return;
        const action = queuedClicks.shift();
        if (!action) return;
        animating = true;
        const currentTurn = ++turnId;
        await performAction(action, currentTurn);
        if (currentTurn !== turnId) return;
        animating = false;
        if (queuedClicks.length) void processQueue();
      }

      function onTileClick(tile) {
        if (gameOver) return;
        queuedClicks.push({ kind: 'tile', tileId: tile.id });
        if (!animating) void processQueue();
      }

      diffSel.addEventListener('change', () => {
        selectedDifficulty = diffSel.value;
        stepLimit = CLASSIC_DIFFICULTY[selectedDifficulty].steps;
        newGame();
      });
      animSel.addEventListener('change', () => { animSpeed = animSel.value; });
      newBtn.addEventListener('click', newGame);
      window.addEventListener('gamehub-theme-change', onThemeChange);
      window.addEventListener('resize', () => {
        const containerWidth = container.clientWidth || 420;
        const fitted = Math.max(28, Math.min(48, Math.floor((Math.min(720, containerWidth - 32) - GAP * (SIZE - 1) - PAD * 2 - 4) / SIZE)));
        if (fitted === CELL) return;
        CELL = fitted;
        boardEl.style.width = boardSize() + 'px';
        boardEl.style.height = boardSize() + 'px';
        boardEl.style.gridTemplateColumns = 'repeat(' + SIZE + ',' + CELL + 'px)';
        gridEl.style.gridTemplateColumns = 'repeat(' + SIZE + ',' + CELL + 'px)';
        gridEl.style.gridTemplateRows = 'repeat(' + SIZE + ',' + CELL + 'px)';
        renderTiles();
      });

      container.appendChild(root);
      selectedDifficulty = diffSel.value;
      stepLimit = CLASSIC_DIFFICULTY[selectedDifficulty].steps;
      newGame();
      return function cleanup() {
        window.removeEventListener('gamehub-theme-change', onThemeChange);
        window.removeEventListener('resize', this);
      };
    };
  }

  function buildItemGame() {
    return function init(container) {
      const SIZE = 6;
      const INITIAL_STEPS = 4;
      const TOOL_COSTS = { plus: 50, minus: 100, shuffle: 50, remove: 50 };
      const COINS_KEY = 'heshu-items-coins';
      const GAP = 6;
      const PAD = 14;
      let CELL = 48;
      let tiles = [];
      let nextId = 1;
      let steps = INITIAL_STEPS;
      let score = 0;
      let bestScore = GameHub.loadBest('heshu-items-score');
      let coins = 0;
      let gameOver = false;
      let animating = false;
      let queuedClicks = [];
      let turnId = 0;
      let animSpeed = 'medium';
      let selectedTool = null;
      let settled = false;
      let roundActive = false;
      const domMap = new Map();
      themeTilePalette = readThemeTilePalette();

      try {
        const saved = Number.parseInt(localStorage.getItem(COINS_KEY), 10);
        coins = Number.isFinite(saved) && saved > 0 ? saved : 0;
      } catch (error) {
        console.warn('无法读取合数道具版金币：', error);
      }

      const root = document.createElement('div');
      root.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:100%;';

      const bar = document.createElement('div');
      bar.className = 'game-toolbar';
      bar.style.cssText = 'width:100%;justify-content:center;';
      bar.innerHTML =
        '<span class="stat">👣 步数 <b id="hs-steps">' + INITIAL_STEPS + '</b></span>' +
        '<span class="stat">🪙 金币 <b id="hs-coins">' + coins + '</b></span>' +
        '<span class="stat">🏆 分数 <b id="hs-score">0</b></span>' +
        '<span class="stat">🔝 最高分 <b id="hs-max">' + bestScore + '</b></span>' +
        '<label class="stat" style="display:flex;align-items:center;gap:4px;">🎞 动画' +
          '<select id="hs-anim">' +
            '<option value="off">关闭</option>' +
            '<option value="fast">快</option>' +
            '<option value="medium" selected>适中</option>' +
            '<option value="slow">慢</option>' +
          '</select>' +
        '</label>' +
        '<button class="btn btn-sm btn-primary" id="hs-new" type="button">新游戏</button>';
      root.appendChild(bar);

      const tools = document.createElement('div');
      tools.className = 'heshu-tools game-toolbar';
      tools.style.cssText = 'width:100%;justify-content:center;';
      tools.innerHTML =
        '<span class="stat">道具</span>' +
        '<button class="btn btn-sm" type="button" data-tool="plus">+1 · 50 金币</button>' +
        '<button class="btn btn-sm" type="button" data-tool="minus">-1 · 100 金币</button>' +
        '<button class="btn btn-sm" type="button" data-tool="shuffle">打乱重排 · 50 金币</button>' +
        '<button class="btn btn-sm" type="button" data-tool="remove">敲除 · 50 金币</button>';
      root.appendChild(tools);

      const boardEl = document.createElement('div');
      function boardSize() { return SIZE * CELL + (SIZE - 1) * GAP + PAD * 2 + 4; }
      boardEl.style.cssText = 'position:relative;display:grid;grid-template-columns:repeat(' + SIZE + ',' + CELL + 'px);gap:' + GAP + 'px;padding:' + PAD + 'px;width:' + boardSize() + 'px;height:' + boardSize() + 'px;max-width:100%;box-sizing:border-box;background:var(--board-bg);border:2px dashed var(--text);border-radius:12px;';
      const gridEl = document.createElement('div');
      gridEl.style.cssText = 'position:absolute;left:' + PAD + 'px;top:' + PAD + 'px;display:grid;grid-template-columns:repeat(' + SIZE + ',' + CELL + 'px);grid-template-rows:repeat(' + SIZE + ',' + CELL + 'px);gap:' + GAP + 'px;pointer-events:none;';
      for (let i = 0; i < SIZE * SIZE; i++) {
        const cell = document.createElement('div');
        cell.style.cssText = 'border:1px dashed var(--text);border-radius:9px;opacity:.38;';
        gridEl.appendChild(cell);
      }
      boardEl.appendChild(gridEl);
      root.appendChild(boardEl);

      const hint = document.createElement('div');
      hint.className = 'hint-text';
      hint.textContent = '点击数字 +1；使用道具消耗 1 步。所有三连及以上同值会自动合并，并返还步数。';
      root.appendChild(hint);

      const msgEl = document.createElement('div');
      msgEl.className = 'msg';
      msgEl.style.textAlign = 'center';
      root.appendChild(msgEl);

      const stepsEl = bar.querySelector('#hs-steps');
      const coinsEl = bar.querySelector('#hs-coins');
      const scoreEl = bar.querySelector('#hs-score');
      const maxEl = bar.querySelector('#hs-max');
      const animSel = bar.querySelector('#hs-anim');

      function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
      function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      }
      function tileX(col) { return PAD + col * (CELL + GAP); }
      function tileY(row) { return PAD + row * (CELL + GAP); }
      function parseColor(value) { return value; }
      function tileAt(row, col) { return tiles.find(tile => tile.row === row && tile.col === col) || null; }
      function groupKey(tile) { return tile.row + ':' + tile.col; }
      function findGroup(start, visited = new Set()) {
        const queue = [start];
        const group = [];
        visited.add(groupKey(start));
        while (queue.length) {
          const current = queue.pop();
          group.push(current);
          const neighbors = [
            tileAt(current.row - 1, current.col),
            tileAt(current.row + 1, current.col),
            tileAt(current.row, current.col - 1),
            tileAt(current.row, current.col + 1)
          ];
          for (const neighbor of neighbors) {
            if (!neighbor || visited.has(groupKey(neighbor)) || neighbor.value !== start.value) continue;
            visited.add(groupKey(neighbor));
            queue.push(neighbor);
          }
        }
        return group;
      }
      function findGroups() {
        const visited = new Set();
        const groups = [];
        for (const tile of tiles) {
          if (visited.has(groupKey(tile))) continue;
          const group = findGroup(tile, visited);
          if (group.length >= 3) groups.push(group);
        }
        return groups;
      }
      function makeTile(tile) {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;width:' + CELL + 'px;height:' + CELL + 'px;display:flex;align-items:center;justify-content:center;border-radius:10px;left:0;top:0;cursor:pointer;will-change:transform;';
        const label = document.createElement('span');
        label.textContent = tile.value;
        label.style.willChange = 'transform';
        el.appendChild(label);
        el.addEventListener('click', () => onTileClick(tile));
        return el;
      }
      function renderTiles() {
        const duration = animMs();
        const active = new Set();
        for (const tile of tiles) {
          active.add(tile.id);
          let el = domMap.get(tile.id);
          let isNew = false;
          if (!el) {
            el = makeTile(tile);
            domMap.set(tile.id, el);
            boardEl.appendChild(el);
            isNew = true;
          }
          const label = el.querySelector('span');
          const valueChanged = label.textContent !== String(tile.value);
          if (isNew && tile.isNew && duration > 0) {
            el.style.transition = 'none';
            el.style.opacity = '0';
            el.style.transform = 'translate3d(' + tileX(tile.col) + 'px,' +
              (tileY(tile.row) - CELL - GAP) + 'px,0) scale(.88)';
          } else {
            el.style.transition = duration > 0
              ? 'transform ' + duration + 'ms ' + ANIM_EASING
              : 'none';
          }
          paintTile(el, tile.value);
          el.style.transform = 'translate3d(' + tileX(tile.col) + 'px,' + tileY(tile.row) + 'px,0) scale(1)';
          if (valueChanged) {
            label.textContent = tile.value;
            if (duration > 0) {
              label.animate(
                [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
                { duration: Math.min(360, duration), easing: ANIM_EASING }
              );
            }
          }
          if (isNew && tile.isNew && duration > 0) {
            el.style.transform = 'translate3d(' + tileX(tile.col) + 'px,' +
              (tileY(tile.row) - CELL - GAP) + 'px,0) scale(.88)';
            requestAnimationFrame(() => requestAnimationFrame(() => {
              el.style.transition = 'transform ' + duration + 'ms ' + ANIM_EASING +
                ', opacity ' + Math.min(220, duration) + 'ms ease-out';
              el.style.opacity = '1';
              el.style.transform = 'translate3d(' + tileX(tile.col) + 'px,' +
                tileY(tile.row) + 'px,0) scale(1)';
            }));
          }
        }
        for (const [id, el] of domMap) {
          if (!active.has(id)) {
            el.style.pointerEvents = 'none';
            el.style.transition = 'opacity 180ms ease-out, transform 180ms ease-out';
            el.style.opacity = '0';
            el.style.transform += ' scale(.72)';
            setTimeout(() => {
              if (!tiles.some(tile => tile.id === id)) {
                el.remove();
                domMap.delete(id);
              }
            }, 190);
          }
        }
        tiles.forEach(tile => { tile.isNew = false; });
        stepsEl.textContent = steps;
        coinsEl.textContent = coins;
        scoreEl.textContent = score;
        maxEl.textContent = bestScore;
      }
      function onThemeChange() {
        themeTilePalette = readThemeTilePalette();
        for (const tile of tiles) {
          const el = domMap.get(tile.id);
          if (el) paintTile(el, tile.value);
        }
      }
      function saveCoins(value) {
        try {
          localStorage.setItem(COINS_KEY, String(value));
        } catch (error) {
          console.error('保存合数道具版金币失败：', error);
          msgEl.textContent = '金币保存失败，请检查浏览器存储空间后重试。';
          msgEl.className = 'msg danger';
          return false;
        }
        coins = value;
        coinsEl.textContent = coins;
        return true;
      }
      function animMs() { return ANIM_MS[animSpeed]; }
      function waitForAnimation() {
        const duration = animMs();
        return duration > 0 ? new Promise(resolve => setTimeout(resolve, duration + 24)) : Promise.resolve();
      }
      function applyGravity() {
        for (let col = 0; col < SIZE; col++) {
          const column = tiles.filter(tile => tile.col === col).sort((a, b) => a.row - b.row);
          for (let row = SIZE - 1; row >= 0; row--) {
            const occupied = column.some(tile => tile.row === row);
            if (occupied) continue;
            const moving = column.filter(tile => tile.row < row).sort((a, b) => b.row - a.row)[0];
            if (moving) moving.row = row;
          }
        }
      }
      function refillTop() {
        for (let col = 0; col < SIZE; col++) {
          for (let row = 0; row < SIZE; row++) {
            if (!tiles.some(tile => tile.row === row && tile.col === col)) {
              tiles.push({ id: nextId++, value: randInt(1, 6), row, col, isNew: true });
            }
          }
        }
      }
      async function resolveBoard(currentTurn, directTile) {
        let direct = false;
        let chains = 0;
        for (let guard = 0; guard < 500; guard++) {
          if (currentTurn !== turnId) return { direct, chains };
          const groups = findGroups();
          if (!groups.length) break;
          for (const group of groups) {
            const isDirect = directTile && !direct && group.includes(directTile);
            const target = isDirect ? directTile : group[0];
            if (isDirect) direct = true;
            else {
              chains += 1;
              steps += 1;
            }
            const mergedValue = target.value + 1;
            score += target.value * group.length;
            for (const member of group) {
              if (member === target) continue;
              const index = tiles.indexOf(member);
              if (index >= 0) tiles.splice(index, 1);
            }
            target.value = mergedValue;
          }
          renderTiles();
          await waitForAnimation();
          if (currentTurn !== turnId) return { direct, chains };
          applyGravity();
          refillTop();
          renderTiles();
          await waitForAnimation();
        }
        return { direct, chains };
      }
      function settleRound() {
        if (settled || !roundActive) return null;
        settled = true;
        const earned = Math.floor(score / 50);
        const payoutSaved = saveCoins(coins + earned);
        const isNew = GameHub.saveBest('heshu-items-score', score);
        bestScore = Math.max(bestScore, score);
        maxEl.textContent = bestScore;
        roundActive = false;
        return { earned, payoutSaved, isNew, score };
      }
      function finishGame() {
        if (settled) return;
        gameOver = true;
        steps = 0;
        const result = settleRound();
        if (!result) return;
        msgEl.textContent = '💥 步数耗尽！得分 ' + result.score + '，结算获得 ' + result.earned +
          ' 金币' + (result.payoutSaved ? '' : '（保存失败）') + (result.isNew ? ' · 新纪录！' : '');
        msgEl.className = 'msg danger';
      }
      async function performAction(action, currentTurn) {
        if (steps <= 0 || gameOver) return;
        let target = action.tileId ? tiles.find(tile => tile.id === action.tileId) : null;
        if (action.kind === 'tile' && !target) return;
        if (action.kind === 'tile' && action.tool) {
          if (action.tool === 'minus' && target.value <= 1) {
            msgEl.textContent = '数字最小为 1，不能继续 -1。';
            msgEl.className = 'msg warn';
            return;
          }
          const cost = TOOL_COSTS[action.tool];
          if (coins < cost) {
            msgEl.textContent = '金币不足：' + cost + ' 金币。';
            msgEl.className = 'msg warn';
            return;
          }
          if (!saveCoins(coins - cost)) return;
        } else if (action.kind === 'shuffle') {
          const cost = TOOL_COSTS.shuffle;
          if (coins < cost) {
            msgEl.textContent = '金币不足：' + cost + ' 金币。';
            msgEl.className = 'msg warn';
            return;
          }
          if (!saveCoins(coins - cost)) return;
        }
        roundActive = true;
        steps = Math.max(0, steps - 1);
        const directTile = action.kind === 'tile' && !action.tool ? target : null;
        if (action.kind === 'tile') {
          if (action.tool === 'minus') target.value -= 1;
          else if (action.tool === 'remove') {
            tiles.splice(tiles.indexOf(target), 1);
          } else {
            target.value += 1;
          }
        } else if (action.kind === 'shuffle') {
          const positions = shuffle(tiles.map(tile => ({ row: tile.row, col: tile.col })));
          tiles.forEach((tile, index) => {
            tile.row = positions[index].row;
            tile.col = positions[index].col;
          });
        }
        renderTiles();
        await waitForAnimation();
        if (currentTurn !== turnId) return;
        if (action.kind === 'tile' && action.tool === 'remove') {
          applyGravity();
          refillTop();
          renderTiles();
          await waitForAnimation();
        }
        const { direct, chains } = await resolveBoard(currentTurn, directTile);
        if (currentTurn !== turnId) return;
        if (steps <= 0) {
          finishGame();
        } else {
          msgEl.textContent = direct
            ? (chains ? '✨ 直接合并 + 连锁 ' + chains + ' 次，补步数！' : '✅ 合并成功')
            : chains ? '✨ 自动连锁 ' + chains + ' 次，补步数！' : action.kind === 'shuffle' ? '🔀 已重新排布，没有触发合并。' : '❌ 未合并，步数 -1';
          msgEl.className = 'msg ' + (direct || chains ? 'ok' : 'warn');
        }
        renderTiles();
      }
      async function processQueue() {
        if (animating || gameOver) return;
        const action = queuedClicks.shift();
        if (!action) return;
        animating = true;
        const currentTurn = ++turnId;
        await performAction(action, currentTurn);
        if (currentTurn !== turnId) return;
        animating = false;
        if (queuedClicks.length) void processQueue();
      }
      function onTileClick(tile) {
        const tool = selectedTool;
        if (tool) {
          selectedTool = null;
          tools.querySelectorAll('[data-tool]').forEach(btn => btn.classList.remove('btn-primary'));
        }
        if (tool) {
          queuedClicks.push({ kind: 'tile', tileId: tile.id, tool });
        } else {
          queuedClicks.push({ kind: 'tile', tileId: tile.id });
        }
        if (!animating) void processQueue();
      }
      function selectTool(tool) {
        selectedTool = selectedTool === tool ? null : tool;
        tools.querySelectorAll('[data-tool]').forEach(button => {
          const active = button.dataset.tool === selectedTool;
          button.classList.toggle('btn-primary', active);
        });
      }
      tools.addEventListener('click', event => {
        const button = event.target.closest('[data-tool]');
        if (!button) return;
        const tool = button.dataset.tool;
        if (tool === 'shuffle') {
          selectedTool = null;
          tools.querySelectorAll('[data-tool]').forEach(btn => btn.classList.remove('btn-primary'));
          queuedClicks.push({ kind: 'shuffle' });
        } else {
          selectTool(tool);
        }
        if (!animating) void processQueue();
      });
      function newGame() {
        const result = settleRound();
        turnId++;
        queuedClicks = [];
        selectedTool = null;
        tiles = [];
        nextId = 1;
        score = 0;
        steps = INITIAL_STEPS;
        settled = false;
        roundActive = false;
        gameOver = false;
        msgEl.textContent = result
          ? '上一局结算：得分 ' + result.score + '，获得 ' + result.earned + ' 金币' +
            (result.payoutSaved ? '' : '（金币保存失败）') + (result.isNew ? ' · 新纪录！' : '')
          : '';
        msgEl.className = result ? (result.payoutSaved ? 'msg ok' : 'msg danger') : 'msg';
        domMap.forEach(el => el.remove());
        domMap.clear();
        let clean = false;
        let guard = 0;
        while (!clean && guard++ < 5000) {
          const values = [];
          while (values.length < SIZE * SIZE) values.push(randInt(1, 6));
          shuffle(values);
          tiles = values.map((value, index) => ({ id: nextId++, value, row: Math.floor(index / SIZE), col: index % SIZE }));
          clean = findGroups().length === 0;
        }
        renderTiles();
      }
      function onResize() {
        const containerWidth = container.clientWidth || 420;
        const fitted = Math.max(28, Math.min(48, Math.floor((Math.min(720, containerWidth - 32) - GAP * (SIZE - 1) - PAD * 2 - 4) / SIZE)));
        if (fitted === CELL) return;
        CELL = fitted;
        boardEl.style.width = boardSize() + 'px';
        boardEl.style.height = boardSize() + 'px';
        boardEl.style.gridTemplateColumns = 'repeat(' + SIZE + ',' + CELL + 'px)';
        gridEl.style.gridTemplateColumns = 'repeat(' + SIZE + ',' + CELL + 'px)';
        gridEl.style.gridTemplateRows = 'repeat(' + SIZE + ',' + CELL + 'px)';
        renderTiles();
      }
      bar.querySelector('#hs-new').addEventListener('click', newGame);
      animSel.addEventListener('change', () => { animSpeed = animSel.value; });
      window.addEventListener('resize', onResize);
      window.addEventListener('gamehub-theme-change', onThemeChange);
      container.appendChild(root);
      newGame();
      return function cleanup() {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('gamehub-theme-change', onThemeChange);
      };
    };
  }

  GameHub.register({
    id: 'heshu',
    title: '合数',
    icon: '🔢',
    desc: '6×6 经典合并消消乐：易中难三种难度',
    badge: '经典',
    rules: [
      '棋盘为 6×6，点击数字会让它 +1。',
      '当同值且上下左右相连的数字达到 3 个及以上时，会自动合并，且允许连锁。',
      '每局都有难度上限：易 15 步、中 10 步、难 5 步。',
      '三种难度不开放道具功能，保留原始经典玩法。'
    ],
    init: function (container) {
      return buildClassicGame()(container);
    }
  });

  GameHub.register({
    id: 'heshu-items',
    title: '合数·道具版',
    icon: '🧩',
    desc: '6×6 道具合并消消乐：每局 4 步，金币道具与连锁返步',
    badge: '道具版',
    rules: [
      '每局初始 4 步，点击数字使其 +1；每次普通操作和道具操作都会消耗 1 步。',
      '+1 50 金币、-1 100 金币、打乱重排 50 金币、敲除 50 金币。',
      '所有 3 个及以上上下左右相连的同值方块会自动合并，并在下落补位后继续连锁。',
      '游戏结束时按 50 分兑换 1 金币结算，金币保存在当前浏览器。'
    ],
    init: function (container) {
      return buildItemGame()(container);
    }
  });
})();
