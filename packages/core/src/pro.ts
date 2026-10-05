// 专业排盘补充：星运/自坐/空亡/旬首/神煞/干支关系/旺相休囚死/格局/五神/命宫身宫胎元胎息/起运交运/人元司令
import { LunarUtil } from 'lunar-javascript';

const GAN = '甲乙丙丁戊己庚辛壬癸', ZHI = '子丑寅卯辰巳午未申酉戌亥';
const GAN_WX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const ZHI_WX = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
const inv = (m) => Object.fromEntries(Object.entries(m).map(([a, b]) => [b, a]));
const SHENG_ME = inv(SHENG), KE_ME = inv(KE);

// 十二长生（阳顺阴逆）
const CS = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养'];
const CS_START = { 甲: '亥', 丙: '寅', 戊: '寅', 庚: '巳', 壬: '申', 乙: '午', 丁: '酉', 己: '酉', 辛: '子', 癸: '卯' };
function changSheng(gan, zhi) {
  const s = ZHI.indexOf(CS_START[gan]), z = ZHI.indexOf(zhi);
  const yang = GAN.indexOf(gan) % 2 === 0;
  return CS[((yang ? z - s : s - z) + 12) % 12];
}

// ---------- 神煞 ----------
const SAN_HE_GROUP = (z) => ['申子辰', '寅午戌', '巳酉丑', '亥卯未'].find((g) => g.includes(z));
const TAOHUA = { 申子辰: '酉', 寅午戌: '卯', 巳酉丑: '午', 亥卯未: '子' };
const YIMA = { 申子辰: '寅', 寅午戌: '申', 巳酉丑: '亥', 亥卯未: '巳' };
const HUAGAI = { 申子辰: '辰', 寅午戌: '戌', 巳酉丑: '丑', 亥卯未: '未' };
const JIANGXING = { 申子辰: '子', 寅午戌: '午', 巳酉丑: '酉', 亥卯未: '卯' };
const TIANYI = { 甲: '丑未', 戊: '丑未', 庚: '丑未', 乙: '子申', 己: '子申', 丙: '亥酉', 丁: '亥酉', 壬: '卯巳', 癸: '卯巳', 辛: '寅午' };
const TAIJI = { 甲: '子午', 乙: '子午', 丙: '卯酉', 丁: '卯酉', 戊: '辰戌丑未', 己: '辰戌丑未', 庚: '寅亥', 辛: '寅亥', 壬: '巳申', 癸: '巳申' };
const WENCHANG = { 甲: '巳', 乙: '午', 丙: '申', 丁: '酉', 戊: '申', 己: '酉', 庚: '亥', 辛: '子', 壬: '寅', 癸: '卯' };
const LU = { 甲: '寅', 乙: '卯', 丙: '巳', 丁: '午', 戊: '巳', 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子' };
const YANGREN = { 甲: '卯', 丙: '午', 戊: '午', 庚: '酉', 壬: '子' };
const JINYU = { 甲: '辰', 乙: '巳', 丙: '未', 丁: '申', 戊: '未', 己: '申', 庚: '戌', 辛: '亥', 壬: '丑', 癸: '寅' };
const HONGLUAN = { 子: '卯', 丑: '寅', 寅: '丑', 卯: '子', 辰: '亥', 巳: '戌', 午: '酉', 未: '申', 申: '未', 酉: '午', 戌: '巳', 亥: '辰' };
const CHONG = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' };
const TIANDE = { 寅: '丁', 卯: '申', 辰: '壬', 巳: '辛', 午: '亥', 未: '甲', 申: '癸', 酉: '寅', 戌: '丙', 亥: '乙', 子: '巳', 丑: '庚' };
const YUEDE = { 寅午戌: '丙', 申子辰: '壬', 亥卯未: '甲', 巳酉丑: '庚' };
const KUIGANG = ['庚辰', '庚戌', '壬辰', '戊戌'];

function shenShaFor(zhi, gan, yearZhi, yearGan, dayGan, monthZhi, dayKong, opts: { isDay?: boolean; isYear?: boolean } = {}) {
  const out = [];
  const add = (n) => { if (!out.includes(n)) out.push(n); };
  if (TIANYI[dayGan]?.includes(zhi) || TIANYI[yearGan]?.includes(zhi)) add('天乙贵人');
  if (TAIJI[dayGan]?.includes(zhi) || TAIJI[yearGan]?.includes(zhi)) add('太极贵人');
  if (WENCHANG[dayGan] === zhi || WENCHANG[yearGan] === zhi) add('文昌');
  if (TIANDE[monthZhi] === gan || TIANDE[monthZhi] === zhi) add('天德');
  if (YUEDE[SAN_HE_GROUP(monthZhi)] === gan) add('月德');
  if (LU[dayGan] === zhi) add('禄神');
  if (YANGREN[dayGan] === zhi) add('羊刃');
  if (JINYU[dayGan] === zhi) add('金舆');
  for (const base of [yearZhi]) {
    const g = SAN_HE_GROUP(base);
    if (!g) continue;
    if (TAOHUA[g] === zhi) add('桃花');
    if (YIMA[g] === zhi) add('驿马');
    if (HUAGAI[g] === zhi) add('华盖');
    if (JIANGXING[g] === zhi) add('将星');
  }
  if (!opts.isYear && HONGLUAN[yearZhi] === zhi) add('红鸾');
  if (!opts.isYear && CHONG[HONGLUAN[yearZhi]] === zhi) add('天喜');
  if (opts.isDay && KUIGANG.includes(gan + zhi)) add('魁罡');
  if (!opts.isDay && dayKong && dayKong.includes(zhi)) add('空亡');
  return out;
}

function shenSha(pillars, i, kong, timeUnknown) {
  const p = pillars[i], yp = pillars[0], dp = pillars[2], mz = pillars[1].zhi;
  const out = [];
  const add = (n) => { if (!out.includes(n)) out.push(n); };
  if (TIANYI[dp.gan].includes(p.zhi) || TIANYI[yp.gan].includes(p.zhi)) add('天乙贵人');
  if (TAIJI[dp.gan].includes(p.zhi) || TAIJI[yp.gan].includes(p.zhi)) add('太极贵人');
  if (WENCHANG[dp.gan] === p.zhi || WENCHANG[yp.gan] === p.zhi) add('文昌');
  if (TIANDE[mz] === p.gan || TIANDE[mz] === p.zhi) add('天德');
  if (YUEDE[SAN_HE_GROUP(mz)] === p.gan) add('月德');
  if (LU[dp.gan] === p.zhi) add('禄神');
  if (YANGREN[dp.gan] === p.zhi) add('羊刃');
  if (JINYU[dp.gan] === p.zhi) add('金舆');
  for (const base of [yp.zhi, dp.zhi]) {
    const g = SAN_HE_GROUP(base);
    if (TAOHUA[g] === p.zhi) add('桃花');
    if (YIMA[g] === p.zhi) add('驿马');
    if (HUAGAI[g] === p.zhi) add('华盖');
    if (JIANGXING[g] === p.zhi) add('将星');
  }
  if (i !== 0 && HONGLUAN[yp.zhi] === p.zhi) add('红鸾');
  if (i !== 0 && CHONG[HONGLUAN[yp.zhi]] === p.zhi) add('天喜');
  if (i === 2 && KUIGANG.includes(p.gan + p.zhi)) add('魁罡');
  if (i !== 2 && kong.includes(p.zhi)) add('空亡');
  return out;
}

// ---------- 干支关系 ----------
const GAN_HE = { 甲己: '土', 乙庚: '金', 丙辛: '水', 丁壬: '木', 戊癸: '火' };
const GAN_CHONG = ['甲庚', '乙辛', '丙壬', '丁癸'];
const LIU_HE = { 子丑: '土', 寅亥: '木', 卯戌: '火', 辰酉: '金', 巳申: '水', 午未: '土' };
const SAN_HE = { 申子辰: '水', 亥卯未: '木', 寅午戌: '火', 巳酉丑: '金' };
const SAN_HUI = { 寅卯辰: '木', 巳午未: '火', 申酉戌: '金', 亥子丑: '水' };
const LIU_CHONG = ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'];
const HAI = ['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌'];
const PO = ['子酉', '卯午', '辰丑', '未戌', '寅亥', '巳申'];
const XING3 = [['寅', '巳', '申', '无恩之刑'], ['丑', '戌', '未', '恃势之刑']];
const pairHas = (list, a, b) => list.includes(a + b) || list.includes(b + a);
const pairKey = (obj, a, b) => obj[a + b] || obj[b + a];

function relations(pillars, timeUnknown) {
  const ps = pillars.filter((_, i) => !(timeUnknown && i === 3));
  const L = (i) => ps[i].label[0];
  const gan = [], zhi = [];
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j], tag = `${L(i)}${L(j)}`;
    const h = pairKey(GAN_HE, a.gan, b.gan); if (h) gan.push(`${a.gan}${b.gan}合${h}（${tag}）`);
    if (pairHas(GAN_CHONG, a.gan, b.gan)) gan.push(`${a.gan}${b.gan}相冲（${tag}）`);
    const lh = pairKey(LIU_HE, a.zhi, b.zhi); if (lh) zhi.push(`${a.zhi}${b.zhi}六合${lh}（${tag}）`);
    if (pairHas(LIU_CHONG, a.zhi, b.zhi)) zhi.push(`${a.zhi}${b.zhi}六冲（${tag}）`);
    if (pairHas(HAI, a.zhi, b.zhi)) zhi.push(`${a.zhi}${b.zhi}相害（${tag}）`);
    if (pairHas(PO, a.zhi, b.zhi)) zhi.push(`${a.zhi}${b.zhi}相破（${tag}）`);
    if ((a.zhi === '子' && b.zhi === '卯') || (a.zhi === '卯' && b.zhi === '子')) zhi.push(`子卯相刑（${tag}）`);
    if (a.zhi === b.zhi && '辰午酉亥'.includes(a.zhi)) zhi.push(`${a.zhi}${a.zhi}自刑（${tag}）`);
    for (const g of Object.keys(SAN_HE)) {
      if (a.zhi !== b.zhi && g.includes(a.zhi) && g.includes(b.zhi) && (a.zhi === g[1] || b.zhi === g[1])) zhi.push(`${a.zhi}${b.zhi}半合${SAN_HE[g]}（${tag}）`);
    }
    for (const [x, y, z, n] of XING3) if ([x, y, z].includes(a.zhi) && [x, y, z].includes(b.zhi) && a.zhi !== b.zhi) zhi.push(`${a.zhi}${b.zhi}相刑·${n}（${tag}）`);
  }
  const zs = ps.map((p) => p.zhi);
  for (const [g, w] of Object.entries(SAN_HE)) if ([...g].every((z) => zs.includes(z))) zhi.unshift(`${g}三合${w}局`);
  for (const [g, w] of Object.entries(SAN_HUI)) if ([...g].every((z) => zs.includes(z))) zhi.unshift(`${g}三会${w}方`);
  return { gan: [...new Set(gan)], zhi: [...new Set(zhi)] };
}

