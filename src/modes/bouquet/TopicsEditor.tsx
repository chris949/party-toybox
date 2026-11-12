// ワードブーケのお題の一覧と追加（このフォルダの README.md の 14.3）。言葉のカードは同梱のものだけを使うので、作るのはお題だけ
import { useState } from 'react';
import { askConfirm, updateBouquets, useStore } from '../../app/store';
import { TITLE_MAX } from '../../core/constants';
import { newTopicId } from '../../storage/local';
import { Notice } from '../../ui/common';
import { SAMPLE_BOUQUETS, WORD_COUNT } from './words';

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
  return (
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
  );
}
