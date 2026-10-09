// 聊天式流程：提取出生信息 → 确认 → 排盘 → 流式详批 → 追问对答
// handleChat(body, emit) 与平台无关：emit(event, data) 由 Express(SSE) 或云函数(收集为数组) 实现。
import { computeChart, checkDate, profileChanges, changeSentence, chartDiffText, compatRelations, briefBazi, recommendCities, cityChartBrief, moveYears, placeCoord, CITY_CATALOG } from '@mingpan/core';
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
  const pending = cleanProfile(body.pending);
  const c = body.pending?.correction;
  if (pending && c && typeof c.id === 'string' && c.id.length <= 64) pending.correction = { id: c.id, changed: Object.fromEntries(Object.entries(c.changed || {}).filter(([k, v]) => ['gender', 'calendar', 'date', 'time', 'city', 'label'].includes(k) && typeof v === 'string').map(([k, v]) => [k, String(v).slice(0, 20)])) };
  return { messages, pending, profile: cleanProfile(body.profile), action: body.action, nowYear: +body.nowYear || undefined, ui: body.ui === 'card' ? 'card' : 'text' };
}
function cleanProfile(p): any {
  if (!p || typeof p !== 'object') return null;
  const o: any = {};
  if (typeof p.name === 'string' && p.name.trim()) o.name = p.name.trim().slice(0, 12);
  if (typeof p.label === 'string' && p.label.trim()) o.label = p.label.trim().slice(0, 8);
  if (p.newPerson) o.newPerson = true;
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

async function extract(messages, pending, nowYear, subject = '') {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const p = getProvider();
  if (p.available) {
    try {
      const t = readTemplate('extract.md');
      const pend = pending ? { ...pending } : null; if (pend) { delete pend.newPerson; delete pend.correction; }
      const vars = { NOW_YEAR: nowYear, PENDING: pend ? JSON.stringify(pend) : '（无）', DIALOG: dialogText(messages), SUBJECT: subject ? `【注意】客户现在是在替自己的「${subject}」提供出生信息：只提取${subject}的信息，对话里客户本人的生辰不要混进来；label 填「${subject}」。` : '' };
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
  return [`${n + 1}年我能结婚吗？`, love, '我适合做什么工作？', '我适合住哪个城市？', past ? `${past.year}年是不是不太顺？` : `${n}年下半年运势怎么样？`];
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
async function streamText(messages, emit0, fallbackText, opts: any = {}) {
  const p = getProvider();
  // gate：推测执行——先请求模型，输出先压住，等意图判断出结果再决定放行还是丢弃
  let emit = emit0;
  if (opts.gate) {
    let open: boolean | null = null; const held: [string, any][] = [];
    opts.gate.then((ok) => { open = ok; if (ok) held.splice(0).forEach(([e, d]) => emit0(e, d)); });
    emit = (e, d) => { if (open === true) emit0(e, d); else if (open === null) held.push([e, d]); };
  }
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
    const sec = i === 0 && opts.recast ? { ...SECTIONS[0], extra: '这是客户更正生辰后按新盘重新做的解读：不要打招呼，不要提旧盘，第一句直接用「按新盘来看」之类的话进入本节。' }
      : i === 0 && opts.subject ? { ...SECTIONS[0], extra: `客户刚才一直在跟你聊，这次是替自己的${opts.subject}看盘：不要说"你好""这位朋友"，开头用一两句自然的话说说对${whoOf(opts.subject)}这个盘的第一印象（如「${whoOf(opts.subject)}这个盘啊……」），再进入本节。` } : SECTIONS[i];
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

// ---------- 多命主：称呼、意图识别 ----------
const MALE = /^(老公|丈夫|先生|男朋友|男友|爸|爸爸|父亲|老爸|儿子|哥|哥哥|弟|弟弟|爷爷|外公|公公|岳父|老爷子|男同事|兄弟)$/;
const FEMALE = /^(老婆|妻子|媳妇|太太|女朋友|女友|妈|妈妈|母亲|老妈|女儿|闺女|姐|姐姐|妹|妹妹|奶奶|外婆|婆婆|岳母|闺蜜|女同事)$/;
const REL = /^(老公|丈夫|先生|老婆|妻子|媳妇|太太|爱人|男朋友|女朋友|男友|女友|对象|爸|爸爸|妈|妈妈|父亲|母亲|老爸|老妈|儿子|女儿|闺女|孩子|宝宝|哥|哥哥|姐|姐姐|弟|弟弟|妹|妹妹|朋友|同事|闺蜜|兄弟|老板|领导|婆婆|公公|岳父|岳母|爷爷|奶奶|外公|外婆|同学|室友)$/;
export const genderOfLabel = (l = '') => (MALE.test(l) ? '男' : FEMALE.test(l) ? '女' : undefined);
/** 对客户说话时怎么称呼命主："你" / "你老公" / "小王" */
export const whoOf = (l?: string) => (!l || l === '我' ? '你' : REL.test(l) ? `你${l}` : l);
export function subjectNote(label?: string) {
  if (!label || label === '我') return '';
  return `【命主】这张盘是客户的${label}，不是正在聊天的客户本人。对客户说话时用「${whoOf(label)}」或「他/她」来称呼命主（如「${whoOf(label)}这个盘…」），不要把命主当成正在聊天的人。`;
}
const CORR_RE = /记错|搞错|弄错|说错|写错|输错|打错|填错|填成|说成|写成|其实是|其实我是|其实他是|其实她是|应该是|更正|纠正|改成|改为|改一下|不是.{0,10}是|不对/;
const PERSON_RE = /(老公|丈夫|先生|老婆|妻子|媳妇|太太|爱人|男朋友|女朋友|男友|女友|对象|爸|妈|父亲|母亲|儿子|女儿|闺女|孩子|宝宝|哥|姐|弟|妹|朋友|同事|闺蜜|兄弟|老板|领导|婆婆|公公|岳父|岳母|爷爷|奶奶|外公|外婆|同学|室友|别人|另一个人|再算|再看一个|再排)/;
const PERSON_ACT = /看看|看一下|算算|算一下|算一个|排一下|排个|测|八字|命|生日|出生|生的|\d{2,4}年|合不合|配不配|合盘|合婚|运势|运气|怎么样|如何|好不好|身体|事业|学业|性格/;
const COMPAT_RE = /合盘|合婚|合不合|配不配|般配|合得来|相配|八字合|合适吗|合适不/;
export const mightRoute = (t: string) => CORR_RE.test(t) || COMPAT_RE.test(t) || (PERSON_RE.test(t) && PERSON_ACT.test(t));

const birthLine = (p) => { try { return profileLine({ ...p, topics: [] }); } catch { return '（信息不全）'; } };
async function route(messages, cur, profiles, nowYear) {
  const p = getProvider();
  if (!p.available) return null;
  try {
    const t = readTemplate('route.md');
    const list = (profiles || []).map((x) => `- id=${x.id} 称呼=${x.label || '我'} ${birthLine(x.data)}`).join('\n') || '（无）';
    const vars = { NOW_YEAR: nowYear, CURRENT: `${cur.label || '我'}（${birthLine(cur)}）`, PROFILES: list, DIALOG: dialogText(messages.slice(-4)) };
    const t0 = Date.now();
    const out = await chat([{ role: 'system', content: fill(t.system, vars) }, { role: 'user', content: fill(t.user, vars) }], { json: true, temperature: 0, maxTokens: 400 });
    const j = parseJSON(out);
    console.log(`[route] ${Date.now() - t0}ms intent=${j?.intent}`);
    return j;
  } catch (e) { console.error('[route]', e.message); return null; }
}
/** 正则兜底：模型不可用时识别"记错了是4号"一类的简单更正 */
function regexCorrection(text: string, cur) {
  if (!CORR_RE.test(text)) return null;
  const ch: any = {};
  const d = text.match(/(\d{1,2})\s*[号日]/); if (d) ch.day = +d[1];
  const m = text.match(/(\d{1,2})\s*月/); if (m) ch.month = +m[1];
  const y = text.match(/((?:19|20)\d{2})\s*年/); if (y) ch.year = +y[1];
  if (/男/.test(text) && cur.gender !== '男' && /是男|男的|男生|男孩/.test(text)) ch.gender = '男';
  if (/女/.test(text) && cur.gender !== '女' && /是女|女的|女生|女孩/.test(text)) ch.gender = '女';
  if (/农历|阴历/.test(text)) ch.calendar = 'lunar'; else if (/公历|阳历|新历/.test(text)) ch.calendar = 'solar';
  const h = text.match(/(早上|上午|中午|下午|晚上|凌晨)?\s*(\d{1,2})\s*点(半)?/);
  if (h) { let hr = +h[2]; if (/下午|晚上/.test(h[1] || '') && hr < 12) hr += 12; ch.time = { type: 'exact', hour: hr % 24, minute: h[3] ? 30 : 0 }; }
  return Object.keys(ch).length ? { intent: 'correction', changes: ch } : null;
}

const REASON = { date: '日子一变，日柱就跟着变', time: '时辰一变，时柱就跟着变', gender: '男女不同，大运的顺逆就不一样', calendar: '公历农历差得远，四柱可能整个都会变', city: '出生地关系到真太阳时，时辰可能会挪一格' };
/** 更正生辰：在大师这一轮里放一张预填好的更正卡片（改动处高亮、标出原值），按钮「按这个重排」→ PATCH */
function handleCorrection(cur, startFrom, changes, emit) {
  const base = { ...cur }; delete base.id; delete base.label;
  const from = { ...startFrom }; delete from.correction; delete from.awaitingConfirm; delete from.newPerson;
  const next: any = cleanProfile({ ...from, ...changes, time: changes.time || from.time, topics: cur.topics, label: cur.label });
  if (!next.calendar) next.calendar = base.calendar || 'solar';
  const changed = profileChanges(base, next);
  if (!Object.keys(changed).length) return false;
  const keys = Object.keys(changed);
  const bad = checkDate(next);
  const why = REASON[keys.find((k) => REASON[k]) || 'date'];
  const text = bad
    ? `嗯…${bad.replace(/，请再核对一下$/, '')}。我把卡片先按你说的改好了，日期你再核对一下，改对了点「按这个重排」就行。`
    : `哦，${changeSentence(base, next)}啊。${why}，盘得重排。我把改动标在下面了，你看一眼，没问题就点「按这个重排」。`;
  emit('text', { text });
  emit('pending', { pending: { ...next, awaitingConfirm: true, correction: { id: cur.id, changed } } });
  emit('done', {});
  return true;
}

/** 想看另一个人：先问对方的生辰（或直接提取），再给一张带"称呼"的新卡片，确认后单独建档、单独对话 */
function handleOtherPerson(person, profiles, emit, compatAsked = false) {
  const label = String(person?.label || '').trim().slice(0, 8) || '朋友';
  const exist = (profiles || []).find((x) => x.label === label);
  const who = whoOf(label);
  if (exist && !person?.year) {
    emit('text', { text: compatAsked
      ? `${who}的盘之前已经排过了。要看你们俩合不合，直接问我「我和${label}合不合」就行。`
      : `${who}的盘之前已经排过了，在单独的一页里。点下面切过去，接着看${who}的就好，两个人的盘分开看才不会串。` });
    if (!compatAsked) emit('switch', { profileId: exist.id, label });
    emit('done', {});
    return;
  }
  const p: any = cleanProfile({ ...(person || {}), label, newPerson: true });
  if (!p.gender) { const g = genderOfLabel(label); if (g) p.gender = g; }
  p.newPerson = true;
  const missing = missingOf(p);
  if (missing.length) {
    emit('pending', { pending: p });
    emit('text', { text: `好呀。不过要看${who}的事，得用${who}自己的八字单独排一盘，拿你的盘去套是不准的。把${who}的${missing.filter((x) => !x.startsWith('出生时间')).concat(missing.some((x) => x.startsWith('出生时间')) ? ['出生时间（不清楚也没关系）'] : []).join('、')}发我，我给${who}单独建一份命盘。${compatAsked ? '建好以后，你们俩合不合我也能一起看。' : ''}` });
    emit('done', {});
    return;
  }
  if (!p.calendar) p.calendar = 'solar';
  const bad = checkDate(p);
  if (bad) { emit('pending', { pending: { ...p, day: undefined } }); emit('text', { text: `嗯…${bad.replace(/，请再核对一下$/, '')}，${who}的生日再帮我核对一下？` }); emit('done', {}); return; }
  emit('text', { text: `好，我单独给${who}建一份命盘，跟你的分开放，不会串。信息在下面，你核对一下，没问题点「开始排盘」。` });
  emit('pending', { pending: { ...p, awaitingConfirm: true } });
  emit('done', {});
}

/** 合盘：两张命盘 + 程序算出的两人关系 → 模型解读（守同样的边界与评分规则） */
async function runCompat(a, b, q, messages, emit, ctx: any = {}) {
  const nowYear = ctx.nowYear || new Date().getFullYear();
  const ca: any = computeChart({ ...toInput(a.data || a), nowYear }), cb: any = computeChart({ ...toInput(b.data || b), nowYear });
  const nA = a.label && a.label !== '我' ? a.label : '你', nB = b.label && b.label !== '我' ? b.label : '你';
  const rel = compatRelations(ca, cb, nA, nB);
  const t = readTemplate('compat.md');
  const scoreCtx = SC.scorePrompt(ca, nowYear, q, SC.pickDims('感情 ' + q));
  const sys = fill(t.system, { NAME_A: nA, NAME_B: nB, CHART_A: chartToText(ca), CHART_B: chartToText(cb), RELATIONS: rel.lines.join('\n'), NOW_YEAR: nowYear, NEXT_YEAR: nowYear + 1, LAST_YEAR: nowYear - 1, STYLE_GUIDE: loadStyle().guide, SCORE_CONTEXT: scoreCtx.text, MEMORY: ctx.memory || '' });
  emit('compat', { a: { label: nA, bazi: briefBazi(ca) }, b: { label: nB, bazi: briefBazi(cb) }, good: rel.good.slice(0, 4), bad: rel.bad.slice(0, 3) });
  emit('bubble', {});
  const fb = () => `你们俩的盘我对着看了一下：${rel.good.length ? `合的地方有${rel.good.slice(0, 2).join('，')}` : '没有特别突出的相合'}${rel.bad.length ? `；需要磨合的是${rel.bad.slice(0, 2).join('，')}` : ''}。\n\n两个人过日子，盘上的合冲只是底色，遇事多商量、多体谅，比什么都管用。`;
  const r = await streamText([{ role: 'system', content: sys }, ...messages.slice(-6)], emit, fb, { chart: ca, scoreCtx, onScore: ctx.onScore, llm: { temperature: 0.7, maxTokens: 1100 } });
  emit('quick', { replies: [`${nowYear + 1}年适合结婚吗？`, '我们俩相处要注意什么？'] });
  emit('done', { source: r.source });
}

// ---------- 宜居城市 / 发展方位 ----------
// 触发：已排盘后问住哪、去哪发展、换城市、移民出国；或快捷追问"再换几个城市""更偏南方的城市""也看看国外的城市"
const CITY_RE = /(住|定居|生活|发展|落脚|安家|搬家?|工作)(在|到|去)?(哪|什么地方|啥地方)|(去|在|往|到|搬)(哪|什么地方|啥地方)(里|儿|个城市|座城市)?(住|定居|生活|发展|落脚|安家|工作|好|比较好|合适)|(哪|什么|啥)(个|座|些)?城市|往哪(个)?(方位|边)(走|去|发展|住)|(哪个|什么)方位|换(个|座)?城市|换个地方(住|生活|发展)|移民|出国|去国外|到国外|国外(发展|生活|定居)|海外(发展|生活|定居)|定居|城市.{0,4}(推荐|呢)|(推荐|换|看看|偏|旺我).{0,8}城市|看看国外|只看国内|(国内|国外|海外)的?城市/;
const ABROAD_RE = /出国|移民|海外|国外|外国|留学|abroad|润出去|日本|韩国|德国|欧洲|美国|加拿大|澳洲|澳大利亚|新西兰|英国|法国|荷兰|西班牙|葡萄牙|意大利|爱尔兰|北欧|芬兰|捷克|奥地利/i;
const NO_ABROAD_RE = /(不|没)(想|打算|考虑|准备|去|太想)(出国|移民|去国外|国外)|只看国内|国内(的)?就(行|好|可以)|国内的?城市/;
const COUNTRY_ALIAS: Record<string, string> = { 澳洲: '澳大利亚' };
const PREF_RES: [string, RegExp][] = [
  ['南', /南方|往南|偏南|南边|南部/], ['北', /北方|往北|偏北|北边|北部/], ['东', /东边|东部|偏东|往东|东方/], ['西', /西边|西部|偏西|往西|西方/],
  ['沿海', /沿海|海边|靠海/], ['内陆', /内陆|不靠海/], ['大城市', /大城市|一线|省会|机会多/], ['小城市', /小城市|小城|二三线|三四线|县城/],
  ['安静', /安静|慢节奏|养老|躺平|清净|不卷/], ['便宜', /便宜|房价低|成本低|性价比|消费低/], ['暖和', /暖和|温暖|不冷|怕冷|暖一点/],
];
const cityNames = (t: string) => CITY_CATALOG.filter((c) => t.includes(c.name)).map((c) => c.name);
export const isCityAsk = (t: string) => CITY_RE.test(t);

function cityContext(messages, geo) {
  const users = messages.filter((m) => m.role === 'user').map((m) => m.content);
  const last = users[users.length - 1] || '';
  const recent = users.slice(-8).join('\n');
  // anchor：大致所在位置，只用于就近排序（海外只到国家，坐标置 0 不参与距离计算）
  let anchor: { lat: number; lng: number; country: string } | null = geo?.country
    ? (geo.lat != null ? { lat: geo.lat, lng: geo.lng, country: geo.country } : geo.country !== '中国' ? { lat: 0, lng: 0, country: geo.country } : null) : null;
  // 客户自己说了现在在哪（"我在杭州""现在住在德国"），以它为准
  const m = recent.match(/(?:我|现在|目前|人|一直)(?:住)?(?:在|待在|住在)([^\s，。,.!！？?]{2,8})/g);
  let saidAbroad = false;
  for (const s of m || []) {
    const place = s.replace(/^(我|现在|目前|人|一直)(住)?(在|待在|住在)/, '');
    const c = placeCoord(place);
    if (c) anchor = { lat: c.lat, lng: c.lng, country: c.country };
    const cty = CITY_CATALOG.find((x) => x.country !== '中国' && (place.includes(x.country) || place.includes(x.name)));
    if (cty) { anchor = { lat: cty.lat, lng: cty.lng, country: cty.country }; saidAbroad = true; }
    else if (/国外|海外/.test(place)) saidAbroad = true;
  }
  // 海外意向：从最近一句往前找，最近一次明确表态为准（"只看国内"会覆盖之前的"想出国"）
  let intent: boolean | null = null;
  for (const u of users.slice(-8).reverse()) { if (NO_ABROAD_RE.test(u)) { intent = false; break; } if (ABROAD_RE.test(u)) { intent = true; break; } }
  // 模式只看聊天里的表态（想出国 / 说自己在国外 / 点了追问）；所在地区只用于就近排序，不单独决定海外模式
  const abroad = intent ?? saidAbroad;
  const countries = [...new Set(CITY_CATALOG.filter((c) => c.country !== '中国' && recent.includes(c.country)).map((c) => c.country)
    .concat(Object.entries(COUNTRY_ALIAS).filter(([k]) => recent.includes(k)).map(([, v]) => v)))];
  const prefer = PREF_RES.filter(([, re]) => re.test(last)).map(([k]) => k);
  const exclude = /换|别的|其他|另外|还有/.test(last)
    ? [...new Set(messages.filter((x) => x.role === 'assistant').slice(-4).flatMap((x) => cityNames(x.content)))] as string[] : [] as string[];
  return { anchor, abroad, countries, prefer, exclude };
}

async function runCities(profile, q, messages, emit, ctx: any = {}) {
  const nowYear = ctx.nowYear || new Date().getFullYear();
  const chart: any = computeChart({ ...toInput(profile), nowYear });
  const cc = cityContext(messages, ctx.geo);
  const cctx = { anchor: cc.anchor, abroad: cc.abroad, countries: cc.countries, prefer: cc.prefer, exclude: cc.exclude };
  let rec = recommendCities(chart, cctx);
  if (rec.cities.length < 3 && cctx.exclude.length) rec = recommendCities(chart, { ...cctx, exclude: [] });
  console.log(`[cities] abroad=${cc.abroad} near=${cc.anchor ? (cc.anchor.country === '中国' ? 'cn' : 'abroad') : 'n'} prefer=${cc.prefer.join('/') || '-'} ex=${cc.exclude.length} -> ${rec.cities.map((c) => c.name).join(',')}`);
  const brief = cityChartBrief(chart);
  const cities = rec.cities.map(({ score, ...c }) => c);
  emit('cities', { brief, abroad: rec.abroad, cities });
  const mv = moveYears(chart);
  const curDy = chart.daYun.find((d) => d.startYear <= nowYear && d.endYear >= nowYear);
  const moveText = [curDy ? `当前大运：${curDy.ganZhi}（${curDy.startYear}–${curDy.endYear}），十神${curDy.shiShen}` : '',
    mv.length ? `利于迁动的年份：${mv.map((y) => `${y.year}年${y.ganZhi}${y.favorable ? '（喜用之年）' : ''}${y.yiMa ? '（逢驿马）' : ''}`).join('、')}` : '近几年没有特别突出的迁动之年，稳中求进即可',
    chart.pro?.pillars?.some((p) => p.shenSha?.includes('驿马')) ? '原局带驿马：一生多走动、外出发展有利' : ''].filter(Boolean).join('\n');
  const cand = rec.cities.map((c, i) => `${i + 1}. ${c.name}${c.country !== '中国' ? `（${c.country}）` : `（${c.prov}）`}：${c.reason}；适合：${c.work}${c.caution ? `；注意：${c.caution}` : ''}${c.value ? `；性价比：${c.value}` : ''}`).join('\n');
  const mode = rec.abroad ? '【模式】客户对海外有意向：前几个是发达国家里性价比高的城市（不一定是首都、名城），后面是国内的备选。' : '【模式】只推荐国内城市。';
  const t = readTemplate('cities.md');
  const sys = fill(t.system, { CHART: chartToText(chart), BRIEF: brief, CANDIDATES: cand, MOVE: moveText, MODE: mode, NOW_YEAR: nowYear, NEXT_YEAR: nowYear + 1, LAST_YEAR: nowYear - 1, SUBJECT: subjectNote(profile.label), STYLE_GUIDE: loadStyle().guide, MEMORY: ctx.memory || '', MORE: rec.abroad ? '只看国内的也行' : '想看看国外的也可以' });
  emit('bubble', {});
  const top = rec.cities[0];
  const fb = () => `你这个盘，${brief.replace(/ · /g, '，')}。住的地方讲究顺着喜用走：方位、水土合了你喜欢的五行，人就容易顺。\n\n我按这个思路挑了上面几座城市，${top ? `最贴的是${top.name}——${top.reason}` : ''}。${mv[0] ? `\n\n时机上，${mv[0].year}年${mv[0].ganZhi}${mv[0].favorable ? '是你的喜用之年' : '逢驿马'}，想动的话这一年起步比较顺。` : ''}\n\n想让师傅再换几个，或者说说你更喜欢南方、沿海还是安静些的地方，我再帮你挑。`;
  const names = rec.cities.map((c) => c.name).join('、');
  const pin = { role: 'system', content: `【本轮卡片上的城市】${names}。这一轮只讲这几座城市，按这个顺序；之前聊过的城市不要再提，也绝不能自己另挑城市。` };
  const r = await streamText([{ role: 'system', content: sys }, ...messages.slice(-6), pin], emit, fb, { llm: { temperature: 0.7, maxTokens: 1000 } });
  const xi = chart.xiYong?.[0];
  const lean = { 火: '想要更偏南方的城市', 水: '想要沿海一点的城市', 木: '想要更偏东边的城市', 金: '想要更偏西边的城市', 土: '想要安静点的小城市' }[xi] || '想要更偏南方的城市';
  emit('quick', { replies: ['再换几个城市', lean, rec.abroad ? '只看国内的城市' : '也看看国外的城市'] });
  emit('done', { source: r.source });
}

interface ChatCtx { geo?: { country: string; lat?: number; lng?: number } | null; memory?: string; onScore?: (s: any) => void; current?: { id: string; label: string; data: any } | null; profiles?: { id: string; label: string; data: any }[] }
async function handleChat(body, emit, ctx: ChatCtx = {}) {
  const { messages, pending, profile: bodyProfile, action, nowYear: ny, ui } = sanitize(body || {});
  const nowYear = ny || new Date().getFullYear();
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  // 当前命主以服务端档案为准（多命主时由 profileId 指定）
  const profile = ctx.current ? { ...cleanProfile(ctx.current.data), id: ctx.current.id, label: ctx.current.label || '我' } : bodyProfile;
  const profiles = ctx.profiles || [];

  // 0) 危机信号：大师不出戏，用命盘讲"低谷会过去"，自然地织入求助热线；紧急时优先让对方马上打电话、找身边的人
  if (action !== 'confirm' && SC.isCrisis(lastUser)) {
    const acute = SC.isAcute(lastUser);
    console.log(`[chat] crisis signal${acute ? ' ACUTE' : ''}`);
    let chart = null;
    const own = profile && (!profile.label || profile.label === '我') ? profile : (profiles.find((x) => x.label === '我')?.data || null);
    if (own && missingOf(own).length === 0) { try { chart = computeChart({ ...toInput(own), nowYear }); } catch { chart = null; } }
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

  const hasChart = profile && missingOf(profile).length === 0;
  // 0.5) 正在为另一个人收集生辰：继续提取（这一句完全没提生辰就回到当前命主的追问）
  let collectingOther = !!(pending?.newPerson && hasChart && action !== 'confirm');
  if (collectingOther && !pending.awaitingConfirm && !/\d|[一二三四五六七八九十]月|号|初|十五|点|时|男|女|农历|阴历|公历|阳历|不知道|不清楚|记不得/.test(lastUser)) {
    emit('pending', { pending: null });
    collectingOther = false;
  }

  // 1) 已排盘：先判断是否在更正生辰 / 想看另一个人 / 合盘；同时推测执行普通追问（输出先压住），判断为普通追问就直接放行
  if (hasChart && action !== 'confirm' && !collectingOther) {
    const q = lastUser;
    const followUp = (gate?: Promise<boolean>) => {
      const chart = computeChart({ ...toInput(profile, { extraYears: yearsMentioned(q, nowYear) }), nowYear });
      const t = readTemplate('chat.md');
      const year = yearsMentioned(q, nowYear)[0] || nowYear;
      const scoreCtx = SC.scorePrompt(chart, year, q);
      const sys = fill(t.system, { CHART: chartToText(chart), NOW_YEAR: nowYear, NEXT_YEAR: nowYear + 1, LAST_YEAR: nowYear - 1, NAME: profile.label && profile.label !== '我' ? '' : profile.name || '', SUBJECT: subjectNote(profile.label), STYLE_GUIDE: loadStyle().guide, SCORE_CONTEXT: scoreCtx.text }) + (ctx.memory ? `\n\n${ctx.memory}` : '');
      let held = null;
      const onScore = gate ? (sc) => { held = sc; gate.then((ok) => ok && ctx.onScore?.(held)); } : ctx.onScore;
      if (gate) gate.then((ok) => ok && emit('bubble', {})); else emit('bubble', {}); // 推测执行时，气泡也等意图判断后再出
      return streamText([{ role: 'system', content: sys }, ...messages.slice(-12)], emit, () => followUpFallback(chart, q), { chart, scoreCtx, onScore, gate });
    };
    if (isCityAsk(q) && !CORR_RE.test(q) && !/合盘|合婚|合不合|配不配|般配|合得来|相配|八字合/.test(q) && !PERSON_RE.test(q)) { await runCities(profile, q, messages, emit, { ...ctx, nowYear }); return; }
    if (mightRoute(q)) {
      let release: (ok: boolean) => void;
      const gate = new Promise<boolean>((ok) => (release = ok));
      const spec = followUp(gate).catch((e) => { console.error('[followup spec]', e.message); return { source: 'error' }; });
      let r = await route(messages, profile, profiles, nowYear);
      if (!r || !r.intent) r = regexCorrection(q, profile) || { intent: 'none' };
      if (r.intent === 'correction' && r.changes && Object.keys(r.changes).length) {
        const startFrom = pending?.correction?.id === profile.id ? pending : profile;
        if (handleCorrection(profile, startFrom, r.changes, emit)) { release(false); return; }
      }
      if (r.intent === 'compat') {
        const other = profiles.find((x) => x.id === r.compat_with && x.id !== profile.id)
          || (r.person?.label ? profiles.find((x) => x.label === r.person.label && x.id !== profile.id) : null);
        if (other) { release(false); await runCompat(profile, other, q, messages, emit, { ...ctx, nowYear }); return; }
        if (r.person) { release(false); handleOtherPerson(r.person, profiles, emit, true); return; }
      }
      if (r.intent === 'other_person' && r.person) { release(false); handleOtherPerson(r.person, profiles, emit); return; }
      release(true);
      const out = await spec;
      emit('done', { source: (out as any).source });
      return;
    }
    const r = await followUp();
    emit('done', { source: r.source });
    return;
  }

  // 2) 确认后排盘 + 详批（旧版文字确认）
  let target = null;
  if (action === 'confirm' && pending && missingOf(pending).length === 0) target = pending;

  // 3) 提取出生信息（首次建档，或正在为另一个人建档）
  if (!target) {
    const subject = collectingOther ? pending.label : '';
    const { x, reply } = await extract(messages, pending, nowYear, subject);
    const { confirmed, ...fields } = x;
    if (collectingOther) { fields.label = pending.label; fields.newPerson = true; if (!fields.gender && !pending.gender) { const g = genderOfLabel(pending.label); if (g) fields.gender = g; } }
    else if (!fields.label && !pending?.label) fields.label = profiles.some((p) => p.label === '我') ? undefined : '我';
    const merged = merge(pending, fields);
    delete merged.correction;
    const missing = missingOf(merged);
    if (confirmed && pending?.awaitingConfirm && missing.length === 0 && ui !== 'card') target = merged;
    else if (missing.length) {
      delete merged.awaitingConfirm;
      emit('pending', { pending: merged });
      emit('text', { text: reply || `好的～还差${missing.join('、')}，告诉我就能排盘啦。\n比如：「1995年农历八月十五 早上8点 女 成都」` });
      emit('done', {});
      return;
    } else {
      let bad = checkDate(merged);
      if (!bad) { try { computeChart({ ...toInput(merged), nowYear }); } catch { bad = `${merged.calendar === 'lunar' ? '农历' : '公历'}${merged.year}年${merged.month}月好像没有${merged.day}日这一天`; } }
      if (bad) {
        emit('pending', { pending: { ...merged, day: undefined, awaitingConfirm: false } });
        emit('text', { text: `嗯…${bad.replace(/，请再核对一下$/, '')}，再帮我核对一下日期好吗？` });
        emit('done', {}); return;
      }
      merged.awaitingConfirm = true;
      if (ui === 'card') { // 新前端：信息整理成可编辑的确认卡片，由「开始排盘」按钮走 /api/v1/profiles
        const who = whoOf(merged.label);
        emit('text', { text: merged.newPerson || (merged.label && merged.label !== '我')
          ? `好，${who}的信息齐了。我单独给${who}建一份命盘，跟你的分开放。你核对一下，没问题点「开始排盘」。`
          : CARD_LINES[Math.floor(Math.random() * CARD_LINES.length)] });
        emit('pending', { pending: merged });
      } else {
        emit('pending', { pending: merged });
        emit('text', { text: summary(merged) });
        emit('quick', { replies: ['对，开始排盘', '我要修改'] });
      }
      emit('done', {});
      return;
    }
  }

  // 排盘（旧版前端：文字确认后直接在这里排盘）
  const prof = { ...target }; delete prof.awaitingConfirm;
  const chart = computeChart({ ...toInput(prof), nowYear });
  emit('profile', { profile: prof });
  emit('text', { text: readingIntro(prof, chart) });
  emit('chart', { chart });
  await runReading(prof, chart, messages, emit, ctx);
}

const CARD_LINES = [
  '好，我把你说的整理成一张卡片了，你核对一下。没问题就点「开始排盘」，哪里不对直接在卡片上改就行。',
  '嗯，信息差不多齐了。我列在下面这张卡片里，你看看对不对，对的话点「开始排盘」。',
  '行，我先帮你理一下，你过一眼——有不对的地方点「修改」，确认无误就开始排盘。',
];

/** 排盘后的第一句话（含真太阳时校正说明） */
function readingIntro(prof, chart, edited = false) {
  const ts = chart.trueSolar;
  return `${edited ? `好，按改过的生辰（${profileLine({ ...prof, topics: [] })}）重新排了一盘，你看看` : `好了，${prof.name ? prof.name + '，' : ''}你的盘排出来了，你先看看`}${ts ? `\n（按${ts.city}真太阳时校正：${ts.time.slice(11, 16)}，${chart.lunar.split(' ').pop()}）` : ''}`;
}

/** 一行生辰摘要（用于系统事件 / 记忆） */
function profileLine(p) {
  const date = p.calendar === 'lunar' ? `农历${p.year}年${p.leap ? '闰' : ''}${CN_M[p.month - 1]}月${CN_D[p.day - 1] || p.day + '日'}` : `公历${p.year}年${p.month}月${p.day}日`;
  const time = p.time?.type === 'exact' ? `${String(p.time.hour).padStart(2, '0')}:${String(p.time.minute).padStart(2, '0')}` : p.time?.type === 'shichen' ? `${p.time.shichen}时` : '时辰不详';
  return `${p.gender}，${date} ${time}${p.city ? `，${p.city}` : ''}${p.topics?.length ? `，想问${p.topics.join('、')}` : ''}`;
}

/** 校验并排盘：返回规范化的生辰与命盘，或错误信息 */
function validateProfile(raw, nowYear): any {
  const p = cleanProfile(raw);
  if (!p) return { error: '缺少生辰信息' };
  delete p.awaitingConfirm;
  if (!p.calendar) p.calendar = 'solar';
  if (!p.time) p.time = { type: 'unknown' };
  const miss = missingOf(p);
  if (miss.length) return { error: `还缺${miss.join('、')}` };
  if (p.year < 1900 || p.year > 2100) return { error: '出生年份需要在 1900–2100 之间' };
  const bad = checkDate(p);
  if (bad) return { error: bad };
  try { return { profile: p, chart: computeChart({ ...toInput(p), nowYear }) }; }
  catch { return { error: `${p.calendar === 'lunar' ? '农历' : '公历'}${p.year}年${p.leap ? '闰' : ''}${p.month}月没有${p.day}日，请再核对一下${p.leap ? '（这一年可能没有这个闰月）' : ''}` }; }
}

/** 详批：评分（仅服务端）→ 分节并行流式 → 收尾 + 推荐追问 */
async function runReading(prof, chart, messages, emit, ctx: { memory?: string; onScore?: (s: any) => void; recast?: boolean } = {}) {
  const nowYear = chart.nowYear;
  emit('bubble', {});
  const questions = { topics: prof.topics || [], text: prof.question || '' };
  const qText = [prof.question || '', ...(messages || []).filter((m) => m.role === 'user').slice(-3).map((m) => m.content)].join(' ');
  const scoreCtx = SC.scorePrompt(chart, nowYear, qText, prof.topics?.length ? SC.pickDims(prof.topics.join(' ') + qText) : SC.pickDims(qText));
  const rm = buildReadingMessages(chart, questions, { SCORE_CONTEXT: scoreCtx.text });
  if (ctx.memory) rm[0].content += `\n\n${ctx.memory}`;
  const subj = subjectNote(prof.label);
  if (subj) rm[0].content += `\n\n${subj}`;
  if (ctx.recast) rm[0].content += '\n\n【重要】客户刚更正了生辰，这是按新盘重新做的解读：旧盘及基于旧盘的结论全部作废，不要提及、对比或沿用，一切以上面的新排盘数据为准。';
  const r = await streamReadingParallel(rm, emit, () => generateFallback(chart, questions), { chart, scoreCtx, onScore: ctx.onScore, recast: ctx.recast, subject: prof.label && prof.label !== '我' ? prof.label : '' });
  emit('text', { text: '大概就是这些。还有哪儿想细问的，某一年的运势、感情、工作上的选择，或者想知道去哪座城市更旺你，直接问我就行。' });
  emit('quick', { replies: suggestions(chart) });
  emit('done', { source: r.source });
  return r;
}

export { handleChat, runReading, runCompat, runCities, validateProfile, profileLine, readingIntro, sanitize };