function wangXiang(monthZhi) {
  const m = ZHI_WX[monthZhi];
  return { [m]: '旺', [SHENG[m]]: '相', [SHENG_ME[m]]: '休', [KE_ME[m]]: '囚', [KE[m]]: '死' };
}

function geJu(pillars, shiShenOf) {
  const dm = pillars[2].gan, hide = pillars[1].hideGan;
  const tou = [pillars[0].gan, pillars[1].gan, pillars[3]?.gan].filter(Boolean);
  const ssBen = shiShenOf(dm, hide[0]);
  const name = (ss) => ({ 比肩: '建禄格', 劫财: GAN.indexOf(dm) % 2 === 0 ? '阳刃格' : '月刃格' }[ss] || ss.replace('七杀', '七杀') + '格');
  if (ssBen === '比肩' || ssBen === '劫财') {
    const other = hide.slice(1).find((g) => tou.includes(g));
    return other ? { name: shiShenOf(dm, other) + '格', note: `月令${pillars[1].zhi}为${name(ssBen)}，透${other}取格` } : { name: name(ssBen), note: `月令${pillars[1].zhi}本气${hide[0]}为${ssBen}` };
  }
  const t = hide.find((g) => tou.includes(g));
  if (t) return { name: shiShenOf(dm, t) + '格', note: `月令${pillars[1].zhi}藏${t}透干` };
  return { name: ssBen + '格', note: `月令${pillars[1].zhi}本气${hide[0]}（未透）` };
}

