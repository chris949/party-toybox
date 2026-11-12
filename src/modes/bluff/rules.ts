// ブラインドブラフのルール（このフォルダの README.md の13章）。画面・通信・ブラウザの機能は使わない（時刻と乱数は ctx で受け取る）
import { BLUFF_CARD_MAX, BLUFF_FOLD, BLUFF_LOSE, BLUFF_ROUNDS, BLUFF_START, BLUFF_STRONG_FOLD, PICK_GRACE_MS } from '../../core/constants';
import { shuffle } from '../../core/random';
import type { ActionFrom, Ctx, RoomState, Timer } from '../../core/types';

export type BluffPhase = 'talk' | 'show' | 'result';

// 1ラウンドの結果
export interface BluffShow {
  winner: string | null;          // 勝負して勝った人（全員が降りたら null）
  strongFold: string | null;      // いちばん強いカードなのに降りた人
  delta: Record<string, number>;  // 点の増減
}

export interface BluffState {
  kind: 'bluff';
  phase: BluffPhase;
  round: number;
  rounds: number;
  cards: Record<string, number>;   // その回に配ったカード（1〜13。同じ数字は配らない）
  bets: Record<string, boolean>;   // 選んだもの（true = 勝負、false = 降りる）
  show: BluffShow | null;
  deadline: number;                // 選ぶ締め切り（0 = なし）
}

const online = (room: RoomState) => room.players.filter(p => p.online);

export function startError(room: RoomState): string | null {
  const n = online(room).length;
  if (n < room.minPlayers) return `あと${room.minPlayers - n}人必要です（${room.minPlayers}〜10人）`;
  return null;
}

// カードを配って、しゃべる時間を始める（つながっている人にだけ配る）
function deal(room: RoomState, g: BluffState, ctx: Ctx) {
  const deck = shuffle(Array.from({ length: BLUFF_CARD_MAX }, (_, i) => i + 1), ctx.random);
  g.cards = Object.fromEntries(online(room).map((p, i) => [p.id, deck[i]]));
  g.bets = {};
  g.show = null;
  g.phase = 'talk';
  g.deadline = ctx.now + room.bluffTime * 1000;
}

export function start(room: RoomState, ctx: Ctx): BluffState {
  room.players.forEach(p => { p.score = BLUFF_START; });
  const g: BluffState = { kind: 'bluff', phase: 'talk', round: 0, rounds: BLUFF_ROUNDS, cards: {}, bets: {}, show: null, deadline: 0 };
  deal(room, g, ctx);
  return g;
}

// 発表：選ばなかった人は「降りる」。点を動かす
function settle(room: RoomState, g: BluffState) {
  const ids = Object.keys(g.cards);
  const go = ids.filter(id => g.bets[id] === true), fold = ids.filter(id => !go.includes(id));
  const delta: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]));
  const top = (list: string[]) => list.reduce<string | null>((a, b) => a == null || g.cards[b] > g.cards[a] ? b : a, null);
  const winner = top(go);
  const best = top(ids);
  const strongFold = winner && best && fold.includes(best) ? best : null; // 全員が降りたときは、点を動かさない
  if (winner) {
    const scoreOf = (id: string) => room.players.find(p => p.id === id)?.score ?? 0;
    // 持ち点より多くは払わない
    const pay = (id: string, n: number) => { const paid = Math.min(n, scoreOf(id) + delta[id]); delta[id] -= paid; return paid; };
    let pot = 0;
    for (const id of fold) pot += pay(id, BLUFF_FOLD + (id === strongFold ? BLUFF_STRONG_FOLD : 0));
    for (const id of go) if (id !== winner) pot += pay(id, BLUFF_LOSE);
    delta[winner] += pot;
    for (const p of room.players) if (delta[p.id]) p.score += delta[p.id];
  }
  g.show = { winner, strongFold, delta };
  g.phase = 'show';
  g.deadline = 0;
}

// 全員が選んだら、時間を待たずに発表へ
export function checkAdvance(room: RoomState, g: BluffState, _ctx: Ctx) {
  if (g.phase === 'talk' && online(room).filter(p => p.id in g.cards).every(p => p.id in g.bets)) settle(room, g);
}

export function reduce(room: RoomState, g: BluffState, a: ActionFrom, ctx: Ctx): boolean {
  const isHost = a.from === room.hostId;
  switch (a.t) {
    case 'bet':
      // 選んだら変えられない
      if (g.phase !== 'talk' || a.round !== g.round || !(a.from in g.cards) || a.from in g.bets || typeof a.go !== 'boolean') return false;
      g.bets[a.from] = a.go;
      checkAdvance(room, g, ctx);
      return true;
    case 'force':
      if (!isHost || g.phase !== 'talk') return false;
      settle(room, g);
      return true;
    case 'timeUp':
      if (!isHost || g.phase !== 'talk' || !g.deadline || ctx.now < g.deadline + PICK_GRACE_MS) return false;
      settle(room, g);
      return true;
    case 'next':
      if (!isHost || g.phase !== 'show') return false;
      if (g.round + 1 >= g.rounds) { g.phase = 'result'; return true; }
      g.round++;
      deal(room, g, ctx);
      return true;
    default:
      return false;
  }
}

export function nextTimer(g: BluffState): Timer | null {
  if (g.phase === 'talk' && g.deadline) return { at: g.deadline + PICK_GRACE_MS, action: { t: 'timeUp' } };
  return null;
}
