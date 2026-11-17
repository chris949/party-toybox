// まぎれろ！で各参加者に見せてよい情報。どれが人かは、かくれている本人にだけ送る（ほかの人には、発表まで送らない）
import { BLEND_STARS } from '../../core/constants';
import { onStar, type BlendEnd, type BlendState } from './rules';

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
  ammo: number;           // 自分の残りの弾（かくれている本人は0）
  ammoMax: number;        // 1人あたりの弾の数
  loaded: number;         // 弾が残っている、さがす人の数
  down: number[];         // 撃たれて倒れた番号（全員に見える）
  shots: { id: string; name: string; i: number; hit: boolean }[]; // 撃った記録（全員に見える）
  seekers: { id: string; name: string; ammo: number; aim: [number, number] | null }[]; // さがす人と、残りの弾、狙っている場所（100倍の整数。全員に見せる）
  end: BlendEnd | null;   // 終わり方（発表のとき）
  gained: Record<string, number> | null;
  void: boolean;
}

export function blendView(g: BlendState, id: string, now: number, ammoMax: number): BlendView {
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
    ammo: g.ammo[id] ?? 0, ammoMax,
    loaded: Object.values(g.ammo).filter(n => n > 0).length,
    down: g.down,
    shots: g.shots.map(s => ({ id: s.by, name: g.names[s.by] ?? '???', i: s.i, hit: s.hit })),
    seekers: g.ring.filter(pid => pid !== g.hiderId).map(pid => ({ id: pid, name: g.names[pid] ?? '???', ammo: g.ammo[pid] ?? 0, aim: !found && g.aims[pid] ? [Math.round(g.aims[pid].x * 100), Math.round(g.aims[pid].z * 100)] as [number, number] : null })),
    end: found ? g.end : null,
    gained: found ? g.gained : null,
    void: g.void,
  };
}