/** 人元司令分野（节气后第几天由月支哪一藏干当令） */
const REN_YUAN: Record<string, [string, number][]> = {
  寅: [['戊', 7], ['丙', 7], ['甲', 16]],
  卯: [['甲', 10], ['乙', 20]],
  辰: [['乙', 9], ['癸', 3], ['戊', 18]],
  巳: [['戊', 5], ['庚', 9], ['丙', 16]],
  午: [['丙', 10], ['己', 9], ['丁', 11]],
  未: [['丁', 9], ['乙', 3], ['己', 18]],
  申: [['己', 7], ['壬', 3], ['庚', 20]],
  酉: [['庚', 10], ['辛', 20]],
  戌: [['辛', 9], ['丁', 3], ['戊', 18]],
  亥: [['戊', 7], ['甲', 5], ['壬', 18]],
  子: [['壬', 10], ['癸', 20]],
  丑: [['癸', 9], ['辛', 3], ['己', 18]],
};
function renYuanSiLing(monthZhi: string, daysIntoJie: number) {
  const segs = REN_YUAN[monthZhi];
  if (!segs) return '';
  let d = Math.max(1, Math.floor(daysIntoJie) + 1); // 节气当日为第 1 天
  for (const [g, n] of segs) { if (d <= n) return g; d -= n; }
  return segs[segs.length - 1][0];
}

