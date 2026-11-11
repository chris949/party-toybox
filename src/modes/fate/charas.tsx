// 運命の二者択一のキャラクター（docs/spec.md の11.8）。
// いまは仮の絵（絵文字）。画像生成で作った絵に差し替えるときは、この Chara の中身を画像に変えるだけで済むようにしてある
export const CHARAS = [
  { name: 'いぬ', face: '🐶' }, { name: 'ねこ', face: '🐱' }, { name: 'うさぎ', face: '🐰' }, { name: 'くま', face: '🐻' },
  { name: 'パンダ', face: '🐼' }, { name: 'かえる', face: '🐸' }, { name: 'ペンギン', face: '🐧' }, { name: 'ひよこ', face: '🐥' },
  { name: 'きつね', face: '🦊' }, { name: 'ぶた', face: '🐷' }, { name: 'コアラ', face: '🐨' }, { name: 'とら', face: '🐯' },
  // アニメ風の人のキャラクター（オリジナル。実在の作品のキャラクターは使わない）
  { name: 'ゆうしゃ', face: '🦸' }, { name: 'まほうつかい', face: '🧙' }, { name: 'にんじゃ', face: '🥷' }, { name: 'アイドル', face: '🧑‍🎤' }, { name: 'かいぞく', face: '🏴‍☠️' },
] as const;

export type Pose = 'stand' | 'move' | 'fall' | 'ghost'; // 立ち・移動中・落ちる（驚き顔）・ゴースト

// 同じキャラクターを選んだ人を見分けるための枠の色（参加した順）
export const PLAYER_COLORS = ['#ff6f6f', '#4aa6f0', '#36c99a', '#ffb020', '#a77bf3', '#ff8fc7', '#00b8c4', '#8d6e63', '#7cb342', '#5c6bc0'];

export const charaOf = (n: number) => CHARAS[((Math.trunc(n) || 0) % CHARAS.length + CHARAS.length) % CHARAS.length];

export function Chara({ n, pose = 'stand', size = 44, color = 'var(--ink)' }: { n: number; pose?: Pose; size?: number; color?: string }) {
  return (
    <span className={`chara ${pose}`} style={{ width: size, height: size, fontSize: size * 0.62, borderColor: color }} aria-hidden>
      <span className="face">{charaOf(n).face}</span>
      {pose === 'fall' && <span className="fx">💦</span>}
      {pose === 'ghost' && <span className="fx">👻</span>}
    </span>
  );
}

export function CharaPicker({ value, onPick }: { value: number; onPick(n: number): void }) {
  return (
    <div className="chara-pick">{CHARAS.map((c, i) => (
      <button key={i} className={i === value % CHARAS.length ? 'on' : ''} aria-pressed={i === value % CHARAS.length} aria-label={c.name} title={c.name} onClick={() => onPick(i)}>
        {c.face}
      </button>
    ))}</div>
  );
}
