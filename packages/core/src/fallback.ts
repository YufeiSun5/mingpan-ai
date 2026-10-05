// 无 API Key 时的规则模板生成器：根据排盘结果拼出一份完整解读。
const PERSONA = {
  木: { img: '一棵向上生长的树', trait: '仁厚、正直、有上进心，心里有自己的理想，也愿意帮人一把', weak: '有时候太要面子、容易钻牛角尖' },
  火: { img: '一团温暖的火光', trait: '热情、开朗、有感染力，点子多，走到哪里都能带动气氛', weak: '性子急，情绪来得快去得也快' },
  土: { img: '一片厚实的大地', trait: '稳重、守信、包容，靠得住，是身边人眼里的"定心丸"', weak: '想得多、做决定前会反复掂量，偶尔有点固执' },
  金: { img: '一块精心打磨的金玉', trait: '果断、讲原则、有执行力，审美在线，对自己要求很高', weak: '嘴上不饶人、心里却很软，容易把压力自己扛' },
  水: { img: '一汪灵动的清泉', trait: '聪明、灵活、悟性高，善于察言观色，适应能力特别强', weak: '心思细腻容易多虑，有时想法多而落地少' },
};
const YIN_YANG = { 阳: '为人大气外放，做事敢冲敢闯', 阴: '外柔内刚，心思细腻，做事讲究分寸' };
const STRENGTH = {
  偏旺: '日主力量偏强，说明你独立、有主见、抗压能力好，适合自己拿主意、带团队；需要注意的是别太硬扛，懂得借力会更顺。',
  中和: '日主力量比较中和，命局平衡，进可攻退可守，人生起伏不会太大，越往后越稳。',
  偏弱: '日主力量偏弱一些，说明你心思细腻、善解人意，很会照顾别人的感受；人生中贵人运是你的关键，跟对人、选对平台，会事半功倍。',
};
// 十神 → 过往可能对应的生活面（弹性措辞）
const SS_PAST = {
  比肩: ['人际关系或合作上有过一些变化', '和朋友、同事之间有过竞争或意见分歧', '想自己做主、独立的念头特别强'],
  劫财: ['钱财上进出比较大，或者为别人花过一笔钱', '人际上有过消耗，付出多回报少', '和身边人有过一些摩擦或竞争'],
  食神: ['心态放松了不少，或者开始培养新的爱好', '有过学习新技能、展示才华的机会', '生活节奏上有过调整'],
  伤官: ['工作上想变动、想跳出来，或者和领导有过不愉快', '说话做事比较冲，可能因此得罪过人', '感情上有过波折或心里不太踏实'],
  偏财: ['钱财上有过意外的进账或开销', '工作机会或人脉上有过变化', '感情上可能有过心动或波动'],
  正财: ['在收入或家庭开支上有过比较大的规划', '工作更加务实，开始认真为将来存钱', '感情或家庭上有过一件需要认真面对的事'],
  七杀: ['压力特别大，工作或学业上有过一段很辛苦的日子', '环境上有过比较大的变动', '感情或身体上需要扛一扛，但也让你迅速成长'],
  正官: ['工作、学业上有过晋升、考试或换平台的机会', '规矩和责任变多，开始被人认可', '感情或婚姻上有过一个重要的节点'],
  偏印: ['心里想得比较多，有过迷茫或想换方向的时候', '学习、考证或接触玄学、新领域', '住处或环境上可能有过变动'],
  正印: ['得到长辈或贵人的帮助', '学业、考证上有收获，或者家里有过喜事', '搬家、买房、换环境的可能性比较大'],
};
const REL_PAST = { 半: '有合作、桃花或贵人相助的缘分', 冲: '变动明显，或搬迁、或换工作、或感情分合', 刑: '心里有些纠结，人际或身体上需要多留心', 合: '有合作、恋爱或贵人牵线的缘分', 本命年: '本命年，各方面起伏会比平时大一些' };
const SS_FUTURE = {
  比肩: '朋友和同伴运旺，适合合作共赢，团队里你会是核心', 劫财: '人气旺、社交多，稳住钱包就是赚到，合作要白纸黑字',
  食神: '福气年，心情好、口福好，才华容易被看见，适合发展副业', 伤官: '灵感爆发，适合创新、做内容、做自媒体，表达力就是财富',
  偏财: '偏财运亮眼，有意外之喜，单身的朋友桃花也不错', 正财: '正财稳步上升，努力就有回报，适合存钱、置业',
  七杀: '有挑战也有大机遇，敢闯就能出头，事业上有突破', 正官: '事业运上扬，有升职、考公、被领导赏识的机会，感情也容易有好消息',
  偏印: '适合学习进修、考证，思路打开后会有新方向', 正印: '贵人运旺，长辈和领导照顾你，适合考试、买房、安家',
};
const TOPIC = {
  感情: (c) => {
    const male = c.input.gender === '男';
    const star = male ? ['正财', '偏财'] : ['正官', '七杀'];
    const yrs = c.liuNian.filter((y) => !y.past && star.includes(y.shiShen)).map((y) => y.year);
    const day = c.pillars[2];
    return `感情方面，看你的日支（夫妻宫）${day.zhi}，${{ 木: '另一半多半性格温和、有上进心', 火: '另一半多半热情开朗', 土: '另一半多半踏实顾家', 金: '另一半多半有原则、有能力', 水: '另一半多半聪明体贴' }[day.zhiWx]}。你对感情很认真，一旦认定就愿意付出。${yrs.length ? `未来 ${yrs.join('、')} 年${male ? '财星' : '官星'}到位，是感情升温、脱单或者谈婚论嫁的好时机。` : '未来几年感情运平稳上升，多参加社交活动，缘分会自然出现。'}已有伴侣的话，多沟通、少较真，感情会越来越甜。`;
  },
  事业: (c) => {
    const ind = { 木: '教育、文化、设计、医疗', 火: '互联网、传媒、餐饮、能源', 土: '房产、管理、行政、农业', 金: '金融、法律、技术、机械', 水: '贸易、物流、咨询、旅游' };
    return `事业方面，你的喜用神是${c.xiYong.join('、')}，适合往 ${c.xiYong.map((w) => ind[w]).join('、')} 等方向发展。${c.dayMaster.strength === '偏弱' ? '你适合在有平台、有靠山的地方发光，跟对领导比单打独斗更重要。' : '你有独当一面的能力，到了合适的时机可以尝试管理岗或者自己做点事情。'}`;
  },
  财运: (c) => {
    const yrs = c.liuNian.filter((y) => !y.past && ['正财', '偏财', '食神'].includes(y.shiShen)).map((y) => y.year);
    return `财运方面，你${c.dayMaster.strength === '偏弱' ? '属于"细水长流"型，靠稳定收入和长期积累更容易聚财，投资宜保守' : '属于"身强能担财"的格局，有赚钱的魄力，正财偏财都能有'}。${yrs.length ? `${yrs.join('、')} 年财星当令，是增加收入的好窗口。` : '未来几年财运稳中有升，开源节流就能攒下一笔。'}`;
  },
  健康: (c) => {
    const organ = { 木: '肝胆、筋骨', 火: '心血管、眼睛', 土: '脾胃、消化', 金: '呼吸系统、皮肤', 水: '肾、泌尿与睡眠' };
    const w = c.jiShen[0], m = c.missing[0];
    return `健康方面，你命局中${w}偏旺${m ? `、${m}偏少` : ''}，平时可以多留意${organ[w]}${m ? `和${organ[m]}` : ''}的保养。规律作息、适度运动，就是最好的开运方法（具体身体情况请以医生意见为准）。`;
  },
  学业: (c) => {
    const yrs = c.liuNian.filter((y) => !y.past && ['正印', '偏印', '正官'].includes(y.shiShen)).map((y) => y.year);
    return `学业方面，你${c.dayMaster.wuXing === '水' || c.dayMaster.wuXing === '木' ? '悟性很好，理解力强' : '踏实肯学，越到后面越有后劲'}。${yrs.length ? `${yrs.join('、')} 年印星或官星到位，考试、考证、升学都有好运。` : '未来几年学习运平稳，坚持就是胜利。'}`;
  },
};

