// 爆弾まわしで各参加者に見せてよい情報。爆発の時刻は送らない（導火線の燃え具合を、4段階で送るだけ）
import type { BombState } from './rules';

export interface BombView {
  round: number;
  rounds: number;
  theme: string;
  holderId: string;
  holderName: string;
  heat: number;                  // 0〜3
  words: { id: string; name: string; text: string }[];
  passes: number;
  loserId: string | null;        // 爆発したとき
  loserName: string | null;
}

export function bombView(g: BombState): BombView {
  const name = (id: string) => g.names[id] ?? '???';
  return {
    round: g.round, rounds: g.rounds, theme: g.theme,
    holderId: g.holderId, holderName: name(g.holderId), heat: g.heat,
    words: g.words.map(w => ({ id: w.id, name: name(w.id), text: w.text })),
    passes: g.passes,
    loserId: g.loserId, loserName: g.loserId ? name(g.loserId) : null,
  };
}
