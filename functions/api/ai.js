/**
 * 海龟汤 AI 代理（Cloudflare Pages Function）
 * 路由：POST /api/ai
 *
 * 同源部署在 pages.dev 下，国内可访问，也不存在跨域问题。
 * 站点密钥藏在 Pages 的「环境变量」AI_API_KEY 里，绝不进入前端。
 * 用户自带密钥（BYOK）通过请求头 x-byok-key 传入，此时站点不付费。
 *
 * Pages 项目环境变量（Settings → Environment variables）：
 *   AI_API_KEY    必填，DeepSeek API Key
 *   AI_BASE_URL   可选，默认 https://api.deepseek.com
 *   AI_MODEL      可选，默认 deepseek-flash
 *   DAILY_LIMIT   可选，默认 50
 * KV 绑定（可选，用于按 IP 限流）：变量名 LIMITER
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

async function handle({ request, env }) {
  const byokKey = (request.headers.get('x-byok-key') || '').trim();
  const base = (env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  const model = env.AI_MODEL || 'deepseek-flash';

  let apiKey;
  if (byokKey) {
    // 用户自带密钥：站点不付费
    apiKey = byokKey;
  } else {
    // 站点密钥：藏在 Pages 环境变量里，浏览器拿不到
    apiKey = (env.AI_API_KEY || '').trim();
    if (!apiKey) return json({ error: '站点 AI 未配置：请在 Pages 环境变量填入 AI_API_KEY' }, 503);

    // 按 IP 每日限流（可选，需绑定 KV: LIMITER）
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

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return json({ error: '仅支持 POST 请求' }, 405);
  }
  return handle(context);
}