const SS = ['比肩', '劫财', '食神', '伤官', '偏财', '正财', '七杀', '正官', '偏印', '正印'];
function ssOf(dm, g) {
  const a = GAN_WX[dm], b = GAN_WX[g], same = (GAN.indexOf(dm) % 2) === (GAN.indexOf(g) % 2);
  let i;
  if (a === b) i = 0; else if (SHENG[a] === b) i = 2; else if (KE[a] === b) i = 4; else if (KE_ME[a] === b) i = 6; else i = 8;
  return SS[i + (same ? 0 : 1)];
}

/** 任意干支 → 一列专业排盘（流年/大运与四柱共用） */
function columnOf(dayGan: string, ganZhi: string, ctx: {
  label: string; yearGan: string; yearZhi: string; monthZhi: string; dayKong: string;
  zhuXing?: string; unknown?: boolean;
}) {
  if (!ganZhi || ganZhi.length < 2 || ctx.unknown) {
    return {
      label: ctx.label, gan: '', zhi: '', ganWx: '' as any, zhiWx: '' as any,
      zhuXing: ctx.zhuXing || '—', hide: [], xingYun: '—', ziZuo: '—',
      kongWang: '—', xunShou: '—', naYin: '—', shenSha: [], unknown: true,
    };
  }
  const gan = ganZhi[0], zhi = ganZhi[1];
  const hideGan: string[] = (LunarUtil.ZHI_HIDE_GAN[zhi] || []).slice();
  return {
    label: ctx.label,
    gan, zhi, ganWx: GAN_WX[gan], zhiWx: ZHI_WX[zhi],
    zhuXing: ctx.zhuXing || ssOf(dayGan, gan),
    hide: hideGan.map((g) => ({ gan: g, wx: GAN_WX[g], ss: ssOf(dayGan, g) })),
    xingYun: changSheng(dayGan, zhi),
    ziZuo: changSheng(gan, zhi),
    kongWang: LunarUtil.getXunKong(ganZhi),
    xunShou: LunarUtil.getXun(ganZhi),
    naYin: LunarUtil.NAYIN[ganZhi] || '',
    shenSha: shenShaFor(zhi, gan, ctx.yearZhi, ctx.yearGan, dayGan, ctx.monthZhi, ctx.dayKong, { isDay: ctx.label === '日柱', isYear: ctx.label === '年柱' }),
  };
}

