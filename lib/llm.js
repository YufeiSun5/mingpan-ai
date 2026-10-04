// 可插拔的大模型调用层。默认 DeepSeek；可选 通义千问(DashScope)、Gemini、任意 OpenAI 兼容接口。
// 环境变量：
//   LLM_PROVIDER = mimo | deepseek | qwen | gemini | openai
//                  （未设置时：有 MIMO_API_KEY 则用 mimo，否则 deepseek）
//   MIMO_API_KEY / MIMO_MODEL(默认 mimo-v2.6-pro；mimo-v2.6-flash 更快更便宜) / MIMO_BASE_URL / MIMO_THINKING(默认 disabled)
//   DEEPSEEK_API_KEY / DEEPSEEK_MODEL(默认 deepseek-chat) / DEEPSEEK_BASE_URL
//   DASHSCOPE_API_KEY / QWEN_MODEL(默认 qwen-plus) / QWEN_BASE_URL
//   GEMINI_API_KEY / GEMINI_MODEL(默认 gemini-2.5-flash) / GEMINI_BASE_URL（可填反代地址）
//   LLM_API_KEY / LLM_MODEL / LLM_BASE_URL   （openai：任意兼容接口，如 Kimi、智谱、硅基流动、自建代理）
//   LLM_TIMEOUT_MS（默认 60000）  LLM_TEMPERATURE（默认 0.8）
const env = process.env;

const PROVIDERS = {
  // 小米 MiMo 开放平台（OpenAI 兼容）https://platform.xiaomimimo.com
  mimo: () => ({ type: 'openai', key: env.MIMO_API_KEY, model: env.MIMO_MODEL || 'mimo-v2.6-pro', base: env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1',
    tokenField: 'max_completion_tokens', extra: { thinking: { type: env.MIMO_THINKING || 'disabled' } } }),
  deepseek: () => ({ type: 'openai', key: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL || 'deepseek-chat', base: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1' }),
  qwen: () => ({ type: 'openai', key: env.DASHSCOPE_API_KEY, model: env.QWEN_MODEL || 'qwen-plus', base: env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1' }),
  gemini: () => ({ type: 'gemini', key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || 'gemini-2.5-flash', base: env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta' }),
  openai: () => ({ type: 'openai', key: env.LLM_API_KEY, model: env.LLM_MODEL || 'gpt-4o-mini', base: env.LLM_BASE_URL || 'https://api.openai.com/v1' }),
};

function getProvider() {
  const name = (env.LLM_PROVIDER || (env.MIMO_API_KEY ? 'mimo' : 'deepseek')).toLowerCase();
  const p = (PROVIDERS[name] || PROVIDERS.deepseek)();
  return { name, ...p, available: !!p.key };
}

let lastUsage = null;
const getLastUsage = () => lastUsage;

async function withTimeout(fn, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || +(env.LLM_TIMEOUT_MS || 60000));
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
        body: JSON.stringify({ model: p.model, messages, temperature, [p.tokenField || 'max_tokens']: opts.maxTokens || 4000, ...(opts.json ? { response_format: { type: 'json_object' } } : {}), ...(p.extra || {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${p.name} HTTP ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
      if (j.usage) lastUsage = { provider: p.name, model: p.model, ...j.usage };
      return (j.choices?.[0]?.message?.content || '').replace(/^\s*<think>[\s\S]*?<\/think>\s*/, '');
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

/** 流式输出：onDelta(text) 逐段回调，返回完整文本 */
async function chatStream(messages, onDelta, opts = {}) {
  const p = getProvider();
  if (!p.available) throw new Error(`LLM provider "${p.name}" 未配置 API Key`);
  const temperature = opts.temperature ?? +(env.LLM_TEMPERATURE || 0.8);
  let url, init;
  if (p.type === 'openai') {
    url = `${p.base.replace(/\/$/, '')}/chat/completions`;
    init = { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
      body: JSON.stringify({ model: p.model, messages, temperature, stream: true, stream_options: { include_usage: true }, [p.tokenField || 'max_tokens']: opts.maxTokens || 4000, ...(p.extra || {}) }) };
  } else {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    url = `${p.base.replace(/\/$/, '')}/models/${p.model}:streamGenerateContent?alt=sse`;
    init = { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.key },
      body: JSON.stringify({ systemInstruction: system ? { parts: [{ text: system }] } : undefined, contents, generationConfig: { temperature, maxOutputTokens: opts.maxTokens || 4000 } }) };
  }
  return withTimeout(async (signal) => {
    const r = await fetch(url, { method: 'POST', signal, ...init });
    if (!r.ok || !r.body) throw new Error(`${p.name} HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`);
    const dec = new TextDecoder(); let buf = '', full = '', inThink = false;
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let j; try { j = JSON.parse(data); } catch { continue; }
        if (j.usage) lastUsage = { provider: p.name, model: p.model, ...j.usage };
        let t = p.type === 'openai' ? j.choices?.[0]?.delta?.content : (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
        if (!t) continue;
        // 去掉可能出现的 <think> 段
        if (t.includes('<think>')) { inThink = true; t = t.split('<think>')[0]; }
        if (inThink) { if (t.includes('</think>')) { inThink = false; t = t.split('</think>').pop(); } else continue; }
        if (t) { full += t; onDelta(t); }
      }
    }
    return full;
  }, opts.timeoutMs || +(env.LLM_STREAM_TIMEOUT_MS || 120000));
}

module.exports = { chat, chatStream, getProvider, getLastUsage };
