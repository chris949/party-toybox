// ワードブーケのお題の一覧と追加（このフォルダの README.md の 14.3）。言葉のカードは同梱のものだけを使うので、作るのはお題だけ
import './styles.css';
import { useState } from 'react';
import { askConfirm, updateBouquets, updateBouquetWords, useStore } from '../../app/store';
import { BOUQUET_WORD_MAX, BOUQUET_WORDS_PER_PLAYER, TITLE_MAX } from '../../core/constants';
import { newTopicId } from '../../storage/local';
import { Notice } from '../../ui/common';
import { ALL_WORDS, SAMPLE_BOUQUETS, WORD_COUNT } from './words';

export function BouquetList() {
  const list = useStore(s => s.bouquets);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const add = () => {
    const theme = text.trim();
    if (!theme) return setNotice('お題を入力してください（例：プロポーズの言葉）');
    if (list.some(b => b.text === theme)) return setNotice('同じお題がもうあります');
    updateBouquets(bs => [...bs, { id: newTopicId(), text: theme, bring: true }]);
    setText('');
    setNotice('');
  };
  return <>
    <section className="card">
      <h2>お題ストック <span className="muted small">{list.length}件 ／ 持っていく: {list.filter(b => b.bring).length}件</span></h2>
      <p className="muted small" style={{ margin: '0 0 8px' }}>
        「どんなひとことを作るか」のお題です。あなたが親の回に、持っていったお題のどれか1つが使われます。作らなくても、同梱のサンプル（{SAMPLE_BOUQUETS.length}個）で遊べます。言葉のカード（約{Math.floor(WORD_COUNT / 10) * 10}語）は、同梱のものを使います。
      </p>
      {list.length ? list.map(b => (
        <div className="topic" key={b.id}>
          <label>
            <input type="checkbox" checked={b.bring} onChange={e => updateBouquets(bs => bs.map(x => x.id === b.id ? { ...x, bring: e.target.checked } : x))} />
            <b>{b.text}</b>
          </label>
          <button className="danger" onClick={() => askConfirm(`「${b.text}」を削除しますか？`, '削除する', () => updateBouquets(bs => bs.filter(x => x.id !== b.id)))}>削除</button>
        </div>
      )) : <p className="muted">まだお題がありません</p>}
      <div className="row" style={{ marginTop: 10 }}>
        <input type="text" maxLength={TITLE_MAX} value={text} placeholder="例）プロポーズの言葉" aria-label="新しいお題"
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); }} />
        <button onClick={add}>追加</button>
      </div>
      <Notice>{notice}</Notice>
    </section>
    <WordList />
  </>;
}

// 持ち寄りの言葉：1語ずつ足す・消す。入れたものは、すべて持っていく
function WordList() {
  const words = useStore(s => s.bouquetWords);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const full = words.length >= BOUQUET_WORDS_PER_PLAYER;
  const add = () => {
    const w = text.trim();
    if (!w) return setNotice('言葉を入力してください（例：筋肉）');
    if (words.includes(w)) return setNotice('同じ言葉がもうあります');
    if (full) return setNotice(`言葉は${BOUQUET_WORDS_PER_PLAYER}語までです`);
    updateBouquetWords(ws => [...ws, w]);
    setText('');
    setNotice(ALL_WORDS.includes(w) ? '足しました（プリセットにもある言葉です）' : '');
  };
  return (
    <section className="card">
      <h2>言葉 <span className="muted small">{words.length} / {BOUQUET_WORDS_PER_PLAYER}語</span></h2>
      <p className="muted small" style={{ margin: '0 0 8px' }}>
        手札に配られる言葉を、自分で足せます（1語{BOUQUET_WORD_MAX}文字まで）。入れた言葉は、すべて持っていきます。みんなの言葉をまとめて配るので、誰の手札に行くかは分かりません。プリセットと混ぜるか、持ち寄りだけにするかは、ホストがロビーで決めます。
      </p>
      <div className="row">
        <input type="text" maxLength={BOUQUET_WORD_MAX} value={text} placeholder="例）筋肉" aria-label="新しい言葉"
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); }} />
        <button onClick={add}>追加</button>
      </div>
      <Notice>{notice}</Notice>
      {words.length
        ? <div className="wordlist">{words.map(w => (
            <span key={w}>{w}<button className="x" aria-label={`${w} を消す`} onClick={() => updateBouquetWords(ws => ws.filter(x => x !== w))}>✕</button></span>
          ))}</div>
        : <p className="muted" style={{ margin: '8px 0 0' }}>まだ言葉がありません（なくても、プリセットで遊べます）</p>}
      {words.length > 0 && <button className="small danger" style={{ marginTop: 10 }} onClick={() => askConfirm('言葉を、ぜんぶ消しますか？', 'ぜんぶ消す', () => updateBouquetWords(() => []))}>ぜんぶ消す</button>}
    </section>
  );
}