function jiaoYunText(yun: any) {
  const sy = yun.getStartSolar();
  const lunar = sy.getLunar();
  const jie = lunar.getPrevJie();
  const gan = lunar.getYearGan();
  const other = GAN[(GAN.indexOf(gan) + 5) % 10];
  const js = jie.getSolar();
  const d0 = Date.UTC(js.getYear(), js.getMonth() - 1, js.getDay());
  const d1 = Date.UTC(sy.getYear(), sy.getMonth() - 1, sy.getDay());
  const days = Math.round((d1 - d0) / 86400000) + 1; // 与主流排盘软件一致：节气当日算起
  return { text: `逢${gan}、${other}年 ${jie.getName()}后${days}天 交大运`, jie: jie.getName(), days, ganPair: [gan, other] as [string, string] };
}

function buildPro({ ec, yun, pillars, dayGan, power, xi, ji, strength, ratio, timeUnknown, shiShenOf, solarYear, solar, lunar, gender }: any): any {
  const kongs = [ec.getYearXunKong(), ec.getMonthXunKong(), ec.getDayXunKong(), ec.getTimeXunKong()];
  const xuns = [ec.getYearXun(), ec.getMonthXun(), ec.getDayXun(), ec.getTimeXun()];
  const dayKong = kongs[2];
  const yearGan = pillars[0].gan, yearZhi = pillars[0].zhi, monthZhi = pillars[1].zhi;
  const dayLabel = gender === '女' ? '元女' : '元男';
  const detail = pillars.map((p, i) => ({
    label: p.label,
    gan: p.unknown ? '' : p.gan, zhi: p.unknown ? '' : p.zhi,
    ganWx: p.ganWx, zhiWx: p.zhiWx,
    zhuXing: i === 2 ? dayLabel : (p.unknown ? '—' : p.shiShenGan),
    hide: p.unknown ? [] : p.hideGan.map((g, k) => ({ gan: g, wx: GAN_WX[g], ss: p.shiShenZhi[k] })),
    xingYun: p.unknown ? '—' : changSheng(dayGan, p.zhi),
    ziZuo: p.unknown ? '—' : changSheng(p.gan, p.zhi),
    kongWang: p.unknown ? '—' : kongs[i],
    xunShou: p.unknown ? '—' : xuns[i],
    naYin: p.unknown ? '—' : p.naYin,
    shenSha: timeUnknown && i === 3 ? [] : shenSha(pillars, i, dayKong, timeUnknown),
    unknown: !!p.unknown,
  }));
  const wx = wangXiang(monthZhi);
  const total = Object.values(power).reduce((a: number, b: any) => a + b, 0) as number || 1;
  const wuXing = Object.keys(power).map((k) => ({ wx: k, power: power[k], pct: Math.round((power[k] / total) * 100), state: wx[k] }));
  const all = ['木', '火', '土', '金', '水'];
  const wushen: Record<string, any> = { 用神: xi[0], 喜神: xi[1] || null, 忌神: ji[0] || null, 仇神: ji[1] || null };
  wushen.闲神 = all.filter((w) => !Object.values(wushen).includes(w)).join('') || null;

  // 人元司令：出生距上一节的天数
  const prevJie = lunar.getPrevJie();
  const jieS = prevJie.getSolar();
  const daysInto = (Date.UTC(solar.getYear(), solar.getMonth() - 1, solar.getDay())
    - Date.UTC(jieS.getYear(), jieS.getMonth() - 1, jieS.getDay())) / 86400000;
  const renYuan = renYuanSiLing(monthZhi, daysInto);

  const jy = jiaoYunText(yun);
  const qiYun = `出生后${yun.getStartYear()}年${yun.getStartMonth()}个月${yun.getStartDay()}天${yun.getStartHour()}小时`;

  const ctxBase = { yearGan, yearZhi, monthZhi, dayKong };

  return {
    pillars: detail,
    relations: relations(pillars, timeUnknown),
    wuXing, monthLing: `${monthZhi}月${ZHI_WX[monthZhi]}旺`,
    strength: { label: strength === '偏旺' ? '身旺' : strength === '偏弱' ? '身弱' : '中和', score: Math.round(ratio * 100) },
    geJu: geJu(pillars, shiShenOf),
    wushen,
    palaces: [
      { k: '胎元', v: ec.getTaiYuan(), ny: ec.getTaiYuanNaYin() },
      { k: '命宫', v: ec.getMingGong(), ny: ec.getMingGongNaYin() },
      { k: '身宫', v: ec.getShenGong(), ny: ec.getShenGongNaYin() },
      { k: '胎息', v: ec.getTaiXi(), ny: ec.getTaiXiNaYin() },
    ],
    qiYun, jiaoYun: jy.text, jiaoYunMeta: jy,
    renYuan, dayKong, dayLabel,
    /** 供前端点选大运/流年时拼列（纯数据，无需再调历法库） */
    mkCol: null as any, // filled in bazi after daYun/liuNian known — actually we attach cols there
  };
}

