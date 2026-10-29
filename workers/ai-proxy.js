/**
 * 海龟汤 AI 代理（Cloudflare Worker）
 * 默认对接 DeepSeek（OpenAI 兼容接口：https://api.deepseek.com/chat/completions）。
 *
 * 两种模式（按路径区分）：
 *   POST /ai       站点密钥模式：使用 Worker 环境变量里的 AI_API_KEY，按 IP 每日限流。
 *   POST /ai/byok  用户自带密钥模式：转发请求头 x-byok-key，站点不付费、不限流。
 *
 * 需要配置的 Worker 环境变量：
 *   AI_API_KEY    DeepSeek API Key（站点付费模式必填；BYOK 模式可不填）
 *   AI_BASE_URL   默认 https://api.deepseek.com
 *   AI_MODEL      默认 deepseek-flash
 *   DAILY_LIMIT   站点密钥模式每 IP 每日提问上限，默认 50
 *
 * 需要绑定一个 KV 命名空间，绑定名：LIMITER
 * （在 Cloudflare 控制台：Workers & Pages → 你的 Worker → Settings → Bindings → KV namespace）
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,x-byok-key',
  'Access-Control-Max-Age': '86400'
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== 'POST') {
      return json({ error: '仅支持 POST 请求' }, 405);
    }

    const url = new URL(request.url);
    const isByok = url.pathname.endsWith('/byok');

    let apiKey;
    const base = (env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
    const model = env.AI_MODEL || 'deepseek-flash';

    if (isByok) {
      // 用户自带密钥：站点不付费
      apiKey = (request.headers.get('x-byok-key') || '').trim();
      if (!apiKey) return json({ error: '缺少自带密钥（x-byok-key）' }, 400);
    } else {
      // 站点密钥：藏在 Worker 环境变量里，浏览器永远拿不到
      apiKey = (env.AI_API_KEY || '').trim();
      if (!apiKey) return json({ error: '站点 AI 未配置：请在 Worker 环境变量填入 AI_API_KEY' }, 503);

      // 按 IP 每日限流，防止被刷量烧钱
      const limit = Number(env.DAILY_LIMIT || 50);
      if (env.LIMITER) {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const key = 'ai:' + ip;
        const used = parseInt(await env.LIMITER.get(key) || '0', 10);
        if (used >= limit) {
          return json({ error: '今日免费额度已用完，可在 AI 设置里填入自己的 DeepSeek API Key 继续提问。' }, 429);
        }
        await env.LIMITER.put(key, String(used + 1), { expirationTtl: 86400 });
      }
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: '请求体必须是 JSON' }, 400);
    }
    if (!body || !Array.isArray(body.messages) || !body.messages.length) {
      return json({ error: '缺少 messages 字段' }, 400);
    }

    try {
      const upstream = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model,
          messages: body.messages,
          temperature: typeof body.temperature === 'number' ? body.temperature : 0.3,
          max_tokens: Math.min(Number(body.max_tokens || 120), 200)
        })
      });
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
      });
    } catch (e) {
      return json({ error: '上游请求失败：' + (e && e.message ? e.message : String(e)) }, 502);
    }
  }
};
