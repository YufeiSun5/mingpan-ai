/**
 * 神煞（三命通会 / 渊海子平常用取法）
 * 每条规则旁标注出处；同一柱可叠多个神煞。流年/大运列与四柱共用 computeShenSha。
 */
const GAN = '甲乙丙丁戊己庚辛壬癸';
const ZHI = '子丑寅卯辰巳午未申酉戌亥';
const zi = (z: string) => ZHI.indexOf(z);
const gan = (g: string) => GAN.indexOf(g);
const sanHe = (z: string) => ['申子辰', '寅午戌', '巳酉丑', '亥卯未'].find((g) => g.includes(z)) || '';

/** 点击弹层用短释 */
export const SHEN_SHA_DESC: Record<string, string> = {
  天乙贵人: '最吉之神煞，主逢凶化吉、贵人提携。《三命通会》',
  太极贵人: '聪明好学，喜研精深玄理。《三命通会》',
  天德: '月之天德，主慈祥解厄。《协纪辨方》',
  月德: '月之月德，主宽厚少灾。《协纪辨方》',
  天德合: '天德所合之干， 主和解消凶。',
  月德合: '月德所合之干， 主和解消凶。',
  德秀: '德秀贵人，月令气势清秀，主才学文采。《三命通会》',
  天厨: '天厨贵人，主食禄丰余。',
  福星贵人: '福星贵人，主福气安稳。',
  文昌: '文昌贵人，主科名文书、聪明。',
  国印: '国印贵人，主掌印信、稳重。',
  学堂: '学堂，主文艺发端。',
  词馆: '词馆，主文章词翰。',
  禄神: '日禄在支，主衣禄丰厚。',
  羊刃: '阳刃，性刚、主进取亦主波折。',
  飞刃: '羊刃所冲，主突发变动。',
  将星: '将星，主领导、权威。',
  华盖: '华盖，主孤高、艺术宗教。',
  驿马: '驿马，主奔波变动、外出。',
  咸池: '咸池桃花，主异性缘、魅力。《三命通会》',
  桃花: '咸池桃花，主异性缘、魅力。《三命通会》',
  红艳: '红艳煞，主风流情愫。',
  天医: '天医，主医药、疗愈能力。《渊海子平》',
  金舆: '金舆，主车马衣禄、配偶贤。',
  金神: '金神，宜火制，主刚决。',
  魁罡: '魁罡，主聪明果决，宜顺忌刑冲。',
  天赦: '天赦日，主解灾宥罪。',
  十灵: '十灵日，主灵敏有声名。',
  六秀: '六秀日，主清秀聪慧。',
  天罗: '戌亥为天罗，主困阻。',
  地网: '辰巳为地网，主困阻。',
  孤辰: '孤辰，主孤独。',
  寡宿: '寡宿，主孤寡。',
  劫煞: '劫煞，主破耗争夺。',
  灾煞: '灾煞，主意外灾滞。',
  亡神: '亡神，主恍惚耗失。',
  元辰: '元辰大耗，主损耗。',
  勾绞: '勾绞煞，主纠缠官非。',
  披麻: '披麻，主孝服之象。',
  丧门: '丧门，主孝服之象。',
  吊客: '吊客，主吊唁忧戚。',
  白虎: '白虎，主血光凶险需谨慎。',
  红鸾: '红鸾，主喜庆婚姻。',
  天喜: '天喜，主喜事临门。',
  童子: '童子煞，传统以为婚育宜化解。',
  阴差阳错: '阴差阳错，婚姻易有周折。',
  孤鸾: '孤鸾煞，婚姻宜审慎。',
  八专: '八专日，传统论情欲。',
  九丑: '九丑日，传统忌嫁娶。',
  平头: '平头煞，传统论婚配岁差。',
  空亡: '旬空，力量易虚，视通根透干而定。',
};

