/**
 * Supabase account, personal-best sync, and public leaderboard.
 * Game records are stored locally first, so gameplay still works offline.
 */
(function () {
  const config = window.SUPABASE_CONFIG || {};
  const statusEl = document.getElementById('cloud-status');
  const authDialog = document.getElementById('auth-dialog');
  const leaderboardDialog = document.getElementById('leaderboard-dialog');
  const authMessage = document.getElementById('auth-message');
  const leaderboardMessage = document.getElementById('leaderboard-message');
  const leaderboardList = document.getElementById('leaderboard-list');
  const authButton = document.getElementById('auth-open');
  const signOutButton = document.getElementById('auth-signout');
  const sessionLabel = document.getElementById('account-session');
  const emailForm = document.getElementById('email-form');
  const phoneForm = document.getElementById('phone-form');
  const games = {
    snake: { label: '贪吃蛇', key: 'snake-score' },
    heshu: { label: '合数', key: 'heshu-score' },
    'game2048-4': { label: '2048 · 4×4', key: 'g2048-score-4' },
    'game2048-5': { label: '2048 · 5×5', key: 'g2048-score-5' },
    'game2048-6': { label: '2048 · 6×6', key: 'g2048-score-6' }
  };
  let client = null;
  let currentUser = null;
  let configured = false;

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function setMessage(element, message) {
    if (element) element.textContent = message || '';
  }

  function getNickname(inputId) {
    const input = document.getElementById(inputId);
    const nickname = input ? input.value.trim() : '';
    return nickname.slice(0, 20) || '玩家';
  }

  function displayName(user) {
    const name = user.user_metadata && user.user_metadata.display_name;
    return typeof name === 'string' && name.trim()
      ? Array.from(name.trim()).slice(0, 20).join('')
      : '玩家';
  }

  function recordForKey(key) {
    return Object.keys(games).find((gameId) => games[gameId].key === key);
  }

  function localBest(key) {
    try {
      const value = Number.parseInt(localStorage.getItem(key), 10);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (error) {
      console.warn('无法读取本地最高分：', error);
      return 0;
    }
  }

  async function pushRecord(gameId, score) {
    if (!client || !currentUser || !games[gameId]) return;
    const { error } = await client.rpc('submit_game_score', {
      p_game_id: gameId,
      p_score: score,
      p_nickname: displayName(currentUser).slice(0, 20)
    });
    if (error) throw error;
  }

  async function synchronizeRecords(user) {
    if (!client || !user) return;
    const { data, error } = await client
      .from('game_scores')
      .select('game_id,best_score')
      .eq('user_id', user.id);
    if (error) throw error;

    const cloudScores = new Map((data || []).map((row) => [row.game_id, row.best_score]));
    for (const [gameId, game] of Object.entries(games)) {
      const local = localBest(game.key);
      const remote = Number(cloudScores.get(gameId) || 0);
      if (remote > local) {
        try {
          localStorage.setItem(game.key, String(remote));
        } catch (storageError) {
          console.warn('无法保存云端最高分到本地：', storageError);
        }
      } else if (local > remote) {
        await pushRecord(gameId, local);
      }
    }
    setStatus('已登录 · 个人最高分已同步');
    window.dispatchEvent(new CustomEvent('gamehub-records-synced'));
  }

  function updateSession(user) {
    const previousUserId = currentUser && currentUser.id;
    currentUser = user || null;
    if (authButton) authButton.textContent = currentUser ? '我的账号' : '登录 / 注册';
    if (signOutButton) signOutButton.hidden = !currentUser;
    emailForm.hidden = Boolean(currentUser);
    phoneForm.hidden = Boolean(currentUser);
    if (sessionLabel) {
      sessionLabel.hidden = !currentUser;
      sessionLabel.textContent = currentUser ? '当前账号：' + displayName(currentUser) : '';
    }
    if (!currentUser) {
      setStatus(configured ? '游戏记录保存在本地浏览器 · 登录后可同步' : '游戏记录保存在本地浏览器 · 云同步尚未配置');
      return;
    }
    if (!previousUserId || previousUserId !== currentUser.id) {
      synchronizeRecords(currentUser).catch((error) => {
        console.error('同步最高分失败：', error);
        setStatus('云端同步失败：' + error.message);
        setMessage(authMessage, '云端同步失败：' + error.message);
      });
    }
  }

  function requireClient() {
    if (!client) {
      throw new Error('云服务未配置。请先在 js/cloud-config.js 填入 Supabase URL 和 anon key。');
    }
    return client;
  }

  async function submitEmailLogin() {
    try {
      if (!emailForm.reportValidity()) return;
      setMessage(authMessage, '正在登录…');
      const supabase = requireClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: document.getElementById('auth-email').value.trim(),
        password: document.getElementById('auth-password').value
      });
      if (error) throw error;
      updateSession(data.user);
      setMessage(authMessage, '登录成功。');
    } catch (error) {
      setMessage(authMessage, error.message);
    }
  }

  async function submitEmailRegistration() {
    try {
      if (!emailForm.reportValidity()) return;
      setMessage(authMessage, '正在创建账号…');
      const supabase = requireClient();
      const nickname = getNickname('email-nickname');
      const { data, error } = await supabase.auth.signUp({
        email: document.getElementById('auth-email').value.trim(),
        password: document.getElementById('auth-password').value,
        options: { data: { display_name: nickname } }
      });
      if (error) throw error;
      if (data.session) updateSession(data.user);
      setMessage(authMessage, data.session
        ? '注册成功，已登录。'
        : '注册成功！请先查收验证邮件，再用邮箱和密码登录。');
    } catch (error) {
      setMessage(authMessage, error.message);
    }
  }

  async function sendPhoneCode() {
    try {
      if (!document.getElementById('auth-phone').reportValidity()) return;
      setMessage(authMessage, '正在发送短信…');
      const supabase = requireClient();
      const { error } = await supabase.auth.signInWithOtp({
        phone: document.getElementById('auth-phone').value.trim(),
        options: {
          shouldCreateUser: true,
          data: { display_name: getNickname('phone-nickname') }
        }
      });
      if (error) throw error;
      setMessage(authMessage, '验证码已发送，请查收短信。');
    } catch (error) {
      setMessage(authMessage, error.message);
    }
  }

  async function verifyPhoneCode() {
    try {
      if (!phoneForm.reportValidity()) return;
      setMessage(authMessage, '正在验证…');
      const supabase = requireClient();
      const { data, error } = await supabase.auth.verifyOtp({
        phone: document.getElementById('auth-phone').value.trim(),
        token: document.getElementById('phone-code').value.trim(),
        type: 'sms'
      });
      if (error) throw error;
      updateSession(data.user);
      setMessage(authMessage, '验证成功，已登录。');
    } catch (error) {
      setMessage(authMessage, error.message);
    }
  }

  async function loadLeaderboard() {
    try {
      leaderboardList.replaceChildren();
      setMessage(leaderboardMessage, '正在加载排行榜…');
      const supabase = requireClient();
      const gameId = document.getElementById('leaderboard-game').value;
      const { data, error } = await supabase
        .from('game_scores')
        .select('nickname,best_score')
        .eq('game_id', gameId)
        .order('best_score', { ascending: false })
        .order('updated_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      if (!data || data.length === 0) {
        setMessage(leaderboardMessage, '还没有成绩，登录后玩一局来占榜吧！');
        return;
      }
      data.forEach((row, index) => {
        const item = document.createElement('li');
        const rank = document.createElement('span');
        rank.className = 'leaderboard-rank';
        rank.textContent = ['🥇', '🥈', '🥉'][index] || String(index + 1);
        const nickname = document.createElement('span');
        nickname.textContent = row.nickname;
        const score = document.createElement('span');
        score.className = 'leaderboard-score';
        score.textContent = Number(row.best_score).toLocaleString();
        item.append(rank, nickname, score);
        leaderboardList.appendChild(item);
      });
      setMessage(leaderboardMessage, '');
    } catch (error) {
      console.error('读取排行榜失败：', error);
      setMessage(leaderboardMessage, '排行榜加载失败：' + error.message);
    }
  }

  document.getElementById('auth-open').addEventListener('click', () => {
    setMessage(authMessage, '');
    authDialog.showModal();
  });
  document.getElementById('leaderboard-open').addEventListener('click', () => {
    leaderboardDialog.showModal();
    loadLeaderboard();
  });
  document.getElementById('email-login').addEventListener('click', submitEmailLogin);
  document.getElementById('email-register').addEventListener('click', submitEmailRegistration);
  document.getElementById('phone-send-code').addEventListener('click', sendPhoneCode);
  document.getElementById('phone-verify').addEventListener('click', verifyPhoneCode);
  document.getElementById('leaderboard-refresh').addEventListener('click', loadLeaderboard);
  document.getElementById('leaderboard-game').addEventListener('change', loadLeaderboard);
  document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => document.getElementById(button.dataset.closeDialog).close());
  });
  signOutButton.addEventListener('click', async () => {
    try {
      const { error } = await requireClient().auth.signOut();
      if (error) throw error;
      updateSession(null);
      setMessage(authMessage, '已退出登录。');
    } catch (error) {
      setMessage(authMessage, error.message);
    }
  });

  if (config.url && config.anonKey && window.supabase && window.supabase.createClient) {
    client = window.supabase.createClient(config.url, config.anonKey);
    configured = true;
    setStatus('正在连接云服务…');
    client.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      updateSession(data.session ? data.session.user : null);
    }).catch((error) => {
      console.error('读取登录状态失败：', error);
      setStatus('云服务连接失败：' + error.message);
    });
    client.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => updateSession(session ? session.user : null), 0);
    });
  } else {
    setStatus('游戏记录保存在本地浏览器 · 云同步尚未配置');
  }

  window.CloudSync = {
    submitRecord(key, score) {
      if (!configured || !currentUser) return;
      const gameId = recordForKey(key);
      if (!gameId) return;
      pushRecord(gameId, score).catch((error) => {
        console.error('提交最高分失败：', error);
        setStatus('最高分暂未同步：' + error.message);
      });
    }
  };
})();
