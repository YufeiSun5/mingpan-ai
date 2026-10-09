// 宜居城市推荐：城市目录（国内 + 发达国家高性价比城市）与纯函数打分。
// 方位按后天八卦取五行（东震木、东南巽木、南离火、西南坤土、西兑金、西北乾金、北坎水、东北艮土、中宫土），
// 再叠加地理气候、产业的五行，与命盘喜用神 / 忌神、日主强弱比对。不含任何网络或定位逻辑。
import type { Chart, Wx } from './types';

export type Dir8 = '东' | '东南' | '南' | '西南' | '西' | '西北' | '北' | '东北' | '中';
export type Feat = '海' | '江' | '湖' | '热' | '暖' | '寒' | '燥' | '山' | '林' | '湿' | '原' | '高' | '晴';
export interface CityInfo {
  name: string; country: string; prov: string; lat: number; lng: number;
  /** 在全国（海外：相对中国）的方位 */
  dir: Dir8; feat: Feat[]; ind: string[];
  /** 发展机会 1–3；生活成本 1–3 */
  dev: 1 | 2 | 3; cost: 1 | 2 | 3;
  /** 海外：性价比 / 落地路径的一句话 */
  value?: string;
}

export const GUA: Record<Dir8, { gua: string; wx: Wx }> = {
  东: { gua: '震', wx: '木' }, 东南: { gua: '巽', wx: '木' }, 南: { gua: '离', wx: '火' }, 西南: { gua: '坤', wx: '土' },
  西: { gua: '兑', wx: '金' }, 西北: { gua: '乾', wx: '金' }, 北: { gua: '坎', wx: '水' }, 东北: { gua: '艮', wx: '土' }, 中: { gua: '中宫', wx: '土' },
};
export const FEAT: Record<Feat, { wx: Wx; t: string }> = {
  海: { wx: '水', t: '临海' }, 江: { wx: '水', t: '江河环绕' }, 湖: { wx: '水', t: '湖泊多' }, 湿: { wx: '水', t: '空气湿润' }, 寒: { wx: '水', t: '冬季寒冷' },
  热: { wx: '火', t: '气候炎热' }, 暖: { wx: '火', t: '四季温暖' }, 晴: { wx: '火', t: '日照充足' },
  燥: { wx: '金', t: '气候干爽' }, 高: { wx: '金', t: '高原清朗' },
  山: { wx: '土', t: '群山环抱' }, 原: { wx: '土', t: '地势平阔' }, 林: { wx: '木', t: '草木繁茂' },
};
/** 行业的五行归属 */
export const IND_WX: Record<string, Wx> = {
  科技: '火', 传媒: '火', 电商: '火', 能源: '火', 餐饮: '火', 半导体: '火',
  教育: '木', 文创: '木', 医药: '木', 农业: '木', 设计: '木',
  地产: '土', 政务: '土', 咨询: '土', 建筑: '土',
  金融: '金', 制造: '金', 汽车: '金', 法律: '金', 机械: '金',
  贸易: '水', 航运: '水', 物流: '水', 文旅: '水',
};
export const WX_IND: Record<Wx, string[]> = { 木: [], 火: [], 土: [], 金: [], 水: [] };
for (const [k, w] of Object.entries(IND_WX)) WX_IND[w].push(k);
const WX_COLOR: Record<Wx, string> = { 木: '绿色', 火: '红色', 土: '黄色', 金: '白色', 水: '蓝黑色' };

