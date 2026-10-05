// 生辰确认卡片（纯展示 + 本地表单状态）：待确认时可就地修改，点「开始排盘」交给上层调用 /api/v1/profiles。
import { useEffect, useState } from 'react';
import type { Profile, BirthTime } from '@mingpan/core';

const CN_M = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const CN_D = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
const SHICHEN: [string, string][] = [['子', '23–1点'], ['丑', '1–3点'], ['寅', '3–5点'], ['卯', '5–7点'], ['辰', '7–9点'], ['巳', '9–11点'], ['午', '11–13点'], ['未', '13–15点'], ['申', '15–17点'], ['酉', '17–19点'], ['戌', '19–21点'], ['亥', '21–23点']];
const pad = (n?: number) => String(n ?? 0).padStart(2, '0');

export const dateText = (p: Profile) => p.calendar === 'lunar'
  ? `农历 ${p.year}年${p.leap ? '闰' : ''}${CN_M[(p.month || 1) - 1]}月${CN_D[(p.day || 1) - 1] || ''}`
  : `公历 ${p.year}年${p.month}月${p.day}日`;
export const timeText = (t?: BirthTime) => !t || t.type === 'unknown' ? '时辰不详' : t.type === 'shichen' ? `${t.shichen}时` : `${pad(t.hour)}:${pad(t.minute)}`;

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg" role="radiogroup">{options.map(([v, l]) => <button type="button" role="radio" aria-checked={value === v} key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

const LABELS = ['我', '老公', '老婆', '男朋友', '女朋友', '妈妈', '爸爸', '孩子', '朋友'];
type Changed = NonNullable<Profile['correction']>['changed'];
interface Props {
  profile: Profile; status: 'editing' | 'confirmed' | 'moved'; busy: boolean; locked: boolean; stale?: boolean;
  correction?: Profile['correction']; onConfirm: (p: Profile) => Promise<string | null>; onSwitch?: () => void;
}
const labelText = (l?: string) => (!l || l === '我' ? '我（本人）' : l);
/** 有变化的字段：卡片行高亮 + "原：3号" */
const Was = ({ k, ch }: { k: keyof Changed; ch?: Changed }) => (ch?.[k] ? <small className="was">原：{ch[k]}</small> : null);
const chg = (ch: Changed | undefined, ...ks: (keyof Changed)[]) => (ch && ks.some((k) => ch[k]) ? 'chg' : undefined);

