// ティアリストのルール。画面・通信・ブラウザの機能は使わない（時刻と乱数は ctx で受け取る）
import {
  PERFECT_BONUS, PICK_GRACE_MS, REVEAL_FIRST_MS, REVEAL_STEP_MS, REVEAL_SUSPENSE_MS,
} from '../../core/constants';
import { shuffle } from '../../core/random';
import { SAMPLE_KEYS, topicKey } from './topics';
import type { ActionFrom, Ctx, Player, RoomState, Timer } from '../../core/types';

export type TierPhase = 'ranking' | 'guess' | 'reveal' | 'result';

export interface Assigned {
  title: string;
  options: string[];      // 出題数だけ選んでシャッフルしたもの
  authorId: string | null; // null = サンプル
  authorName: string;
}

export interface RevealRow { id: string; name: string; order: number[]; hits: number; pts: number }

export interface Reveal {
  answer: number[];
  rows: RevealRow[];
  timeouts: string[]; // 時間切れで予想しなかった人の名前
  shown: number;      // めくり済みの数（下から数える）
  suspense: boolean;  // 「1位は…」で溜めている
  done: boolean;
  nextAt: number;     // 次にめくる時刻（0 = なし）
}

export interface TierState {
  kind: 'tier';
  phase: TierPhase;
  assign: Record<string, Assigned>;
  ranks: Record<string, number[]>;
  order: string[];   // 当てられる人の順番
  round: number;
  guesses: Record<string, number[]>;
  reveal: Reveal | null;
  deadline: number;  // 並び替えの締め切り（0 = なし）
}

const online = (room: RoomState) => room.players.filter(p => p.online);

export const validOrder = (o: unknown, n: number): o is number[] =>
  Array.isArray(o) && o.length === n && new Set(o).size === n && o.every(i => Number.isInteger(i) && i >= 0 && i < n);

// 途中までの並び（空きは null）の空きを、残りの選択肢でランダムに埋める。おかしな値は捨てて埋め直す
export function fillRandom(order: readonly unknown[], n: number, ctx: Ctx): number[] {
  const slots: (number | null)[] = Array.from({ length: n }, (_, i) => (order[i] ?? null) as number | null);
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) {
    const v = slots[i];
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= n || seen.has(v as number)) slots[i] = null;
    else seen.add(v as number);
  }
  const rest = shuffle([...Array(n).keys()].filter(i => !seen.has(i)), ctx.random);
  return slots.map(v => v ?? (rest.pop() as number));
}

