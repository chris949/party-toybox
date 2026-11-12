// セレクトファイブのお題の一覧と作成・編集（src/modes/five/README.md の10.3）
import { useRef, useState } from 'react';
import { MAX_OPT, OPTION_MAX, TITLE_MAX } from '../../core/constants';
import {
  defaultDummy, dummyRange, FIVE_DEFAULT_SIZE, FIVE_MIN_ANSWERS, FIVE_MIN_DUMMIES, FIVE_PICK, fiveError, fitCounts, SAMPLE_FIVES, sizeRange,
} from './topics';
import { newTopicId } from '../../storage/local';
import { Notice, TitleBar } from '../../ui/common';
import { askConfirm, updateFives, useStore, type EditingFive } from '../../app/store';

const dummyLabel = (d: number | null) => d == null ? 'ダミーはおまかせ' : `うちダミー${d}個`;

export function FiveList() {
  const fives = useStore(s => s.fives);
  const count = fives.filter(t => t.bring).length;
  const edit = (e: EditingFive) => useStore.setState({ editingFive: e, screen: 'editFive', notice: '' });
  return (
    <section className="card">
      <h2>お題ストック <span className="muted small">{fives.length}件 ／ 持っていく: {count}件</span></h2>
      <p className="muted small" style={{ margin: '0 0 8px' }}>
        正解とダミーを混ぜた選択肢から、正解だと思うものを{FIVE_PICK}つ選ぶモードです。足りない分は同梱のサンプル（{SAMPLE_FIVES.length}個）で補うので、作らなくても遊べます。
      </p>
      {fives.length ? fives.map(t => (
        <div className="topic" key={t.id}>
          <label>
            <input type="checkbox" checked={t.bring} onChange={e => updateFives(ts => ts.map(x => x.id === t.id ? { ...x, bring: e.target.checked } : x))} />
            <b>{t.title}</b><span className="muted small">正解{t.answers.length}・ダミー{t.dummies.length}から{t.size}個（{dummyLabel(t.dummy)}）</span>
          </label>
          <button onClick={() => edit({ id: t.id, title: t.title, answers: [...t.answers], dummies: [...t.dummies], size: t.size, dummy: t.dummy })}>編集</button>
          <button className="danger" onClick={() => askConfirm(`「${t.title}」を削除しますか？`, '削除する', () => updateFives(ts => ts.filter(x => x.id !== t.id)))}>削除</button>
        </div>
      )) : <p className="muted">まだお題がありません</p>}
      <button className="wide" style={{ marginTop: 10 }} onClick={() => edit({
        id: null, title: '', answers: Array(FIVE_MIN_ANSWERS).fill(''), dummies: Array(FIVE_DEFAULT_SIZE - FIVE_MIN_ANSWERS).fill(''), size: FIVE_DEFAULT_SIZE, dummy: FIVE_DEFAULT_SIZE / 2,
      })}>＋ お題を作る</button>
    </section>
  );
}

// 正解・ダミーの入力欄の並び。Enter で次の欄へ、最後の欄なら欄を足して移る
function OptionFields({ label, hint, items, min, max, onChange }: {
  label: string; hint: string; items: string[]; min: number; max: number; onChange(items: string[]): void;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focusAt = useRef<number | null>(null);
  const onEnter = (e: React.KeyboardEvent, next: number) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (next < items.length) refs.current[next]?.focus();
    else if (items.length < max) { focusAt.current = next; onChange([...items, '']); }
  };
  return <>
    <div className="field muted small">{label}（{hint}）</div>
    {items.map((o, i) => (
      <div className="opt-row" key={i}>
        <span>{i + 1}</span>
        <input type="text" maxLength={OPTION_MAX} value={o} onChange={e => onChange(items.map((x, k) => k === i ? e.target.value : x))} onKeyDown={e => onEnter(e, i + 1)}
          ref={el => { refs.current[i] = el; if (el && focusAt.current === i) { focusAt.current = null; el.focus(); } }} />
        <button disabled={items.length <= min} onClick={() => onChange(items.filter((_, k) => k !== i))}>✕</button>
      </div>
    ))}
    <button className="wide" disabled={items.length >= max} onClick={() => onChange([...items, ''])}>＋ {label}を追加</button>
  </>;
}

