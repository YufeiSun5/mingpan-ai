// 聊天式流程：提取出生信息 → 确认 → 排盘 → 流式详批 → 追问对答
// handleChat(body, emit) 与平台无关：emit(event, data) 由 Express(SSE) 或云函数(收集为数组) 实现。
import { computeChart } from '@mingpan/core';
import { buildReadingMessages, chartToText, readTemplate, fill, loadStyle } from './prompt';
import { generateFallback } from '@mingpan/core';
import { chat, chatStream, getProvider, getLastUsage } from './llm';
import { parseBirth } from '@mingpan/core';
import { SC } from '@mingpan/core';

const TOPICS = ['感情', '事业', '财运', '健康', '学业'];
const SHICHEN = '子丑寅卯辰巳午未申酉戌亥';

function sanitize(body): any {
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20).map((m) => ({ role: m.role, content: m.content.slice(0, m.role === 'user' ? 500 : 4000) }));
  return { messages, pending: cleanProfile(body.pending), profile: cleanProfile(body.profile), action: body.action, nowYear: +body.nowYear || undefined };
}
function cleanProfile(p): any {
  if (!p || typeof p !== 'object') return null;
  const o: any = {};
  if (typeof p.name === 'string') o.name = p.name.slice(0, 12);
  if (p.gender === '男' || p.gender === '女') o.gender = p.gender;
  if (p.calendar === 'lunar' || p.calendar === 'solar') o.calendar = p.calendar;
  for (const k of ['year', 'month', 'day']) if (Number.isInteger(+p[k]) && +p[k] > 0) o[k] = +p[k];
  o.leap = !!p.leap;
  const t = p.time;
  if (t && t.type === 'exact' && +t.hour >= 0 && +t.hour < 24) o.time = { type: 'exact', hour: +t.hour, minute: Math.min(59, Math.max(0, +t.minute || 0)) };
  else if (t && t.type === 'shichen' && SHICHEN.includes(t.shichen) && t.shichen) o.time = { type: 'shichen', shichen: t.shichen };
  else if (t && t.type === 'unknown') o.time = { type: 'unknown' };
  if (typeof p.city === 'string') o.city = p.city.slice(0, 20);
  o.topics = Array.isArray(p.topics) ? p.topics.filter((x) => TOPICS.includes(x)) : [];
  if (typeof p.question === 'string') o.question = p.question.slice(0, 200);
  if (p.awaitingConfirm) o.awaitingConfirm = true;
  return o;
}
function merge(base, x): any {
  const o = { ...(base || {}) };
  for (const [k, v] of Object.entries(x || {})) {
    if (k === 'topics') o.topics = [...new Set([...(o.topics || []), ...((v as any) || [])])];
    else if (k === 'leap') { if (v) o.leap = true; }
    else if (v !== null && v !== undefined && v !== '') o[k] = v;
  }
  return o;
}
const missingOf = (p) => [!p.gender && '性别', !p.year && '出生年份', !p.month && '月份', !p.day && '日期', !p.time && '出生时间（不清楚也可以说不知道）'].filter(Boolean);
function toInput(p, extra: any = {}) {
  const i: any = { name: p.name, gender: p.gender, calendar: p.calendar || 'solar', year: p.year, month: p.month, day: p.day, leap: p.leap, city: p.city, ...extra };
  if (p.time?.type === 'exact') { i.hour = p.time.hour; i.minute = p.time.minute; }
  else if (p.time?.type === 'shichen') i.shichen = p.time.shichen;
  else i.timeUnknown = true;
  return i;
}
const CN_M = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const CN_D = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
function summary(p) {
  const date = p.calendar === 'lunar' ? `农历 ${p.year}年${p.leap ? '闰' : ''}${CN_M[p.month - 1]}月${CN_D[p.day - 1] || p.day + '日'}` : `${p.calendar ? '公历' : '公历（如果是农历请告诉我）'} ${p.year}年${p.month}月${p.day}日`;
  const time = p.time.type === 'exact' ? `${String(p.time.hour).padStart(2, '0')}:${String(p.time.minute).padStart(2, '0')}` : p.time.type === 'shichen' ? `${p.time.shichen}时` : '时辰不详';
  return `好，我先核对一下哈\n\n· 性别：${p.gender}\n· 生日：${date}\n· 时间：${time}${p.city ? `\n· 出生地：${p.city}` : ''}${p.topics?.length ? `\n· 想问：${p.topics.join('、')}` : ''}\n\n没问题的话，我这就给你排盘。`;
}
function dialogText(messages) {
  return messages.slice(-8).map((m) => `${m.role === 'user' ? '客户' : '大师'}：${m.content.slice(0, 300)}`).join('\n');
}
function parseJSON(s) { const m = String(s).match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }

