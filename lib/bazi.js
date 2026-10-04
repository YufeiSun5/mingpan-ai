// 确定性排盘：基于 6tail 的 lunar-javascript
const { Solar, Lunar, LunarYear } = require('lunar-javascript');
const CITIES = require('./cities');

const GAN_WX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const ZHI_WX = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
const GAN_YY = { 甲: '阳', 乙: '阴', 丙: '阳', 丁: '阴', 戊: '阳', 己: '阴', 庚: '阳', 辛: '阴', 壬: '阳', 癸: '阴' };
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // 我生
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };    // 我克
const inv = (m) => Object.fromEntries(Object.entries(m).map(([a, b]) => [b, a]));
const SHENG_ME = inv(SHENG), KE_ME = inv(KE);
// 月令旺相休囚死（对五行的季节系数）
const SEASON = {
  寅: { 木: 1.5, 火: 1.2, 水: 0.9, 金: 0.6, 土: 0.6 }, 卯: { 木: 1.5, 火: 1.2, 水: 0.9, 金: 0.6, 土: 0.6 },
  巳: { 火: 1.5, 土: 1.2, 木: 0.9, 水: 0.6, 金: 0.6 }, 午: { 火: 1.5, 土: 1.2, 木: 0.9, 水: 0.6, 金: 0.6 },
  申: { 金: 1.5, 水: 1.2, 土: 0.9, 火: 0.6, 木: 0.6 }, 酉: { 金: 1.5, 水: 1.2, 土: 0.9, 火: 0.6, 木: 0.6 },
  亥: { 水: 1.5, 木: 1.2, 金: 0.9, 土: 0.6, 火: 0.6 }, 子: { 水: 1.5, 木: 1.2, 金: 0.9, 土: 0.6, 火: 0.6 },
  辰: { 土: 1.5, 金: 1.2, 火: 0.9, 木: 0.6, 水: 0.6 }, 戌: { 土: 1.5, 金: 1.2, 火: 0.9, 木: 0.6, 水: 0.6 },
  丑: { 土: 1.5, 金: 1.2, 火: 0.9, 木: 0.6, 水: 0.6 }, 未: { 土: 1.5, 金: 1.2, 火: 0.9, 木: 0.6, 水: 0.6 },
};
const SHICHEN = { 子: 0, 丑: 2, 寅: 4, 卯: 6, 辰: 8, 巳: 10, 午: 12, 未: 14, 申: 16, 酉: 18, 戌: 20, 亥: 22 };

const LUCK = {
  木: { colors: ['绿色', '青色'], direction: '东方', numbers: [3, 8], items: '绿植、木质饰品' },
  火: { colors: ['红色', '紫色'], direction: '南方', numbers: [2, 7], items: '红色饰品、多晒太阳' },
  土: { colors: ['黄色', '咖色'], direction: '中央/本地', numbers: [5, 0], items: '陶瓷、玉石、黄水晶' },
  金: { colors: ['白色', '金色'], direction: '西方', numbers: [4, 9], items: '金属饰品、白水晶' },
  水: { colors: ['黑色', '蓝色'], direction: '北方', numbers: [1, 6], items: '鱼缸、流水摆件、多喝水' },
};