export function EditFive() {
  const initial = useStore(s => s.editingFive)!;
  const [t, setT] = useState<EditingFive>(initial);
  const [notice, setNotice] = useState('');
  const answers = t.answers.map(o => o.trim()).filter(Boolean);
  const dummies = t.dummies.map(o => o.trim()).filter(Boolean);
  // 入力中の数に合わせて、選べる範囲を出す（範囲の外は保存時に収める）
  const sr = sizeRange(answers.length, dummies.length);
  const size = Math.max(sr.lo, Math.min(sr.hi, t.size));
  const dr = dummyRange(size, answers.length, dummies.length);
  const ready = sr.hi >= sr.lo && dr.hi >= dr.lo;
  const room = MAX_OPT - t.answers.length - t.dummies.length;

  const save = () => {
    const title = t.title.trim();
    const err = fiveError({ title, answers, dummies });
    if (err) return setNotice(err);
    const counts = fitCounts(answers.length, dummies.length, t.size, t.dummy);
    updateFives(fs => t.id && fs.some(x => x.id === t.id)
      ? fs.map(x => x.id === t.id ? { ...x, title, answers, dummies, ...counts } : x)
      : [...fs, { id: newTopicId(), title, answers, dummies, ...counts, bring: true }]);
    useStore.setState({ editingFive: null, screen: 'topics', topicsTab: 'five' });
  };
  const back = () => useStore.setState({ editingFive: null, screen: 'topics', topicsTab: 'five' });

  return (
    <>
      <TitleBar />
      <h2 style={{ fontSize: 20, margin: '0 0 12px' }}>{t.id ? 'お題を編集' : 'お題をつくる'}<span className="muted small">　セレクトファイブ</span></h2>
      <section className="card">
        <label className="field">お題
          <input type="text" maxLength={TITLE_MAX} value={t.title} placeholder="例）哺乳類はどれ？" onChange={e => setT({ ...t, title: e.target.value })} />
        </label>
        <OptionFields label="正解" hint={`${FIVE_MIN_ANSWERS}個以上`} items={t.answers} min={FIVE_MIN_ANSWERS} max={t.answers.length + room}
          onChange={a => setT({ ...t, answers: a })} />
      </section>
      <section className="card">
        <OptionFields label="ダミー" hint={`${FIVE_MIN_DUMMIES}個以上。本当っぽいものほど、みんなが引っかかります`} items={t.dummies} min={FIVE_MIN_DUMMIES} max={t.dummies.length + room}
          onChange={d => setT({ ...t, dummies: d })} />
      </section>
      <section className="card">
        <h2>出題する数</h2>
        <p className="muted small" style={{ margin: '0 0 10px' }}>ゲームでは、登録した正解とダミーの中から、この数だけランダムに出します。多めに登録しておくと、毎回違う組み合わせで遊べます。</p>
        {ready ? <>
          <div className="row stepper">
            <span className="muted small">選択肢</span>
            <button disabled={size <= sr.lo} onClick={() => setT({ ...t, size: size - 1 })}>−</button>
            <span className="count-val">{size}個</span>
            <button disabled={size >= sr.hi} onClick={() => setT({ ...t, size: size + 1 })}>＋</button>
          </div>
          <div className="row stepper" style={{ marginTop: 8 }}>
            <span className="muted small">うちダミー</span>
            {t.dummy == null
              ? <span className="count-val">おまかせ（毎回{dr.lo === dr.hi ? dr.lo : `${dr.lo}〜${dr.hi}`}個）</span>
              : <>
                <button disabled={Math.min(t.dummy, dr.hi) <= dr.lo} onClick={() => setT({ ...t, dummy: Math.max(dr.lo, Math.min(dr.hi, t.dummy! - 1)) })}>−</button>
                <span className="count-val">{Math.max(dr.lo, Math.min(dr.hi, t.dummy))}個</span>
                <button disabled={Math.max(t.dummy, dr.lo) >= dr.hi} onClick={() => setT({ ...t, dummy: Math.max(dr.lo, Math.min(dr.hi, t.dummy! + 1)) })}>＋</button>
              </>}
          </div>
          <label className="small" style={{ display: 'block', marginTop: 8 }}>
            <input type="checkbox" checked={t.dummy == null} onChange={e => setT({ ...t, dummy: e.target.checked ? null : defaultDummy(size, answers.length, dummies.length) })} />
            ダミーの数をおまかせにする（答える人は、いくつがダミーか分からないまま選びます）
          </label>
        </> : <p className="muted small">正解を{FIVE_MIN_ANSWERS}個以上、ダミーを{FIVE_MIN_DUMMIES}個以上、合わせて7個以上入力すると決められます。</p>}
        <Notice>{notice}</Notice>
      </section>
      <div className="row">
        <button onClick={back}>キャンセル</button>
        <button className="primary" style={{ flex: 1 }} onClick={save}>保存</button>
      </div>
    </>
  );
}
