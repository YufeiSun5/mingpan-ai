// 跨平台共享类型（Web / 小程序 / 服务端）
export type Gender = '男' | '女';
export type Wx = '木' | '火' | '土' | '金' | '水';
export interface BirthTime { type: 'exact' | 'shichen' | 'unknown'; hour?: number; minute?: number; shichen?: string }
export interface Profile {
  name?: string; gender?: Gender; calendar?: 'solar' | 'lunar'; year?: number; month?: number; day?: number; leap?: boolean;
  time?: BirthTime; city?: string; topics?: string[]; question?: string; awaitingConfirm?: boolean;
}
export interface Pillar {
  label: string; gan: string; zhi: string; ganWx: Wx; zhiWx: Wx; shiShenGan: string; shiShenZhi: string[];
  hideGan: string[]; naYin: string; diShi?: string; unknown?: boolean;
}
export interface LiuNian { year: number; ganZhi: string; age: number; past: boolean; current: boolean; shiShen: string; ganWx: Wx; zhiWx: Wx; daYun: string; relations: string[]; favorable: number }
export interface DaYun { ganZhi: string; startYear: number; endYear: number; startAge: number; endAge: number; shiShen: string }
export interface ProPillar { label: string; zhuXing: string; hide: { gan: string; wx: Wx; ss: string }[]; xingYun: string; ziZuo: string; kongWang: string; naYin: string; shenSha: string[] }
export interface ProChart {
  pillars: ProPillar[]; relations: { gan: string[]; zhi: string[] };
  wuXing: { wx: Wx; power: number; pct: number; state: string }[]; monthLing: string;
  strength: { label: string; score: number }; geJu: { name: string; note: string };
  wushen: Record<string, string | null>; palaces: { k: string; v: string; ny: string }[];
  qiYun: string; jiaoYun: string; dayKong: string;
}
export interface Chart {
  input: { name: string; gender: Gender; calendar: string; clockTime: string; timeUnknown: boolean; city: string };
  trueSolar: { city: string; time: string } | null; solar: string; lunar: string; shengXiao: string; xingZuo: string;
  pillars: Pillar[]; dayMaster: { gan: string; wuXing: Wx; yinYang: string; strength: string; ratio: number };
  wuXingCount: Record<Wx, number>; wuXingPower: Record<Wx, number>; missing: Wx[]; xiYong: Wx[]; jiShen: Wx[];
  luck: { wuXing: Wx; colors: string[]; direction: string; numbers: number[]; items: string }[];
  yun: { startYear: number; startMonth: number; startDay: number; startDate: string; forward: boolean };
  daYun: DaYun[]; liuNian: LiuNian[]; extraLiuNian: LiuNian[]; nowYear: number; taiYuan: string; mingGong: string;
  pro: ProChart;
}
export interface ScoreDim { k: string; score: number; base: number; reason: string }
export interface ScoreCard { health: number; level: 'good' | 'mid' | 'low'; verdict: 'ok' | 'caution' | 'no'; note: string; period: string; dims: ScoreDim[]; flags: string[] }
export interface LlmMessage { role: 'user' | 'assistant'; content: string }

/** 服务端推送的事件（SSE / JSON 回放 / 轮询 共用） */
export type ChatEvent =
  | ['text', { text: string }] | ['delta', { text: string }] | ['bubble', Record<string, never>]
  | ['chart', { chart: Chart }] | ['score', { score: ScoreCard }] | ['pending', { pending: Profile }]
  | ['profile', { profile: Profile }] | ['quick', { replies: string[] }] | ['error', { error: string }]
  | ['crisis', Record<string, never>] | ['ping', Record<string, never>] | ['done', { source?: string }];
export type ChatEventName = ChatEvent[0];

export interface ChatRequest { cid?: string; messages: LlmMessage[]; pending: Profile | null; profile: Profile | null; action?: 'confirm'; nowYear?: number }

export type ChatItem =
  | { type: 'user'; text: string } | { type: 'bot'; text: string }
  | { type: 'chart'; chart: Chart } | { type: 'score'; score: ScoreCard };
