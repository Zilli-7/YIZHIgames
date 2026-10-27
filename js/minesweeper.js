/**
 * 扫雷 —— 经典规则
 * 左键翻开，右键插旗；首点必安全；数字 0 自动展开；计时 + 剩余雷数。
 * 支持初级 / 中级 / 高级 / 自定义。
 */
(function () {
  const PRESETS = {
    beginner: { label: '初级', rows: 9, cols: 9, mines: 10 },
    intermediate: { label: '中级', rows: 16, cols: 16, mines: 40 },
    expert: { label: '高级', rows: 16, cols: 30, mines: 99 }
  };

  function init(container) {
    container.innerHTML = '';
    const state = {
      rows: 9, cols: 9, mines: 10,
      board: [],        // -1 = mine, 0-8 = count
      revealed: [],     // boolean
      flagged: [],      // boolean
      cellSize: 34,
      flagMode: false,
      firstClick: true,
      gameOver: false,
      won: false,
      timer: null,
      seconds: 0
    };

    const root = document.createElement('div');
    root.className = 'minesweeper-game';
    root.innerHTML =
      '<div class="game-toolbar">' +
        '<select id="ms-level">' +
          '<option value="beginner">初级 9×9 · 10 雷</option>' +
          '<option value="intermediate">中级 16×16 · 40 雷</option>' +
          '<option value="expert">高级 16×30 · 99 雷</option>' +
          '<option value="custom">自定义</option>' +
        '</select>' +
        '<span class="stat">💣 剩余 <b id="ms-mines">0</b></span>' +
        '<span class="stat">⏱ <b id="ms-time">0</b>s</span>' +
        '<button class="btn btn-sm" id="ms-restart" type="button">🔄 重开</button>' +
      '</div>' +
      '<div id="ms-custom" style="display:none;gap:8px;margin-bottom:12px;flex-wrap:wrap;">' +
        '<input id="ms-rows" type="number" min="5" max="30" value="12" style="width:70px;" title="行">' +
        '<input id="ms-cols" type="number" min="5" max="40" value="12" style="width:70px;" title="列">' +
        '<input id="ms-mine-count" type="number" min="1" max="500" value="20" style="width:70px;" title="雷数">' +
        '<button class="btn btn-sm" id="ms-apply-custom" type="button">应用</button>' +
      '</div>' +
      '<div class="minesweeper-actions">' +
        '<div class="hint-text">点按翻开</div>' +
        '<button class="btn btn-sm" id="ms-flag-mode" type="button" aria-pressed="false">🚩 插旗模式：关</button>' +
      '</div>' +
      '<div id="ms-board-wrap" style="display:flex;width:100%;max-width:100%;overflow-x:auto;overscroll-behavior-x:contain;">' +
        '<div id="ms-board" style="display:grid;gap:1px;width:max-content;padding:8px;border:2px dashed var(--text);border-radius:8px;user-select:none;touch-action:manipulation;"></div>' +
      '</div>' +
      '<div class="hint-text">右键或长按插旗；开启插旗模式后点按棋盘切换旗帜。</div>';

    container.appendChild(root);

    const levelSel = root.querySelector('#ms-level');
    const customBox = root.querySelector('#ms-custom');
    const boardEl = root.querySelector('#ms-board');
    const boardWrap = root.querySelector('#ms-board-wrap');
    const minesEl = root.querySelector('#ms-mines');
    const timeEl = root.querySelector('#ms-time');
    const flagModeBtn = root.querySelector('#ms-flag-mode');

    function fitCellSize() {
      const availableWidth = boardWrap.clientWidth;
      return Math.max(16, Math.min(34,
        Math.floor((availableWidth - 20 - (state.cols - 1)) / state.cols)));
    }

    function stopTimer() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }
    function startTimer() {
      if (state.timer) return;
      state.timer = setInterval(() => {
        state.seconds++;
        timeEl.textContent = state.seconds;
      }, 1000);
    }

    function initBoard(rows, cols, mines) {
      stopTimer();
      state.rows = rows; state.cols = cols; state.mines = mines;
      state.firstClick = true;
      state.gameOver = false;
      state.won = false;
      state.flagMode = false;
      state.seconds = 0;
      timeEl.textContent = '0';
      state.board = [];
      state.revealed = [];
      state.flagged = [];
      for (let r = 0; r < rows; r++) {
        state.board.push(new Array(cols).fill(0));
        state.revealed.push(new Array(cols).fill(false));
        state.flagged.push(new Array(cols).fill(false));
      }
      state.cellSize = fitCellSize();
      // 初始不布雷，首点后再布雷，保证首点安全
      render();
      boardWrap.scrollLeft = 0;
      requestAnimationFrame(onResize);
      updateMineCount();
    }

    function placeMines(safeR, safeC) {
      const total = state.rows * state.cols;
      const mineCount = Math.min(state.mines, total - 1);
      let placed = 0;
      while (placed < mineCount) {
        const r = Math.floor(Math.random() * state.rows);
        const c = Math.floor(Math.random() * state.cols);
        if (state.board[r][c] === -1) continue;
        if (r === safeR && c === safeC) continue;
        state.board[r][c] = -1;
        placed++;
      }
      // 计算数字
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          if (state.board[r][c] === -1) continue;
          state.board[r][c] = neighbors(r, c).filter(([nr, nc]) => state.board[nr][nc] === -1).length;
        }
      }
    }

    function neighbors(r, c) {
      const out = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) out.push([nr, nc]);
        }
      }
      return out;
    }

    function reveal(r, c) {
      if (state.gameOver || state.won) return;
      if (state.revealed[r][c] || state.flagged[r][c]) return;
      if (state.firstClick) {
        placeMines(r, c);
        state.firstClick = false;
        startTimer();
      }
      if (state.board[r][c] === -1) {
        state.revealed[r][c] = true;
        state.gameOver = true;
        stopTimer();
        revealAllMines();
        render();
        return;
      }
      // BFS 展开
      const stack = [[r, c]];
      while (stack.length) {
        const [cr, cc] = stack.pop();
        if (state.revealed[cr][cc]) continue;
        state.revealed[cr][cc] = true;
        if (state.board[cr][cc] === 0) {
          neighbors(cr, cc).forEach(([nr, nc]) => {
            if (!state.revealed[nr][nc] && !state.flagged[nr][nc]) stack.push([nr, nc]);
          });
        }
      }
      checkWin();
      render();
    }

    function toggleFlag(r, c) {
      if (state.gameOver || state.won) return;
      if (state.revealed[r][c]) return;
      state.flagged[r][c] = !state.flagged[r][c];
      updateMineCount();
      render();
    }

    function revealAllMines() {
      for (let r = 0; r < state.rows; r++)
        for (let c = 0; c < state.cols; c++)
          if (state.board[r][c] === -1) state.revealed[r][c] = true;
    }

    function checkWin() {
      let hidden = 0;
      for (let r = 0; r < state.rows; r++)
        for (let c = 0; c < state.cols; c++)
          if (!state.revealed[r][c]) hidden++;
      if (hidden === state.mines) {
        state.won = true;
        stopTimer();
        // 胜利时自动插旗
        for (let r = 0; r < state.rows; r++)
          for (let c = 0; c < state.cols; c++)
            if (state.board[r][c] === -1) state.flagged[r][c] = true;
        updateMineCount();
      }
    }

    function updateMineCount() {
      let flags = 0;
      for (let r = 0; r < state.rows; r++)
        for (let c = 0; c < state.cols; c++)
          if (state.flagged[r][c]) flags++;
      minesEl.textContent = state.mines - flags;
    }

    function render() {
      boardEl.innerHTML = '';
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          const cell = document.createElement('div');
          const sz = state.cellSize;
          cell.style.cssText =
            'width:' + sz + 'px;height:' + sz + 'px;display:flex;align-items:center;justify-content:center;' +
            'font-size:' + Math.max(13, sz * 0.55) + 'px;font-weight:600;cursor:pointer;' +
            'border-radius:4px;background:' + (state.revealed[r][c] ? 'var(--board-bg)' : 'var(--surface-hover)') + ';' +
            'transition:background .1s;';
          if (state.revealed[r][c]) {
            const v = state.board[r][c];
            if (v === -1) {
              cell.textContent = '💣';
              cell.style.background = 'var(--danger)';
            } else if (v > 0) {
              cell.textContent = v;
              cell.style.color = 'var(--tile-' + (((v - 1) % 6) + 1) + ')';
            }
          } else if (state.flagged[r][c]) {
            cell.textContent = '🚩';
          }
          let longPressTimer = null;
          let longPressed = false;
          cell.addEventListener('pointerdown', e => {
            if (e.pointerType !== 'touch') return;
            longPressed = false;
            longPressTimer = setTimeout(() => {
              longPressed = true;
              toggleFlag(r, c);
            }, 450);
          });
          const cancelLongPress = () => {
            if (longPressTimer) clearTimeout(longPressTimer);
            longPressTimer = null;
          };
          cell.addEventListener('pointerup', cancelLongPress);
          cell.addEventListener('pointercancel', cancelLongPress);
          cell.addEventListener('click', () => {
            if (longPressed) return;
            if (state.flagMode) toggleFlag(r, c);
            else reveal(r, c);
          });
          cell.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!longPressed) toggleFlag(r, c);
          });
          boardEl.appendChild(cell);
        }
      }
      const size = state.cellSize;
      boardEl.style.gridTemplateColumns = 'repeat(' + state.cols + ', ' + size + 'px)';
      const boardWidth = state.cols * size + state.cols - 1 + 20;
      boardWrap.style.justifyContent = boardWidth <= boardWrap.clientWidth ? 'center' : 'flex-start';
      flagModeBtn.textContent = state.flagMode ? '🚩 插旗模式：开' : '🚩 插旗模式：关';
      flagModeBtn.setAttribute('aria-pressed', String(state.flagMode));
      boardEl.querySelectorAll(':scope > div').forEach(cell => {
        cell.style.width = size + 'px';
        cell.style.height = size + 'px';
      });
    }

    function onResize() {
      const fittedSize = fitCellSize();
      if (fittedSize === state.cellSize) return;
      state.cellSize = fittedSize;
      render();
    }

    function restart() {
      const preset = PRESETS[levelSel.value];
      if (preset) initBoard(preset.rows, preset.cols, preset.mines);
      else initBoard(parseInt(root.querySelector('#ms-rows').value, 10) || 12,
                     parseInt(root.querySelector('#ms-cols').value, 10) || 12,
                     parseInt(root.querySelector('#ms-mine-count').value, 10) || 20);
    }

    levelSel.addEventListener('change', () => {
      customBox.style.display = levelSel.value === 'custom' ? 'flex' : 'none';
      restart();
    });
    root.querySelector('#ms-restart').addEventListener('click', restart);
    root.querySelector('#ms-apply-custom').addEventListener('click', restart);
    flagModeBtn.addEventListener('click', () => {
      state.flagMode = !state.flagMode;
      flagModeBtn.textContent = state.flagMode ? '🚩 插旗模式：开' : '🚩 插旗模式：关';
      flagModeBtn.setAttribute('aria-pressed', String(state.flagMode));
    });
    window.addEventListener('resize', onResize);

    initBoard(9, 9, 10);

    return function cleanup() {
      stopTimer();
      window.removeEventListener('resize', onResize);
    };
  }

  GameHub.register({
    id: 'minesweeper',
    title: '扫雷',
    icon: '💣',
    desc: '经典扫雷，左键翻开右键插旗，小心别踩雷',
    badge: '逻辑',
    rules: [
      '翻开所有没有地雷的格子即可获胜；点中地雷则游戏结束。',
      '点按翻开格子，右键或长按插旗标记地雷；再次右键或长按可取消旗帜。',
      '格子上的数字表示其周围八个方向的地雷数量；翻开无数字的空格时会自动展开邻近区域。',
      '首个翻开的格子保证安全；可选择难度或设置自定义棋盘。'
    ],
    init
  });
})();
