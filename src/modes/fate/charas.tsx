// 運命の二者択一のキャラクター（src/modes/fate/README.md の11.8）。
// いまは仮の絵（絵文字）。画像生成で作った絵に差し替えるときは、この Chara の中身を画像に変えるだけで済むようにしてある
import './styles.css'; // キャラクターの選択は、ホームやロビーでも使う

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

// 同じキャラクターを選んだ人のうち何人目か（0 = 1人目）。2人目からは色合いを変えて見分ける
export const variantOf = (players: readonly { chara: number }[], i: number) =>
  players.slice(0, i).filter(p => charaOf(p.chara) === charaOf(players[i].chara)).length;

export function Chara({ n, pose = 'stand', size = 44, color = 'var(--ink)', variant = 0 }: { n: number; pose?: Pose; size?: number; color?: string; variant?: number }) {
  const alt = variant > 0 && pose !== 'ghost';
  return (
    <span className={`chara ${pose}`} aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.62, borderColor: color, background: alt ? `color-mix(in srgb, ${color} 30%, #fff)` : undefined }}>
      <span className="face" style={alt ? { filter: `hue-rotate(${variant * 75}deg)` } : undefined}>{charaOf(n).face}</span>
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
