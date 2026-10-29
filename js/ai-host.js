/**
 * AIHost —— 海龟汤等游戏的 LLM 主持人客户端。
 * 依赖 js/ai-config.js（window.AI_CONFIG）。
 * 用户自带密钥只存在其浏览器 localStorage；站点密钥始终在服务端，绝不进入前端。
 */
(function () {
  const CFG = window.AI_CONFIG || {};
  const STORE_KEY = 'gamehub-ai-byok-key';
  const ENABLED_KEY = 'gamehub-ai-enabled';

  function readStore(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeStore(key, value) {
    try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (e) {}
  }

  function getByokKey() { return readStore(STORE_KEY) || ''; }
  function setByokKey(k) { writeStore(STORE_KEY, (k || '').trim()); }

  function enabled() {
    const saved = readStore(ENABLED_KEY);
    return saved === null ? true : saved === '1'; // 默认开启
  }
  function setEnabled(on) { writeStore(ENABLED_KEY, on ? '1' : '0'); }

  function configured() { return Boolean(CFG && CFG.endpoint && !/你的-worker/.test(CFG.endpoint)); }
  function endpoint() { return (CFG.endpoint || '').replace(/\/$/, ''); }
  function model() { return CFG.defaultModel || 'deepseek-flash'; }

  /**
   * 调用 AI 主持人。
   * @param {string} context 系统提示词（含汤底与规则）
   * @param {Array<{role:string, content:string}>} history 多轮历史
   * @returns {Promise<{text?:string, error?:string}>}
   */
  async function chat(context, history) {
    if (!configured()) return { error: 'AI 未配置：请在 js/ai-config.js 填入代理地址。' };
    if (!enabled()) return { error: 'AI 已关闭' };
    const byok = getByokKey();
    const url = endpoint();
    const headers = { 'Content-Type': 'application/json' };
    if (byok) headers['x-byok-key'] = byok;
    const messages = [{ role: 'system', content: context }].concat(history || []);

    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages, max_tokens: 120 })
      });
    } catch (e) {
      return { error: '无法连接 AI，请检查网络或稍后再试。' };
    }
    let data = {};
    try { data = await resp.json(); } catch (e) { /* 非 JSON 响应 */ }
    if (!resp.ok) {
      const msg = data && data.error ? data.error : '请求失败（' + resp.status + '）';
      return { error: typeof msg === 'string' ? msg : JSON.stringify(msg) };
    }
    const text = data && data.choices && data.choices[0] && data.choices[0].message
      ? (data.choices[0].message.content || '') : '';
    return { text: String(text).trim() };
  }

  // ---- 设置弹窗 ----
  function refreshStatus() {
    const line = document.getElementById('ai-status-line');
    if (!line) return;
    if (!configured()) {
      line.textContent = '当前：AI 未配置（需在 js/ai-config.js 填写代理地址）';
    } else if (!enabled()) {
      line.textContent = '当前：AI 已关闭（使用本地规则）';
    } else if (getByokKey()) {
      line.textContent = '当前：已启用 · 使用自带密钥（不限次）';
    } else {
      line.textContent = '当前：已启用 · 使用站点免费额度';
    }
  }

  function openSettings() {
    const dialog = document.getElementById('ai-dialog');
    if (!dialog) return;
    const keyEl = document.getElementById('ai-key');
    if (keyEl) keyEl.value = getByokKey();
    const toggle = document.getElementById('ai-toggle');
    if (toggle) toggle.checked = enabled();
    const msg = document.getElementById('ai-message');
    if (msg) msg.textContent = '';
    refreshStatus();
    dialog.showModal();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('ai-save');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      const keyEl = document.getElementById('ai-key');
      const toggle = document.getElementById('ai-toggle');
      if (toggle) setEnabled(toggle.checked);
      if (keyEl) setByokKey(keyEl.value);
      const msg = document.getElementById('ai-message');
      if (msg) {
        if (!enabled()) msg.textContent = '已保存：AI 已关闭，将使用本地规则。';
        else if (getByokKey()) msg.textContent = '已保存：将使用你的自带密钥（不限次）。';
        else msg.textContent = '已保存：使用站点免费额度。';
      }
      refreshStatus();
      window.dispatchEvent(new CustomEvent('gamehub-ai-change'));
    });

    const clearBtn = document.getElementById('ai-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      const keyEl = document.getElementById('ai-key');
      if (keyEl) keyEl.value = '';
      setByokKey('');
      const msg = document.getElementById('ai-message');
      if (msg) msg.textContent = '已清除自带密钥，将使用站点免费额度。';
      refreshStatus();
      window.dispatchEvent(new CustomEvent('gamehub-ai-change'));
    });

    refreshStatus();
  });

  window.AIHost = {
    chat, configured, enabled, setEnabled,
    getByokKey, setByokKey, model, endpoint,
    openSettings
  };
})();
