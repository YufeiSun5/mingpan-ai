import { Pool } from 'pg';
import type { Memory, Store, StoredMessage, User } from './types';

const MIGRATIONS: string[] = [
  `create table if not exists users (
     id text primary key, kind text not null default 'anon', phone text unique, wechat_openid text unique, wechat_unionid text,
     meta jsonb not null default '{}', created_at timestamptz not null default now(), last_seen_at timestamptz not null default now());
   create table if not exists profiles (
     id text primary key, user_id text not null references users(id) on delete cascade, birth_key text not null,
     data jsonb not null, chart jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
     unique (user_id, birth_key));
   create table if not exists conversations (
     user_id text not null references users(id) on delete cascade, id text not null, title text,
     created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key (user_id, id));
   create table if not exists messages (
     id bigserial primary key, user_id text not null, conversation_id text not null, role text not null, content text not null,
     meta jsonb, tokens int not null default 0, created_at timestamptz not null default now(),
     foreign key (user_id, conversation_id) references conversations(user_id, id) on delete cascade);
   create index if not exists messages_conv_idx on messages (user_id, conversation_id, id);
   create table if not exists memory (
     user_id text primary key references users(id) on delete cascade, facts jsonb not null default '{}', long_term text not null default '',
     conv_summaries jsonb not null default '{}', tokens int not null default 0, updated_at timestamptz not null default now());`,
];

const u = (r: any): User => r && ({ id: r.id, kind: r.kind, phone: r.phone, wechatOpenid: r.wechat_openid, createdAt: r.created_at?.toISOString?.() ?? r.created_at, lastSeenAt: r.last_seen_at?.toISOString?.() ?? r.last_seen_at, meta: r.meta });

