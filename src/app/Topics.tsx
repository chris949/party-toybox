import { useRef, useState } from 'react';
import { MAX_OPT, MAX_PICK, MIN_OPT, MIN_PICK, OPTION_MAX, TITLE_MAX } from '../core/constants';
import { pickCount } from '../core/topics';
import { newTopicId } from '../storage/local';
import { Notice, TitleBar } from '../ui/common';
import { askConfirm, setScreen, updateTopics, useStore, type Editing } from './store';
import { FiveList } from './TopicsFive';
import { GAME_MODES, type GameMode } from '../core/types';

export function Topics() {
  const tab = useStore(s => s.topicsTab);
  return (
    <>
      <TitleBar right={<button className="small" onClick={() => setScreen('home')}>← 戻る</button>} />
      <h2 style={{ fontSize: 20, margin: '0 0 12px' }}>お題の設定</h2>
      {/* お題の形がモードごとに違うので、ストックを分ける */}
      <div className="seg" style={{ marginBottom: 12 }}>{(Object.entries(GAME_MODES) as [GameMode, string][]).map(([k, label]) => (
        <button key={k} className={tab === k ? 'on' : ''} onClick={() => useStore.setState({ topicsTab: k })}>{label}</button>
      ))}</div>
      {tab === 'five' ? <FiveList /> : <TierList />}
    </>
  );
}

function TierList() {
  const topics = useStore(s => s.topics);
  const count = topics.filter(t => t.bring).length;
  const edit = (e: Editing) => useStore.setState({ editing: e, screen: 'edit', notice: '' });
  return (
    <>
      <section className="card">
        <h2>お題ストック <span className="muted small">{topics.length}件 ／ 持っていく: {count}件</span></h2>
        <p className="muted small" style={{ margin: '0 0 8px' }}>チェックを入れたお題を次のゲームに持っていきます。</p>
        {topics.length ? topics.map(t => (
          <div className="topic" key={t.id}>
            <label>
              <input type="checkbox" checked={t.bring} onChange={e => updateTopics(ts => ts.map(x => x.id === t.id ? { ...x, bring: e.target.checked } : x))} />
              <b>{t.title}</b><span className="muted small">{t.options.length}個から{pickCount(t)}個</span>
            </label>
            <button onClick={() => edit({ id: t.id, title: t.title, options: [...t.options], count: pickCount(t) })}>編集</button>
            <button className="danger" onClick={() => askConfirm(`「${t.title}」を削除しますか？`, '削除する', () => updateTopics(ts => ts.filter(x => x.id !== t.id)))}>削除</button>
          </div>
        )) : <p className="muted">まだお題がありません</p>}
        <button className="wide" style={{ marginTop: 10 }} onClick={() => edit({ id: null, title: '', options: Array(MIN_OPT).fill(''), count: MIN_PICK })}>＋ お題を作る</button>
      </section>
    </>
  );
}

export function Edit() {
  const initial = useStore(s => s.editing)!;
  const [t, setT] = useState<Editing>(initial);
  const [notice, setNotice] = useState('');
  const optRefs = useRef<(HTMLInputElement | null)[]>([]);
  const focusAt = useRef<number | null>(null);

  const setOpt = (i: number, v: string) => setT(x => ({ ...x, options: x.options.map((o, k) => k === i ? v : o) }));
  // Enter で次の欄へ。最後の欄なら（上限未満のとき）欄を足して移る。日本語の変換確定の Enter は無視
  const onEnter = (e: React.KeyboardEvent, next: number) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (next < t.options.length) optRefs.current[next]?.focus();
    else if (t.options.length < MAX_OPT) { focusAt.current = next; setT(x => ({ ...x, options: [...x.options, ''] })); }
  };
  const save = () => {
    const title = t.title.trim();
    const opts = t.options.map(o => o.trim()).filter(Boolean);
    if (!title) return setNotice('お題を入力してください');
    if (opts.length < MIN_OPT) return setNotice(`選択肢を${MIN_OPT}個以上入力してください`);
    if (new Set(opts).size !== opts.length) return setNotice('同じ選択肢が重複しています');
    if (t.count > opts.length) return setNotice(`出題数（${t.count}個）が選択肢の数（${opts.length}個）より多くなっています`);
    const count = Math.max(MIN_PICK, Math.min(MAX_PICK, t.count));
    updateTopics(ts => t.id && ts.some(x => x.id === t.id)
      ? ts.map(x => x.id === t.id ? { ...x, title, options: opts, count } : x)
      : [...ts, { id: newTopicId(), title, options: opts, count, bring: true }]);
    useStore.setState({ editing: null, screen: 'topics' });
  };

  return (
    <>
      <TitleBar />
      <h2 style={{ fontSize: 20, margin: '0 0 12px' }}>{t.id ? 'お題を編集' : 'お題をつくる'}</h2>
      <section className="card">
        <label className="field">お題
          <input type="text" maxLength={TITLE_MAX} value={t.title} placeholder="例）好きな野菜は？"
            onChange={e => setT({ ...t, title: e.target.value })} onKeyDown={e => onEnter(e, 0)} />
        </label>
        <div className="field muted small">選択肢（{MIN_OPT}〜{MAX_OPT}個）</div>
        {t.options.map((o, i) => (
          <div className="opt-row" key={i}>
            <span>{i + 1}</span>
            <input type="text" maxLength={OPTION_MAX} value={o} onChange={e => setOpt(i, e.target.value)} onKeyDown={e => onEnter(e, i + 1)}
              ref={el => { optRefs.current[i] = el; if (el && focusAt.current === i) { focusAt.current = null; el.focus(); } }} />
            <button disabled={t.options.length <= MIN_OPT} onClick={() => setT(x => {
              const options = x.options.filter((_, k) => k !== i);
              return { ...x, options, count: Math.min(x.count, Math.max(MIN_PICK, options.length)) };
            })}>✕</button>
          </div>
        ))}
        <button className="wide" disabled={t.options.length >= MAX_OPT} onClick={() => setT({ ...t, options: [...t.options, ''] })}>＋ 選択肢を追加</button>
      </section>
      <section className="card">
        <h2>出題数</h2>
        <p className="muted small" style={{ margin: '0 0 10px' }}>ゲームでは、選択肢の中からこの数だけランダムに出します（{MIN_PICK}〜{MAX_PICK}個）。多めに作っておくと、毎回違う組み合わせで遊べます。</p>
        <div className="row stepper">
          <button disabled={t.count <= MIN_PICK} onClick={() => setT({ ...t, count: Math.max(MIN_PICK, t.count - 1) })}>−</button>
          <span className="count-val">{t.count}個</span>
          <button disabled={t.count >= Math.min(MAX_PICK, t.options.length)} onClick={() => setT({ ...t, count: Math.min(MAX_PICK, t.options.length, t.count + 1) })}>＋</button>
        </div>
        <Notice>{notice}</Notice>
      </section>
      <div className="row">
        <button onClick={() => useStore.setState({ editing: null, screen: 'topics' })}>キャンセル</button>
        <button className="primary" style={{ flex: 1 }} onClick={save}>保存</button>
      </div>
    </>
  );
}