async function extract(messages, pending, nowYear) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const p = getProvider();
  if (p.available) {
    try {
      const t = readTemplate('extract.md');
      const vars = { NOW_YEAR: nowYear, PENDING: pending ? JSON.stringify(pending) : '（无）', DIALOG: dialogText(messages) };
      const t0 = Date.now();
      const out = await chat([{ role: 'system', content: fill(t.system, vars) }, { role: 'user', content: fill(t.user, vars) }], { json: true, temperature: 0.1, maxTokens: 600 });
      console.log(`[extract] ${p.name}:${p.model} ${Date.now() - t0}ms`);
      const j = parseJSON(out);
      if (j) {
        let reply = typeof j.reply === 'string' ? j.reply.trim() : '';
        if (!/[。！？!?～~」）)…\p{Extended_Pictographic}]\s*$/u.test(reply)) reply = ''; // 疑似被截断，改用固定话术
        return { x: { ...cleanProfile(j), confirmed: !!j.confirmed }, reply };
      }
    } catch (e) { console.error('[extract]', e.message); }
  }
  const x = cleanProfile(parseBirth(lastUser));
  return { x: { ...x, confirmed: !!pending?.awaitingConfirm && /^(对|是|没错|嗯|好|可以|开始|确认)/.test(lastUser.trim()) }, reply: '' };
}

function suggestions(chart) {
  const n = chart.nowYear, love = chart.input.gender === '女' ? '我什么时候能遇到正缘？' : '我什么时候桃花运最好？';
  const past = chart.liuNian.filter((y) => y.past && y.relations.some((r) => /冲|刑|太岁/.test(r)) && y.favorable <= 0).pop()
    || chart.liuNian.filter((y) => y.past && y.relations.length).pop();
  return [`${n + 1}年我能结婚吗？`, love, '我适合做什么工作？', past ? `${past.year}年是不是不太顺？` : `${n}年下半年运势怎么样？`];
}

