// 无大模型时的规则版出生信息解析（也作为兜底）
const CN = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function cnNum(s) {
  if (/^\d+$/.test(s)) return +s;
  s = s.replace(/^初/, '').replace(/^廿/, '二十').replace(/^卅/, '三十').replace('正', '一').replace('冬', '十一').replace('腊', '十二');
  if (s.length === 4 && [...s].every((c) => c in CN)) return +[...s].map((c) => CN[c]).join('');
  let n = 0;
  if (s.includes('十')) { const [a, b] = s.split('十'); n = (a ? CN[a] : 1) * 10 + (b ? CN[b] : 0); } else n = CN[s] ?? NaN;
  return n;
}
const SC = '子丑寅卯辰巳午未申酉戌亥';
function parseBirth(text) {
  const t = String(text);
  const r = { gender: null, calendar: null, year: null, month: null, day: null, leap: false, time: null, city: null, topics: [], question: null };
  if (/女|姑娘|宝妈/.test(t)) r.gender = '女'; else if (/男/.test(t)) r.gender = '男';
  if (/农历|阴历|旧历/.test(t)) r.calendar = 'lunar'; else if (/公历|阳历|新历/.test(t)) r.calendar = 'solar';
  if (!r.calendar && /正月|冬月|腊月|初[一二三四五六七八九十]|廿/.test(t)) r.calendar = 'lunar';
  if (/闰/.test(t)) r.leap = true;
  let m = t.match(/(\d{4}|\d{2}|[零〇一二三四五六七八九]{4})\s*年/);
  if (m) { let y = cnNum(m[1]); if (y < 100) y += y > 30 ? 1900 : 2000; r.year = y; }
  m = t.match(/年\s*(?:农历|阴历|公历|阳历)?\s*闰?\s*(\d{1,2}|[正一二三四五六七八九十冬腊]{1,3})\s*月/) || t.match(/(\d{1,2})\s*月/);
  if (m) r.month = cnNum(m[1]);
  m = t.match(/月\s*(\d{1,2}|初[一二三四五六七八九十]|[十廿卅][一二三四五六七八九]?|[一二三四五六七八九十]{1,3})\s*[日号]?/);
  if (m) r.day = cnNum(m[1]);
  const d = t.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (d) { r.year = +d[1]; r.month = +d[2]; r.day = +d[3]; }
  m = t.match(/([子丑寅卯辰巳午未申酉戌亥])时/);
  if (m) r.time = { type: 'shichen', shichen: m[1] };
  else if (/不知道|不清楚|不记得/.test(t)) r.time = { type: 'unknown' };
  else {
    m = t.match(/(凌晨|早上|上午|中午|下午|晚上|傍晚)?\s*(\d{1,2}|[一二三四五六七八九十]{1,3})\s*[点:：时]\s*(半|\d{1,2})?/);
    if (m) { let h = cnNum(m[2]); if (/下午|晚上|傍晚/.test(m[1] || '') && h < 12) h += 12; if (m[1] === '中午' && h < 6) h += 12; r.time = { type: 'exact', hour: h % 24, minute: m[3] === '半' ? 30 : +(m[3] || 0) }; }
  }
  const cities = Object.keys(require('./cities')); r.city = cities.find((c) => t.includes(c)) || null;
  r.topics = ['感情', '事业', '财运', '健康', '学业'].filter((k) => t.includes(k) || (k === '感情' && /结婚|婚姻|桃花|对象|正缘/.test(t)) || (k === '事业' && /工作|跳槽/.test(t)));
  return r;
}
module.exports = { parseBirth, SC };
