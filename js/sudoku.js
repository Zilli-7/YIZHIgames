/**
 * 数独 —— 9×9，唯一解生成 + 难度分级 + 校验 + 提示
 * 点击格子后按数字键 / 数字按钮填入；支持笔记（候选数）。
 */
(function () {
  const DIFFICULTY = {
    easy: { label: '简单', remove: 38 },
    medium: { label: '中等', remove: 46 },
    hard: { label: '困难', remove: 54 }
  };

  // ---------- 求解器 ----------
  function solve(board, countLimit) {
    // board: 81 长度数组，0 = 空
    const limit = countLimit || 1;
    const solutions = [];
    const copy = board.slice();
    (function backtrack(b) {
      if (solutions.length >= limit) return;
      const idx = b.indexOf(0);
      if (idx === -1) { solutions.push(b.slice()); return; }
      const r = Math.floor(idx / 9), c = idx % 9;
      const used = new Set();
      for (let i = 0; i < 9; i++) {
        used.add(b[r * 9 + i]);
        used.add(b[i * 9 + c]);
      }
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++)
          used.add(b[(br + dr) * 9 + (bc + dc)]);
      const cands = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9].filter(n => !used.has(n)));
      for (const n of cands) {
        b[idx] = n;
        backtrack(b);
        b[idx] = 0;
        if (solutions.length >= limit) return;
      }
    })(copy);
    return solutions;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function generatePuzzle(difficulty) {
    const target = DIFFICULTY[difficulty].remove;
    // 生成完整解
    let full = null;
    for (let attempt = 0; attempt < 50 && !full; attempt++) {
      const sols = solve(new Array(81).fill(0), 1);
      if (sols.length) full = sols[0];
    }
    if (!full) return null;
    // 逐步挖洞，保证唯一解
    const puzzle = full.slice();
    const positions = shuffle(Array.from({ length: 81 }, (_, i) => i));
    let removed = 0;
    for (const pos of positions) {
      if (removed >= target) break;
      const backup = puzzle[pos];
      puzzle[pos] = 0;
      const sols = solve(puzzle, 2);
      if (sols.length === 1) {
        removed++;
      } else {
        puzzle[pos] = backup; // 恢复，保持唯一解
      }
    }
    return { puzzle, solution: full };
  }

  // ---------- 游戏 ----------
  function init(container) {
    container.innerHTML = '';
    let solution = null;
    let puzzle = null;
    let grid = [];      // 当前玩家状态 0-9（0 空）
    let given = [];     // 是否题面固定
    let notes = [];     // 候选数集合（数组 of Set）
    let selected = -1;
    let noteMode = false;
    let timer = null;
    let seconds = 0;

    const root = document.createElement('div');
    root.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
    root.innerHTML =
      '<div class="game-toolbar" style="width:100%;justify-content:center;">' +
        '<select id="sd-diff">' +
          '<option value="easy">简单</option>' +
          '<option value="medium" selected>中等</option>' +
          '<option value="hard">困难</option>' +
        '</select>' +
        '<span class="stat">⏱ <b id="sd-time">0</b>s</span>' +
        '<button class="btn btn-sm" id="sd-note" type="button">✏️ 笔记</button>' +
        '<button class="btn btn-sm" id="sd-check" type="button">✅ 检查</button>' +
        '<button class="btn btn-sm" id="sd-hint" type="button">💡 提示</button>' +
        '<button class="btn btn-sm btn-primary" id="sd-new" type="button">新游戏</button>' +
      '</div>' +
      '<div id="sd-board" style="display:grid;grid-template-columns:repeat(9,44px);gap:0;border:3px solid #0000;border-radius:8px;overflow:hidden;"></div>' +
      '<div id="sd-pad" style="display:grid;grid-template-columns:repeat(9,44px);gap:4px;margin-top:14px;"></div>' +
      '<div id="sd-msg" class="msg" style="text-align:center;"></div>';

    container.appendChild(root);
    const boardEl = root.querySelector('#sd-board');
    const padEl = root.querySelector('#sd-pad');
    const msgEl = root.querySelector('#sd-msg');
    const noteBtn = root.querySelector('#sd-note');
    const diffSel = root.querySelector('#sd-diff');
    const timeEl = root.querySelector('#sd-time');

    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
    function startTimer() {
      if (timer) return;
      timer = setInterval(() => { seconds++; timeEl.textContent = seconds; }, 1000);
    }

    function newGame() {
      stopTimer();
      seconds = 0; timeEl.textContent = '0';
      const gen = generatePuzzle(diffSel.value);
      if (!gen) { setMsg('生成失败，请重试', 'danger'); return; }
      puzzle = gen.puzzle;
      solution = gen.solution;
      grid = puzzle.slice();
      given = puzzle.map(v => v !== 0);
      notes = Array.from({ length: 81 }, () => new Set());
      selected = -1;
      msgEl.textContent = '';
      msgEl.className = 'msg';
      render();
      startTimer();
    }

    function setMsg(text, tone) {
      msgEl.textContent = text;
      msgEl.className = 'msg ' + (tone || '');
    }

    function render() {
      boardEl.innerHTML = '';
      for (let i = 0; i < 81; i++) {
        const r = Math.floor(i / 9), c = i % 9;
        const cell = document.createElement('div');
        cell.style.cssText =
          'width:44px;height:44px;display:flex;align-items:center;justify-content:center;' +
          'font-size:1.15rem;font-weight:600;cursor:pointer;position:relative;' +
          'background:' + (selected === i ? 'var(--accent)' : (given[i] ? 'var(--surface)' : 'var(--board-bg)')) + ';' +
          'border:1px solid var(--line);';
        // 3×3 宫粗边框
        cell.style.borderRight = (c % 3 === 2 && c !== 8) ? '2px solid var(--accent-soft)' : '1px solid var(--line)';
        cell.style.borderBottom = (r % 3 === 2 && r !== 8) ? '2px solid var(--accent-soft)' : '1px solid var(--line)';

        if (grid[i] !== 0) {
          const wrong = given[i] === false && grid[i] !== solution[i];
          cell.textContent = grid[i];
          cell.style.color = selected === i ? 'var(--accent-ink)' : (given[i] ? 'var(--text)' : (wrong ? 'var(--danger)' : 'var(--accent-soft)'));
        } else if (notes[i].size > 0) {
          cell.innerHTML = '<span style="font-size:.6rem;font-weight:400;color:var(--text-dim);display:grid;grid-template-columns:repeat(3,12px);line-height:1;">' +
            [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => '<span style="text-align:center;">' + (notes[i].has(n) ? n : '') + '</span>').join('') +
            '</span>';
        }
        cell.addEventListener('click', () => { selected = i; render(); });
        boardEl.appendChild(cell);
      }
      noteBtn.textContent = noteMode ? '✏️ 笔记：开' : '✏️ 笔记：关';
      noteBtn.style.background = noteMode ? 'var(--accent)' : '';
    }

    function renderPad() {
      padEl.innerHTML = '';
      for (let n = 1; n <= 9; n++) {
        const b = document.createElement('button');
        b.className = 'btn';
        b.style.cssText = 'width:44px;height:44px;font-size:1.1rem;font-weight:700;';
        b.textContent = n;
        b.addEventListener('click', () => input(n));
        padEl.appendChild(b);
      }
    }

    function input(n) {
      if (selected < 0) { setMsg('先点选一个格子', 'warn'); return; }
      if (given[selected]) { setMsg('题面数字不可修改', 'warn'); return; }
      if (n === 0) {
        // 清除
        grid[selected] = 0;
        notes[selected].clear();
      } else if (noteMode) {
        if (grid[selected] === 0) {
          if (notes[selected].has(n)) notes[selected].delete(n); else notes[selected].add(n);
        }
      } else {
        notes[selected].clear();
        grid[selected] = grid[selected] === n ? 0 : n;
      }
      checkWin();
      render();
    }

    function checkWin() {
      if (grid.every((v, i) => v === solution[i])) {
        stopTimer();
        setMsg('🎉 恭喜完成！用时 ' + seconds + ' 秒', 'ok');
      }
    }

    function doCheck() {
      let wrong = 0, empty = 0;
      for (let i = 0; i < 81; i++) {
        if (grid[i] === 0) empty++;
        else if (grid[i] !== solution[i]) wrong++;
      }
      if (empty === 0 && wrong === 0) setMsg('✅ 全部正确！', 'ok');
      else if (wrong > 0) setMsg('⚠️ 有 ' + wrong + ' 处错误，请检查红色格子', 'danger');
      else setMsg('目前 ' + empty + ' 格待填，暂无错误', 'warn');
    }

    function doHint() {
      // 找一个空格或错格，填入正确值
      let target = -1;
      for (let i = 0; i < 81; i++) {
        if (grid[i] !== solution[i]) { target = i; break; }
      }
      if (target < 0) { setMsg('已经完成了！', 'ok'); return; }
      grid[target] = solution[target];
      notes[target].clear();
      selected = target;
      render();
      checkWin();
    }

    // 键盘输入
    function onKey(e) {
      if (e.key >= '1' && e.key <= '9') input(parseInt(e.key, 10));
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') input(0);
      else if (e.key === 'n' || e.key === 'N') { noteMode = !noteMode; render(); }
    }

    noteBtn.addEventListener('click', () => { noteMode = !noteMode; render(); });
    root.querySelector('#sd-check').addEventListener('click', doCheck);
    root.querySelector('#sd-hint').addEventListener('click', doHint);
    root.querySelector('#sd-new').addEventListener('click', newGame);
    diffSel.addEventListener('change', newGame);
    document.addEventListener('keydown', onKey);

    renderPad();
    newGame();

    return function cleanup() {
      stopTimer();
      document.removeEventListener('keydown', onKey);
    };
  }

  GameHub.register({
    id: 'sudoku',
    title: '数独',
    icon: '🔢',
    desc: '9×9 数独，唯一解生成，支持笔记与提示',
    badge: '数字',
    rules: [
      '在 9×9 棋盘中填入 1–9，使每一行、每一列和每个 3×3 宫内数字都不重复。',
      '点击空格后，使用数字键或下方数字按钮填写；题面给出的数字不能修改。',
      '开启笔记模式可记录候选数字；使用检查或提示辅助解题。',
      '正确填满棋盘即可完成，可选择简单、中等或困难难度。'
    ],
    init
  });
})();
