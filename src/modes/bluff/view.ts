// ブラインドブラフで各参加者に見せてよい情報。しゃべっている間は、自分のカードと、ほかの人が選んだものを送らない
import type { BluffShow, BluffState } from './rules';

export interface BluffView {
  round: number;
  rounds: number;
  cards: Record<string, number | null>;      // 自分のカードは、発表まで null
  dealt: boolean;                            // 自分にカードが配られているか（途中から見ている人は false）
  myBet: boolean | null;                     // 自分が選んだもの（true = 勝負、false = 降りる）
  bets: Record<string, boolean> | null;      // 発表してから：全員が選んだもの（選ばなかった人は false）
  show: BluffShow | null;
}

export function bluffView(g: BluffState, id: string): BluffView {
  const open = g.phase !== 'talk';
  return {
    round: g.round, rounds: g.rounds,
    cards: Object.fromEntries(Object.entries(g.cards).map(([pid, n]) => [pid, open || pid !== id ? n : null])),
    dealt: id in g.cards,
    myBet: g.bets[id] ?? null,
    bets: open ? Object.fromEntries(Object.keys(g.cards).map(pid => [pid, g.bets[pid] === true])) : null,
    show: open ? g.show : null,
  };
}
