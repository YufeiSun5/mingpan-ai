// 问题评分与边界：
//  1) 问题健康度：规则识别（危机 / 伤害他人 / 强求 / 赌博投机 / 以命理替代就医 / 出轨 / 孤注一掷）给出上限，LLM 在规则范围内给分
//  2) 多维度评分：完全由排盘数据确定性计算基准分（喜用/忌神 × 流年/大运干支、十神、刑冲合），LLM 只能在 ±ADJ 内微调
// 同一命盘、同一年份、同一维度，基准分永远相同 → 多次提问结果一致。
const DIMS = ['事业', '财运', '感情', '健康', '人际', '学业'];
const ADJ = 8;
const GAN_WX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const ZHI_WX = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };

// 各维度关注的十神
function dimShiShen(dim, gender) {
  return {
    事业: ['正官', '七杀', '正印', '偏印'],
    财运: ['正财', '偏财', '食神', '伤官'],
    感情: gender === '女' ? ['正官', '七杀'] : ['正财', '偏财'],
    健康: ['七杀', '伤官', '劫财'],
    人际: ['比肩', '劫财', '正印', '食神'],
    学业: ['正印', '偏印', '食神'],
  }[dim] || [];
}
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // 我生
const KE = { 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' }; // 我克
const inv = (m, v) => Object.keys(m).find((k) => m[k] === v);
// 各维度的"星"：财星=我克，官星=克我，印星=生我，比劫=同我，食伤=我生
function starOf(dim, dm, gender) {
  const cai = KE[dm], guan = inv(KE, dm), yin = inv(SHENG, dm);
  return { 事业: [guan, '官星'], 财运: [cai, '财星'], 感情: gender === '女' ? [guan, '夫星'] : [cai, '妻星'], 学业: [yin, '印星'], 人际: [dm, '比劫'], 健康: [dm, '日主'] }[dim];
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
const tone = (wx, chart) => (chart.xiYong.includes(wx) ? '喜' : chart.jiShen.includes(wx) ? '忌' : '平');

function yearEntry(chart, year) {
  return [...chart.liuNian, ...(chart.extraLiuNian || [])].find((l) => l.year === year) || null;
}
function daYunOf(chart, year) { return chart.daYun.find((d) => year >= d.startYear && year <= d.endYear) || null; }

/** 某一年各维度的确定性基准分 */
function baseScores(chart, year) {
  const ln = yearEntry(chart, year) || yearEntry(chart, chart.nowYear);
  if (!ln) return { year, period: `${year}年`, dims: {} };
  const dy = daYunOf(chart, ln.year);
  const gender = chart.input.gender;
  const ganT = tone(ln.ganWx, chart), zhiT = tone(ln.zhiWx, chart);
  const dyFav = dy ? [GAN_WX[dy.ganZhi[0]], ZHI_WX[dy.ganZhi[1]]].reduce((s, w) => s + (chart.xiYong.includes(w) ? 1 : chart.jiShen.includes(w) ? -1 : 0), 0) : 0;
  const rel = ln.relations || [];
  const has = (re) => rel.some((r) => re.test(r));
  const dims = {};
  for (const dim of DIMS) {
    let s = 56 + ln.favorable * 6 + dyFav * 3;
    const notes = [];
    const [star, starName] = starOf(dim, chart.dayMaster.wuXing, gender);
    const starT = tone(star, chart);
    const hitStar = [ln.ganWx, ln.zhiWx].filter((w) => w === star).length;
    if (dim === '健康') {
      const strong = /旺|强/.test(chart.dayMaster.strength);
      const sup = [ln.ganWx, ln.zhiWx].filter((w) => w === star || w === inv(SHENG, star)).length; // 帮身之五行
      s += (strong ? -sup : sup) * 4 + (strong ? 2 : 0);
      notes.push(`日主${chart.dayMaster.wuXing}${chart.dayMaster.strength}`);
    } else {
      s += starT === '喜' ? 4 : starT === '忌' ? -4 : 0;
      if (hitStar) { s += (starT === '喜' ? 6 : starT === '忌' ? -7 : 2) * hitStar; notes.push(`流年引动${starName}（${star}${starT === '平' ? '' : '为' + starT}）`); }
      else notes.push(`${starName}${star}${starT === '平' ? '' : '为' + starT}`);
    }
    const ssSet = dimShiShen(dim, gender);
    if (ssSet.includes(ln.shiShen)) {
      if (dim === '健康') { s -= ganT === '喜' ? 2 : 7; notes.push(`流年${ln.shiShen}主耗身`); }
      else if (ganT === '喜') { s += 9; notes.push(`${ln.shiShen}为喜用`); }
      else if (ganT === '忌') { s -= 9; notes.push(`${ln.shiShen}为忌`); }
      else { s += 3; notes.push(`逢${ln.shiShen}`); }
    }
    if (dy && ssSet.includes(dy.shiShen) && dim !== '健康') s += dyFav >= 0 ? 4 : -3;
    if (has(/冲日柱/)) { s -= dim === '感情' ? 11 : dim === '健康' ? 7 : 4; notes.push(`${ln.ganZhi[1]}冲日支`); }
    else if (has(/冲/)) { s -= dim === '健康' ? 5 : 3; notes.push(rel.find((r) => /冲/.test(r))); }
    if (has(/刑/)) { s -= dim === '人际' || dim === '健康' ? 6 : 4; notes.push(rel.find((r) => /刑/.test(r))); }
    if (has(/^合日柱|半合日柱/)) { s += dim === '感情' ? 8 : 3; notes.push('合日支'); }
    else if (has(/合/)) s += dim === '人际' ? 4 : 2;
    if (has(/太岁/)) { s -= 4; notes.push('值太岁'); }
    const base = clamp(s, 30, 95);
    const head = `${ln.ganZhi}年${ln.ganWx}${ganT === '平' ? '' : '为' + ganT}${ln.zhiWx !== ln.ganWx ? `、${ln.zhiWx}${zhiT === '平' ? '' : '为' + zhiT}` : ''}`;
    const reason = `${head}，${[...new Set(notes)].slice(0, 2).join('，')}${dy ? `；${dy.ganZhi}运` : ''}`;
    dims[dim] = { base, reason };
  }
  return { year: ln.year, period: `${ln.year} ${ln.ganZhi}年`, shiShen: ln.shiShen, dims };
}

// ---------- 问题健康度规则 ----------
const RULES = [
  { id: 'crisis', re: /(结束这一切|就结束吧|今晚就结束|不想再醒|想解脱|一了百了|遗书|永别|想消失|活着好累|想死|不想活|活着没意思|活不下去|自杀|轻生|结束(自己的?)?生命|割腕|跳楼|跳河|烧炭|安眠药.*(吃|吞)|了结自己|去死)/, cap: 5, label: '危机信号' },
  { id: 'harm', re: /(报复|弄死|害(他|她|ta|死)|让(他|她|ta)(倒霉|出事|不得好死)|诅咒|下降头|扎小人|整死|搞垮|下蛊)/i, cap: 10, label: '伤害他人' },
  { id: 'force', re: /(不管用什么(办法|方法|手段)|不择手段|强行|逼(他|她)|控制(他|她)|让(他|她)离不开|和合术|情降|锁心|做法.*(回来|挽回))/, cap: 25, label: '强求他人意愿' },
  { id: 'gamble', re: /(赌|梭哈|全部(存款|积蓄|家当|身家)|所有(存款|积蓄)|all\s?in|押上(全部|一切)|一夜暴富|借钱.*(炒|投|博)|贷款.*(炒|投|博))/i, cap: 20, label: '赌博/孤注一掷' },
  { id: 'medical', re: /((不做|不用|不去|拒绝|不想做|放弃)(手术|化疗|放疗|治疗)|不吃药|停药|靠(转运|风水|改名|做法|算命|开光)|(癌|病|肿瘤).*(转运|改运|做法|风水))/, cap: 20, label: '以命理替代就医' },
  { id: 'cheat', re: /(出轨|小三|劈腿|偷情|拆散|脚踏两)/, cap: 30, label: '违背伦理' },
  { id: 'reckless', re: /(裸辞|辞职.*(全部|所有|一把)|一把(翻身|发财))/, cap: 40, label: '冲动冒进' },
];
function classify(text) {
  const t = String(text || '');
  const hit = RULES.filter((r) => r.re.test(t));
  return { flags: hit.map((r) => r.id), labels: hit.map((r) => r.label), cap: hit.length ? Math.min(...hit.map((r) => r.cap)) : 100, crisis: hit.some((r) => r.id === 'crisis') };
}
const isCrisis = (text) => classify(text).crisis;

// 按问题挑选维度
function pickDims(q) {
  const t = String(q || '');
  if (/(病|癌|手术|健康|身体|医院|治疗|肿瘤)/.test(t)) return ['健康', '人际', '财运'];
  if (/(赌|彩票|投资|股票|基金|币|发财|暴富|钱|财)/.test(t)) return ['财运', '事业', '人际'];
  if (/(辞职|工作|事业|升职|跳槽|创业|老板|面试|考公|编制)/.test(t)) return ['事业', '财运', '人际'];
  if (/(考试|学业|考研|高考|读书|留学)/.test(t)) return ['学业', '事业', '健康'];
  if (/(前任|复合|结婚|感情|桃花|正缘|对象|男朋友|女朋友|老公|老婆|恋爱|婚)/.test(t)) return ['感情', '人际', '健康'];
  return ['事业', '财运', '感情', '健康', '人际'];
}
const levelOf = (h) => (h >= 75 ? 'good' : h >= 50 ? 'mid' : 'low');

function ganZhiSet(chart) {
  const s = new Set();
  chart.pillars.forEach((p) => s.add(p.gan + p.zhi));
  chart.daYun.forEach((d) => s.add(d.ganZhi));
  [...chart.liuNian, ...(chart.extraLiuNian || [])].forEach((l) => s.add(l.ganZhi));
  return s;
}
const GZ_RE = /[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g;

const LEVEL_WORD = (n: number) => (n >= 82 ? '很旺' : n >= 68 ? '偏旺' : n >= 52 ? '平稳' : n >= 42 ? '偏弱' : '受压');
const HOW: Record<string, string> = {
  harm: '想伤害、报复他人', force: '想不择手段控制或挽回别人', gamble: '想靠赌博或孤注一掷暴富', medical: '想用转运代替看病治疗',
  cheat: '违背伦理（出轨、拆散别人）', reckless: '冲动冒进、押上全部', crisis: '可能有轻生念头',
};
/** 生成注入 system 的隐藏指引（只用定性措辞，不出现分数，避免外泄） */
function scorePrompt(chart, year, q, defaultDims?: string[]) {
  const b = baseScores(chart, year);
  const c = classify(q);
  const dims = defaultDims || pickDims(q);
  const lines = dims.map((d) => `- ${d}：${LEVEL_WORD(b.dims[d]?.base ?? 60)}（${b.dims[d]?.reason ?? ''}）`).join('\n');
  const flagged = c.flags.filter((f) => f !== 'crisis');
  const refuse = c.cap <= 30, careful = !refuse && c.cap < 100;
  const how = refuse
    ? `这次所问属于「${flagged.map((f) => HOW[f]).join('、')}」，必须拒绝：开口第一句就明确说"不行"或"这个真的不行"；接着用上面的排盘依据（具体的流年/大运干支、十神、喜忌、刑冲）讲清楚为什么命里不支持、硬来会怎样；再温和地给一个建设性的替代办法；最后一句吉祥话收尾。`
    : careful
      ? `这次所问有「${flagged.map((f) => HOW[f]).join('、')}」的倾向，要直说利害、劝他稳一稳，用排盘依据说明为什么不宜冒进，再给稳妥的做法。`
      : '这次所问是正常的问题，按命盘如实、正面地解读。如果你自己判断问题本身过度、不健康或不道德（比如伤害别人、违法、赌博、用算命代替看病），同样要明确说"不行"，用排盘依据讲清楚原因，再给替代办法和吉祥话。';
  return {
    base: b, cls: c, dims,
    text: `【内部参考——只供你心里有数，回答里绝不能提到"参考""评分""分数""健康度""规则""程序"这类字眼，也不要说任何分值】\n${b.period}，与所问相关的几方面气势（据排盘推算）：\n${lines}\n${how}${c.flags.includes('medical') ? '\n涉及疾病：一定要明确说"一定要听医生的，按医生的方案治疗"，命理只作心态和调养参考。' : ''}`,
  };
}

/** 校验 LLM 给出的评分 JSON，与基准合成最终评分卡 */
function buildCard(chart, ctx, raw?: any) {
  const { base, cls, dims: defDims } = ctx;
  const j = raw && typeof raw === 'object' ? raw : {};
  const gz = ganZhiSet(chart);
  let health = Number.isFinite(+j.health) ? clamp(+j.health, 0, 100) : (cls.cap < 100 ? cls.cap : 85);
  health = Math.min(health, cls.cap);
  if (!cls.flags.length && !Number.isFinite(+j.health)) health = 85;
  let verdict = ['ok', 'caution', 'no'].includes(j.verdict) ? j.verdict : null;
  if (cls.cap <= 30) verdict = 'no';
  if (!verdict) verdict = raw ? (health >= 70 ? 'ok' : health >= 45 ? 'caution' : 'no') : (cls.cap <= 30 ? 'no' : cls.cap < 100 ? 'caution' : 'ok');
  const note = typeof j.healthNote === 'string' && j.healthNote.trim() ? j.healthNote.trim().slice(0, 40) : cls.labels.length ? `问题涉及「${cls.labels[0]}」，大师会直说利害` : '问题合理，可以放心细看';
  const llmDims = Array.isArray(j.dims) ? j.dims.filter((d) => d && DIMS.includes(d.k)) : [];
  let names = [...new Set(llmDims.map((d) => d.k))].slice(0, 5);
  for (const d of defDims) if (names.length < 3 && !names.includes(d)) names.push(d);
  if (!names.length) names = defDims;
  const dims = names.map((k) => {
    const b = base.dims[k as string] || { base: 60, reason: '' };
    const l = llmDims.find((d) => d.k === k) || {};
    const adj = Number.isFinite(+l.adj) ? clamp(+l.adj, -ADJ, ADJ) : 0;
    let reason = typeof l.reason === 'string' ? l.reason.trim().slice(0, 42) : '';
    const bad = (reason.match(GZ_RE) || []).some((x) => !gz.has(x));
    if (!reason || bad || /规则|上限|预判|基准|分数|\d+\s*分|JSON|score/i.test(reason)) reason = b.reason; // 不让内部规则措辞外露
    return { k, score: clamp(b.base + adj, 20, 98), base: b.base, reason };
  });
  return { health, level: levelOf(health), verdict, note, period: base.period, dims, flags: cls.flags };
}

const CRISIS_TEXT = '先停一下，我想认真地跟你说几句。\n\n听起来你现在真的很难受、很累。这种时候，命盘不重要，**你这个人最重要**。你愿意说出来，已经很勇敢了。\n\n请现在就联系能陪你的人：\n- **全国心理援助热线：400-161-9995**（24 小时）\n- **心理援助热线：12356**\n- 如果有立即的危险，请拨打 **120 / 110**，或马上去最近的医院急诊\n\n也可以告诉身边信任的家人、朋友，让他们现在陪着你。难熬的时刻会过去的，你值得被好好照顾。我在这里，愿意听你慢慢说。';

// 紧急危险信号：有计划、方法、时间或在告别
const ACUTE_RE = /(遗书|遗言|告别|永别|再见了|下辈子|最后一次|来世|后事|已经(准备|买|写|想好)|准备好了|今晚.*(结束|走|死|跳|吃)|现在就.*(死|跳|走|吃)|(买|囤|攒)了.*(药|安眠药|炭|农药|绳)|安眠药|农药|烧炭|割腕|上吊|站在.*(楼顶|天台|桥|窗)|(楼顶|天台|桥上|窗边|河边)|刀片)/;
const isAcute = (t: string) => ACUTE_RE.test(t || '');
const GAN_WX2: Record<string, string> = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const ZHI_WX2: Record<string, string> = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
/** 从排盘数据里找"转运"依据：当前大运、下一步大运（是否喜用）、接下来的喜用流年 */
function turningPoints(chart) {
  const now = chart.nowYear, xi = chart.xiYong || [];
  const fav = (gz: string) => [GAN_WX2[gz[0]], ZHI_WX2[gz[1]]].filter((w) => xi.includes(w)).length;
  const cur = chart.daYun.find((d) => d.startYear <= now && d.endYear >= now);
  const next = chart.daYun.find((d) => d.startYear > now);
  const years = [...chart.liuNian, ...(chart.extraLiuNian || [])].filter((l) => l.year > now && l.year <= now + 6 && l.favorable > 0).slice(0, 3);
  const lines = [];
  if (cur) lines.push(`现在走${cur.ganZhi}大运（${cur.startYear}–${cur.endYear}，${cur.shiShen}），${fav(cur.ganZhi) ? `大运里有你的喜用${xi.join('')}` : '这步运偏辛苦，属于磨砺期'}`);
  if (next) lines.push(`${next.startYear}年交入${next.ganZhi}大运（${next.shiShen}）${fav(next.ganZhi) ? `，喜用神${xi.filter((w) => [GAN_WX2[next.ganZhi[0]], ZHI_WX2[next.ganZhi[1]]].includes(w)).join('')}到位` : ''}，离现在${next.startYear - now}年`);
  if (years.length) lines.push(`接下来对你有利的流年：${years.map((y) => `${y.year}${y.ganZhi}（${y.shiShen}，${y.ganWx}${y.zhiWx}为喜）`).join('、')}`);
  const cy = chart.liuNian.find((l) => l.year === now);
  if (cy) lines.push(`今年${cy.ganZhi}，${cy.favorable > 0 ? '本身是喜用之年，眼下的难是一时的' : cy.favorable < 0 ? '流年带忌神，所以这一年格外压人，但流年一过就松' : '平年'}`);
  return { lines, next, years, cur };
}
export { isAcute, turningPoints };
export { DIMS, baseScores, classify, isCrisis, pickDims, scorePrompt, buildCard, CRISIS_TEXT, levelOf };
