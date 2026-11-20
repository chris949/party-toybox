// まぎれろ！のセリフの一覧と追加（このフォルダの README.md の 15.10）。入れたものは、すべて持っていく
import { useState } from 'react';
import { BLEND_LINE_MAX, BLEND_LINES_PER_PLAYER } from '../../core/constants';
import { Notice } from '../../ui/common';
import { askConfirm, updateBlendLines, useStore } from '../../app/store';
import { SAMPLE_LINES } from './lines';

export function BlendLinesList() {
  const lines = useStore(s => s.blendLines);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const full = lines.length >= BLEND_LINES_PER_PLAYER;
  const add = () => {
    const w = text.trim();
    if (!w) return setNotice('セリフを入力してください（例：ねむい…）');
    if (lines.includes(w)) return setNotice('同じセリフがもうあります');
    if (full) return setNotice(`セリフは${BLEND_LINES_PER_PLAYER}個までです`);
    updateBlendLines(ws => [...ws, w]);
    setText('');
    setNotice('');
  };
  return (
    <section className="card">
      <h2>セリフ <span className="muted small">{lines.length} / {BLEND_LINES_PER_PLAYER}個</span></h2>
      <p className="muted small" style={{ margin: '0 0 8px' }}>
        舞台のキャラクターが、ときどきしゃべるひとことです（1つ{BLEND_LINE_MAX}文字まで）。入れたセリフは、すべて持っていきます。誰がどのセリフをしゃべるかは、でたらめに決まります。作らなくても、同梱のセリフ（{SAMPLE_LINES.length}個）でしゃべります。
      </p>
      <div className="row">
        <input type="text" maxLength={BLEND_LINE_MAX} value={text} placeholder="例）ねむい…" aria-label="新しいセリフ"
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); }} />
        <button onClick={add}>追加</button>
      </div>
      <Notice>{notice}</Notice>
      {lines.length
        ? <div className="wordlist">{lines.map(w => (
            <span key={w}>{w}<button className="x" aria-label={`${w} を消す`} onClick={() => updateBlendLines(ws => ws.filter(x => x !== w))}>✕</button></span>
          ))}</div>
        : <p className="muted" style={{ margin: '8px 0 0' }}>まだセリフがありません（なくても、同梱のセリフで遊べます）</p>}
      {lines.length > 0 && <button className="small danger" style={{ marginTop: 10 }} onClick={() => askConfirm('セリフを、ぜんぶ消しますか？', 'ぜんぶ消す', () => updateBlendLines(() => []))}>ぜんぶ消す</button>}
    </section>
  );
}
