/**
 * 海龟汤（情境猜谜）—— 本地规则 + DeepSeek AI 主持人
 * 题库来自 js/puzzles-a/b/c.js（共 100 道，固定列表）。
 * 界面：题目列表（可搜索、带编号）→ 选玩 → 提问/猜答案/揭晓。
 * AI 模式：优先调用 window.AIHost（DeepSeek 大模型），失败时回退到本地关键词判定。
 */
(function () {
  const PUZZLES = window.TURTLE_SOUP_PUZZLES || [];

  function normalize(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, '');
  }

  /** 根据玩家提问返回 { verdict, response } */
  function judge(question, puzzle) {
    const q = normalize(question);
    if (!q) return { verdict: '空', response: '你还没问问题呢～' };
    const hit = puzzle.guess.some(k => q.includes(normalize(k)));
    if (hit) {
      // 若问题含否定词，倾向答“否”
      if (/(不是|没有|是否|吗|么|吗|不|没|无|会不会|对不对)/.test(q) && /(不|没|无|非|否)/.test(q)) {
        return { verdict: '是', response: randomOf(['是的。', '没错，是这样。', '是，有关系。']) };
      }
      return { verdict: '是', response: randomOf(['是的。', '没错，是这样。', '是，有关系。']) };
    }
    return { verdict: '无关', response: randomOf(['这个嘛……无关。', '不重要，换个方向想想。', '我不能确定，但这似乎不是关键。', '与此无关。']) };
  }

  function checkGuess(guess, puzzle) {
    const g = normalize(guess);
    if (!g) return false;
    return puzzle.guess.some(k => g.includes(normalize(k)));
  }

  function randomOf(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /** AI 主持人系统提示词（含汤底与规则） */
  function buildSystem(puzzle) {
    return '你是「海龟汤」主持人。汤底（真相）是：' + puzzle.answer + '\n' +
      '玩家轮流提问，你只能回答：是 / 否 / 是也不是 / 无关。\n' +
      '规则：1) 绝不直接说出汤底，即使玩家猜得很接近也只给简短判断；\n' +
      '2) 与真相无关的问题回答「无关」；\n' +
      '3) 回答控制在 15 字内，不要解释；\n' +
      '4) 若玩家明确说出真相，回答「恭喜，你猜对了」。';
  }

  /** 把 AI 回复归类成「是 / 否 / 无关」，用于气泡配色 */
  function classify(text) {
    const t = String(text || '').trim();
    if (/恭喜|猜对|正确/.test(t)) return '是';
    if (/无关|不重要|没有关系|不能确定/.test(t)) return '无关';
    if (/不是|没有|否|不会|不对/.test(t)) return '否';
    if (/是/.test(t)) return '是';
    return '无关';
  }

  /** AI 接入状态描述 */
  function aiStatusText() {
    const h = window.AIHost;
    if (!h || !h.configured()) return 'AI 未配置 · 本地规则';
    if (!h.enabled()) return 'AI 已关闭 · 本地规则';
    return h.getByokKey() ? 'AI 已启用 · 自带密钥' : 'AI 已启用 · 站点额度';
  }

  function init(container) {
    container.innerHTML = '';
    const root = document.createElement('div');
    root.style.cssText = 'max-width:680px;margin:0 auto;';
    container.appendChild(root);

    // 视图1：题目列表
    function showList() {
      root.innerHTML = '';
      const listView = document.createElement('div');
      listView.innerHTML =
        '<div class="game-toolbar">' +
          '<input id="ts-search" type="text" placeholder="搜索题面关键词…" style="flex:1;" autocomplete="off">' +
          '<span class="stat">共 <b>' + PUZZLES.length + '</b> 题</span>' +
        '</div>' +
        '<div class="game-toolbar" style="margin-top:6px;">' +
          '<span class="stat" id="ts-ai-status">' + aiStatusText() + '</span>' +
          '<span style="flex:1;"></span>' +
          '<button class="btn btn-sm" id="ts-ai-open" type="button">🤖 AI 设置</button>' +
        '</div>' +
        '<div id="ts-list" style="max-height:520px;overflow:auto;margin-top:6px;"></div>' +
        '<div class="hint-text">点击任一题目进入游玩；AI 会回答「是 / 否 / 无关」。</div>';
      root.appendChild(listView);

      const searchEl = listView.querySelector('#ts-search');
      const listEl = listView.querySelector('#ts-list');
      listView.querySelector('#ts-ai-open').addEventListener('click', () => window.AIHost && window.AIHost.openSettings());

      function renderList() {
        const kw = normalize(searchEl.value);
        listEl.innerHTML = '';
        const filtered = PUZZLES.map((p, i) => ({ p, i }))
          .filter(({ p }) => !kw || normalize(p.title).includes(kw) || normalize(p.answer).includes(kw) || p.guess.some(k => normalize(k).includes(kw)));
        if (!filtered.length) {
          listEl.innerHTML = '<div class="hint-text" style="text-align:center;padding:20px;">没有匹配的题目</div>';
          return;
        }
        filtered.forEach(({ p, i }) => {
          const item = document.createElement('div');
          item.style.cssText =
            'padding:10px 12px;margin:6px 0;border:1px solid var(--line);border-radius:10px;' +
            'background:var(--surface);cursor:pointer;transition:background .15s;';
          item.innerHTML =
            '<div class="ts-question-number">第 ' + (i + 1) + ' 题</div>' +
            '<div style="font-size:.95rem;line-height:1.5;">' + escapeHtml(p.title) + '</div>';
          item.addEventListener('mouseenter', () => item.style.background = 'var(--surface-hover)');
          item.addEventListener('mouseleave', () => item.style.background = 'var(--surface)');
          item.addEventListener('click', () => showPlay(i));
          listEl.appendChild(item);
        });
      }

      searchEl.addEventListener('input', renderList);
      renderList();
      searchEl.focus();
    }

    // 视图2：单题游玩
    function showPlay(index) {
      root.innerHTML = '';
      const puzzle = PUZZLES[index];
      let solved = false;
      let asking = false;
      let guessing = false;
      const history = [];

      const playView = document.createElement('div');
      playView.innerHTML =
        '<div class="game-toolbar">' +
          '<button class="btn btn-sm" id="ts-back" type="button">← 返回列表</button>' +
          '<span class="stat">第 <b>' + (index + 1) + '</b> / ' + PUZZLES.length + ' 题</span>' +
          '<span style="flex:1;"></span>' +
          '<button class="btn btn-sm" id="ts-prev" type="button">上一题</button>' +
          '<button class="btn btn-sm" id="ts-next" type="button">下一题</button>' +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
          '<label style="display:block;margin-bottom:6px;color:var(--text-dim);font-size:.9rem;">谜面</label>' +
          '<div id="ts-title" class="ts-riddle" style="font-size:1.05rem;line-height:1.7;border:1px solid var(--line);border-radius:10px;padding:12px 14px;"></div>' +
        '</div>' +
        '<div class="game-toolbar">' +
          '<button class="btn btn-sm" id="ts-hint" type="button">💡 提示</button>' +
          '<button class="btn btn-sm" id="ts-answer" type="button">🔑 揭晓谜底</button>' +
          '<span style="flex:1;"></span>' +
          '<button class="btn btn-sm" id="ts-ai-open" type="button">🤖 AI</button>' +
        '</div>' +
        '<div id="ts-log" style="min-height:150px;max-height:280px;overflow:auto;margin:14px 0;padding-right:4px;"></div>' +
        '<form id="ts-form" style="display:flex;gap:8px;">' +
          '<input id="ts-input" type="text" placeholder="向 AI 提问，如：他是因为钱吗？" style="flex:1;" autocomplete="off">' +
          '<button class="btn btn-primary" type="submit">提问</button>' +
        '</form>' +
        '<div id="ts-guess" style="margin-top:10px;display:flex;gap:8px;">' +
          '<input id="ts-guess-input" type="text" placeholder="猜答案：一句话说出真相" style="flex:1;" autocomplete="off">' +
          '<button class="btn" type="button" id="ts-guess-btn">猜</button>' +
        '</div>' +
        '<div id="ts-msg" class="msg"></div>';
      root.appendChild(playView);

      const titleEl = playView.querySelector('#ts-title');
      const logEl = playView.querySelector('#ts-log');
      const inputEl = playView.querySelector('#ts-input');
      const formEl = playView.querySelector('#ts-form');
      const guessInputEl = playView.querySelector('#ts-guess-input');
      const guessBtn = playView.querySelector('#ts-guess-btn');
      const msgEl = playView.querySelector('#ts-msg');

      function renderTitle() { titleEl.textContent = puzzle.title; }

      function addLog(who, text, tone) {
        const line = document.createElement('div');
        line.style.cssText = 'margin:6px 0;font-size:.92rem;';
        if (who === '我') {
          line.innerHTML = '<span style="color:var(--accent-soft);">我：</span>' + escapeHtml(text);
        } else if (who === 'AI') {
          const color = tone === '是' ? 'var(--ok)' : tone === '否' ? 'var(--danger)' : 'var(--text-dim)';
          line.innerHTML = '<span style="color:var(--accent-soft);">AI：</span><span style="color:' + color + ';">' + escapeHtml(text) + '</span>';
        } else {
          line.innerHTML = '<span style="color:var(--text-dim);">' + escapeHtml(text) + '</span>';
        }
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
      }

      function setMsg(text, tone) {
        msgEl.textContent = text;
        msgEl.className = 'msg ' + (tone || '');
      }

      async function ask() {
        const q = inputEl.value.trim();
        if (!q || asking) return;
        asking = true;
        addLog('我', q);
        history.push({ role: 'user', content: q });

        const aiOn = window.AIHost && window.AIHost.configured() && window.AIHost.enabled();
        let verdict, response;
        if (aiOn) {
          setMsg('AI 思考中…', '');
          const r = await window.AIHost.chat(buildSystem(puzzle), history);
          if (r.error) {
            const local = judge(q, puzzle);
            verdict = local.verdict; response = local.response;
            setMsg('AI 暂不可用（' + r.error + '），已用本地规则回答。', 'warn');
          } else {
            verdict = classify(r.text); response = r.text;
            setMsg('', '');
          }
        } else {
          const local = judge(q, puzzle);
          verdict = local.verdict; response = local.response;
          setMsg('', '');
        }
        history.push({ role: 'assistant', content: response });
        addLog('AI', response, verdict);
        inputEl.value = '';
        inputEl.focus();
        asking = false;
      }

      async function guess() {
        const g = guessInputEl.value.trim();
        if (!g || guessing) return;
        if (solved) { setMsg('这题已经解开啦，点「下一题」继续吧。', 'warn'); return; }
        guessing = true;

        let hit = checkGuess(g, puzzle);
        if (!hit && window.AIHost && window.AIHost.configured() && window.AIHost.enabled()) {
          const r = await window.AIHost.chat(
            '你是海龟汤裁判。汤底是：' + puzzle.answer + '。玩家猜测：「' + g + '」。判断玩家是否说出了真相，只回答「对」或「错」。',
            []
          );
          if (!r.error) hit = /对|正确|猜对|是的|恭喜/.test(r.text || '');
        }

        if (hit) {
          solved = true;
          addLog('系统', '🎉 恭喜！你猜对了！谜底：' + puzzle.answer, 'ok');
          setMsg('🎉 回答正确！', 'ok');
        } else {
          addLog('系统', '「' + g + '」—— 不对，再想想。', '无关');
          setMsg('还不对，换个角度。', 'warn');
          guessInputEl.value = '';
        }
        guessing = false;
      }

      function reveal() {
        if (solved) return;
        solved = true;
        addLog('系统', '🔑 谜底：' + puzzle.answer, 'ok');
        setMsg('谜底已揭晓。', 'ok');
      }

      function goto(n) {
        const next = (n + PUZZLES.length) % PUZZLES.length;
        showPlay(next);
      }

      formEl.addEventListener('submit', (e) => { e.preventDefault(); ask(); });
      guessBtn.addEventListener('click', guess);
      guessInputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guess(); } });
      playView.querySelector('#ts-hint').addEventListener('click', () => addLog('系统', '💡 ' + puzzle.hint, '提示'));
      playView.querySelector('#ts-answer').addEventListener('click', reveal);
      playView.querySelector('#ts-ai-open').addEventListener('click', () => window.AIHost && window.AIHost.openSettings());
      playView.querySelector('#ts-back').addEventListener('click', showList);
      playView.querySelector('#ts-prev').addEventListener('click', () => goto(index - 1));
      playView.querySelector('#ts-next').addEventListener('click', () => goto(index + 1));

      renderTitle();
      addLog('系统', (window.AIHost && window.AIHost.configured() && window.AIHost.enabled())
        ? 'AI 主持人已就绪，按「提问」开始抽丝剥茧吧。'
        : '当前使用本地规则；点「🤖 AI 设置」接入智能主持人。');
      inputEl.focus();
    }

    function refreshAiStatus() {
      const el = document.getElementById('ts-ai-status');
      if (el) el.textContent = aiStatusText();
    }
    document.addEventListener('gamehub-ai-change', refreshAiStatus);

    showList();
    return function cleanup() { document.removeEventListener('gamehub-ai-change', refreshAiStatus); };
  }

  GameHub.register({
    id: 'turtle-soup',
    title: '海龟汤',
    icon: '🐢',
    desc: '100 道情境猜谜：向 AI 提问，抽丝剥茧还原真相',
    badge: '悬疑推理',
    rules: [
      '阅读谜面，推理隐藏在故事背后的真相。',
      '在提问框提出可以用“是 / 否 / 无关”回答的问题，逐步缩小范围。',
      '在猜答案框输入你推理出的真相；也可以使用提示或揭晓谜底。',
      '使用上一题、下一题切换题目，或返回列表搜索其他谜面。'
    ],
    init
  });
})();
