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
      // guard：先压住开头几十个字检查（如模型服务商的固定安全回复会出戏、热线号码也不对），命中则丢弃改用兜底
      let head = '', held = !!opts.guard, rejected = false;
      const full = await chatStream(messages, (d) => {
        if (!first) first = Date.now() - t0;
        if (rejected) return;
        if (held) {
          head += d;
          if (head.length < 28) return;
          held = false;
          if (opts.guard.test(head)) { rejected = true; return; }
          return f.push(head);
        }
        f.push(d);
      }, opts.llm || {});
      if (held && head) { if (opts.guard.test(head)) rejected = true; else f.push(head); }
      if (rejected) { console.warn('[LLM stream] guard rejected:', head.slice(0, 40)); throw new Error('guard'); }
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

// 模型服务商的固定安全话术（出戏，且号码可能不对）
const CANNED_RE = /(非常抱歉听到|很抱歉听到|强烈建议你|心理健康专业人士|当地的紧急|作为(一个)?(AI|人工智能)|我(只)?是(一个)?(AI|人工智能)|自杀是一个)/i;

function crisisFallback(tp, acute) {
  const hope = tp?.next ? `我刚又看了一眼你的盘，${tp.next.startYear}年你就交入${tp.next.ganZhi}运了${tp.years[0] ? `，${tp.years[0].year}年${tp.years[0].ganZhi}也是你的喜用之年` : ''}。眼下这一段是低谷，运是会转的，好日子在后头，你得在，才等得到。`
    : '人这一辈子运是流动的，没有一直走背运的命。眼下这一段是低谷，会过去的。';
  const urgent = '孩子，你先听师傅一句：现在就打 120 或 110，或者打 12356、400-161-9995，再马上去找你身边的人，家人、室友、邻居都行，别一个人待着，把药和危险的东西放远一点。\n\n';
  return `${acute ? urgent : '嗯……你说的这些，师傅听到了。能撑到现在，已经很不容易了。\n\n'}${hope}\n\n最近是发生什么事了？愿意的话，慢慢跟我说说。\n\n${acute ? '打完电话回来跟师傅说一声，我在这儿等你。' : '今晚要是实在难受，给 12356 或者 400-161-9995 打个电话，有人陪你说说话，师傅也在这儿等你。'}`;
}

