// 海龟汤 AI 配置。
// 这里的 endpoint 是「公开代理地址」，可以出现在网页里；真正的 API 密钥始终藏在 Worker 端，绝不放这里。
// 部署后把下面的地址替换成你自己的 Cloudflare Worker 地址（例如 https://你的-worker.workers.dev/ai）。
// defaultModel 仅作展示用；实际模型在 Worker 的 AI_MODEL 环境变量里设置（DeepSeek 用 deepseek-flash）。
window.AI_CONFIG = {
  endpoint: 'https://turtle-ai.woyongqihaodeyaosi.workers.dev/ai',
  defaultModel: 'deepseek-flash'
};