type Row = [string, string, number, number, Dir8, string, string, number, number, string?];
const CN: Row[] = [
  ['北京', '北京', 39.9, 116.4, '北', '寒燥', '科技金融传媒政务文创', 3, 3],
  ['天津', '天津', 39.1, 117.2, '北', '海寒', '制造航运物流汽车', 2, 2],
  ['石家庄', '河北', 38.04, 114.5, '北', '燥原', '医药制造物流', 1, 1],
  ['太原', '山西', 37.87, 112.55, '北', '燥山', '能源制造', 1, 1],
  ['呼和浩特', '内蒙古', 40.84, 111.75, '北', '寒燥原', '农业能源文旅', 1, 1],
  ['济南', '山东', 36.65, 117.0, '东', '湖山', '制造医药科技政务', 2, 1],
  ['青岛', '山东', 36.07, 120.38, '东', '海湿', '制造航运贸易文旅', 2, 2],
  ['烟台', '山东', 37.46, 121.45, '东', '海', '制造农业文旅', 1, 1],
  ['沈阳', '辽宁', 41.8, 123.43, '东北', '寒原', '制造汽车机械', 1, 1],
  ['大连', '辽宁', 38.91, 121.6, '东北', '海寒', '航运制造科技文旅', 2, 2],
  ['长春', '吉林', 43.82, 125.32, '东北', '寒林', '汽车农业教育', 1, 1],
  ['哈尔滨', '黑龙江', 45.75, 126.63, '东北', '寒江', '农业文旅制造', 1, 1],
  ['上海', '上海', 31.23, 121.47, '东', '海江湿', '金融贸易科技航运传媒', 3, 3],
  ['南京', '江苏', 32.06, 118.78, '东', '江山湿', '教育科技制造医药', 3, 2],
  ['苏州', '江苏', 31.3, 120.62, '东', '湖湿林', '制造半导体医药文旅', 3, 2],
  ['无锡', '江苏', 31.49, 120.31, '东', '湖湿', '半导体制造物流', 2, 2],
  ['常州', '江苏', 31.81, 119.97, '东', '湖湿', '制造能源汽车', 2, 1],
  ['南通', '江苏', 31.98, 120.89, '东', '江海', '建筑航运制造', 2, 1],
  ['杭州', '浙江', 30.27, 120.15, '东南', '湖林湿', '电商科技文创文旅', 3, 2],
  ['宁波', '浙江', 29.87, 121.55, '东南', '海湿', '航运贸易制造', 2, 2],
  ['嘉兴', '浙江', 30.75, 120.76, '东南', '湖湿', '制造电商文旅', 1, 1],
  ['绍兴', '浙江', 30.0, 120.58, '东南', '湖湿', '文创制造教育', 1, 1],
  ['温州', '浙江', 28.0, 120.7, '东南', '海山', '贸易制造', 2, 1],
  ['合肥', '安徽', 31.82, 117.23, '中', '湖原', '科技半导体能源教育', 3, 1],
  ['芜湖', '安徽', 31.33, 118.38, '中', '江', '汽车制造', 1, 1],
  ['福州', '福建', 26.07, 119.3, '东南', '江海暖', '制造贸易电商', 2, 1],
  ['厦门', '福建', 24.48, 118.09, '东南', '海暖林', '贸易文旅航运科技', 2, 2],
  ['泉州', '福建', 24.87, 118.68, '东南', '海暖', '制造贸易餐饮', 2, 1],
  ['南昌', '江西', 28.68, 115.89, '中', '湖江湿', '制造医药教育', 1, 1],
  ['赣州', '江西', 25.83, 114.93, '南', '山暖林', '制造农业文旅', 1, 1],
  ['郑州', '河南', 34.75, 113.62, '中', '原', '物流制造电商政务', 2, 1],
  ['洛阳', '河南', 34.62, 112.45, '中', '山原', '机械文旅制造', 1, 1],
  ['武汉', '湖北', 30.59, 114.3, '中', '江湖热', '汽车教育科技医药物流', 3, 1],
  ['宜昌', '湖北', 30.69, 111.29, '中', '江山', '能源文旅制造', 1, 1],
  ['长沙', '湖南', 28.23, 112.94, '南', '江热湿', '传媒机械餐饮文创', 2, 1],
  ['广州', '广东', 23.13, 113.26, '南', '热江湿', '贸易餐饮汽车电商教育', 3, 2],
  ['深圳', '广东', 22.54, 114.06, '南', '海热', '科技半导体金融制造', 3, 3],
  ['珠海', '广东', 22.27, 113.58, '南', '海暖林', '文旅制造科技', 2, 2],
  ['佛山', '广东', 23.02, 113.12, '南', '江热', '制造餐饮', 2, 1],
  ['东莞', '广东', 23.02, 113.75, '南', '江热', '制造电商物流', 2, 1],
  ['惠州', '广东', 23.11, 114.42, '南', '海暖山', '能源制造文旅', 1, 1],
  ['中山', '广东', 22.52, 113.39, '南', '江暖', '制造', 1, 1],
  ['南宁', '广西', 22.82, 108.37, '南', '暖湿林', '贸易农业物流', 1, 1],
  ['桂林', '广西', 25.27, 110.29, '南', '山江林', '文旅农业教育', 1, 1],
  ['柳州', '广西', 24.33, 109.42, '南', '江山', '汽车制造', 1, 1],
  ['海口', '海南', 20.04, 110.35, '南', '海热', '贸易文旅医药', 2, 1],
  ['三亚', '海南', 18.25, 109.51, '南', '海热晴', '文旅医药', 1, 2],
  ['成都', '四川', 30.66, 104.07, '西南', '湿原林', '科技文创餐饮传媒医药', 3, 1],
  ['绵阳', '四川', 31.47, 104.68, '西南', '山', '科技制造', 1, 1],
  ['重庆', '重庆', 29.56, 106.55, '西南', '江山热', '汽车制造物流餐饮', 3, 1],
  ['贵阳', '贵州', 26.65, 106.63, '西南', '山林湿', '科技文旅', 2, 1],
  ['昆明', '云南', 25.04, 102.71, '西南', '高晴暖湖', '文旅农业医药', 1, 1],
  ['大理', '云南', 25.61, 100.27, '西南', '高湖晴', '文旅文创', 1, 1],
  ['西安', '陕西', 34.34, 108.94, '西北', '燥原', '科技教育半导体文旅', 2, 1],
  ['兰州', '甘肃', 36.06, 103.83, '西北', '燥江山', '能源制造', 1, 1],
  ['银川', '宁夏', 38.49, 106.23, '西北', '燥原', '能源农业', 1, 1],
  ['西宁', '青海', 36.62, 101.78, '西北', '高燥寒', '能源文旅', 1, 1],
  ['乌鲁木齐', '新疆', 43.83, 87.62, '西北', '燥寒', '贸易能源物流', 1, 1],
];
type ARow = [string, string, number, number, Dir8, string, string, number, number, string];
const ABROAD: ARow[] = [
  ['福冈', '日本', 33.59, 130.4, '东', '海暖', '科技文旅餐饮', 2, 1, '生活成本在日本大城市里偏低，设有外国人创业签证特区'],
  ['大阪', '日本', 34.69, 135.5, '东', '海湿', '制造贸易餐饮医药', 2, 2, '工作机会多，房租明显低于东京'],
  ['釜山', '韩国', 35.18, 129.08, '东', '海', '航运物流文旅', 2, 1, '韩国第二大城，房租比首尔低不少'],
  ['莱比锡', '德国', 51.34, 12.37, '西北', '寒原', '物流汽车科技', 2, 1, '德国东部房租较低，技术岗可走欧盟蓝卡'],
  ['德累斯顿', '德国', 51.05, 13.74, '西北', '江寒', '半导体科技文创', 2, 1, '"萨克森硅谷"，芯片与工程岗缺人，生活成本低于德国西部'],
  ['埃因霍温', '荷兰', 51.44, 5.47, '西北', '原湿', '半导体设计科技', 2, 2, '科技企业集中，荷兰高技术移民通道审批快'],
  ['科克', '爱尔兰', 51.9, -8.47, '西北', '海湿', '医药科技', 2, 2, '英语环境，跨国医药与科技企业集中，房租低于都柏林'],
  ['波尔图', '葡萄牙', 41.15, -8.61, '西', '海暖', '科技文旅设计', 1, 1, '西欧生活成本较低的一档，远程工作可了解数字游民签证'],
  ['瓦伦西亚', '西班牙', 39.47, -0.38, '西', '海暖晴', '文旅贸易农业', 1, 1, '气候宜人，物价明显低于马德里、巴塞罗那'],
  ['布尔诺', '捷克', 49.2, 16.61, '西北', '原', '科技教育', 1, 1, '中欧软件研发重镇，生活成本低'],
  ['格拉茨', '奥地利', 47.07, 15.44, '西北', '山林', '汽车科技教育', 1, 1, '汽车与高校集中，生活成本低于维也纳'],
  ['坦佩雷', '芬兰', 61.5, 23.76, '西北', '湖寒林', '科技制造', 1, 1, '芬兰科技城，房租低于赫尔辛基'],
  ['博洛尼亚', '意大利', 44.49, 11.34, '西北', '原', '汽车机械餐饮教育', 1, 1, '机械汽车与大学城，生活成本低于米兰'],
  ['基督城', '新西兰', -43.53, 172.64, '东南', '海原', '农业建筑教育', 1, 2, '新西兰南岛最大城，房价低于奥克兰，建筑类岗位缺口大'],
  ['阿德莱德', '澳大利亚', -34.93, 138.6, '南', '热燥晴海', '教育医药制造农业', 1, 2, '属澳洲偏远地区，移民有加分，房价低于悉尼、墨尔本'],
  ['哈利法克斯', '加拿大', 44.65, -63.57, '东', '海寒', '航运教育科技', 1, 1, '可走大西洋省移民项目，生活成本低于多伦多'],
  ['卡尔加里', '加拿大', 51.05, -114.07, '东', '寒燥晴', '能源科技金融', 2, 2, '阿尔伯塔省无省销售税，房价低于温哥华、多伦多'],
  ['罗利', '美国', 35.78, -78.64, '东', '林暖', '科技医药教育', 2, 2, '研究三角园区所在地，收入对房价比高'],
  ['匹兹堡', '美国', 40.44, -79.99, '东', '江山', '科技医药教育', 2, 1, '机器人与医疗重镇，房价在美国大城市里偏低'],
];
const split = (s: string, n: number) => Array.from({ length: s.length / n }, (_, i) => s.slice(i * n, i * n + n));
// 行业名都是两个字，"半导体"三个字单独处理
const indOf = (s: string) => { const out: string[] = []; let t = s; if (t.includes('半导体')) { out.push('半导体'); t = t.replace('半导体', ''); } return [...out, ...split(t, 2)]; };
const mk = (r: Row | ARow, country: string): CityInfo => ({
  name: r[0], country, prov: r[1], lat: r[2], lng: r[3], dir: r[4], feat: [...r[5]] as Feat[], ind: indOf(r[6]),
  dev: r[7] as 1 | 2 | 3, cost: r[8] as 1 | 2 | 3, ...(r[9] ? { value: r[9] } : {}),
});
export const CITY_CATALOG: CityInfo[] = [...CN.map((r) => mk(r, '中国')), ...ABROAD.map((r) => mk(r, r[1]))];

