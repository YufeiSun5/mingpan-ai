import type { Store } from './types';
import { createPgStore } from './pg';
import { createMemoryStore } from './memory';
export type { Store, Memory, StoredMessage, User, ConvSummary } from './types';
let store: Store | null = null;
/** STORE_DRIVER: postgres（默认，需 DATABASE_URL）| memory（开发/测试） */
export function getStore(): Store {
  if (store) return store;
  const driver = process.env.STORE_DRIVER || (process.env.DATABASE_URL ? 'postgres' : 'memory');
  store = driver === 'postgres' ? createPgStore(process.env.DATABASE_URL!) : createMemoryStore();
  return store;
}
