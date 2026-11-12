// まぎれろ！で各参加者に見せてよい情報。どれが人かは、かくれている本人にだけ送る（ほかの人には、発表まで送らない）
import { BLEND_STARS } from '../../core/constants';
import { onStar, type BlendState } from './rules';

export interface BlendView {
  round: number;
  rounds: number;
  hiderId: string;
  hiderName: string;
  chara: number;          // 全員の見た目
  pos: number[];          // 全員の位置（x, z の順に並べる。100倍して整数にしてある）
  tick: number;           // 位置を進めた回数
  ready: boolean;         // まだ動き出していない（よーい）
  me: number | null;      // 人が動かしている番号（かくれている本人と、発表のときだけ）
  star: [number, number] | null;
  stars: number;
  goal: number;
  canGrab: boolean;       // かくれている本人が、ほしに乗っている
  myGuess: number | null;
  guessed: number;        // 選んでいる人の数
  guesses: { id: string; name: string; i: number | null; ok: boolean }[] | null; // 発表のとき
  gained: Record<string, number> | null;
  void: boolean;
}

export function blendView(g: BlendState, id: string, now: number): BlendView {
  const found = g.phase !== 'hide';
  const mine = id === g.hiderId;
  return {
    round: g.round, rounds: g.ring.length,
    hiderId: g.hiderId, hiderName: g.names[g.hiderId] ?? '???',
    chara: g.chara,
    pos: g.mobs.flatMap(m => [Math.round(m.x * 100), Math.round(m.z * 100)]),
    tick: g.tick,
    ready: g.phase === 'hide' && now < g.startAt,
    me: found || mine ? g.me : null,
    star: g.star ? [Math.round(g.star.x * 100), Math.round(g.star.z * 100)] : null,
    stars: g.stars, goal: BLEND_STARS,
    canGrab: mine && g.phase === 'hide' && onStar(g, g.mobs[g.me]),
    myGuess: g.guesses[id] ?? null,
    guessed: Object.keys(g.guesses).length,
    guesses: found ? g.ring.filter(pid => pid !== g.hiderId).map(pid => ({ id: pid, name: g.names[pid] ?? '???', i: g.guesses[pid] ?? null, ok: g.guesses[pid] === g.me })) : null,
    gained: found ? g.gained : null,
    void: g.void,
  };
}
