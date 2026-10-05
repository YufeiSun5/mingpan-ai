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

interface Props { profile: Profile; status: 'editing' | 'confirmed'; busy: boolean; locked: boolean; onConfirm: (p: Profile) => Promise<string | null> }

export function ConfirmCard({ profile, status, busy, locked, onConfirm }: Props) {
  const [edit, setEdit] = useState(false);
  const [d, setD] = useState<Profile>(profile);
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => { if (!edit) setD(profile); }, [profile, edit]);
  const set = (patch: Partial<Profile>) => { setErr(''); setD((x) => ({ ...x, ...patch })); };
  const t: BirthTime = d.time || { type: 'unknown' };

  const submit = async () => {
    if (!d.gender) return setErr('请选择性别');
    if (!d.year || d.year < 1900 || d.year > 2100) return setErr('年份需要在 1900–2100 之间');
    if (!d.month || d.month < 1 || d.month > 12) return setErr('月份不对');
    if (!d.day || d.day < 1 || d.day > (d.calendar === 'lunar' ? 30 : 31)) return setErr('日期不对');
    setSending(true);
    const e = await onConfirm({ ...d, calendar: d.calendar || 'solar', time: t, leap: d.calendar === 'lunar' ? !!d.leap : false, awaitingConfirm: undefined });
    setSending(false);
    if (e) setErr(e); else setEdit(false);
  };

  if (status === 'confirmed' && !edit) {
    return (
      <div className="cf done">
        <span className="ok" aria-hidden="true">✓</span>
        <span className="cf-line"><b>已确认</b>{profile.gender} · {dateText(profile)} · {timeText(profile.time)}{profile.city ? ` · ${profile.city}` : ''}</span>
        {!locked && <button type="button" className="link" disabled={busy} onClick={() => setEdit(true)}>修改</button>}
      </div>
    );
  }

  if (!edit) {
    return (
      <div className="cf">
        <div className="cf-h">核对生辰<span>确认后开始排盘</span></div>
        <dl className="cf-kv">
          <dt>性别</dt><dd>{profile.gender}</dd>
          <dt>生日</dt><dd>{dateText(profile)}</dd>
          <dt>时间</dt><dd>{timeText(profile.time)}</dd>
          <dt>出生地</dt><dd>{profile.city || <em>未填（不做真太阳时校正）</em>}</dd>
          {!!profile.topics?.length && <><dt>想问</dt><dd>{profile.topics.join('、')}</dd></>}
        </dl>
        {err && <p className="cf-err">{err}</p>}
        <div className="cf-act">
          <button type="button" className="primary" disabled={busy || sending} onClick={submit}>{sending ? '排盘中…' : '开始排盘'}</button>
          <button type="button" className="ghost" disabled={busy || sending} onClick={() => setEdit(true)}>修改</button>
        </div>
      </div>
    );
  }

  return (
    <form className="cf edit" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="cf-h">{status === 'confirmed' ? '修改生辰' : '核对生辰'}<span>改好后直接排盘</span></div>
      <div className="cf-f"><label>性别</label><Seg value={(d.gender || '') as any} options={[['女', '女'], ['男', '男']]} onChange={(v) => set({ gender: v as any })} /></div>
      <div className="cf-f"><label>历法</label>
        <div className="cf-in">
          <Seg value={(d.calendar || 'solar') as 'solar' | 'lunar'} options={[['solar', '公历'], ['lunar', '农历']]} onChange={(v) => set({ calendar: v, leap: v === 'lunar' ? d.leap : false })} />
          {d.calendar === 'lunar' && <label className="chk"><input type="checkbox" checked={!!d.leap} onChange={(e) => set({ leap: e.target.checked })} />闰月</label>}
        </div>
      </div>
      <div className="cf-f"><label>日期</label>
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
      <div className="cf-f"><label>时间</label>
        <div className="cf-in col">
          <Seg value={t.type} options={[['exact', '具体时间'], ['shichen', '时辰'], ['unknown', '不清楚']]}
            onChange={(v) => set({ time: v === 'exact' ? { type: 'exact', hour: t.hour ?? 12, minute: t.minute ?? 0 } : v === 'shichen' ? { type: 'shichen', shichen: t.shichen || '午' } : { type: 'unknown' } })} />
          {t.type === 'exact' && <input type="time" aria-label="出生时间" value={`${pad(t.hour)}:${pad(t.minute)}`} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); set({ time: { type: 'exact', hour: h || 0, minute: m || 0 } }); }} />}
          {t.type === 'shichen' && <select aria-label="时辰" value={t.shichen} onChange={(e) => set({ time: { type: 'shichen', shichen: e.target.value } })}>{SHICHEN.map(([z, r]) => <option key={z} value={z}>{z}时（{r}）</option>)}</select>}
        </div>
      </div>
      <div className="cf-f"><label>出生地</label><div className="cf-in"><input className="city" placeholder="如 成都（可不填）" maxLength={20} value={d.city || ''} onChange={(e) => set({ city: e.target.value })} /></div></div>
      {err && <p className="cf-err">{err}</p>}
      <div className="cf-act">
        <button type="submit" className="primary" disabled={busy || sending}>{sending ? '排盘中…' : status === 'confirmed' ? '重新排盘' : '开始排盘'}</button>
        <button type="button" className="ghost" disabled={sending} onClick={() => { setEdit(false); setD(profile); setErr(''); }}>取消</button>
      </div>
    </form>
  );
}