// 详批分节并行生成：五节同时请求（同一份提示词与排盘数据，篇幅与单次生成相同），第一节实时流出，
// 后面各节按顺序衔接——总耗时≈最长一节，而不是五节相加。READING_PARALLEL=0 可退回单次生成。
const SECTIONS = [
  { h: '命局总论', words: '280～350', extra: '开头先用一两句自然的话打个招呼、说说对这个盘的第一印象，再进入本节。' },
  { h: '过往验证', words: '280～350', extra: '' },
  { h: '所问之事', words: '320～400', extra: '如果所问过度、不健康或命盘不支持，本节第一句就明确说"不行"，用排盘依据讲清楚原因，再给替代办法。' },
  { h: '未来运势', words: '300～380', extra: '' },
  { h: '开运建议', words: '220～300', extra: '本节最后单独一行写一句祝福语，作为整篇的结尾。' },
];
async function streamReadingParallel(rm, emit, fallbackText, opts: any = {}) {
  const p = getProvider();
  if (!p.available || process.env.READING_PARALLEL === '0') return streamText(rm, emit, fallbackText, opts);
  const { chart, scoreCtx } = opts;
  if (scoreCtx && opts.onScore) opts.onScore(SC.buildCard(chart, scoreCtx));
  const t0 = Date.now();
  const bufs = SECTIONS.map(() => ''), done = SECTIONS.map(() => false), failed = SECTIONS.map(() => false);
  let cur = 0, sent = 0, first = 0; // cur：正在实时输出的节；sent：该节已输出的字符数
  const f = leakFilter((t) => emit('delta', { text: t }));
  const pump = () => {
    while (cur < SECTIONS.length) {
      if (bufs[cur].length > sent) { f.push((cur > 0 && sent === 0 ? '\n\n' : '') + bufs[cur].slice(sent)); sent = bufs[cur].length; }
      if (!done[cur]) return;
      cur++; sent = 0;
    }
  };
  const run = (i) => {
    const sec = SECTIONS[i];
    const others = SECTIONS.filter((_, j) => j !== i).map((x) => x.h).join('、');
    const msgs = [rm[0], { role: 'user', content: `${rm[1].content}\n\n【本次分工】这份解读由五位同门分节同时撰写，你只负责其中「## ${sec.h}」这一节：以"## ${sec.h}"这一行开头，写 ${sec.words} 字（严格控制篇幅，宁短勿长），写完这一节就停。${sec.extra}不要写其他小节（${others}）的内容，也不要重复别的小节会讲的东西；除非本节要求，否则不要寒暄开场、不要写结尾祝福。` }];
    return chatStream(msgs, (d) => { if (!first) first = Date.now() - t0; bufs[i] += d; pump(); }, opts.llm || {})
      .then((full) => { if (!bufs[i].trim()) bufs[i] = full; })
      .catch((e) => { console.error(`[LLM section ${sec.h}]`, e.message); failed[i] = true; })
      .finally(() => { done[i] = true; pump(); });
  };
  await Promise.all(SECTIONS.map((_, i) => run(i)));
  // 失败的节：顺序补写一次（极少发生）
  if (failed.some(Boolean)) {
    for (let i = 0; i < SECTIONS.length; i++) if (failed[i] && !bufs[i].trim()) { done[i] = false; failed[i] = false; await run(i); }
  }
  f.end();
  const text = cleanVisible(bufs.join('\n\n')).trim();
  console.log(`[LLM parallel] ${p.name}:${p.model} first=${first}ms total=${Date.now() - t0}ms chars=${text.length}${failed.some(Boolean) ? ' FAILED=' + failed.map((x, i) => (x ? SECTIONS[i].h : '')).filter(Boolean) : ''}`);
  if (text.length > 200) return { text, source: `${p.name}:${p.model}:parallel` };
  return streamText(rm, emit, fallbackText, { ...opts, onScore: null });
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

  // 0) 危机信号：大师不出戏，用命盘讲"低谷会过去"，自然地织入求助热线；紧急时优先让对方马上打电话、找身边的人
  if (action !== 'confirm' && SC.isCrisis(lastUser)) {
    const acute = SC.isAcute(lastUser);
    console.log(`[chat] crisis signal${acute ? ' ACUTE' : ''}`);
    let chart = null;
    if (profile && missingOf(profile).length === 0) { try { chart = computeChart({ ...toInput(profile), nowYear }); } catch { chart = null; } }
    const tp = chart ? SC.turningPoints(chart) : null;
    const sys = fill(readTemplate('crisis.md').system, {
      TURNING: tp?.lines.length ? `${chart.pillars.map((p) => p.gan + p.zhi).join(' ')}，日主${chart.dayMaster.gan}${chart.dayMaster.wuXing}，喜用${chart.xiYong.join('')}\n${tp.lines.join('\n')}` : '（还没有排盘，不要谈具体年份运势）',
      NEXT_YEAR_HINT: tp?.next ? `${tp.next.startYear}年交入${tp.next.ganZhi}运` : tp?.years[0] ? `${tp.years[0].year}年${tp.years[0].ganZhi}是喜用之年` : '明年运势会松动',
      ACUTE_RULE: acute
        ? '6. 【紧急】对方的话里有具体的计划、方法或在告别，这是眼下的危险。第一段就要恳切而直接地请他现在、马上：拨打 120 或 110，或者打 12356 / 400-161-9995，并且立刻去找身边的人（家人、室友、邻居、楼下保安都行），离开危险的地方、把药和工具放远。语气是心疼和着急，不是命令和训斥。命盘转运只用一两句带过，最后请他打完电话回来跟师傅说一声。'
        : '',
      MEMORY: ctx.memory || '',
    });
    emit('crisis', {});
    emit('bubble', {});
    const fb = () => crisisFallback(tp, acute);
    await streamText([{ role: 'system', content: sys }, ...messages.slice(-8)], emit, fb, { llm: { temperature: 0.7, maxTokens: 900 }, guard: CANNED_RE });
    emit('quick', { replies: acute ? ['我打过电话了', '我身边有人了'] : ['嗯，我想说说发生了什么', '我现在好一点了'] });
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
  const r = await streamReadingParallel(rm, emit, () => generateFallback(chart, questions), { chart, scoreCtx, onScore: ctx.onScore });
  emit('text', { text: '大概就是这些。还有哪儿想细问的，某一年的运势、感情、工作上的选择，直接问我就行。' });
  emit('quick', { replies: suggestions(chart) });
  emit('done', { source: r.source });
}

export { handleChat };