export function ConfirmCard({ profile, status, busy, locked, stale, correction, onConfirm, onSwitch }: Props) {
  const [edit, setEdit] = useState(false);
  const [d, setD] = useState<Profile>(profile);
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => { if (!edit) setD(profile); }, [profile, edit]);
  const set = (patch: Partial<Profile>) => { setErr(''); setD((x) => ({ ...x, ...patch })); };
  const t: BirthTime = d.time || { type: 'unknown' };

  const submit = async () => {
    if (!d.label?.trim()) return setErr('请填一下这是谁的盘（比如 老公、妈妈、朋友）');
    if (!d.gender) return setErr('请选择性别');
    if (!d.year || d.year < 1900 || d.year > 2100) return setErr('年份需要在 1900–2100 之间');
    if (!d.month || d.month < 1 || d.month > 12) return setErr('月份不对');
    if (!d.day || d.day < 1 || d.day > (d.calendar === 'lunar' ? 30 : 31)) return setErr('日期不对');
    setSending(true);
    const e = await onConfirm({ ...d, label: d.label?.trim(), calendar: d.calendar || 'solar', time: t, leap: d.calendar === 'lunar' ? !!d.leap : false, awaitingConfirm: undefined, correction: undefined, newPerson: undefined });
    setSending(false);
    if (e) setErr(e); else setEdit(false);
  };

  const ch = correction?.changed;
  const primary = correction ? '按这个重排' : '开始排盘';
  if (status === 'moved') {
    return (
      <div className="cf done moved">
        <span className="ok" aria-hidden="true">✓</span>
        <span className="cf-line"><b>已为「{profile.label}」单独建档</b>{profile.gender} · {dateText(profile)}</span>
        {onSwitch && <button type="button" className="link" disabled={busy} onClick={onSwitch}>去看看 →</button>}
      </div>
    );
  }
  if (status === 'confirmed' && !edit) {
    return (
      <div className={`cf done${stale ? ' stale' : ''}`}>
        <span className="ok" aria-hidden="true">{stale ? '↺' : '✓'}</span>
        <span className="cf-line"><b>{stale ? '已更正' : correction ? '已重排' : '已确认'}</b>{profile.label && profile.label !== '我' ? `${profile.label} · ` : ''}{profile.gender} · {dateText(profile)} · {timeText(profile.time)}{profile.city ? ` · ${profile.city}` : ''}</span>
        {!locked && !stale && <button type="button" className="link" disabled={busy} onClick={() => setEdit(true)}>修改</button>}
      </div>
    );
  }

  if (!edit) {
    return (
      <div className={`cf${correction ? ' corr' : ''}`}>
        <div className="cf-h">{correction ? '更正生辰' : profile.newPerson || (profile.label && profile.label !== '我') ? `为「${profile.label || '新命主'}」排盘` : '核对生辰'}<span>{correction ? '改动已标出' : '确认后开始排盘'}</span></div>
        <dl className="cf-kv">
          <dt>命主</dt><dd className={!profile.label ? 'chg' : undefined}>{profile.label ? labelText(profile.label) : <em>未填，点「修改」填一下是谁</em>}</dd>
          <dt>性别</dt><dd className={chg(ch, 'gender')}>{profile.gender}<Was k="gender" ch={ch} /></dd>
          <dt>生日</dt><dd className={chg(ch, 'date', 'calendar')}>{dateText(profile)}<Was k="date" ch={ch} />{ch?.calendar && <small className="was">原：{ch.calendar}</small>}</dd>
          <dt>时间</dt><dd className={chg(ch, 'time')}>{timeText(profile.time)}<Was k="time" ch={ch} /></dd>
          <dt>出生地</dt><dd className={chg(ch, 'city')}>{profile.city || <em>未填（不做真太阳时校正）</em>}<Was k="city" ch={ch} /></dd>
          {!!profile.topics?.length && !correction && <><dt>想问</dt><dd>{profile.topics.join('、')}</dd></>}
        </dl>
        {err && <p className="cf-err">{err}</p>}
        <div className="cf-act">
          <button type="button" className="primary" disabled={busy || sending} onClick={submit}>{sending ? '排盘中…' : primary}</button>
          <button type="button" className="ghost" disabled={busy || sending} onClick={() => setEdit(true)}>修改</button>
        </div>
      </div>
    );
  }

  return (
    <form className="cf edit" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="cf-h">{status === 'confirmed' || correction ? '修改生辰' : '核对生辰'}<span>改好后直接排盘</span></div>
      <div className="cf-f"><label>命主</label>
        <div className="cf-in col">
          <input className="city" aria-label="命主称呼" placeholder="这是谁的盘：我 / 老公 / 妈妈 / 朋友…" maxLength={8} value={d.label || ''} disabled={status === 'confirmed' && !!profile.id} onChange={(e) => set({ label: e.target.value })} />
          {!(status === 'confirmed' && profile.id) && <div className="chips">{LABELS.map((l) => <button type="button" key={l} className={d.label === l ? 'on' : ''} onClick={() => set({ label: l })}>{l}</button>)}</div>}
        </div>
      </div>
      <div className={`cf-f ${chg(ch, 'gender') || ''}`}><label>性别</label><Seg value={(d.gender || '') as any} options={[['女', '女'], ['男', '男']]} onChange={(v) => set({ gender: v as any })} /></div>
      <div className="cf-f"><label>历法</label>
        <div className="cf-in">
          <Seg value={(d.calendar || 'solar') as 'solar' | 'lunar'} options={[['solar', '公历'], ['lunar', '农历']]} onChange={(v) => set({ calendar: v, leap: v === 'lunar' ? d.leap : false })} />
          {d.calendar === 'lunar' && <label className="chk"><input type="checkbox" checked={!!d.leap} onChange={(e) => set({ leap: e.target.checked })} />闰月</label>}
        </div>
      </div>
      <div className={`cf-f ${chg(ch, 'date') || ''}`}><label>日期</label>
        <div className="cf-in date">
          <input aria-label="年" inputMode="numeric" value={d.year ?? ''} onChange={(e) => set({ year: +e.target.value.replace(/\D/g, '').slice(0, 4) || undefined })} /><span>年</span>
          {d.calendar === 'lunar'
            ? <select aria-label="月" value={d.month ?? ''} onChange={(e) => set({ month: +e.target.value })}>{CN_M.map((m, i) => <option key={m} value={i + 1}>{m}月</option>)}</select>
            : <><input aria-label="月" inputMode="numeric" value={d.month ?? ''} onChange={(e) => set({ month: +e.target.value.replace(/\D/g, '').slice(0, 2) || undefined })} /><span>月</span></>}
          {d.calendar === 'lunar'
            ? <select aria-label="日" value={d.day ?? ''} onChange={(e) => set({ day: +e.target.value })}>{CN_D.map((x, i) => <option key={x} value={i + 1}>{x}</option>)}</select>
            : <><input aria-label="日" inputMode="numeric" value={d.day ?? ''} onChange={(e) => set({ day: +e.target.value.replace(/\D/g, '').slice(0, 2) || undefined })} /><span>日</span></>}
        </div>
      </div>
      <div className={`cf-f ${chg(ch, 'time') || ''}`}><label>时间</label>
        <div className="cf-in col">
          <Seg value={t.type} options={[['exact', '具体时间'], ['shichen', '时辰'], ['unknown', '不清楚']]}
            onChange={(v) => set({ time: v === 'exact' ? { type: 'exact', hour: t.hour ?? 12, minute: t.minute ?? 0 } : v === 'shichen' ? { type: 'shichen', shichen: t.shichen || '午' } : { type: 'unknown' } })} />
          {t.type === 'exact' && <input type="time" aria-label="出生时间" value={`${pad(t.hour)}:${pad(t.minute)}`} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); set({ time: { type: 'exact', hour: h || 0, minute: m || 0 } }); }} />}
          {t.type === 'shichen' && <select aria-label="时辰" value={t.shichen} onChange={(e) => set({ time: { type: 'shichen', shichen: e.target.value } })}>{SHICHEN.map(([z, r]) => <option key={z} value={z}>{z}时（{r}）</option>)}</select>}
        </div>
      </div>
      <div className={`cf-f ${chg(ch, 'city') || ''}`}><label>出生地</label><div className="cf-in"><input className="city" placeholder="如 成都（可不填）" maxLength={20} value={d.city || ''} onChange={(e) => set({ city: e.target.value })} /></div></div>
      {err && <p className="cf-err">{err}</p>}
      <div className="cf-act">
        <button type="submit" className="primary" disabled={busy || sending}>{sending ? '排盘中…' : status === 'confirmed' ? '重新排盘' : primary}</button>
        <button type="button" className="ghost" disabled={sending} onClick={() => { setEdit(false); setD(profile); setErr(''); }}>取消</button>
      </div>
    </form>
  );
}
