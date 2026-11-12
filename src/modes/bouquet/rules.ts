// ワードブーケのルール（このフォルダの README.md の14章）。画面・通信・ブラウザの機能は使わない（時刻と乱数は ctx で受け取る）
import { BOUQUET_MAX_ROUNDS, PICK_GRACE_MS } from '../../core/constants';
import { shuffle } from '../../core/random';
import type { ActionFrom, Ctx, RoomState, Timer } from '../../core/types';
import { dealHand, SAMPLE_BOUQUETS, toPhrase } from './words';

export type BouquetPhase = 'compose' | 'choose' | 'bloom' | 'result';

export interface BouquetState {
  kind: 'bouquet';
  phase: BouquetPhase;
  ring: string[];                    // 親が回る順（参加者のID）
  names: Record<string, string>;     // 開始時の名前
  round: number;
  goal: number;                      // 0 = 全員が親を1回。1以上 = その点を先に取った人が出たら終わり
  parentId: string;
  theme: string;                     // お題
  themeBy: string;                   // お題を持ってきた人の名前（サンプルなら「サンプル」）
  used: string[];                    // 使ったお題（同じお題は、1ゲームに1回まで）
  hands: Record<string, string[]>;   // 手札（親には配らない）
  redrawn: Record<string, boolean>;  // 手札を引き直したか（1ラウンドに1回）
  phrases: Record<string, string>;   // 提出された文
  winner: string | null;             // 親が選んだ人
  deadline: number;                  // 作る締め切り（0 = なし）
}

const online = (room: RoomState) => room.players.filter(p => p.online);
const isOnline = (room: RoomState, id: string) => !!room.players.find(p => p.id === id)?.online;
// その回に作る人（親以外で、手札が配られた人）
export const composers = (room: RoomState, g: BouquetState) => online(room).filter(p => p.id in g.hands);

export function startError(room: RoomState): string | null {
  const n = online(room).length;
  if (n < room.minPlayers) return `あと${room.minPlayers - n}人必要です（${room.minPlayers}〜10人）`;
  return null;
}

// 新しいラウンド：親を決め（つながっている人まで飛ばす）、お題を決め、手札を配る
function deal(room: RoomState, g: BouquetState, ctx: Ctx) {
  const n = g.ring.length;
  let parent = g.ring[g.round % n];
  for (let i = 0; i < n && !isOnline(room, parent); i++) parent = g.ring[(g.round + i + 1) % n];
  g.parentId = parent;
  // お題：親が持ってきたものから1つ。なければサンプル。使い切ったら、使ったものからもう一度
  const own = shuffle(room.bouquetsBy[parent] ?? [], ctx.random).find(t => !g.used.includes(t));
  const sample = shuffle(SAMPLE_BOUQUETS, ctx.random);
  g.theme = own ?? sample.find(t => !g.used.includes(t)) ?? sample[0];
  g.themeBy = own ? g.names[parent] ?? '???' : 'サンプル';
  g.used.push(g.theme);
  g.hands = Object.fromEntries(online(room).filter(p => p.id !== parent).map(p => [p.id, dealHand(ctx.random)]));
  g.redrawn = {};
  g.phrases = {};
  g.winner = null;
  g.phase = 'compose';
  g.deadline = ctx.now + room.bouquetTime * 1000;
}

export function start(room: RoomState, ctx: Ctx): BouquetState {
  const players = shuffle(online(room), ctx.random);
  room.players.forEach(p => { p.score = 0; });
  const g: BouquetState = {
    kind: 'bouquet', phase: 'compose', ring: players.map(p => p.id), names: Object.fromEntries(players.map(p => [p.id, p.name])),
    round: 0, goal: room.bouquetGoal, parentId: '', theme: '', themeBy: '', used: [], hands: {}, redrawn: {}, phrases: {}, winner: null, deadline: 0,
  };
  deal(room, g, ctx);
  return g;
}

// 作る時間を締めて、親が選ぶ番へ。誰も提出していなければ、選ぶものがないので、そのまま発表（点なし）へ
function toChoose(g: BouquetState) {
  g.deadline = 0;
  g.phase = Object.keys(g.phrases).length ? 'choose' : 'bloom';
}

// 全員が提出したら、時間を待たずに次へ
export function checkAdvance(room: RoomState, g: BouquetState, _ctx: Ctx) {
  if (g.phase === 'compose' && composers(room, g).every(p => p.id in g.phrases)) toChoose(g);
}

// このラウンドで終わりか
const isLast = (room: RoomState, g: BouquetState) => g.goal === 0
  ? g.round + 1 >= g.ring.length
  : room.players.some(p => p.score >= g.goal) || g.round + 1 >= BOUQUET_MAX_ROUNDS;

export function reduce(room: RoomState, g: BouquetState, a: ActionFrom, ctx: Ctx): boolean {
  const isHost = a.from === room.hostId;
  switch (a.t) {
    case 'phrase': {
      const hand = g.hands[a.from];
      if (g.phase !== 'compose' || a.round !== g.round || !hand || a.from in g.phrases) return false;
      const text = toPhrase(a.tokens, hand);
      if (!text) return false;
      g.phrases[a.from] = text;
      checkAdvance(room, g, ctx);
      return true;
    }
    case 'redraw':
      // 手札をまるごと引き直す（1ラウンドに1回。提出したあとは引き直せない）
      if (g.phase !== 'compose' || a.round !== g.round || !(a.from in g.hands) || a.from in g.phrases || g.redrawn[a.from]) return false;
      g.hands[a.from] = dealHand(ctx.random);
      g.redrawn[a.from] = true;
      return true;
    case 'choose':
      if (g.phase !== 'choose' || a.round !== g.round || a.from !== g.parentId || !(a.id in g.phrases)) return false;
      g.winner = a.id;
      { const p = room.players.find(x => x.id === a.id); if (p) p.score += 1; }
      g.phase = 'bloom';
      return true;
    case 'force':
      // 作る時間を待たずに進める／親が選べないときは、選ばずに進める（その回は点なし）
      if (!isHost) return false;
      if (g.phase === 'compose') toChoose(g);
      else if (g.phase === 'choose') g.phase = 'bloom';
      else return false;
      return true;
    case 'timeUp':
      if (!isHost || g.phase !== 'compose' || !g.deadline || ctx.now < g.deadline + PICK_GRACE_MS) return false;
      toChoose(g);
      return true;
    case 'next':
      if (!isHost || g.phase !== 'bloom') return false;
      if (isLast(room, g)) { g.phase = 'result'; return true; }
      g.round++;
      deal(room, g, ctx);
      return true;
    default:
      return false;
  }
}

export function nextTimer(g: BouquetState): Timer | null {
  if (g.phase === 'compose' && g.deadline) return { at: g.deadline + PICK_GRACE_MS, action: { t: 'timeUp' } };
  return null;
}

// 全部で何ラウンドか（先取のときは決まらないので 0）
export const totalRounds = (g: BouquetState) => g.goal === 0 ? g.ring.length : 0;