/** 省级行政区的大致中心（用于出生地 / 所在地只到省级时） */
export const PROVINCE_CENTER: Record<string, [number, number]> = {
  北京: [39.9, 116.4], 天津: [39.1, 117.2], 上海: [31.23, 121.47], 重庆: [29.56, 106.55], 河北: [38.04, 114.5], 山西: [37.87, 112.55],
  内蒙古: [40.84, 111.75], 辽宁: [41.8, 123.43], 吉林: [43.82, 125.32], 黑龙江: [45.75, 126.63], 江苏: [32.06, 118.78], 浙江: [30.27, 120.15],
  安徽: [31.82, 117.23], 福建: [26.07, 119.3], 江西: [28.68, 115.89], 山东: [36.65, 117.0], 河南: [34.75, 113.62], 湖北: [30.59, 114.3],
  湖南: [28.23, 112.94], 广东: [23.13, 113.26], 广西: [22.82, 108.37], 海南: [20.04, 110.35], 四川: [30.66, 104.07], 贵州: [26.65, 106.63],
  云南: [25.04, 102.71], 西藏: [29.65, 91.11], 陕西: [34.34, 108.94], 甘肃: [36.06, 103.83], 青海: [36.62, 101.78], 宁夏: [38.49, 106.23],
  新疆: [43.83, 87.62], 香港: [22.32, 114.17], 澳门: [22.2, 113.54], 台湾: [25.03, 121.5],
};
const norm = (s: string) => s.replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市)$/, '').trim();
/** 地名 → 坐标（先找目录城市，再找省份；找不到返回 null） */
export function placeCoord(place?: string | null): { lat: number; lng: number; name: string; country: string } | null {
  if (!place) return null;
  const s = String(place);
  const c = CITY_CATALOG.find((x) => s.includes(x.name));
  if (c) return { lat: c.lat, lng: c.lng, name: c.name, country: c.country };
  const p = Object.keys(PROVINCE_CENTER).find((k) => norm(s).startsWith(k) || s.includes(k));
  if (p) return { lat: PROVINCE_CENTER[p][0], lng: PROVINCE_CENTER[p][1], name: p, country: '中国' };
  return null;
}
export function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** from → to 的八方位（平面近似，国内够用） */
export function bearing8(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Dir8 {
  const dx = (to.lng - from.lng) * Math.cos(((from.lat + to.lat) / 2) * Math.PI / 180), dy = to.lat - from.lat;
  const a = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360; // 0=北，90=东
  return (['北', '东北', '东', '东南', '南', '西南', '西', '西北'] as Dir8[])[Math.round(a / 45) % 8];
}

/** 推荐上下文：anchor 只用于"就近优先"，绝不出现在理由文字里 */
export interface CityContext {
  /** 大致所在位置（仅用于排序） */
  anchor?: { lat: number; lng: number; country?: string } | null;
  /** 海外模式：在国外 / 想出国 */
  abroad?: boolean;
  /** 用户在聊天里点名的国家 */
  countries?: string[];
  /** 偏好：南/北/东/西/沿海/内陆/大城市/小城市/安静/便宜/近 */
  prefer?: string[];
  /** 排除（"换几个"） */
  exclude?: string[];
}
export interface CityPick {
  name: string; country: string; prov: string; dir: Dir8; gua: string; dirWx: Wx;
  /** 一句话命盘理由（引用真实盘面字段） */
  reason: string; work: string; caution?: string; value?: string; tags: string[]; score: number;
}

const near = (d: number) => (d < 250 ? 2.2 : d < 600 ? 1.6 : d < 1000 ? 0.8 : d > 2200 ? -0.3 : 0);
const PREF: Record<string, (c: CityInfo) => number> = {
  南: (c) => (c.lat < 27 ? 2.2 : /南/.test(c.dir) && c.lat < 31 ? 1 : c.lat > 34 ? -1.5 : 0),
  北: (c) => (c.lat > 34 ? 2.2 : c.lat < 28 ? -1.5 : 0),
  东: (c) => (/东/.test(c.dir) ? 2 : /西/.test(c.dir) ? -1.5 : 0),
  西: (c) => (/西/.test(c.dir) ? 2 : /东/.test(c.dir) ? -1.5 : 0),
  沿海: (c) => (c.feat.includes('海') ? 2.2 : -1),
  内陆: (c) => (c.feat.includes('海') ? -1.5 : 1),
  大城市: (c) => (c.dev === 3 ? 2 : c.dev === 1 ? -1.5 : 0),
  小城市: (c) => (c.dev === 1 ? 1.8 : c.dev === 3 ? -1.8 : 0),
  安静: (c) => (c.cost === 1 && c.dev < 3 ? 1.5 : c.dev === 3 ? -1.2 : 0),
  便宜: (c) => (c.cost === 1 ? 1.8 : c.cost === 3 ? -2 : 0),
  暖和: (c) => (c.feat.some((f) => f === '暖' || f === '热') ? 2 : c.feat.includes('寒') ? -2 : 0),
};
export const PREF_KEYS = Object.keys(PREF);

function scoreOne(chart: Chart, c: CityInfo, ctx: CityContext, birth: ReturnType<typeof placeCoord>) {
  const xi = chart.xiYong || [], ji = chart.jiShen || [];
  // 国内城市：以出生地论方位（出生地是盘上的信息），否则以全国方位论；海外按相对中国的方位
  const dB = c.country === '中国' && birth && birth.country === '中国' ? distKm(birth, c) : -1;
  const relDir: Dir8 = dB > 150 ? bearing8(birth!, c) : c.dir;
  const dw = GUA[relDir].wx;
  let s = 0;
  if (dw === xi[0]) s += 3; else if (xi.includes(dw)) s += 2;
  if (ji.includes(dw)) s -= 2;
  let fs = 0;
  for (const f of c.feat) { const w = FEAT[f].wx; if (w === xi[0]) fs += 1.3; else if (xi.includes(w)) fs += 1; if (ji.includes(w)) fs -= 1; }
  s += Math.max(-2.5, Math.min(2.5, fs));
  s += Math.min(1.8, c.ind.filter((i) => xi.includes(IND_WX[i])).length * 0.6);
  s += c.dev * 0.6;
  const st = chart.dayMaster?.strength;
  if (st === '偏弱' && c.cost === 3) s -= 1;
  if (st === '偏旺' && c.dev === 3) s += 0.6;
  if (ctx.anchor && c.country === '中国' && (!ctx.anchor.country || ctx.anchor.country === '中国')) {
    const d = distKm(ctx.anchor, c);
    s += near(d);
    if (d < 40) s -= 0.8; // 就在身边的城市不必"推荐"
  }
  if (c.country !== '中国' && ctx.anchor?.country && ctx.anchor.country === c.country) s += 1.5;
  if (c.country !== '中国' && ctx.countries?.includes(c.country)) s += 3;
  for (const p of ctx.prefer || []) s += PREF[p]?.(c) || 0;
  return { s, relDir, dw, rel: dB > 150 ? 'birth' : dB >= 0 ? 'home' : 'abs' };
}

function describe(chart: Chart, c: CityInfo, relDir: Dir8, rel: string): Omit<CityPick, 'score'> {
  const xi = chart.xiYong || [], ji = chart.jiShen || [];
  const { gua, wx: dw } = GUA[relDir];
  const where = c.country !== '中国' ? `在中国的${relDir}方` : rel === 'birth' ? `在你出生地的${relDir}方` : rel === 'home' ? `就是你出生的地方，在国内属${relDir === '中' ? '中部' : `${relDir}方`}` : `在国内${relDir === '中' ? '居中' : `偏${relDir}`}`;
  const good = c.feat.filter((f) => xi.includes(FEAT[f].wx));
  const featTxt = good.length ? `${good.slice(0, 2).map((f) => FEAT[f].t).join('、')}，${[...new Set(good.map((f) => FEAT[f].wx))].join('')}气足` : '';
  let reason: string;
  if (xi.includes(dw)) reason = `${where}，${gua}位属${dw}，正合你喜用的${dw}${featTxt ? `；${featTxt}，再添一层助力` : ''}`;
  else if (featTxt) reason = `${where}，${gua}位属${dw}，方位平平；但${featTxt}，补你所喜的${[...new Set(good.map((f) => FEAT[f].wx))].join('、')}`;
  else reason = `${where}，${gua}位属${dw}；五行上不算最贴，胜在${c.dev === 3 ? '机会多、平台大' : '节奏稳、成本低'}`;
  const inds = c.ind.filter((i) => xi.includes(IND_WX[i]));
  const work = inds.length ? `${inds.slice(0, 3).join('、')}（属${[...new Set(inds.slice(0, 3).map((i) => IND_WX[i]))].join('、')}，合你喜用）`
    : `往${WX_IND[xi[0]]?.slice(0, 3).join('、') || '稳定行业'}这类属${xi[0]}的行当靠`;
  const badFeat = c.feat.filter((f) => ji.includes(FEAT[f].wx));
  const goodDir = (Object.keys(GUA) as Dir8[]).find((d) => d !== '中' && GUA[d].wx === xi[0]);
  let caution: string | undefined;
  if (ji.includes(dw)) caution = `方位属${dw}，是你所忌，宜住城中偏${goodDir || '东'}的片区，家里多用${WX_COLOR[xi[0]]}调`;
  else if (badFeat.length) caution = `${FEAT[badFeat[0]].t}，${FEAT[badFeat[0]].wx}气偏重，居家宜多用${WX_COLOR[xi[0]]}调来调和`;
  else if (chart.dayMaster?.strength === '偏弱' && c.cost === 3) caution = '节奏快、开销大，日主偏弱的人宜稳扎稳打，别一上来硬拼';
  else if (c.feat.includes('寒') && xi.includes('火')) caution = '冬季偏冷，你喜火，多晒太阳、多动';
  return {
    name: c.name, country: c.country, prov: c.prov, dir: relDir, gua, dirWx: dw, reason, work, ...(caution ? { caution } : {}), ...(c.value ? { value: c.value } : {}),
    tags: [c.country === '中国' ? c.prov : c.country, `${relDir}方·${dw}`].filter((t, i, a) => a.indexOf(t) === i && !(c.country === '中国' && t === c.name)),
  };
}

/** 单个城市对命盘的契合度（纯函数） */
export function scoreCityAgainstChart(chart: Chart, city: CityInfo, ctx: CityContext = {}): CityPick {
  const birth = placeCoord(chart.input?.city);
  const r = scoreOne(chart, city, ctx, birth);
  return { ...describe(chart, city, r.relDir, r.rel), score: +r.s.toFixed(2) };
}

/** 排序并挑选：国内默认 4 个（不同省）；海外模式 3 个海外（不同国家）+ 2 个国内 */
export function recommendCities(chart: Chart, ctx: CityContext = {}, n?: { cn?: number; abroad?: number }) {
  const ex = new Set(ctx.exclude || []);
  const ranked = CITY_CATALOG.filter((c) => !ex.has(c.name)).map((c) => ({ c, p: scoreCityAgainstChart(chart, c, ctx) })).sort((a, b) => b.p.score - a.p.score);
  const take = (list: typeof ranked, k: number, key: (c: CityInfo) => string) => {
    const out: typeof ranked = [], seen = new Set<string>();
    for (const x of list) { if (out.length >= k) break; if (seen.has(key(x.c))) continue; seen.add(key(x.c)); out.push(x); }
    return out;
  };
  const nCn = n?.cn ?? (ctx.abroad ? 2 : 4), nAb = ctx.abroad ? n?.abroad ?? 3 : 0;
  const ab = take(ranked.filter((x) => x.c.country !== '中国'), nAb, (c) => c.country);
  const cn = take(ranked.filter((x) => x.c.country === '中国'), nCn, (c) => c.prov);
  return { abroad: !!ctx.abroad, cities: [...ab, ...cn].map((x) => x.p), all: ranked.map((x) => x.p) };
}

/** 命盘摘要（卡片抬头） */
export function cityChartBrief(chart: Chart) {
  return `日主${chart.dayMaster.gan}${chart.dayMaster.wuXing}·${chart.dayMaster.strength} · 喜${(chart.xiYong || []).join('')}${chart.jiShen?.length ? ` · 忌${chart.jiShen.join('')}` : ''}`;
}

/** 未来几年里利于迁动的年份（喜用流年 / 驿马年），用于提示"什么时候动" */
export function moveYears(chart: Chart, k = 2) {
  const fut = [...(chart.liuNian || []), ...(chart.extraLiuNian || [])].filter((y) => !y.past).sort((a, b) => a.year - b.year).slice(0, 6);
  const good = fut.filter((y) => y.favorable > 0 || y.col?.shenSha?.includes('驿马'));
  return good.slice(0, k).map((y) => ({ year: y.year, ganZhi: y.ganZhi, yiMa: !!y.col?.shenSha?.includes('驿马'), favorable: y.favorable > 0 }));
}
