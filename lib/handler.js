// 平台无关的业务入口：Express、云函数、函数计算都调用这里。
const { computeChart } = require('./bazi');
const { buildReadingMessages } = require('./prompt');
const { generateFallback } = require('./fallback');
const { chat, getProvider } = require('./llm');

function validate(b) {
  const y = +b.year, m = +b.month, d = +b.day;
  if (!(y >= 1850 && y <= 2100) || !(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) throw Object.assign(new Error('出生日期不正确'), { status: 400 });
}

async function handleReading(body = {}) {
  validate(body);
  const chart = computeChart(body);
  const questions = { topics: Array.isArray(body.topics) ? body.topics.slice(0, 5) : [], text: String(body.question || '').slice(0, 300) };
  const p = getProvider();
  let reading, source = 'template', error;
  if (p.available && !body.templateOnly) {
    try {
      reading = await chat(buildReadingMessages(chart, questions));
      source = `${p.name}:${p.model}`;
    } catch (e) { error = e.message; console.error('[LLM]', e.message); }
  }
  if (!reading) reading = generateFallback(chart, questions);
  return { chart, reading, source, ...(error ? { llmError: '大模型暂不可用，已使用模板解读' } : {}) };
}

function handleChart(body = {}) { validate(body); return { chart: computeChart(body) }; }

module.exports = { handleReading, handleChart };
