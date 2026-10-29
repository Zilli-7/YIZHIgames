/**
 * 合数道具版 —— 6×6 合并消消乐（方块对象 + 绝对定位，支持动画）
 * 规则：
 *  - 初始数字范围 1~6；点击方块使其 +1。
 *  - 仅当点击方块所在的上下左右连通同值方块达到 3 个时，合并为更大数字。
 *  - 合并结果留在点击位置；各列上方方块下落，列顶空位再补入随机数字。
 *  - 每局初始 4 步；每组自动连锁合并返还 1 步，步数不设上限。
 *  - 道具消耗金币：+1 / 打乱 / 敲除 50 金币，-1 100 金币。
 * 动画：逐步展示数字升级、合并、下落和列顶补块，速度可调。
 * 配色：数字块使用当前主题色卡，并按数值映射到不同明暗层级。
 */
(function () {
  const SIZE = 6;
  const INITIAL_STEPS = 4;
  const TOOL_COSTS = { plus: 50, minus: 100, shuffle: 50, remove: 50 };
  const COINS_KEY = 'heshu-items-coins';
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
    function fitCellSize() {
      const styles = getComputedStyle(container);
      const availableWidth = Math.min(720, container.clientWidth -
        parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight));
      return Math.max(28, Math.min(48, Math.floor(
        (availableWidth - GAP * (SIZE - 1) - PAD * 2 - 4) / SIZE
      )));
    }
    CELL = fitCellSize();
    let tiles = [];       // { id, value, row, col, isNew, justMerged }
    let nextId = 1;
    const domMap = new Map();
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

    try {
      const savedCoins = Number.parseInt(localStorage.getItem(COINS_KEY), 10);
      coins = Number.isFinite(savedCoins) && savedCoins > 0 ? savedCoins : 0;
    } catch (error) {
      console.warn('无法读取合数道具版金币：', error);
    }

    // ---------- UI ----------
    const root = document.createElement('div');
    root.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:100%;';

    const bar = document.createElement('div');
    bar.className = 'game-toolbar';
    bar.style.cssText = 'width:100%;justify-content:center;';
    bar.innerHTML =
      '<span class="stat">👣 步数 <b id="hs-steps">' + INITIAL_STEPS + '</b></span>' +
      '<span class="stat">🪙 金币 <b id="hs-coins">' + coins + '</b></span>' +
      '<span class="stat">🏆 分数 <b id="hs-score">0</b></span>' +
      '<span class="stat">🔝 道具版最高分 <b id="hs-max">' + bestScore + '</b></span>' +
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

    const tools = document.createElement('div');
    tools.className = 'heshu-tools game-toolbar';
    tools.style.cssText = 'width:100%;justify-content:center;';
    tools.innerHTML =
      '<span class="stat">道具（每次操作消耗 1 步）</span>' +
      '<button class="btn btn-sm" type="button" data-tool="plus">+1 · 50 金币</button>' +
      '<button class="btn btn-sm" type="button" data-tool="minus">-1 · 100 金币</button>' +
      '<button class="btn btn-sm" type="button" data-tool="shuffle">打乱重排 · 50 金币</button>' +
      '<button class="btn btn-sm" type="button" data-tool="remove">敲除 · 50 金币</button>';
    root.appendChild(tools);

    const boardEl = document.createElement('div');
    function boardSize() { return SIZE * CELL + (SIZE - 1) * GAP + PAD * 2 + 4; }
    boardEl.style.cssText =
      'position:relative;display:grid;grid-template-columns:repeat(' + SIZE + ',' + CELL + 'px);' +
      'gap:' + GAP + 'px;padding:' + PAD + 'px;width:' + boardSize() + 'px;height:' + boardSize() + 'px;' +
      'max-width:100%;box-sizing:border-box;background:var(--board-bg);border:2px dashed var(--text);border-radius:12px;';
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
    hint.textContent = '点击数字消耗 1 步并使其 +1；选择道具后点选目标数字。自动合并每组返还 1 步，步数上限 4。';
    root.appendChild(hint);

    const msgEl = document.createElement('div');
    msgEl.className = 'msg';
    msgEl.style.textAlign = 'center';
    root.appendChild(msgEl);

    container.appendChild(root);

    const stepsEl = bar.querySelector('#hs-steps');
    const coinsEl = bar.querySelector('#hs-coins');
    const scoreEl = bar.querySelector('#hs-score');
    const maxEl = bar.querySelector('#hs-max');
    const animSel = bar.querySelector('#hs-anim');

    function animMs() { return ANIM_MS[animSpeed]; }

    function onResize() {
      const fittedSize = fitCellSize();
      if (fittedSize === CELL) return;
      CELL = fittedSize;
      boardEl.style.width = boardSize() + 'px';
      boardEl.style.height = boardSize() + 'px';
      boardEl.style.gridTemplateColumns = 'repeat(' + SIZE + ',' + CELL + 'px)';
      gridEl.style.gridTemplateColumns = 'repeat(' + SIZE + ',' + CELL + 'px)';
      gridEl.style.gridTemplateRows = 'repeat(' + SIZE + ',' + CELL + 'px)';
      gridEl.querySelectorAll('div').forEach(cell => {
        cell.style.width = CELL + 'px';
        cell.style.height = CELL + 'px';
      });
      for (const tile of tiles) {
        const el = domMap.get(tile.id);
        if (el) {
          el.style.width = CELL + 'px';
          el.style.height = CELL + 'px';
        }
      }
      renderTiles();
    }

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
        maxEl.textContent = score;
      } else {
        maxEl.textContent = bestScore;
      }
    }

    // ---------- 游戏流程 ----------
    function waitForAnimation(dur) {
      return dur > 0 ? new Promise(resolve => setTimeout(resolve, dur + 24)) : Promise.resolve();
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

    function selectTool(tool) {
      selectedTool = selectedTool === tool ? null : tool;
      tools.querySelectorAll('[data-tool]').forEach(button => {
        const selected = button.dataset.tool === selectedTool;
        button.classList.toggle('btn-primary', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      if (selectedTool) {
        const labels = { plus: '+1', minus: '-1', remove: '敲除' };
        msgEl.textContent = '已选择 ' + labels[selectedTool] + ' 道具，请点击一个数字使用。';
        msgEl.className = 'msg';
      }
    }

    function newGame() {
      turnId++;
      animating = false;
      queuedClicks = [];
      selectedTool = null;
      tools.querySelectorAll('[data-tool]').forEach(button => {
        button.classList.remove('btn-primary');
        button.setAttribute('aria-pressed', 'false');
      });
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

      steps = INITIAL_STEPS;
      score = 0;
      gameOver = false;
      settled = false;
      msgEl.textContent = '';
      msgEl.className = 'msg';
      renderTiles();
    }

    function enqueueAction(action) {
      if (gameOver) return;
      queuedClicks.push(action);
      if (!animating) void processActionQueue();
    }

    async function resolveBoard(currentTurn, directTile) {
      let direct = false;
      let chains = 0;
      for (let guard = 0; guard < 500; guard++) {
        if (currentTurn !== turnId) return { direct, chains };
        const groups = findGroups();
        if (groups.length === 0) break;

        for (const group of groups) {
          const isDirect = directTile && !direct && group.includes(directTile);
          const target = isDirect ? directTile : group[0];
          if (isDirect) direct = true;
          else {
            chains++;
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
          target.justMerged = true;
        }
        renderTiles();
        await waitForAnimation(animMs());
        if (currentTurn !== turnId) return { direct, chains };

        applyGravity();
        refillTop();
        renderTiles();
        await waitForAnimation(animMs());
      }
      return { direct, chains };
    }

    function finishGame() {
      if (settled) return;
      settled = true;
      steps = 0;
      gameOver = true;
      const earned = Math.floor(score / 50);
      const payoutSaved = saveCoins(coins + earned);
      const isNew = GameHub.saveBest('heshu-items-score', score);
      bestScore = Math.max(bestScore, score);
      maxEl.textContent = bestScore;
      msgEl.textContent = '💥 步数耗尽！得分 ' + score +
        '，结算获得 ' + earned + ' 金币' + (payoutSaved ? '' : '（金币保存失败）') +
        (isNew ? ' · 道具版新纪录！' : '');
      msgEl.className = 'msg danger';
    }

    async function performAction(action, currentTurn) {
      const dur = animMs();
      if (steps <= 0) return;
      let target = action.tileId
        ? tiles.find(tile => tile.id === action.tileId)
        : null;
      if (action.kind === 'tile' && !target) return;

      if (action.kind === 'tile' && action.tool) {
        if (action.tool === 'minus' && target.value <= 1) {
          msgEl.textContent = '数字最小为 1，无法使用 -1 道具。';
          msgEl.className = 'msg warn';
          return;
        }
        const cost = TOOL_COSTS[action.tool];
        if (coins < cost) {
          msgEl.textContent = '金币不足：该道具需要 ' + cost + ' 金币。';
          msgEl.className = 'msg warn';
          return;
        }
        if (!saveCoins(coins - cost)) return;
      } else if (action.kind === 'shuffle') {
        const cost = TOOL_COSTS.shuffle;
        if (coins < cost) {
          msgEl.textContent = '金币不足：该道具需要 ' + cost + ' 金币。';
          msgEl.className = 'msg warn';
          return;
        }
        if (!saveCoins(coins - cost)) return;
      }

      steps = Math.max(0, steps - 1);
      let directTile = null;
      const autoAction = action.kind === 'shuffle' || Boolean(action.tool);

      if (action.kind === 'tile' && action.tool === 'remove') {
        tiles.splice(tiles.indexOf(target), 1);
        renderTiles();
        await waitForAnimation(dur);
        if (currentTurn !== turnId) return;
        applyGravity();
        refillTop();
      } else if (action.kind === 'tile') {
        if (action.tool === 'minus') target.value -= 1;
        else target.value += 1;
        target.justMerged = Boolean(action.tool);
        if (!action.tool) directTile = target;
      } else if (action.kind === 'shuffle') {
        const positions = shuffle(tiles.map(tile => ({ row: tile.row, col: tile.col })));
        tiles.forEach((tile, index) => {
          tile.row = positions[index].row;
          tile.col = positions[index].col;
        });
      }

      if (currentTurn !== turnId) return;
      renderTiles();
      await waitForAnimation(dur);
      if (currentTurn !== turnId) return;
      const { direct, chains } = await resolveBoard(currentTurn, autoAction ? null : directTile);
      if (currentTurn !== turnId) return;

      if (steps <= 0) {
        finishGame();
      } else {
        msgEl.textContent = direct
          ? (chains ? '✨ 直接合并 + 连锁 ' + chains + ' 次，补步数！' : '✅ 合并成功')
          : chains ? '✨ 自动连锁 ' + chains + ' 次，补步数！'
            : action.kind === 'shuffle' ? '🔀 已重新排布，没有触发合并。'
              : autoAction ? '✅ 道具使用成功，没有触发合并。'
                : '❌ 未合并，步数 -1';
        msgEl.className = 'msg ' + (direct || chains ? 'ok' : 'warn');
      }
      renderTiles();
    }

    async function processActionQueue() {
      if (animating || gameOver) return;
      const action = queuedClicks.shift();
      if (!action) return;
      animating = true;
      const currentTurn = ++turnId;
      await performAction(action, currentTurn);
      if (currentTurn !== turnId) return;
      animating = false;
      if (gameOver) queuedClicks = [];
      else if (queuedClicks.length) void processActionQueue();
    }

    function onTileClick(tile) {
      const tool = selectedTool;
      if (tool) selectTool(tool);
      enqueueAction({ kind: 'tile', tileId: tile.id, tool });
    }

    tools.addEventListener('click', event => {
      const button = event.target.closest('[data-tool]');
      if (!button) return;
      const tool = button.dataset.tool;
      if (tool === 'shuffle') {
        selectTool(null);
        enqueueAction({ kind: 'shuffle' });
      } else {
        selectTool(tool);
      }
    });

    root.querySelector('#hs-new').addEventListener('click', newGame);
    animSel.addEventListener('change', () => { animSpeed = animSel.value; });
    window.addEventListener('resize', onResize);

    newGame();

    return function cleanup() {
      window.removeEventListener('gamehub-theme-change', onThemeChange);
      window.removeEventListener('resize', onResize);
    };
  }

  GameHub.register({
    id: 'heshu-items',
    title: '合数·道具版',
    icon: '🧩',
    desc: '6×6 道具合并消消乐：使用金币道具操作，自动连锁合并',
    badge: '道具版',
    rules: [
      '棋盘为 6×6，每局初始 4 步。普通点击使数字 +1；每次普通操作或道具操作消耗 1 步。',
      '+1（50 金币）、-1（100 金币）和敲除（50 金币）需先选择道具，再点击目标数字；数字最小为 1。',
      '打乱重排（50 金币）会重新排列棋盘上现有方块，不新增数字。敲除后本列上方方块下落，再从顶部补入新数字。',
      '每次棋盘改变后扫描全盘；所有 3 个及以上上下左右连通的同值方块自动合并升级，下落补位后继续连锁。每组自动合并返还 1 步，步数不设上限。',
      '游戏结束时按 50 分兑换 1 金币结算并累积金币（不足 50 分部分不兑换）。金币保存在当前浏览器。'
    ],
    init
  });
})();
