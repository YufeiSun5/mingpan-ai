import { Pool } from 'pg';
import type { Memory, ProfileRow, Store, StoredMessage, User } from './types';

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
  // 2：多命主（label / 绑定对话 / 版本号），对话归属命主，生辰历史版本
  `alter table profiles drop constraint if exists profiles_user_id_birth_key_key;
   create index if not exists profiles_user_key_idx on profiles (user_id, birth_key);
   alter table profiles add column if not exists label text not null default '';
   alter table profiles add column if not exists conversation_id text;
   alter table profiles add column if not exists version int not null default 1;
   alter table conversations add column if not exists profile_id text;
   create table if not exists profile_versions (
     id bigserial primary key, profile_id text not null references profiles(id) on delete cascade, user_id text not null,
     version int not null, data jsonb not null, chart jsonb, created_at timestamptz not null default now(), unique (profile_id, version));
   update profiles set label='我' where label='';
   insert into profile_versions (profile_id, user_id, version, data, chart) select id, user_id, 1, data, chart from profiles on conflict do nothing;`,
];

const row = (r: any): ProfileRow | null => r ? { id: r.id, data: r.data, chart: r.chart, label: r.label || r.data?.label || '', cid: r.conversation_id || null, version: r.version || 1, updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at, createdAt: r.created_at?.toISOString?.() ?? r.created_at } : null;
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
      const ex = (await q('select id from profiles where user_id=$1 and birth_key=$2 order by updated_at desc limit 1', [uid, birthKey])).rows[0];
      if (ex) { await q('update profiles set data=$3, chart=$4, updated_at=now() where user_id=$1 and id=$2', [uid, ex.id, data, chart]); return ex.id; }
      return (await this.createProfile(uid, { birthKey, data, chart, label: data?.label || '', cid: null })).id;
    },
    async createProfile(uid, p) {
      const c = await pool.connect();
      try {
        await c.query('begin');
        const r = (await c.query(`insert into profiles(id, user_id, birth_key, data, chart, label, conversation_id) values (md5(random()::text || clock_timestamp()::text), $1, $2, $3, $4, $5, $6) returning *`, [uid, p.birthKey, p.data, p.chart, p.label, p.cid])).rows[0];
        await c.query('insert into profile_versions(profile_id, user_id, version, data, chart) values ($1,$2,1,$3,$4)', [r.id, uid, p.data, p.chart]);
        if (p.cid) await c.query(`insert into conversations(user_id, id, profile_id) values ($1,$2,$3) on conflict (user_id, id) do update set profile_id=excluded.profile_id, updated_at=now()`, [uid, p.cid, r.id]);
        await c.query('commit');
        return row(r);
      } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
    },
    async findProfile(uid, birthKey, label) { return row((await q('select * from profiles where user_id=$1 and birth_key=$2 and label=$3 order by updated_at desc limit 1', [uid, birthKey, label])).rows[0]); },
    async getProfiles(uid) { return (await q('select * from profiles where user_id=$1 order by created_at', [uid])).rows.map(row); },
    async getProfile(uid, id) { return row((await q('select * from profiles where user_id=$1 and id=$2', [uid, id])).rows[0]); },
    async updateProfile(uid, id, birthKey, data, chart) {
      const c = await pool.connect();
      try {
        await c.query('begin');
        const v = (await c.query('update profiles set birth_key=$3, data=$4, chart=$5, version=version+1, updated_at=now() where user_id=$1 and id=$2 returning version', [uid, id, birthKey, data, chart])).rows[0]?.version;
        if (v) await c.query('insert into profile_versions(profile_id, user_id, version, data, chart) values ($1,$2,$3,$4,$5) on conflict do nothing', [id, uid, v, data, chart]);
        await c.query('commit');
      } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
      return id;
    },
    async renameProfile(uid, id, label, name) {
      await q(`update profiles set label=$3, data = case when $4::text is null then data else jsonb_set(data, '{name}', to_jsonb($4::text)) end, updated_at=now() where user_id=$1 and id=$2`, [uid, id, label, name ?? null]);
    },
    async deleteProfile(uid, id) {
      const p = await this.getProfile(uid, id); if (!p) return;
      await q('delete from conversations where user_id=$1 and (profile_id=$2 or id=$3)', [uid, id, p.cid || '']);
      await q('delete from profiles where user_id=$1 and id=$2', [uid, id]);
    },
    async bindConversation(uid, id, cid) {
      await q('update profiles set conversation_id=$3 where user_id=$1 and id=$2', [uid, id, cid]);
      await q(`insert into conversations(user_id, id, profile_id) values ($1,$2,$3) on conflict (user_id, id) do update set profile_id=excluded.profile_id`, [uid, cid, id]);
    },
    async getVersions(uid, id) { return (await q('select version, data, chart, created_at from profile_versions where user_id=$1 and profile_id=$2 order by version', [uid, id])).rows.map((r) => ({ version: r.version, data: r.data, chart: r.chart, createdAt: r.created_at.toISOString() })); },
    async conversationProfile(uid, cid) { return (await q('select profile_id from conversations where user_id=$1 and id=$2', [uid, cid])).rows[0]?.profile_id || null; },
    async ensureConversation(uid, cid, profileId = null) { await q(`insert into conversations(user_id, id, profile_id) values ($1,$2,$3) on conflict (user_id, id) do update set updated_at=now(), profile_id=coalesce(excluded.profile_id, conversations.profile_id)`, [uid, cid, profileId]); },
    async deleteConversation(uid, cid) { await q('delete from conversations where user_id=$1 and id=$2', [uid, cid]); },
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
      const profiles = (await q('select id, label, data, chart, version, conversation_id, created_at, updated_at from profiles where user_id=$1', [uid])).rows;
      const versions = (await q('select profile_id, version, data, created_at from profile_versions where user_id=$1 order by profile_id, version', [uid])).rows;
      const convs = await this.listConversations(uid);
      const conversations: Record<string, StoredMessage[]> = {};
      for (const c of convs) conversations[c.id] = await this.getMessages(uid, c.id);
      return { user, profiles, profileVersions: versions, memory: await this.getMemory(uid), conversations };
    },
  };
}
