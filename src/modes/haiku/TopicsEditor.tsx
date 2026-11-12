// ハイカー575 のお題（上の五文字）の一覧と追加（src/modes/haiku/README.md の12.3）
import { useState } from 'react';
import { SAMPLE_HAIKUS, THEME_LEN, toTheme } from './themes';
import { newTopicId } from '../../storage/local';
import { Notice } from '../../ui/common';
import { askConfirm, updateHaikus, useStore } from '../../app/store';

export function HaikuList() {
  const haikus = useStore(s => s.haikus);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const add = () => {
    const theme = toTheme(text);
    if (!theme) return setNotice(`ひらがな${THEME_LEN}文字で入力してください（例：ふるいけや）`);
    if (haikus.some(h => h.text === theme)) return setNotice('同じお題がもうあります');
    updateHaikus(hs => [...hs, { id: newTopicId(), text: theme, bring: true }]);
    setText('');
    setNotice('');
  };
  return (
    <section className="card">
      <h2>お題ストック <span className="muted small">{haikus.length}件 ／ 持っていく: {haikus.filter(h => h.bring).length}件</span></h2>
      <p className="muted small" style={{ margin: '0 0 8px' }}>
        「お題持ち寄り」で遊ぶときの、上の五文字です。あなたが担当する短冊に、持っていったお題のどれか1つが使われます。作らなくても、同梱のサンプル（{SAMPLE_HAIKUS.length}個）で遊べます。
      </p>
      {haikus.length ? haikus.map(h => (
        <div className="topic" key={h.id}>
          <label>
            <input type="checkbox" checked={h.bring} onChange={e => updateHaikus(hs => hs.map(x => x.id === h.id ? { ...x, bring: e.target.checked } : x))} />
            <b>{h.text}</b>
          </label>
          <button className="danger" onClick={() => askConfirm(`「${h.text}」を削除しますか？`, '削除する', () => updateHaikus(hs => hs.filter(x => x.id !== h.id)))}>削除</button>
        </div>
      )) : <p className="muted">まだお題がありません</p>}
      <div className="row" style={{ marginTop: 10 }}>
        <input type="text" maxLength={THEME_LEN + 3} value={text} placeholder="ひらがな5文字（例：ふるいけや）" aria-label="新しいお題"
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); }} />
        <button onClick={add}>追加</button>
      </div>
      <Notice>{notice}</Notice>
    </section>
  );
}
