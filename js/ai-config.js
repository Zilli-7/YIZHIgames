// 海龟汤 AI 配置。
// 这里的 endpoint 是「公开代理地址」，可以出现在网页里；真正的 API 密钥始终藏在服务端，绝不放这里。
// 代理由 Cloudflare Pages 函数提供，挂在同一个 pages.dev 域名下（国内可访问，不需要单独的 Worker 域名）。
window.AI_CONFIG = {
  endpoint: 'https://yizhigames.pages.dev/api/ai',
  defaultModel: 'deepseek-flash'
};