function hash(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

function generateFallback(c, q) {
  const dm = c.dayMaster, P = PERSONA[dm.wuXing], name = c.input.name || '';
  const seed = hash(c.solar + c.input.gender);
  const out = [];
  out.push('## 命局总论');
  out.push(`${name ? name + '，' : ''}我看了一下你的盘，嗯……挺有意思的。你是 **${dm.gan}${dm.wuXing}日主**，就像${P.img}。${YIN_YANG[dm.yinYang]}，性格里带着${P.trait}。`);
  out.push(STRENGTH[dm.strength]);
  const most = Object.entries(c.wuXingCount).sort((a: any, b: any) => b[1] - a[1])[0][0];
  out.push(`你的八字里${most}气最足${c.missing.length ? `，${c.missing.join('、')}比较少` : '，五行俱全，这是难得的福气'}；喜用神为 **${c.xiYong.join('、')}**。小提醒：你${P.weak}，学会放松一点，福气会来得更快。`);
  if (c.input.timeUnknown) out.push('（因为出生时辰不确定，以下以年、月、日三柱为主来看，晚年和子女方面的细节会略有出入。）');

  out.push('## 过往验证');
  const past = c.liuNian.filter((y) => y.past);
  const scored = past.map((y) => ({ y, s: y.relations.length * 2 + (c.daYun.some((d) => d.startYear === y.year) ? 2 : 0) + Math.abs(y.favorable) + ((seed + y.year) % 3) / 10 }));
  const picks = scored.sort((a, b) => b.s - a.s).slice(0, 4).map((x) => x.y).sort((a, b) => a.year - b.year);
  picks.forEach((y, i) => {
    const opts = SS_PAST[y.shiShen];
    const a = opts[(seed + i) % opts.length], b = opts[(seed + i + 1) % opts.length];
    const rel = y.relations.map((r) => (r.startsWith('本命年') ? REL_PAST.本命年 : REL_PAST[r[0]])).filter(Boolean)[0];
    const dyChange = c.daYun.find((d) => d.startYear === y.year);
    out.push(`- **${y.year}年（${y.ganZhi}）前后**：${a}，或者${b}${rel ? `；这一年流年${y.relations.join('、')}，${rel}` : ''}${dyChange ? `；同时你正好换入「${dyChange.ganZhi}」大运，心态和方向上会有明显转折` : ''}。`);
  });
  out.push('这些年份你可以对照一下……不一定每件都一模一样，但大方向你自己应该能感觉到。');

  out.push('## 所问之事');
  const topics = (q?.topics?.length ? q.topics : ['事业', '财运', '感情']).filter((t) => TOPIC[t]);
  topics.forEach((t) => out.push(`**${t}**：${TOPIC[t](c)}`));
  if (q?.text) out.push(`关于你提到的"${q.text.slice(0, 60)}"：从命局看，${dm.strength === '偏弱' ? '这件事不要一个人扛，多听听身边可信的人的建议，借力而行更顺' : '你自己心里其实已经有答案了，顺着本心、稳扎稳打去做就好'}，${c.xiYong[0]}旺的年份和月份去推进，成功率更高。`);

  out.push('## 未来运势');
  c.liuNian.filter((y) => !y.past).forEach((y) => {
    const tone = y.favorable > 0 ? '好运年：' : y.favorable < 0 ? '稳中求进：' : '平稳向上：';
    out.push(`- **${y.year}年 ${y.ganZhi}**　${tone}${SS_FUTURE[y.shiShen]}${y.favorable < 0 ? '；这一年做事稳一稳，多做准备就能化压力为动力' : ''}${y.relations.some((r) => r.startsWith('冲')) ? '；有变动的迹象，变动中藏着机会' : ''}。`);
  });
  const best = c.liuNian.filter((y) => !y.past).sort((a, b) => b.favorable - a.favorable)[0];
  if (best) out.push(`其中 **${best.year}年** 是你这几年里运势最亮的一年，想做的事情可以大胆安排在那时候，说实话，这一年我挺看好你的。`);

  out.push('## 开运建议');
  c.luck.forEach((l) => out.push(`- **补${l.wuXing}**：幸运色 ${l.colors.join('、')}；吉利方位 ${l.direction}；幸运数字 ${l.numbers.join('、')}；可以用 ${l.items}。`));
  out.push(`- 忌神为${c.jiShen.join('、')}，相关颜色不必刻意回避，少量即可。`);
  out.push('- 保持好作息、多晒太阳、多和正能量的人在一起，就是最好的风水。');
  out.push('');
  out.push(`愿你${c.nowYear}年起好运连连，所求皆如愿，所行化坦途。`);
  return out.join('\n\n');
}

export { generateFallback };
