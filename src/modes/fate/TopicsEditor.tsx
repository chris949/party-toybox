// 運命の二者択一の問題の一覧と作成・編集（src/modes/fate/README.md の11.3）
import { useState } from 'react';
import { OPTION_MAX, TITLE_MAX } from '../../core/constants';
import { fateError, SAMPLE_FATES } from './questions';
import { newTopicId } from '../../storage/local';
import { Notice, TitleBar } from '../../ui/common';
import { askConfirm, updateFates, useStore, type EditingFate } from '../../app/store';

export function FateList() {
  const fates = useStore(s => s.fates);
  const count = fates.filter(q => q.bring).length;
  const edit = (e: EditingFate) => useStore.setState({ editingFate: e, screen: 'editFate', notice: '' });
  return (
    <section className="card">
      <h2>問題ストック <span className="muted small">{fates.length}件 ／ 持っていく: {count}件</span></h2>
      <p className="muted small" style={{ margin: '0 0 8px' }}>
        2択のクイズです。持っていった問題が先に出て、足りない分は同梱のサンプル（{SAMPLE_FATES.length}問）で補うので、作らなくても遊べます。自分が作った問題では、自動でセーフになります。
      </p>
      <p className="muted small" style={{ margin: '0 0 8px' }}>
        💡 「セレクトファイブ」のタブで作ったお題も、このモードで使われます。正解とダミーから1つずつ抜いて2択にするので、1つ作れば毎回違う問題になります。たくさん用意したいときは、そちらが手軽です。
      </p>
      {fates.length ? fates.map(q => (
        <div className="topic" key={q.id}>
          <label>
            <input type="checkbox" checked={q.bring} onChange={e => updateFates(qs => qs.map(x => x.id === q.id ? { ...x, bring: e.target.checked } : x))} />
            <b>{q.text}</b><span className="muted small">⭕{q.right}　✕{q.wrong}</span>
          </label>
          <button onClick={() => edit({ id: q.id, text: q.text, right: q.right, wrong: q.wrong })}>編集</button>
          <button className="danger" onClick={() => askConfirm(`「${q.text}」を削除しますか？`, '削除する', () => updateFates(qs => qs.filter(x => x.id !== q.id)))}>削除</button>
        </div>
      )) : <p className="muted">まだ問題がありません</p>}
      <button className="wide" style={{ marginTop: 10 }} onClick={() => edit({ id: null, text: '', right: '', wrong: '' })}>＋ 問題を作る</button>
    </section>
  );
}

export function EditFate() {
  const initial = useStore(s => s.editingFate)!;
  const [q, setQ] = useState<EditingFate>(initial);
  const [notice, setNotice] = useState('');
  const back = () => useStore.setState({ editingFate: null, screen: 'topics', topicsTab: 'fate' });
  const save = () => {
    const ok = { text: q.text.trim(), right: q.right.trim(), wrong: q.wrong.trim() };
    const err = fateError(ok);
    if (err) return setNotice(err);
    updateFates(qs => q.id && qs.some(x => x.id === q.id)
      ? qs.map(x => x.id === q.id ? { ...x, ...ok } : x)
      : [...qs, { id: newTopicId(), ...ok, bring: true }]);
    back();
  };
  // Enter で保存（日本語の変換確定の Enter は無視）
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) save(); };
  return (
    <>
      <TitleBar />
      <h2 style={{ fontSize: 20, margin: '0 0 12px' }}>{q.id ? '問題を編集' : '問題をつくる'}<span className="muted small">　運命の二者択一</span></h2>
      <section className="card">
        <label className="field">問題文
          <input type="text" maxLength={TITLE_MAX} value={q.text} placeholder="例）日本でいちばん長い川は？" onChange={e => setQ({ ...q, text: e.target.value })} />
        </label>
        <label className="field">⭕ 正解
          <input type="text" maxLength={OPTION_MAX} value={q.right} placeholder="例）信濃川" onChange={e => setQ({ ...q, right: e.target.value })} />
        </label>
        <label className="field">✕ 不正解
          <input type="text" maxLength={OPTION_MAX} value={q.wrong} placeholder="例）利根川" onChange={e => setQ({ ...q, wrong: e.target.value })} onKeyDown={onEnter} />
        </label>
        <p className="muted small" style={{ margin: 0 }}>正解を左右どちらに出すかは、出題のたびにランダムで決まります。本当っぽい不正解ほど盛り上がります。</p>
        <Notice>{notice}</Notice>
      </section>
      <div className="row">
        <button onClick={back}>キャンセル</button>
        <button className="primary" style={{ flex: 1 }} onClick={save}>保存</button>
      </div>
    </>
  );
}
