// 存储接口：当前实现 PostgreSQL（pg.ts）与内存（memory.ts，仅开发/测试）。以后换 MySQL 只需实现同一接口。
export interface User { id: string; kind: string; phone?: string | null; wechatOpenid?: string | null; createdAt: string; lastSeenAt: string; meta?: any }
export interface StoredMessage { id?: number; role: 'user' | 'assistant' | 'system'; content: string; meta?: any; tokens: number; createdAt?: string }
export interface ConvSummary { text: string; lastId: number; tokens: number; updatedAt: string }
export interface Memory { facts: any; longTerm: string; convSummaries: Record<string, ConvSummary>; tokens: number }
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
  saveProfile(uid: string, birthKey: string, data: any, chart: any): Promise<string>;
  getProfiles(uid: string): Promise<{ id: string; data: any; updatedAt: string }[]>;
  getProfile(uid: string, id: string): Promise<{ id: string; data: any; chart: any } | null>;
  updateProfile(uid: string, id: string, birthKey: string, data: any, chart: any): Promise<string>;
  ensureConversation(uid: string, cid: string): Promise<void>;
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
