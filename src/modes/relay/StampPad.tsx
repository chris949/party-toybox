// スタンプで作った絵を見せる部品と、作る部品（このフォルダの README.md の 17.3）
import { useRef, useState } from 'react';
import { RELAY_MAX_STAMPS, RELAY_SIZES } from '../../core/constants';
import { STAMP_GROUPS, STAMPS, type Stamp } from './stamps';

const SIZE = [0, 9, 13, 18, 26, 38]; // 大きさの段階ごとの、絵の幅に対する割合（%）
const style = (s: Stamp) => ({ left: `${s.x}%`, top: `${s.y}%`, fontSize: `${SIZE[s.s] ?? 18}cqw`, transform: `translate(-50%, -50%) rotate(${s.r * 45}deg)` });

// 見るだけの絵
export function StampView({ stamps, small }: { stamps: Stamp[]; small?: boolean }) {
  return (
    <div className={`spad ${small ? 'small' : ''}`} role="img" aria-label={`スタンプ${stamps.length}個の絵`}>
      {stamps.map((s, i) => <span key={i} style={style(s)}>{STAMPS[s.k]}</span>)}
      {!stamps.length && <em>（何も置かれていません）</em>}
    </div>
  );
}

// 作る：下の一覧からスタンプを選ぶと、絵の真ん中あたりに出る。指でつかんで動かす。選んだスタンプは、大きさ・向きを変えたり、消したりできる
export function StampEditor({ stamps, onChange, disabled }: { stamps: Stamp[]; onChange(next: Stamp[]): void; disabled?: boolean }) {
  const pad = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [group, setGroup] = useState(0);
  const drag = useRef<number | null>(null);
  const cur = sel != null ? stamps[sel] : undefined;
  const full = stamps.length >= RELAY_MAX_STAMPS;
  const edit = (f: (s: Stamp) => Stamp) => { if (sel != null && cur) onChange(stamps.map((s, i) => i === sel ? f(s) : s)); };
  const add = (k: number) => {
    if (disabled || full) return;
    // 重ならないよう、真ん中から少しずつずらして置く
    const n = stamps.length;
    onChange([...stamps, { k, x: 50 + ((n * 17) % 40) - 20, y: 50 + ((n * 29) % 40) - 20, s: 3, r: 0 }]);
    setSel(n);
  };
  const move = (e: React.PointerEvent) => {
    const i = drag.current, r = pad.current?.getBoundingClientRect();
    if (i == null || !r || disabled) return;
    const x = Math.max(0, Math.min(100, Math.round((e.clientX - r.left) / r.width * 100)));
    const y = Math.max(0, Math.min(100, Math.round((e.clientY - r.top) / r.height * 100)));
    onChange(stamps.map((s, k) => k === i ? { ...s, x, y } : s));
  };
  return <>
    <div className="spad edit" ref={pad} aria-label="スタンプを置く場所"
      onPointerDown={() => setSel(null)} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      {stamps.map((s, i) => (
        <span key={i} style={style(s)} className={i === sel ? 'sel' : ''}
          onPointerDown={e => { if (disabled) return; e.stopPropagation(); setSel(i); drag.current = i; pad.current?.setPointerCapture(e.pointerId); }}>{STAMPS[s.k]}</span>
      ))}
      {!stamps.length && <em>下からスタンプを選ぶと、ここに出ます。指でつかんで動かせます</em>}
    </div>
    <div className="stools">
      <button className="small" disabled={!cur || cur.s <= 1} onClick={() => edit(s => ({ ...s, s: s.s - 1 }))}>小さく</button>
      <button className="small" disabled={!cur || cur.s >= RELAY_SIZES} onClick={() => edit(s => ({ ...s, s: s.s + 1 }))}>大きく</button>
      <button className="small" disabled={!cur} onClick={() => edit(s => ({ ...s, r: (s.r + 1) % 8 }))}>回す</button>
      <button className="small danger" disabled={!cur} onClick={() => { onChange(stamps.filter((_, i) => i !== sel)); setSel(null); }}>消す</button>
      <span className="muted small">{stamps.length} / {RELAY_MAX_STAMPS}個</span>
    </div>
    <div className="seg wrap sgroups">{STAMP_GROUPS.map((g, i) => (
      <button key={g.name} className={group === i ? 'on' : ''} onClick={() => setGroup(i)}>{g.name}</button>
    ))}</div>
    <div className="spalette">{STAMP_GROUPS[group].items.map(e => (
      <button key={e} disabled={disabled || full} onClick={() => add(STAMPS.indexOf(e))} aria-label={`スタンプ ${e}`}>{e}</button>
    ))}</div>
  </>;
}