export function createPgStore(url: string): Store {
  const pool = new Pool({ connectionString: url, max: +(process.env.PG_POOL_MAX || 5), idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
  pool.on('error', (e) => console.error('[pg] pool error', e.message));
  const q = (sql: string, params: any[] = []) => pool.query(sql, params);
  return {
    driver: 'postgres',
    async init() {
      await q('create table if not exists schema_migrations (version int primary key, applied_at timestamptz not null default now())');
      const done = new Set((await q('select version from schema_migrations')).rows.map((r) => r.version));
      for (let i = 0; i < MIGRATIONS.length; i++) {
        if (done.has(i + 1)) continue;
        const c = await pool.connect();
        try { await c.query('begin'); await c.query(MIGRATIONS[i]); await c.query('insert into schema_migrations(version) values ($1)', [i + 1]); await c.query('commit'); console.log(`[pg] migration ${i + 1} applied`); }
        catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
      }
    },
    close: () => pool.end(),
    async ensureUser(id) {
      return u((await q(`insert into users(id) values ($1) on conflict (id) do update set last_seen_at = now() returning *`, [id])).rows[0]);
    },
    async getUser(id) { return u((await q('select * from users where id=$1', [id])).rows[0]) || null; },
    async listUsers(limit, offset) {
      const total = +(await q('select count(*) from users')).rows[0].count;
      const rows = (await q(`select u.*, (select count(*) from messages m where m.user_id=u.id)::int as messages, (select count(*) from profiles p where p.user_id=u.id)::int as profiles
        from users u order by last_seen_at desc limit $1 offset $2`, [limit, offset])).rows;
      return { total, users: rows.map((r) => ({ ...u(r), messages: r.messages, profiles: r.profiles })) };
    },
    async deleteUser(id) { await q('delete from users where id=$1', [id]); },
    async findUserByWechat(openid) { return u((await q('select * from users where wechat_openid=$1', [openid])).rows[0]) || null; },
    async linkWechat(id, openid, unionid) { await q(`update users set wechat_openid=$2, wechat_unionid=$3, kind='wechat' where id=$1`, [id, openid, unionid || null]); },
    async saveProfile(uid, birthKey, data, chart) {
      const id = (await q(`insert into profiles(id, user_id, birth_key, data, chart) values (md5(random()::text || clock_timestamp()::text), $1, $2, $3, $4)
        on conflict (user_id, birth_key) do update set data=excluded.data, chart=excluded.chart, updated_at=now() returning id`, [uid, birthKey, data, chart])).rows[0].id;
      return id;
    },
    async getProfiles(uid) { return (await q('select id, data, updated_at from profiles where user_id=$1 order by updated_at desc', [uid])).rows.map((r) => ({ id: r.id, data: r.data, updatedAt: r.updated_at.toISOString() })); },
    async getProfile(uid, id) { const r = (await q('select id, data, chart from profiles where user_id=$1 and id=$2', [uid, id])).rows[0]; return r || null; },
    async updateProfile(uid, id, birthKey, data, chart) {
      // 改成与已有档案相同的生辰：直接合并到那份档案，删掉当前这份
      const dup = (await q('select id from profiles where user_id=$1 and birth_key=$2 and id<>$3', [uid, birthKey, id])).rows[0];
      if (dup) { await q('delete from profiles where user_id=$1 and id=$2', [uid, id]); await q('update profiles set data=$3, chart=$4, updated_at=now() where user_id=$1 and id=$2', [uid, dup.id, data, chart]); return dup.id; }
      await q('update profiles set birth_key=$3, data=$4, chart=$5, updated_at=now() where user_id=$1 and id=$2', [uid, id, birthKey, data, chart]);
      return id;
    },
    async ensureConversation(uid, cid) { await q(`insert into conversations(user_id, id) values ($1,$2) on conflict (user_id, id) do update set updated_at=now()`, [uid, cid]); },
    async hasConversation(uid, cid) { return (await q('select 1 from conversations where user_id=$1 and id=$2', [uid, cid])).rowCount > 0; },
    async appendMessages(uid, cid, msgs) {
      if (!msgs.length) return;
      const c = await pool.connect();
      try {
        await c.query('begin');
        await c.query(`insert into conversations(user_id, id) values ($1,$2) on conflict (user_id, id) do update set updated_at=now()`, [uid, cid]);
        for (const m of msgs) await c.query('insert into messages(user_id, conversation_id, role, content, meta, tokens) values ($1,$2,$3,$4,$5,$6)', [uid, cid, m.role, m.content, m.meta ?? null, m.tokens]);
        await c.query('commit');
      } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
    },
    async getMessages(uid, cid, afterId = 0) {
      return (await q('select id, role, content, meta, tokens, created_at from messages where user_id=$1 and conversation_id=$2 and id>$3 order by id', [uid, cid, afterId]))
        .rows.map((r) => ({ id: +r.id, role: r.role, content: r.content, meta: r.meta, tokens: r.tokens, createdAt: r.created_at.toISOString() } as StoredMessage));
    },
    async listConversations(uid) {
      return (await q(`select c.id, c.updated_at, coalesce(sum(m.tokens),0)::int as tokens, count(m.id)::int as messages from conversations c
        left join messages m on m.user_id=c.user_id and m.conversation_id=c.id where c.user_id=$1 group by c.id, c.updated_at order by c.updated_at`, [uid]))
        .rows.map((r) => ({ id: r.id, updatedAt: r.updated_at.toISOString(), tokens: r.tokens, messages: r.messages }));
    },
    async deleteMessages(uid, cid, uptoId) { return (await q('delete from messages where user_id=$1 and conversation_id=$2 and id<=$3', [uid, cid, uptoId])).rowCount; },
    async rawTokens(uid) { return +(await q('select coalesce(sum(tokens),0)::int as t from messages where user_id=$1', [uid])).rows[0].t; },
    async getMemory(uid) {
      const r = (await q('select * from memory where user_id=$1', [uid])).rows[0];
      return r ? { facts: r.facts || {}, longTerm: r.long_term || '', convSummaries: r.conv_summaries || {}, tokens: r.tokens } : { facts: {}, longTerm: '', convSummaries: {}, tokens: 0 };
    },
    async saveMemory(uid, m: Memory) {
      await q(`insert into memory(user_id, facts, long_term, conv_summaries, tokens, updated_at) values ($1,$2,$3,$4,$5,now())
        on conflict (user_id) do update set facts=excluded.facts, long_term=excluded.long_term, conv_summaries=excluded.conv_summaries, tokens=excluded.tokens, updated_at=now()`,
      [uid, m.facts, m.longTerm, m.convSummaries, m.tokens]);
    },
    async exportUser(uid) {
      const user = await this.getUser(uid); if (!user) return null;
      const profiles = (await q('select id, data, chart, created_at, updated_at from profiles where user_id=$1', [uid])).rows;
      const convs = await this.listConversations(uid);
      const conversations: Record<string, StoredMessage[]> = {};
      for (const c of convs) conversations[c.id] = await this.getMessages(uid, c.id);
      return { user, profiles, memory: await this.getMemory(uid), conversations };
    },
  };
}