// —— 查表（三命通会 / 通书常用）——
const TIANYI: Record<string, string> = { 甲: '丑未', 戊: '丑未', 庚: '丑未', 乙: '子申', 己: '子申', 丙: '亥酉', 丁: '亥酉', 壬: '卯巳', 癸: '卯巳', 辛: '寅午' };
const TAIJI: Record<string, string> = { 甲: '子午', 乙: '子午', 丙: '卯酉', 丁: '卯酉', 戊: '辰戌丑未', 己: '辰戌丑未', 庚: '寅亥', 辛: '寅亥', 壬: '巳申', 癸: '巳申' };
const WENCHANG: Record<string, string> = { 甲: '巳', 乙: '午', 丙: '申', 丁: '酉', 戊: '申', 己: '酉', 庚: '亥', 辛: '子', 壬: '寅', 癸: '卯' };
const GUOYIN: Record<string, string> = { 甲: '戌', 乙: '亥', 丙: '丑', 丁: '寅', 戊: '丑', 己: '寅', 庚: '辰', 辛: '巳', 壬: '未', 癸: '申' };
const LU: Record<string, string> = { 甲: '寅', 乙: '卯', 丙: '巳', 丁: '午', 戊: '巳', 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子' };
// 羊刃：阳干取帝旺；阴干细盘常取禄前一位（暗刃）《三命通会》附注
const YANGREN: Record<string, string> = { 甲: '卯', 乙: '寅', 丙: '午', 丁: '巳', 戊: '午', 己: '巳', 庚: '酉', 辛: '申', 壬: '子', 癸: '亥' };
const JINYU: Record<string, string> = { 甲: '辰', 乙: '巳', 丙: '未', 丁: '申', 戊: '未', 己: '申', 庚: '戌', 辛: '亥', 壬: '丑', 癸: '寅' };
const TIANCHU: Record<string, string> = { 甲: '巳', 乙: '午', 丙: '巳', 丁: '午', 戊: '申', 己: '酉', 庚: '亥', 辛: '子', 壬: '寅', 癸: '卯' };
const FUXING: Record<string, string> = { 甲: '寅', 乙: '丑', 丙: '子', 丁: '酉', 戊: '申', 己: '未', 庚: '午', 辛: '巳', 壬: '辰', 癸: '卯' }; // 一常见取法
const HONGYAN: Record<string, string> = { 甲: '午', 乙: '申', 丙: '寅', 丁: '未', 戊: '辰', 己: '辰', 庚: '戌', 辛: '酉', 壬: '子', 癸: '申' };
const HONGLUAN: Record<string, string> = { 子: '卯', 丑: '寅', 寅: '丑', 卯: '子', 辰: '亥', 巳: '戌', 午: '酉', 未: '申', 申: '未', 酉: '午', 戌: '巳', 亥: '辰' };
const CHONG: Record<string, string> = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' };
// 天德：以月支定天德所临天干或地支（《协纪辨方》）
const TIANDE: Record<string, string> = { 寅: '丁', 卯: '申', 辰: '壬', 巳: '辛', 午: '亥', 未: '甲', 申: '癸', 酉: '寅', 戌: '丙', 亥: '乙', 子: '巳', 丑: '庚' };
const TIANDE_HE: Record<string, string> = { 甲: '己', 乙: '庚', 丙: '辛', 丁: '壬', 戊: '癸', 己: '甲', 庚: '乙', 辛: '丙', 壬: '丁', 癸: '戊', 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' };
const YUEDE: Record<string, string> = { 寅午戌: '丙', 申子辰: '壬', 亥卯未: '甲', 巳酉丑: '庚' };
const YUEDE_HE: Record<string, string> = { 丙: '辛', 壬: '丁', 甲: '己', 庚: '乙' };
/** 德秀：月支三合局 → 德干 / 秀干《三命通会》 */
const DEXIU: Record<string, { de: string; xiu: string }> = {
  寅午戌: { de: '丙丁', xiu: '戊癸' },
  申子辰: { de: '壬癸戊己', xiu: '甲己' }, // 简化常用：壬癸为德，戊己亦有取
  巳酉丑: { de: '庚辛', xiu: '乙丙' },
  亥卯未: { de: '甲乙', xiu: '丁壬' },
};
/** 天医：月支退一位《渊海子平》正月起丑逆行 ≡ 月支-1 */
const tianYiZhi = (monthZhi: string) => ZHI[(zi(monthZhi) + 11) % 12];
const TAOHUA: Record<string, string> = { 申子辰: '酉', 寅午戌: '卯', 巳酉丑: '午', 亥卯未: '子' };
const YIMA: Record<string, string> = { 申子辰: '寅', 寅午戌: '申', 巳酉丑: '亥', 亥卯未: '巳' };
const HUAGAI: Record<string, string> = { 申子辰: '辰', 寅午戌: '戌', 巳酉丑: '丑', 亥卯未: '未' };
const JIANGXING: Record<string, string> = { 申子辰: '子', 寅午戌: '午', 巳酉丑: '酉', 亥卯未: '卯' };
const JIESHA: Record<string, string> = { 申子辰: '巳', 寅午戌: '亥', 巳酉丑: '寅', 亥卯未: '申' };
const ZAISHA: Record<string, string> = { 申子辰: '午', 寅午戌: '子', 巳酉丑: '卯', 亥卯未: '酉' };
const WANGSHEN: Record<string, string> = { 申子辰: '亥', 寅午戌: '巳', 巳酉丑: '申', 亥卯未: '寅' };
const KUIGANG = ['庚辰', '庚戌', '壬辰', '戊戌'];
const JINSHEN = ['乙丑', '己巳', '癸酉']; // 金神三合
const TIAN_SHE: Record<string, string> = { 寅卯辰: '戊寅', 巳午未: '甲午', 申酉戌: '戊申', 亥子丑: '甲子' }; // 季节天赦
const SHILING = ['甲辰', '乙亥', '丙辰', '丁酉', '戊午', '庚戌', '庚寅', '辛亥', '壬寅', '癸未'];
const LIUXIU = ['丙午', '丁未', '戊子', '戊午', '己丑', '己未'];
const YINCHA = ['丙子', '丙午', '丁丑', '丁未', '戊寅', '戊申', '辛卯', '辛酉', '壬辰', '壬戌', '癸巳', '癸亥'];
const GULUAN = ['甲寅', '乙巳', '丙午', '丁巳', '戊午', '戊申', '辛亥', '壬子'];
const BAZHUAN = ['甲寅', '乙卯', '丁未', '戊戌', '己未', '庚申', '辛酉', '癸丑'];
const JIUCHOU = ['丁酉', '戊子', '戊午', '己卯', '己酉', '辛卯', '辛酉', '壬子', '壬午'];
// 学堂词馆：日主纳音 → 学堂/词馆地支（长生为学堂，临官为词馆，简取）
const XUETANG: Record<string, string> = { 木: '亥', 火: '寅', 土: '寅', 金: '巳', 水: '申' };
const CIGUAN: Record<string, string> = { 木: '寅', 火: '巳', 土: '巳', 金: '申', 水: '亥' };
const GAN_WX: Record<string, string> = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
// 孤辰寡宿（以年支）
const GUCHEN: Record<string, string> = { 寅卯辰: '巳', 巳午未: '申', 申酉戌: '亥', 亥子丑: '寅' };
const GUASU: Record<string, string> = { 寅卯辰: '丑', 巳午未: '辰', 申酉戌: '未', 亥子丑: '戌' };
// 童子：以年支或月支（简化：午卯者见寅卯未申… 取常见细盘）
const TONGZI_YEAR: Record<string, string> = { 寅卯申酉: '午未', 子丑午未: '寅卯', 辰戌丑未: '辰巳' }; // 粗表
// 丧门吊客白虎披麻（以年支起，顺行）
const fromYear = (yearZhi: string, offset: number) => ZHI[(zi(yearZhi) + offset + 12) % 12];

export interface ShenShaCtx {
  yearGan: string; yearZhi: string; monthZhi: string; dayGan: string; dayZhi: string;
  dayKong: string; gender?: '男' | '女';
  /** 当前列是否日柱 / 年柱 */
  isDay?: boolean; isYear?: boolean;
}

/** 计算一柱（或流年/大运列）神煞列表，已去重、按吉凶大致排序 */
export function computeShenSha(ganStr: string, zhiStr: string, ctx: ShenShaCtx): string[] {
  if (!ganStr || !zhiStr) return [];
  const out: string[] = [];
  const add = (n: string) => { if (n && !out.includes(n)) out.push(n); };
  const gz = ganStr + zhiStr;
  const { yearGan, yearZhi, monthZhi, dayGan, dayZhi, dayKong } = ctx;
  const yGroup = sanHe(yearZhi);
  const mGroup = sanHe(monthZhi);
  const dGroup = sanHe(dayZhi);

  // 贵人类
  if (TIANYI[dayGan]?.includes(zhiStr) || TIANYI[yearGan]?.includes(zhiStr)) add('天乙贵人');
  if (TAIJI[dayGan]?.includes(zhiStr) || TAIJI[yearGan]?.includes(zhiStr)) add('太极贵人');
  if (WENCHANG[dayGan] === zhiStr || WENCHANG[yearGan] === zhiStr) add('文昌');
  if (GUOYIN[dayGan] === zhiStr) add('国印');
  if (TIANCHU[dayGan] === zhiStr) add('天厨');
  if (FUXING[dayGan] === zhiStr) add('福星贵人');

  // 天德 / 月德 / 合
  const td = TIANDE[monthZhi];
  if (td && (td === ganStr || td === zhiStr)) add('天德');
  if (td && TIANDE_HE[td] && (TIANDE_HE[td] === ganStr || TIANDE_HE[td] === zhiStr)) add('天德合');
  const yd = YUEDE[mGroup];
  if (yd === ganStr) add('月德');
  if (yd && YUEDE_HE[yd] === ganStr) add('月德合');

  // 德秀贵人：月令德秀之干临本柱天干
  const dx = DEXIU[mGroup];
  if (dx && (dx.de.includes(ganStr) || dx.xiu.includes(ganStr))) add('德秀');

  // 天医（月支退一）
  if (tianYiZhi(monthZhi) === zhiStr) add('天医');

  // 禄刃舆
  if (LU[dayGan] === zhiStr) add('禄神');
  if (YANGREN[dayGan] === zhiStr) add('羊刃');
  if (YANGREN[dayGan] && CHONG[YANGREN[dayGan]] === zhiStr) add('飞刃');
  if (JINYU[dayGan] === zhiStr) add('金舆');

  // 学堂词馆（按日主五行）
  const wx = GAN_WX[dayGan];
  if (XUETANG[wx] === zhiStr) add('学堂');
  if (CIGUAN[wx] === zhiStr) add('词馆');

  // 将星华盖驿马桃花（年支、日支三合）
  for (const g of [yGroup, dGroup]) {
    if (!g) continue;
    if (JIANGXING[g] === zhiStr) add('将星');
    if (HUAGAI[g] === zhiStr) add('华盖');
    if (YIMA[g] === zhiStr) add('驿马');
    if (TAOHUA[g] === zhiStr) add('咸池');
    if (JIESHA[g] === zhiStr) add('劫煞');
    if (ZAISHA[g] === zhiStr) add('灾煞');
    if (WANGSHEN[g] === zhiStr) add('亡神');
  }
  if (HONGYAN[dayGan] === zhiStr) add('红艳');

  // 红鸾天喜（年支）
  if (!ctx.isYear && HONGLUAN[yearZhi] === zhiStr) add('红鸾');
  if (!ctx.isYear && CHONG[HONGLUAN[yearZhi]] === zhiStr) add('天喜');

  // 魁罡 / 金神 / 日专类
  if (ctx.isDay && KUIGANG.includes(gz)) add('魁罡');
  if (JINSHEN.includes(gz)) add('金神');
  if (ctx.isDay && SHILING.includes(gz)) add('十灵');
  if (ctx.isDay && LIUXIU.includes(gz)) add('六秀');
  if (ctx.isDay && YINCHA.includes(gz)) add('阴差阳错');
  if (ctx.isDay && GULUAN.includes(gz)) add('孤鸾');
  if (ctx.isDay && BAZHUAN.includes(gz)) add('八专');
  if (ctx.isDay && JIUCHOU.includes(gz)) add('九丑');

  // 天赦（季节）
  const season = ['寅卯辰', '巳午未', '申酉戌', '亥子丑'].find((g) => g.includes(monthZhi));
  if (season && TIAN_SHE[season] === gz) add('天赦');

  // 天罗地网
  if (zhiStr === '戌' || zhiStr === '亥') add('天罗');
  if (zhiStr === '辰' || zhiStr === '巳') add('地网');

  // 孤辰寡宿（年支）
  const yg = ['寅卯辰', '巳午未', '申酉戌', '亥子丑'].find((g) => g.includes(yearZhi));
  if (yg && GUCHEN[yg] === zhiStr) add('孤辰');
  if (yg && GUASU[yg] === zhiStr) add('寡宿');

  // 元辰：年支阴阳顺逆冲后一位（阳男阴女顺，反之逆）— 简化：年支之冲
  // 大耗常同元辰取冲位
  if (CHONG[yearZhi] === zhiStr) add('元辰');

  // 丧门(+2) 吊客(+8) 白虎(+10) 披麻(+6) 勾绞 男(+5/+7) 女(+1/+11) — 以年支起顺数
  if (fromYear(yearZhi, 2) === zhiStr) add('丧门');
  if (fromYear(yearZhi, 8) === zhiStr) add('吊客');
  if (fromYear(yearZhi, 10) === zhiStr) add('白虎');
  if (fromYear(yearZhi, 6) === zhiStr) add('披麻');
  const gou = ctx.gender === '女' ? 1 : 5;
  const jiao = ctx.gender === '女' ? 11 : 7;
  if (fromYear(yearZhi, gou) === zhiStr || fromYear(yearZhi, jiao) === zhiStr) add('勾绞');

  // 童子（简化：年支分组见特定支）
  if ((yearZhi.match(/[寅卯申酉]/) && '午未'.includes(zhiStr))
    || (yearZhi.match(/[子丑午未]/) && '寅卯'.includes(zhiStr))
    || (yearZhi.match(/[辰戌丑未]/) && '辰巳'.includes(zhiStr))) add('童子');

  // 平头：日柱与他柱天干同（由上层多柱比较时加；单柱不判）

  // 空亡（日旬）— 日柱本身不标空亡
  if (!ctx.isDay && dayKong && dayKong.includes(zhiStr)) add('空亡');

  // 展示序：贵人吉神靠前
  const rank = (n: string) => {
    const hi = ['天乙贵人', '太极贵人', '天德', '月德', '德秀', '天医', '文昌', '文昌贵人', '天厨', '福星贵人', '国印', '学堂', '词馆', '禄神', '金舆', '将星', '咸池', '桃花', '红鸾', '天喜'];
    const i = hi.indexOf(n);
    return i >= 0 ? i : 100 + out.indexOf(n);
  };
  return out.sort((a, b) => rank(a) - rank(b));
}

/** 多柱之间的平头（两干相同）— 返回柱索引对，由调用方选用 */
export function pingTouPairs(pillars: { gan: string }[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < pillars.length; i++) for (let j = i + 1; j < pillars.length; j++) {
    if (pillars[i].gan && pillars[i].gan === pillars[j].gan) pairs.push([i, j]);
  }
  return pairs;
}