// 内部用语过滤：评分只在服务端用于引导回答，任何内部字眼都不能出现在可见文本里
const LEAK_RE = /<\/?score>|问题健康度|健康度|评分卡|评分|打分|基准分|规则预判|内部参考|据排盘推算|程序(推算|计算)/g;
const BLOCK_RE = /<score>[\s\S]*?<\/score>/g;
export const cleanVisible = (t: string) => t.replace(BLOCK_RE, '').replace(LEAK_RE, '');
/** 流式过滤器：按标点/换行切分后再清洗，保证被拆在两个分片里的词也能过滤；只压住不到一句的尾巴，几乎不增加延迟 */
function leakFilter(out: (t: string) => void) {
  let pend = '';
  const flush = (all = false) => {
    let cut = all ? pend.length : Math.max(pend.search(/[^。！？，、；：…\n!?,;:）)」』"”]*$/), 0);
    if (!all && cut === 0 && pend.length > 48) cut = pend.length - 8;
    if (!all && pend.includes('<score') && !pend.includes('</score>')) return; // 等整块
    if (cut <= 0) return;
    const t = cleanVisible(pend.slice(0, cut)); pend = pend.slice(cut);
    if (t) out(t);
  };
  return { push: (d: string) => { pend += d; flush(); }, end: () => flush(true) };
}

// 流式输出：评分由程序确定性计算（不让模型先吐 JSON），只作为服务端内部事件；正文第一个 token 起就直接流给客户端
async function streamText(messages, emit, fallbackText, opts: any = {}) {
  const p = getProvider();
  const { chart, scoreCtx } = opts;
  if (scoreCtx && opts.onScore) opts.onScore(SC.buildCard(chart, scoreCtx)); // 只回调给服务端，不产生任何下发事件
  const f = leakFilter((t) => emit('delta', { text: t }));
  if (p.available) {
    try {
      const t0 = Date.now(); let first = 0;
      const full = await chatStream(messages, (d) => { if (!first) first = Date.now() - t0; f.push(d); }, opts.llm || {});
      f.end();
      const u = getLastUsage();
      console.log(`[LLM stream] ${p.name}:${p.model} first=${first}ms total=${Date.now() - t0}ms tokens=${u?.prompt_tokens}/${u?.completion_tokens}${u?.completion_tokens_details?.reasoning_tokens ? ' reasoning=' + u.completion_tokens_details.reasoning_tokens : ''}`);
      const text = cleanVisible(full).replace(/^\s+/, '');
      if (text.trim()) return { text, source: `${p.name}:${p.model}` };
    } catch (e) { console.error('[LLM stream]', e.message); f.end(); }
  }
  const text = fallbackText();
  for (let i = 0; i < text.length; i += 40) emit('delta', { text: text.slice(i, i + 40) });
  return { text, source: 'template' };
}

function yearsMentioned(text, nowYear) {
  const ys = (text.match(/(19|20)\d{2}/g) || []).map(Number);
  const rel = { 今年: 0, 明年: 1, 后年: 2, 去年: -1, 前年: -2 };
  for (const [k, v] of Object.entries(rel)) if (text.includes(k)) ys.push(nowYear + v);
  const m = text.match(/(\d{1,2})年[内后]/); if (m) for (let i = 1; i <= Math.min(+m[1], 10); i++) ys.push(nowYear + i);
  return ys;
}

function followUpFallback(chart, q) {
  const ys = yearsMentioned(q, chart.nowYear);
  const all = [...chart.liuNian, ...(chart.extraLiuNian || [])];
  const y = all.find((l) => l.year === ys[0]);
  if (y) {
    const tone = y.favorable > 0 ? '是你的喜用之年，整体顺遂，有贵人相助' : y.favorable < 0 ? '五行上稍有压力，凡事稳一稳、多做准备就好' : '整体平稳，稳中有进';
    return `${y.year}年是${y.ganZhi}年，流年十神为${y.shiShen}，走的是${y.daYun}大运${y.relations.length ? `，流年${y.relations.join('、')}，这一年前后变动会多一些` : ''}。\n\n从命局看，这一年${tone}。${y.past ? '你可以回想一下，那一年前后在工作、感情或家里，是不是有过一些起伏或转折？' : '把握好节奏，好事慢慢就来了。'}`;
  }
  return `嗯，这个问题我看了一下。从你的命局看，日主${chart.dayMaster.gan}${chart.dayMaster.wuXing}${chart.dayMaster.strength}，喜用${chart.xiYong.join('、')}。顺着喜用神的方向去做，多用${chart.luck[0].colors.join('、')}，往${chart.luck[0].direction}发展，会越来越顺的。\n\n你也可以问我具体某一年，比如"${chart.nowYear + 1}年怎么样"。`;
}

async function handleChat(body, emit, ctx: { memory?: string; onScore?: (s: any) => void } = {}) {
  const { messages, pending, profile, action, nowYear: ny } = sanitize(body || {});
  const nowYear = ny || new Date().getFullYear();
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';

  // 0) 危机信号：不算命，先关心并给出专业求助渠道
  if (action !== 'confirm' && SC.isCrisis(lastUser)) {
    console.log('[chat] crisis signal');
    emit('crisis', {});
    emit('text', { text: SC.CRISIS_TEXT });
    emit('quick', { replies: ['谢谢你，我想再聊聊', '我现在好一点了'] });
    emit('done', {});
    return;
  }

  // 1) 已排盘：追问
  if (profile && missingOf(profile).length === 0 && action !== 'confirm') {
    const q = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const chart = computeChart({ ...toInput(profile, { extraYears: yearsMentioned(q, nowYear) }), nowYear });
    const t = readTemplate('chat.md');
    const year = yearsMentioned(q, nowYear)[0] || nowYear;
    const scoreCtx = SC.scorePrompt(chart, year, q);
    const sys = fill(t.system, { CHART: chartToText(chart), NOW_YEAR: nowYear, NAME: profile.name || '', STYLE_GUIDE: loadStyle().guide, SCORE_CONTEXT: scoreCtx.text }) + (ctx.memory ? `\n\n${ctx.memory}` : '');
    emit('bubble', {});
    const r = await streamText([{ role: 'system', content: sys }, ...messages.slice(-12)], emit, () => followUpFallback(chart, q), { chart, scoreCtx, onScore: ctx.onScore });
    emit('done', { source: r.source });
    return;
  }

  // 2) 确认后排盘 + 详批
  let target = null;
  if (action === 'confirm' && pending && missingOf(pending).length === 0) target = pending;

  // 3) 提取出生信息
  if (!target) {
    const { x, reply } = await extract(messages, pending, nowYear);
    const { confirmed, ...fields } = x;
    const merged = merge(pending, fields);
    const missing = missingOf(merged);
    if (confirmed && pending?.awaitingConfirm && missing.length === 0) target = merged;
    else if (missing.length) {
      delete merged.awaitingConfirm;
      emit('pending', { pending: merged });
      emit('text', { text: reply || `好的～还差${missing.join('、')}，告诉我就能排盘啦。\n比如：「1995年农历八月十五 早上8点 女 成都」` });
      emit('done', {});
      return;
    } else {
      try { computeChart({ ...toInput(merged), nowYear }); } catch (e) {
        emit('pending', { pending: { ...merged, day: undefined, awaitingConfirm: false } });
        emit('text', { text: `嗯…${merged.calendar === 'lunar' ? '农历' : '公历'}${merged.year}年${merged.month}月好像没有${merged.day}日这一天，再帮我核对一下日期好吗？` });
        emit('done', {}); return;
      }
      merged.awaitingConfirm = true;
      emit('pending', { pending: merged });
      emit('text', { text: summary(merged) });
      emit('quick', { replies: ['对，开始排盘', '我要修改'] });
      emit('done', {});
      return;
    }
  }

  // 排盘
  const prof = { ...target }; delete prof.awaitingConfirm;
  const chart = computeChart({ ...toInput(prof), nowYear });
  emit('profile', { profile: prof });
  const ts = chart.trueSolar;
  emit('text', { text: `好了，${prof.name ? prof.name + '，' : ''}你的盘排出来了，你先看看${ts ? `\n（按${ts.city}真太阳时校正：${ts.time.slice(11, 16)}，${chart.lunar.split(' ').pop()}）` : ''}` });
  emit('chart', { chart });
  emit('bubble', {});
  const questions = { topics: prof.topics || [], text: prof.question || '' };
  const qText = [prof.question || '', ...messages.filter((m) => m.role === 'user').slice(-3).map((m) => m.content)].join(' ');
  const scoreCtx = SC.scorePrompt(chart, nowYear, qText, prof.topics?.length ? SC.pickDims(prof.topics.join(' ') + qText) : SC.pickDims(qText));
  const rm = buildReadingMessages(chart, questions, { SCORE_CONTEXT: scoreCtx.text });
  if (ctx.memory) rm[0].content += `\n\n${ctx.memory}`;
  const r = await streamText(rm, emit, () => generateFallback(chart, questions), { chart, scoreCtx, onScore: ctx.onScore });
  emit('text', { text: '大概就是这些。还有哪儿想细问的，某一年的运势、感情、工作上的选择，直接问我就行。' });
  emit('quick', { replies: suggestions(chart) });
  emit('done', { source: r.source });
}

export { handleChat };
