// 排盘正确性自测：node scripts/test-charts.js
const { computeChart } = require('../packages/core/dist');
const cases = [
  { desc: '2000-01-01 12:00 男（题目给定）', in: { gender: '男', year: 2000, month: 1, day: 1, hour: 12 }, expect: '己卯 丙子 戊午 戊午' },
  { desc: '1893-12-26 辰时 男（毛泽东，经典命例）', in: { gender: '男', year: 1893, month: 12, day: 26, shichen: '辰' }, expect: '癸巳 甲子 丁酉 甲辰' },
  { desc: '2024-02-04 12:00 女（立春16:27之前，仍属癸卯年）', in: { gender: '女', year: 2024, month: 2, day: 4, hour: 12 }, expect: '癸卯 乙丑 戊戌 戊午' },
  { desc: '农历1995年八月十五 辰时 女（=公历1995-09-09）', in: { gender: '女', calendar: 'lunar', year: 1995, month: 8, day: 15, shichen: '辰' }, expect: '乙亥 乙酉 癸卯 丙辰' },
];
let fail = 0;
for (const t of cases) {
  const c = computeChart({ ...t.in, nowYear: 2026 });
  const got = c.pillars.map((p) => p.ganZhi).join(' ');
  const ok = got === t.expect; if (!ok) fail++;
  console.log(`${ok ? '✅' : '❌'} ${t.desc}\n   四柱：${got}${ok ? '' : '  期望 ' + t.expect}\n   公历 ${c.solar}｜农历 ${c.lunar}｜生肖 ${c.shengXiao}｜日主 ${c.dayMaster.gan}${c.dayMaster.wuXing} ${c.dayMaster.strength}｜五行 ${JSON.stringify(c.wuXingCount)}｜喜用 ${c.xiYong}\n   纳音 ${c.pillars.map((p) => p.naYin).join(' ')}｜十神(干) ${c.pillars.map((p) => p.shiShenGan).join(' ')}\n   起运 ${c.yun.startYear}年${c.yun.startMonth}月${c.yun.startDay}天 ${c.yun.forward ? '顺' : '逆'}排｜大运 ${c.daYun.slice(0, 5).map((d) => `${d.ganZhi}(${d.startAge}岁/${d.startYear})`).join(' ')}`);
}
const ts = computeChart({ gender: '男', year: 2000, month: 1, day: 1, hour: 12, city: '成都', nowYear: 2026 });
console.log(`ℹ️ 真太阳时示例：成都 2000-01-01 12:00 → ${ts.trueSolar.time}（${ts.trueSolar.offsetMinutes}分钟），四柱 ${ts.pillars.map((p) => p.ganZhi).join(' ')}`);
const ln = computeChart({ gender: '男', year: 2000, month: 1, day: 1, hour: 12, nowYear: 2026 }).liuNian;
console.log('ℹ️ 流年：' + ln.map((y) => y.year + y.ganZhi).join(' '));
process.exit(fail ? 1 : 0);
