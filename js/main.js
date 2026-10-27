/**
 * GameHub —— 游戏注册表 + 大厅导航
 * 每个游戏通过 GameHub.register(id, { title, icon, desc, badge, init, destroy }) 注册。
 * init(containerEl) 负责构建界面并启动；destroy() 负责清理定时器/监听器。
 */
(function () {
  const registry = [];
  const THEMES = {
    moss: {
      name: '苔原青绿',
      page: '#D9E5D8',
      game: '#35594F',
      board: '#344740',
      text: '#F1F6EE',
      accent: '#A8CBAA',
      accentSoft: '#C7DEC1',
      danger: '#F1F6EE',
      colors: ['#D9E5D8', '#35594F', '#A8CBAA', '#C7DEC1', '#D6E8D4', '#D3E3E5', '#F1F6EE']
    },
    ember: {
      name: '焦糖暖橙',
      page: '#E8D6C1',
      game: '#674C3A',
      board: '#49433D',
      text: '#F7F0E6',
      accent: '#DDB182',
      accentSoft: '#E9CCA6',
      danger: '#F7F0E6',
      colors: ['#E8D6C1', '#674C3A', '#DDB182', '#E9CCA6', '#F0DFCB', '#DCE1DA', '#F7F0E6']
    },
    ocean: {
      name: '深海蔚蓝',
      page: '#D6E9EF',
      game: '#315D70',
      board: '#344850',
      text: '#F0F7F8',
      accent: '#8DC6D8',
      accentSoft: '#B8DCE4',
      danger: '#E9DDBB',
      colors: ['#D6E9EF', '#315D70', '#8DC6D8', '#B8DCE4', '#D3EAF0', '#D4E5D9', '#F0F7F8']
    },
    coral: {
      name: '赤焰珊瑚',
      page: '#F0DAD5',
      game: '#714D4D',
      board: '#4C4144',
      text: '#F8EEEA',
      accent: '#D9978D',
      accentSoft: '#E8BFB0',
      danger: '#F8EEEA',
      colors: ['#F0DAD5', '#714D4D', '#D9978D', '#E8BFB0', '#F0D9D2', '#D9DFE0', '#F8EEEA']
    },
    vanilla: {
      name: '香草奶霜',
      page: '#98A080',
      game: '#4E5339',
      board: '#45463E',
      text: '#F3EFDF',
      accent: '#C19481',
      accentSoft: '#E2CCB5',
      danger: '#E2CCB5',
      colors: ['#F3EFDF', '#E2CCB5', '#C19481', '#98A080', '#4E5339']
    },
    seashell: {
      name: '贝壳花语',
      page: '#C9B8A8',
      game: '#36545A',
      board: '#343F42',
      text: '#F6EEE5',
      accent: '#D49A91',
      accentSoft: '#E4BFB0',
      danger: '#E4BFB0',
      colors: ['#C9B8A8', '#36545A', '#D49A91', '#E4BFB0', '#E8D8C9', '#D9E1D9', '#F6EEE5']
    },
    latte: {
      name: '海盐奶油',
      page: '#A69D90',
      game: '#49433D',
      board: '#494642',
      text: '#FCF6DE',
      accent: '#C6D2D9',
      accentSoft: '#B8B0A3',
      danger: '#C6D2D9',
      colors: ['#C6D2D9', '#A69D90', '#FCF6DE', '#49433D']
    },
    mist: {
      name: '雾蓝奶油',
      page: '#E7DDC9',
      game: '#D5EAF3',
      board: '#AFC7D8',
      text: '#354654',
      accent: '#FCF3CB',
      accentSoft: '#B7DCED',
      danger: '#8A4F47',
      colors: ['#E7DDC9', '#D5EAF3', '#FCF3CB', '#AFC7D8', '#B7DCED', '#D8E8EE', '#354654']
    },
    'classic-light': {
      name: '传统白色',
      page: '#F5F5F5',
      game: '#FFFFFF',
      board: '#E8EAED',
      text: '#202124',
      accent: '#7891A8',
      accentSoft: '#DCE6EF',
      danger: '#B3261E',
      colors: ['#F5F5F5', '#FFFFFF', '#7891A8', '#DCE6EF', '#E8EAED', '#DDE9E7', '#202124']
    },
    'classic-dark': {
      name: '传统黑色',
      page: '#000000',
      game: '#121212',
      board: '#1E1E1E',
      text: '#F5F5F5',
      accent: '#90CAF9',
      accentSoft: '#263B4D',
      danger: '#FF8A80',
      colors: ['#000000', '#121212', '#90CAF9', '#263B4D', '#1E1E1E', '#304344', '#F5F5F5']
    }
  };
  const DEFAULT_THEME = 'moss';
  let lobbyTheme = readTheme('gamehub-theme', DEFAULT_THEME);
  let currentGameId = null;

  function readTheme(key, fallback) {
    try {
      const saved = localStorage.getItem(key);
      return Object.prototype.hasOwnProperty.call(THEMES, saved) ? saved : fallback;
    } catch (e) {
      console.warn('无法读取主题设置：', e);
      return fallback;
    }
  }

  function persistTheme(key, themeId) {
    try {
      localStorage.setItem(key, themeId);
    } catch (e) {
      console.warn('无法保存主题设置：', e);
    }
  }

  function applyTheme(themeId) {
    if (!Object.prototype.hasOwnProperty.call(THEMES, themeId)) return;
    document.documentElement.dataset.theme = themeId;
    window.dispatchEvent(new CustomEvent('gamehub-theme-change', { detail: THEMES[themeId] }));
  }

  function register(def) {
    registry.push(def);
  }

  function renderLobby() {
    const grid = document.getElementById('lobby-grid');
    grid.innerHTML = '';
    registry.forEach((def) => {
      const card = document.createElement('div');
      card.className = 'game-card';
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      card.innerHTML =
        '<span class="icon">' + (def.icon || '🎮') + '</span>' +
        '<div class="name">' + def.title + '</div>' +
        '<div class="desc">' + def.desc + '</div>' +
        (def.badge ? '<span class="badge">' + def.badge + '</span>' : '');
      card.addEventListener('click', () => open(def));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(def); }
      });
      grid.appendChild(card);
    });
  }

  let currentDef = null;
  let currentCleanup = null;

  function runCleanup() {
    if (currentCleanup) {
      try { currentCleanup(); } catch (e) { console.warn(e); }
      currentCleanup = null;
    }
  }

  function open(def) {
    runCleanup();
    currentDef = def;
    currentGameId = def.id;
    document.getElementById('lobby').hidden = true;
    document.getElementById('game-view').hidden = false;
    document.getElementById('game-view-title').textContent = def.title;
    const rulesList = document.getElementById('game-rules-list');
    rulesList.replaceChildren();
    (def.rules || []).forEach((rule) => {
      const item = document.createElement('li');
      item.textContent = rule;
      rulesList.appendChild(item);
    });
    document.getElementById('game-rules-title').textContent = def.title + ' · 游戏规则';
    document.getElementById('game-rules-btn').disabled = !(def.rules && def.rules.length);
    const gameTheme = readTheme('gamehub-theme-' + def.id, lobbyTheme);
    document.getElementById('game-theme-select').value = gameTheme;
    applyTheme(gameTheme);
    const container = document.getElementById('game-container');
    container.innerHTML = '';
    const cleanup = def.init(container);
    currentCleanup = (typeof cleanup === 'function') ? cleanup : null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function close() {
    runCleanup();
    currentDef = null;
    currentGameId = null;
    applyTheme(lobbyTheme);
    const container = document.getElementById('game-container');
    if (container) container.innerHTML = '';
    document.getElementById('game-view').hidden = true;
    document.getElementById('lobby').hidden = false;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const back = document.getElementById('back-btn');
    if (back) back.addEventListener('click', close);
    const rulesButton = document.getElementById('game-rules-btn');
    const rulesDialog = document.getElementById('game-rules-dialog');
    if (rulesButton && rulesDialog) {
      rulesButton.addEventListener('click', () => rulesDialog.showModal());
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && rulesDialog.open) {
          event.preventDefault();
          rulesDialog.close();
        }
      });
    }
    const lobbySelect = document.getElementById('lobby-theme-select');
    const gameSelect = document.getElementById('game-theme-select');
    lobbySelect.value = lobbyTheme;
    gameSelect.value = lobbyTheme;
    applyTheme(lobbyTheme);
    lobbySelect.addEventListener('change', () => {
      lobbyTheme = lobbySelect.value;
      persistTheme('gamehub-theme', lobbyTheme);
      if (!currentGameId) applyTheme(lobbyTheme);
    });
    gameSelect.addEventListener('change', () => {
      if (!currentGameId) return;
      persistTheme('gamehub-theme-' + currentGameId, gameSelect.value);
      applyTheme(gameSelect.value);
    });
  });

  /** 本地存储辅助：读取最高分 */
  function loadBest(key) {
    try {
      const v = parseInt(localStorage.getItem(key), 10);
      return isNaN(v) ? 0 : v;
    } catch (e) { return 0; }
  }

  /** 本地存储辅助：写入最高分，返回是否创新高 */
  function saveBest(key, value) {
    const prev = loadBest(key);
    if (value > prev) {
      try { localStorage.setItem(key, String(value)); } catch (e) {}
      if (window.CloudSync) window.CloudSync.submitRecord(key, value);
      return true;
    }
    return false;
  }

  window.GameHub = {
    register, renderLobby, open, close, loadBest, saveBest,
    getTheme: () => THEMES[document.documentElement.dataset.theme] || THEMES[DEFAULT_THEME],
    themes: THEMES
  };
})();