/** 给大运/流年附上完整列数据，便于前端切换 */
function attachCols(pro: any, dayGan: string, yearGan: string, yearZhi: string, monthZhi: string, items: { ganZhi: string; label: string }[]) {
  const dayKong = pro.dayKong;
  return items.map((it) => columnOf(dayGan, it.ganZhi, { label: it.label, yearGan, yearZhi, monthZhi, dayKong }));
}

function proText(pro) {
  if (!pro) return '';
  const L = [];
  L.push('【专业排盘】');
  L.push(`格局：${pro.geJu.name}（${pro.geJu.note}）；日主${pro.strength.label}（自党力量约${pro.strength.score}%）`);
  L.push(`五神：用神${pro.wushen.用神} 喜神${pro.wushen.喜神 || '-'} 忌神${pro.wushen.忌神 || '-'} 仇神${pro.wushen.仇神 || '-'} 闲神${pro.wushen.闲神 || '-'}`);
  L.push(`月令：${pro.monthLing}；人元司令：${pro.renYuan || '-'}；五行旺衰：${pro.wuXing.map((w) => `${w.wx}${w.state}${w.pct}%`).join(' ')}`);
  pro.pillars.forEach((p) => L.push(`${p.label}：主星${p.zhuXing} 星运${p.xingYun} 自坐${p.ziZuo} 空亡${p.kongWang} 旬首${p.xunShou || ''} 神煞${(p.shenSha || []).join('、') || '无'}`));
  L.push(`天干关系：${pro.relations.gan.join('；') || '无'}`);
  L.push(`地支关系：${pro.relations.zhi.join('；') || '无'}`);
  L.push(`宫位：${pro.palaces.filter((x) => x.k !== '胎息').map((x) => `${x.k}${x.v}(${x.ny})`).join(' ')}`);
  L.push(`起运：${pro.qiYun}；${pro.jiaoYun}`);
  return L.join('\n');
}

export { buildPro, proText, changSheng, columnOf, attachCols, renYuanSiLing, GAN_HE, GAN_CHONG, LIU_HE, SAN_HE, LIU_CHONG, HAI, PO, XING3, pairHas, pairKey };
