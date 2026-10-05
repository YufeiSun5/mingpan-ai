// 跨平台共享类型（Web / 小程序 / 服务端）
export type Gender = '男' | '女';
export type Wx = '木' | '火' | '土' | '金' | '水';
export interface BirthTime { type: 'exact' | 'shichen' | 'unknown'; hour?: number; minute?: number; shichen?: string }
export interface Profile {
  name?: string; gender?: Gender; calendar?: 'solar' | 'lunar'; year?: number; month?: number; day?: number; leap?: boolean;
  time?: BirthTime; city?: string; topics?: string[]; question?: string; awaitingConfirm?: boolean; id?: string;
  /** 命主与客户的关系 / 称呼：我、老公、妈妈、朋友、名字… */
  label?: string;
  /** 正在为另一个人建档（确认后单独建档、单独对话） */
  newPerson?: boolean;
  /** 更正已有档案：id＝档案 id；changed＝{字段: 原来的显示文本}，卡片据此高亮并显示"原：3号" */
  correction?: { id: string; changed: Partial<Record<'gender' | 'calendar' | 'date' | 'time' | 'city' | 'label', string>> };
}
/** 命主列表项（GET /api/v1/profiles） */
export interface ProfileSummary { id: string; label: string; name: string; data: Profile; cid: string | null; version: number; bazi: string; updatedAt: string }
/** 合盘摘要卡片（程序计算的两人关系） */
export interface CompatCard { a: { label: string; bazi: string }; b: { label: string; bazi: string }; good: string[]; bad: string[] }
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
/** 仅服务端内部使用（日志 / 数据库 / 管理端），不会下发给客户端 */
export interface ScoreCard { health: number; level: 'good' | 'mid' | 'low'; verdict: 'ok' | 'caution' | 'no'; note: string; period: string; dims: ScoreDim[]; flags: string[] }
export interface LlmMessage { role: 'user' | 'assistant'; content: string }

/** 服务端推送的事件（SSE / JSON 回放 / 轮询 共用） */
export type ChatEvent =
  | ['text', { text: string }] | ['delta', { text: string }] | ['bubble', Record<string, never>]
  | ['chart', { chart: Chart }] | ['pending', { pending: Profile | null }]
  | ['switch', { profileId: string; label: string }] | ['compat', CompatCard]
  | ['profile', { profile: Profile }] | ['quick', { replies: string[] }] | ['error', { error: string }]
  | ['crisis', Record<string, never>] | ['ping', Record<string, never>] | ['done', { source?: string }];
export type ChatEventName = ChatEvent[0];

export interface ChatRequest { cid?: string; profileId?: string; messages: LlmMessage[]; pending: Profile | null; profile: Profile | null; action?: 'confirm'; nowYear?: number; ui?: 'card' | 'text' }

export type ChatItem =
  | { type: 'user'; text: string } | { type: 'bot'; text: string }
  /** stale：生辰更正前的旧盘（保留用于对比） */
  | { type: 'chart'; chart: Chart; stale?: boolean }
  /** 生辰确认卡片：editing＝待确认（可编辑），confirmed＝已确认（折叠为摘要），moved＝已为另一位命主单独建档；stale＝已被更正 */
  | { type: 'confirm'; profile: Profile; status: 'editing' | 'confirmed' | 'moved'; id?: string; correction?: Profile['correction']; stale?: boolean; cid?: string }
  /** 建议切换到已有命主 */
  | { type: 'switch'; profileId: string; label: string }
  | { type: 'compat'; card: CompatCard };