// 持ち込まれたお題をまとめる。同じお題は1つにし、先に入った人を作成者にする。手を加えていないサンプルの作成者は「サンプル」
export function topicPool(room: RoomState, players: Player[]) {
  const seen = new Set<string>();
  return players.flatMap(p => (room.topicsBy[p.id] ?? []).map(t => SAMPLE_KEYS.has(topicKey(t.title, t.options))
    ? { ...t, authorId: null as string | null, authorName: 'サンプル' }
    : { ...t, authorId: p.id as string | null, authorName: p.name }))
    .filter(t => {
      const key = topicKey(t.title, t.options);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function startError(room: RoomState): string | null {
  const n = online(room).length;
  if (n < room.minPlayers) return `あと${room.minPlayers - n}人必要です（${room.minPlayers}〜10人）`;
  const total = topicPool(room, online(room)).length;
  if (total < n) return `お題が足りません（同じお題は1つにまとめて${total}個 / ${n}人分必要）。誰かがお題を作ってから入り直してください`;
  return null;
}

export function start(room: RoomState, ctx: Ctx): TierState {
  const players = online(room);
  const pool = topicPool(room, players);
  // 自作のお題を優先して配り、足りない分をサンプルで補う（柱3）。「作成者ごとに1つずつ」なら作成者から1つずつ先に選ぶ
  const custom = shuffle(pool.filter(t => t.authorId), ctx.random);
  const samples = pool.filter(t => !t.authorId);
  const first = room.pickMode === 'each' ? custom.filter((t, i) => custom.findIndex(x => x.authorId === t.authorId) === i) : [];
  const rest = custom.filter(t => !first.includes(t));
  const chosen = [...shuffle(first, ctx.random), ...rest, ...shuffle(samples, ctx.random)].slice(0, players.length);
  // 自分が作ったお題がなるべく自分に当たらない割り振りを探す
  let best = chosen, bestOwn = Infinity;
  for (let i = 0; i < 300 && bestOwn > 0; i++) {
    const pick = shuffle(chosen, ctx.random);
    const own = pick.filter((t, k) => t.authorId === players[k].id).length;
    if (own < bestOwn) { best = pick; bestOwn = own; }
  }
  const assign: Record<string, Assigned> = {};
  players.forEach((p, k) => {
    const t = best[k];
    assign[p.id] = { title: t.title, options: shuffle(t.options, ctx.random).slice(0, t.count), authorId: t.authorId, authorName: t.authorName };
  });
  room.players.forEach(p => { p.score = 0; });
  return { kind: 'tier', phase: 'ranking', assign, ranks: {}, order: [], round: 0, guesses: {}, reveal: null, deadline: ctx.now + limitMs(room) };
}

const limitMs = (room: RoomState) => room.timeLimit * 1000;

export const currentTarget = (g: TierState) => (g.phase === 'guess' || g.phase === 'reveal') ? g.order[g.round] : undefined;

// 準備フェーズを締める。問題数を参加人数とそろえるため、並べていない人の分はランダムに埋めて、全員を当てられる側にする
function toGuess(room: RoomState, g: TierState, ctx: Ctx) {
  for (const p of room.players) if (g.assign[p.id] && !g.ranks[p.id]) g.ranks[p.id] = fillRandom([], g.assign[p.id].options.length, ctx);
  g.order = shuffle(room.players.filter(p => g.ranks[p.id]).map(p => p.id), ctx.random);
  g.round = 0; g.guesses = {};
  g.phase = g.order.length ? 'guess' : 'result';
  g.deadline = g.phase === 'guess' ? ctx.now + limitMs(room) : 0;
}

function toReveal(room: RoomState, g: TierState, ctx: Ctx) {
  const tgt = currentTarget(g)!;
  const answer = g.ranks[tgt];
  const rows = room.players.filter(p => g.guesses[p.id]).map(p => {
    const order = g.guesses[p.id];
    const hits = order.filter((v, i) => v === answer[i]).length;
    return { id: p.id, name: p.name, order, hits, pts: hits + (hits === answer.length ? PERFECT_BONUS : 0) };
  });
  const timeouts = room.players.filter(p => p.id !== tgt && p.online && !g.guesses[p.id]).map(p => p.name);
  g.reveal = { answer, rows, timeouts, shown: 0, suspense: false, done: false, nextAt: ctx.now + REVEAL_FIRST_MS };
  g.phase = 'reveal';
  g.deadline = 0;
}

// 全部めくり終わった時点で得点を加算する
function finishReveal(room: RoomState, r: Reveal) {
  r.shown = r.answer.length; r.suspense = false; r.nextAt = 0;
  if (r.done) return;
  r.done = true;
  for (const row of r.rows) {
    const p = room.players.find(x => x.id === row.id);
    if (p) p.score += row.pts;
  }
}

// 全員がそろったら、時間を待たずに次へ
export function checkAdvance(room: RoomState, g: TierState, ctx: Ctx) {
  if (g.phase === 'ranking' && online(room).every(p => g.ranks[p.id] || !g.assign[p.id])) toGuess(room, g, ctx);
  else if (g.phase === 'guess') {
    const tgt = currentTarget(g);
    if (online(room).filter(p => p.id !== tgt).every(p => g.guesses[p.id])) toReveal(room, g, ctx);
  }
}

// モードの操作を受け付ける。受け付けたら true
export function reduce(room: RoomState, g: TierState, a: ActionFrom, ctx: Ctx): boolean {
  const isHost = a.from === room.hostId;
  switch (a.t) {
    case 'rank': {
      if (g.phase !== 'ranking' || !g.assign[a.from]) return false;
      const n = g.assign[a.from].options.length;
      // 時間切れで途中までしか並べていないときは、空きをランダムに埋める
      const order = a.partial ? fillRandom(a.order, n, ctx) : a.order;
      if (!validOrder(order, n)) return false;
      g.ranks[a.from] = order;
      checkAdvance(room, g, ctx);
      return true;
    }
    case 'guess': {
      const tgt = currentTarget(g);
      if (g.phase !== 'guess' || !tgt || a.round !== g.round || a.from === tgt || !validOrder(a.order, g.assign[tgt].options.length)) return false;
      g.guesses[a.from] = a.order;
      checkAdvance(room, g, ctx);
      return true;
    }
    case 'retract': // 決定した予想を取り消す（全員そろうと答え合わせに進むので、それまでの間だけ）
      if (g.phase !== 'guess' || a.round !== g.round || !g.guesses[a.from]) return false;
      delete g.guesses[a.from];
      return true;
    case 'force':
      if (!isHost) return false;
      if (g.phase === 'ranking') toGuess(room, g, ctx);
      else if (g.phase === 'guess') toReveal(room, g, ctx);
      else return false;
      return true;
    case 'timeUp':
      if (!isHost || !g.deadline || ctx.now < g.deadline + PICK_GRACE_MS) return false;
      if (g.phase === 'ranking') toGuess(room, g, ctx);
      else if (g.phase === 'guess') toReveal(room, g, ctx);
      else return false;
      return true;
    case 'revealStep': {
      const r = g.phase === 'reveal' ? g.reveal : null;
      if (!isHost || !r || r.done) return false;
      const n = r.answer.length;
      if (r.shown === n - 1 && !r.suspense) {
        r.suspense = true; // 「1位は…」で溜める
        r.nextAt = ctx.now + REVEAL_SUSPENSE_MS;
      } else {
        r.suspense = false;
        r.shown++;
        if (r.shown >= n) finishReveal(room, r);
        else r.nextAt = ctx.now + REVEAL_STEP_MS;
      }
      return true;
    }
    case 'reveal-all':
      if (g.phase !== 'reveal' || !g.reveal || g.reveal.done || (!isHost && a.from !== currentTarget(g))) return false;
      finishReveal(room, g.reveal);
      return true;
    case 'next':
      if (!isHost || g.phase !== 'reveal' || !g.reveal?.done) return false;
      g.round++; g.guesses = {}; g.reveal = null;
      g.phase = g.round < g.order.length ? 'guess' : 'result';
      g.deadline = g.phase === 'guess' ? ctx.now + limitMs(room) : 0;
      return true;
    default:
      return false;
  }
}

// 次に時間で起きること
export function nextTimer(g: TierState): Timer | null {
  if ((g.phase === 'ranking' || g.phase === 'guess') && g.deadline) return { at: g.deadline + PICK_GRACE_MS, action: { t: 'timeUp' } };
  if (g.phase === 'reveal' && g.reveal && !g.reveal.done && g.reveal.nextAt) return { at: g.reveal.nextAt, action: { t: 'revealStep' } };
  return null;
}