// 均时差（分钟），用于真太阳时
function equationOfTime(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const n = Math.floor((date - start) / 86400000);
  const b = (2 * Math.PI * (n - 81)) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

function resolveCity(name) {
  if (!name) return null;
  const n = String(name).replace(/[市省县区\s]/g, '');
  for (const [k, v] of Object.entries(CITIES)) if (n.includes(k) || k.includes(n)) return { name: k, lng: v };
  return null;
}

/**
 * input: { gender:'男'|'女', calendar:'solar'|'lunar', year, month, day, leap?, hour?, minute?, shichen?, timeUnknown?, city?, name? }
 */
function computeChart(input) {
  const g = input.gender === '女' ? 0 : 1;
  const year = +input.year, month = +input.month, day = +input.day;
  let hour = 12, minute = 0;
  const timeUnknown = !!input.timeUnknown || (input.hour === undefined && !input.shichen);
  if (!timeUnknown) {
    if (input.shichen && SHICHEN[input.shichen] !== undefined) { hour = SHICHEN[input.shichen]; minute = 0; }
    else { hour = +input.hour || 0; minute = +input.minute || 0; }
  }
  // 公历时间
  let solar;
  if (input.calendar === 'lunar') {
    const lm = input.leap ? -month : month;
    solar = Lunar.fromYmdHms(year, lm, day, hour, minute, 0).getSolar();
  } else {
    solar = Solar.fromYmdHms(year, month, day, hour, minute, 0);
  }
  const clockTime = solar.toYmdHms();
  // 真太阳时（仅当给出精确时间且城市可识别时；以北京时间东经120°为基准）
  let trueSolar = null;
  const city = resolveCity(input.city);
  if (!timeUnknown && city && !input.shichen) {
    const d = new Date(Date.UTC(solar.getYear(), solar.getMonth() - 1, solar.getDay(), solar.getHour(), solar.getMinute()));
    const offset = (city.lng - 120) * 4 + equationOfTime(d);
    const t = new Date(d.getTime() + offset * 60000);
    solar = Solar.fromYmdHms(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes(), 0);
    trueSolar = { city: city.name, lng: city.lng, offsetMinutes: Math.round(offset), time: solar.toYmdHms() };
  }

  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();
  ec.setSect(2);
  const dayGan = ec.getDayGan();
  const dmWx = GAN_WX[dayGan];

  const P = (label, gz, ssGan, ssZhi, hide, nayin, dishi) => ({
    label, ganZhi: gz, gan: gz[0], zhi: gz[1], ganWx: GAN_WX[gz[0]], zhiWx: ZHI_WX[gz[1]],
    shiShenGan: ssGan, hideGan: hide, shiShenZhi: ssZhi, naYin: nayin, diShi: dishi,
  });
  const pillars = [
    P('年柱', ec.getYear(), ec.getYearShiShenGan(), ec.getYearShiShenZhi(), ec.getYearHideGan(), ec.getYearNaYin(), ec.getYearDiShi()),
    P('月柱', ec.getMonth(), ec.getMonthShiShenGan(), ec.getMonthShiShenZhi(), ec.getMonthHideGan(), ec.getMonthNaYin(), ec.getMonthDiShi()),
    P('日柱', ec.getDay(), '日主', ec.getDayShiShenZhi(), ec.getDayHideGan(), ec.getDayNaYin(), ec.getDayDiShi()),
    P('时柱', ec.getTime(), ec.getTimeShiShenGan(), ec.getTimeShiShenZhi(), ec.getTimeHideGan(), ec.getTimeNaYin(), ec.getTimeDiShi()),
  ];
  const used = timeUnknown ? pillars.slice(0, 3) : pillars;
  if (timeUnknown) pillars[3].unknown = true;

  // 五行个数（天干+地支本气）
  const count = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  used.forEach((p) => { count[p.ganWx]++; count[p.zhiWx]++; });
  // 加权力量（天干1，地支藏干 本气0.6/中气0.3/余气0.1，月令系数）
  const season = SEASON[pillars[1].zhi];
  const power = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  used.forEach((p, i) => {
    power[p.ganWx] += 1 * (i === 2 ? 1 : 1);
    const w = [0.6, 0.3, 0.1];
    p.hideGan.forEach((hg, j) => { power[GAN_WX[hg]] += (w[j] || 0.1) * (i === 1 ? 2 : 1); });
  });
  Object.keys(power).forEach((k) => (power[k] = +(power[k] * season[k]).toFixed(2)));
  const total = Object.values(power).reduce((a, b) => a + b, 0);
  const self = power[dmWx] + power[SHENG_ME[dmWx]];
  const ratio = self / total;
  const strength = ratio >= 0.55 ? '偏旺' : ratio >= 0.45 ? '中和' : '偏弱';
  // 喜用神（简化扶抑法）
  let xi;
  if (strength === '偏弱') xi = [SHENG_ME[dmWx], dmWx];
  else if (strength === '偏旺') xi = [SHENG[dmWx], KE[dmWx], KE_ME[dmWx]].sort((a, b) => power[a] - power[b]).slice(0, 2);
  else xi = Object.keys(power).sort((a, b) => power[a] - power[b]).slice(0, 2);
  let ji;
  if (strength === '偏旺') ji = [SHENG_ME[dmWx], dmWx];
  else ji = Object.keys(power).filter((k) => !xi.includes(k)).sort((a, b) => power[b] - power[a]).slice(0, 2);
  const missing = Object.keys(count).filter((k) => count[k] === 0);

  // 大运
  const yun = ec.getYun(g, 2);
  const daYun = yun.getDaYun(10).slice(1).map((d) => ({
    ganZhi: d.getGanZhi(), startYear: d.getStartYear(), endYear: d.getEndYear(), startAge: d.getStartAge(), endAge: d.getEndAge(),
    shiShen: shiShenOf(dayGan, d.getGanZhi()[0]),
  }));
  const yearGanYY = GAN_YY[pillars[0].gan];
  const forward = (yearGanYY === '阳' && g === 1) || (yearGanYY === '阴' && g === 0);

  // 流年
  const nowYear = +(input.nowYear || new Date().getFullYear());
  const liuNian = [];
  for (let y = nowYear - 10; y <= nowYear + 5; y++) {
    if (y < solar.getYear()) continue;
    const gz = LunarYear.fromYear(y).getGanZhi();
    const dy = daYun.find((d) => y >= d.startYear && y <= d.endYear) || null;
    liuNian.push({
      year: y, ganZhi: gz, age: y - solar.getYear() + 1, past: y < nowYear, current: y === nowYear,
      shiShen: shiShenOf(dayGan, gz[0]), ganWx: GAN_WX[gz[0]], zhiWx: ZHI_WX[gz[1]],
      daYun: dy ? dy.ganZhi : '(未起运)',
      relations: relationsWith(gz[1], pillars, timeUnknown),
      favorable: [GAN_WX[gz[0]], ZHI_WX[gz[1]]].filter((w) => xi.includes(w)).length - [GAN_WX[gz[0]], ZHI_WX[gz[1]]].filter((w) => ji.includes(w)).length,
    });
  }

  return {
    input: { name: input.name || '', gender: g ? '男' : '女', calendar: input.calendar || 'solar', clockTime, timeUnknown, city: input.city || '' },
    trueSolar,
    solar: solar.toYmdHms(),
    lunar: `${lunar.getYearInGanZhi()}年（${lunar.getYearInChinese()}年）${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}${timeUnknown ? '' : ' ' + lunar.getTimeZhi() + '时'}`,
    shengXiao: lunar.getYearShengXiao(),
    xingZuo: solar.getXingZuo(),
    pillars,
    dayMaster: { gan: dayGan, wuXing: dmWx, yinYang: GAN_YY[dayGan], strength, ratio: +ratio.toFixed(2) },
    wuXingCount: count, wuXingPower: power, missing,
    xiYong: xi, jiShen: ji,
    luck: xi.map((w) => ({ wuXing: w, ...LUCK[w] })),
    yun: { startYear: yun.getStartYear(), startMonth: yun.getStartMonth(), startDay: yun.getStartDay(), startDate: yun.getStartSolar().toYmd(), forward },
    daYun, liuNian, nowYear,
    taiYuan: ec.getTaiYuan(), mingGong: ec.getMingGong(),
  };
}

const SS = ['比肩', '劫财', '食神', '伤官', '偏财', '正财', '七杀', '正官', '偏印', '正印'];
function shiShenOf(dm, g) {
  const a = GAN_WX[dm], b = GAN_WX[g], same = GAN_YY[dm] === GAN_YY[g];
  let i;
  if (a === b) i = 0; else if (SHENG[a] === b) i = 2; else if (KE[a] === b) i = 4; else if (KE_ME[a] === b) i = 6; else i = 8;
  return SS[i + (same ? 0 : 1)];
}

const CHONG = { 子: '午', 丑: '未', 寅: '申', 卯: '酉', 辰: '戌', 巳: '亥' };
Object.entries({ ...CHONG }).forEach(([a, b]) => (CHONG[b] = a));
const HE6 = { 子: '丑', 寅: '亥', 卯: '戌', 辰: '酉', 巳: '申', 午: '未' };
Object.entries({ ...HE6 }).forEach(([a, b]) => (HE6[b] = a));
const XING = { 寅: '巳', 巳: '申', 申: '寅', 丑: '戌', 戌: '未', 未: '丑', 子: '卯', 卯: '子' };
function relationsWith(zhi, pillars, timeUnknown) {
  const out = [];
  pillars.forEach((p, i) => {
    if (timeUnknown && i === 3) return;
    if (CHONG[zhi] === p.zhi) out.push(`冲${p.label}`);
    if (HE6[zhi] === p.zhi) out.push(`合${p.label}`);
    if (XING[zhi] === p.zhi) out.push(`刑${p.label}`);
    if (zhi === p.zhi && i === 0) out.push('本命年(值太岁)');
  });
  return out;
}

module.exports = { computeChart, shiShenOf, LUCK };
