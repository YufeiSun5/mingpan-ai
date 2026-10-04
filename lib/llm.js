// 可插拔的大模型调用层。默认 DeepSeek；可选 通义千问(DashScope)、Gemini、任意 OpenAI 兼容接口。
// 环境变量：
//   LLM_PROVIDER = deepseek | qwen | gemini | openai   （默认 deepseek）
//   DEEPSEEK_API_KEY / DEEPSEEK_MODEL(默认 deepseek-chat) / DEEPSEEK_BASE_URL
//   DASHSCOPE_API_KEY / QWEN_MODEL(默认 qwen-plus) / QWEN_BASE_URL
//   GEMINI_API_KEY / GEMINI_MODEL(默认 gemini-2.5-flash) / GEMINI_BASE_URL（可填反代地址）
//   LLM_API_KEY / LLM_MODEL / LLM_BASE_URL   （openai：任意兼容接口，如 Kimi、智谱、硅基流动、自建代理）
//   LLM_TIMEOUT_MS（默认 60000）  LLM_TEMPERATURE（默认 0.9）
const env = process.env;

const PROVIDERS = {
  deepseek: () => ({ type: 'openai', key: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL || 'deepseek-chat', base: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1' }),
  qwen: () => ({ type: 'openai', key: env.DASHSCOPE_API_KEY, model: env.QWEN_MODEL || 'qwen-plus', base: env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1' }),
  gemini: () => ({ type: 'gemini', key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || 'gemini-2.5-flash', base: env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta' }),
  openai: () => ({ type: 'openai', key: env.LLM_API_KEY, model: env.LLM_MODEL || 'gpt-4o-mini', base: env.LLM_BASE_URL || 'https://api.openai.com/v1' }),
};

function getProvider() {
  const name = (env.LLM_PROVIDER || 'deepseek').toLowerCase();
  const p = (PROVIDERS[name] || PROVIDERS.deepseek)();
  return { name, ...p, available: !!p.key };
}

async function withTimeout(fn) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), +(env.LLM_TIMEOUT_MS || 60000));
  try { return await fn(ctrl.signal); } finally { clearTimeout(t); }
}

/** messages: [{role:'system'|'user'|'assistant', content}] → string */
async function chat(messages, opts = {}) {
  const p = getProvider();
  if (!p.available) throw new Error(`LLM provider "${p.name}" 未配置 API Key`);
  const temperature = opts.temperature ?? +(env.LLM_TEMPERATURE || 0.9);
  if (p.type === 'openai') {
    return withTimeout(async (signal) => {
      const r = await fetch(`${p.base.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({ model: p.model, messages, temperature, max_tokens: opts.maxTokens || 4000 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${p.name} HTTP ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
      return j.choices?.[0]?.message?.content || '';
    });
  }
  // Gemini 原生接口
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  return withTimeout(async (signal) => {
    const r = await fetch(`${p.base.replace(/\/$/, '')}/models/${p.model}:generateContent`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.key },
      body: JSON.stringify({ systemInstruction: system ? { parts: [{ text: system }] } : undefined, contents, generationConfig: { temperature, maxOutputTokens: opts.maxTokens || 4000 } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`gemini HTTP ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
    return (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
  });
}

module.exports = { chat, getProvider };
