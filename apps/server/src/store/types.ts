// 存储接口：当前实现 PostgreSQL（pg.ts）与内存（memory.ts，仅开发/测试）。以后换 MySQL 只需实现同一接口。
export interface User { id: string; kind: string; phone?: string | null; wechatOpenid?: string | null; createdAt: string; lastSeenAt: string; meta?: any }
export interface StoredMessage { id?: number; role: 'user' | 'assistant' | 'system'; content: string; meta?: any; tokens: number; createdAt?: string }
export interface ConvSummary { text: string; lastId: number; tokens: number; updatedAt: string }
export interface Memory { facts: any; longTerm: string; convSummaries: Record<string, ConvSummary>; tokens: number }
export interface ProfileRow { id: string; data: any; chart: any; label: string; cid: string | null; version: number; updatedAt: string; createdAt?: string }
export interface Store {
  driver: string;
  init(): Promise<void>;
  close(): Promise<void>;
  ensureUser(id: string): Promise<User>;
  getUser(id: string): Promise<User | null>;
  listUsers(limit: number, offset: number): Promise<{ total: number; users: (User & { messages: number; profiles: number })[] }>;
  deleteUser(id: string): Promise<void>;
  findUserByWechat(openid: string): Promise<User | null>;
  linkWechat(id: string, openid: string, unionid?: string): Promise<void>;
  /** 旧接口：按生辰去重写入（旧版聊天确认流程） */
  saveProfile(uid: string, birthKey: string, data: any, chart: any): Promise<string>;
  /** 新建命主档案（同一用户可有多位命主；label 区分"我/老公/妈妈…"），同时写入版本 1 */
  createProfile(uid: string, p: { birthKey: string; data: any; chart: any; label: string; cid: string | null }): Promise<ProfileRow>;
  /** 同一用户下生辰与称呼都相同的档案（避免重复点确认产生重复档案） */
  findProfile(uid: string, birthKey: string, label: string): Promise<ProfileRow | null>;
  getProfiles(uid: string): Promise<ProfileRow[]>;
  getProfile(uid: string, id: string): Promise<ProfileRow | null>;
  /** 更正生辰：覆盖当前数据并追加一个历史版本（旧版本保留用于对比） */
  updateProfile(uid: string, id: string, birthKey: string, data: any, chart: any): Promise<string>;
  renameProfile(uid: string, id: string, label: string, name?: string): Promise<void>;
  deleteProfile(uid: string, id: string): Promise<void>;
  bindConversation(uid: string, id: string, cid: string): Promise<void>;
  getVersions(uid: string, id: string): Promise<{ version: number; data: any; chart: any; createdAt: string }[]>;
  conversationProfile(uid: string, cid: string): Promise<string | null>;
  ensureConversation(uid: string, cid: string, profileId?: string | null): Promise<void>;
  deleteConversation(uid: string, cid: string): Promise<void>;
  hasConversation(uid: string, cid: string): Promise<boolean>;
  appendMessages(uid: string, cid: string, msgs: StoredMessage[]): Promise<void>;
  getMessages(uid: string, cid: string, afterId?: number): Promise<StoredMessage[]>;
  listConversations(uid: string): Promise<{ id: string; updatedAt: string; tokens: number; messages: number }[]>;
  deleteMessages(uid: string, cid: string, uptoId: number): Promise<number>;
  rawTokens(uid: string): Promise<number>;
  getMemory(uid: string): Promise<Memory>;
  saveMemory(uid: string, m: Memory): Promise<void>;
  exportUser(uid: string): Promise<any>;
}
