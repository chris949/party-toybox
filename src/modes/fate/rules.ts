// 運命の二者択一のルール（docs/spec.md の11章）。画面・通信・ブラウザの機能は使わない（時刻と乱数は ctx で受け取る）
import { FATE_GRACE_MS, FATE_VERDICT_MS } from '../../core/constants';
import { fateKey, SAMPLE_FATE_KEYS, SAMPLE_FATES, type FateQuestion } from '../../core/fates';
import { shuffle } from '../../core/random';
import type { ActionFrom, Ctx, RoomState, Timer } from '../../core/types';

export type FatePhase = 'question' | 'verdict' | 'result';
export type Side = 'L' | 'R';
export type Pos = Side | 'C'; // C = 真ん中（動いていない）

export interface FateCard extends FateQuestion {
  rightSide: Side;      // 正解を出す側（発表まで参加者には送らない）
  authorIds: string[];  // この問題を持ってきた人（自動でセーフ）。サンプルは空
  authorName: string;
}

export interface FateVerdict {
  fallen: string[]; // この問題で落ちた人
  saved: boolean;   // 全員が不正解だったので、全員セーフにした
}

export interface FateState {
  kind: 'fate';
  phase: FatePhase;
  deck: FateCard[];             // 1ゲーム分の問題の束
  round: number;
  pos: Record<string, Pos>;     // 全員の位置（ゴーストも含む）
  out: Record<string, number>;  // 脱落した人 → 落ちた問題の番号（0始まり）
  verdict: FateVerdict | null;
  deadline: number;             // 移動の締め切り（0 = なし）
  nextAt: number;               // 発表のあと、次へ進む時刻（0 = なし）
  paused: number | null;        // 一時停止中なら、止めたときの残り時間（ミリ秒）
}

const online = (room: RoomState) => room.players.filter(p => p.online);
const limitMs = (room: RoomState) => room.fateTime * 1000;
export const cardOf = (g: FateState) => g.deck[g.round];
export const isSide = (s: unknown): s is Side => s === 'L' || s === 'R';
// 生き残っている人（切断中の人も、落ちるまでは生き残り）
export const survivors = (room: RoomState, g: FateState) => room.players.filter(p => !(p.id in g.out));

// 持ち込まれた問題をまとめる。同じ問題は1つにし、持ってきた人を全員「作った人」として覚える。同梱のサンプルと同じものは除く
export function fatePool(room: RoomState) {
  const byKey = new Map<string, Omit<FateCard, 'rightSide'>>();
  for (const p of online(room)) {
    for (const q of room.fatesBy[p.id] ?? []) {
      const key = fateKey(q);
      if (SAMPLE_FATE_KEYS.has(key)) continue;
      const had = byKey.get(key);
      if (had) had.authorIds.push(p.id);
      else byKey.set(key, { ...q, authorIds: [p.id], authorName: p.name });
    }
  }
  return [...byKey.values()];
}

export function startError(room: RoomState): string | null {
  const n = online(room).length;
  if (n < room.minPlayers) return `あと${room.minPlayers - n}人必要です（${room.minPlayers}〜10人）`;
  return null;
}

const centered = (room: RoomState): Record<string, Pos> => Object.fromEntries(room.players.map(p => [p.id, 'C' as Pos]));

export function start(room: RoomState, ctx: Ctx): FateState {
  // 全員が持ってきた問題を先に、そのあとに同梱のサンプルを並べる。順番はそれぞれの中でランダム
  const custom = shuffle(fatePool(room), ctx.random);
  const samples = shuffle(SAMPLE_FATES, ctx.random).map(q => ({ ...q, authorIds: [] as string[], authorName: 'サンプル' }));
  const deck = [...custom, ...samples].map(q => ({ ...q, rightSide: (ctx.random() < 0.5 ? 'L' : 'R') as Side }));
  room.players.forEach(p => { p.score = 0; });
  return { kind: 'fate', phase: 'question', deck, round: 0, pos: centered(room), out: {}, verdict: null, deadline: ctx.now + limitMs(room), nextAt: 0, paused: null };
}

// 締め切り：その瞬間にいた側を答えとする。真ん中のままの人は不正解。作った人は結果に関わらない
function judge(room: RoomState, g: FateState, ctx: Ctx) {
  const card = cardOf(g);
  const judged = survivors(room, g).filter(p => !card.authorIds.includes(p.id));
  const wrong = judged.filter(p => g.pos[p.id] !== card.rightSide);
  const saved = judged.length > 0 && wrong.length === judged.length; // 全員が不正解なら、全員セーフ
  const fallen = saved ? [] : wrong.map(p => p.id);
  for (const id of fallen) g.out[id] = g.round;
  g.verdict = { fallen, saved };
  g.phase = 'verdict';
  g.deadline = 0;
  g.nextAt = ctx.now + FATE_VERDICT_MS;
}

// 発表のあと：生き残りが1人なら終わり。問題がなくなったら、残った全員の勝ち
function advance(room: RoomState, g: FateState, ctx: Ctx) {
  g.nextAt = 0;
  if (survivors(room, g).length <= 1 || g.round + 1 >= g.deck.length) { g.phase = 'result'; return; }
  g.round++;
  g.pos = centered(room);
  g.verdict = null;
  g.phase = 'question';
  g.deadline = ctx.now + limitMs(room);
}

// 全員の移動を待たない（締め切りまで何度でも動ける）ので、誰かが抜けても進め方は変わらない
export function checkAdvance(_room: RoomState, _g: FateState, _ctx: Ctx) { /* 何もしない */ }

export function reduce(room: RoomState, g: FateState, a: ActionFrom, ctx: Ctx): boolean {
  const isHost = a.from === room.hostId;
  switch (a.t) {
    case 'move':
      // ゴーストも作った人も動ける（結果には関わらない）
      if (g.phase !== 'question' || !isSide(a.side) || !room.players.some(p => p.id === a.from)) return false;
      if (g.deadline && ctx.now > g.deadline + FATE_GRACE_MS) return false;
      if (g.pos[a.from] === a.side) return false;
      g.pos[a.from] = a.side;
      return true;
    case 'timeUp':
      if (!isHost || g.phase !== 'question' || g.paused != null || !g.deadline || ctx.now < g.deadline + FATE_GRACE_MS) return false;
      judge(room, g, ctx);
      return true;
    case 'revealStep':
      if (!isHost || g.phase !== 'verdict' || g.paused != null || !g.nextAt || ctx.now < g.nextAt) return false;
      advance(room, g, ctx);
      return true;
    case 'pause': {
      if (!isHost || g.phase === 'result') return false;
      const key = g.phase === 'question' ? 'deadline' : 'nextAt';
      if (g.paused == null) { g.paused = Math.max(0, g[key] - ctx.now); g[key] = 0; }
      else { g[key] = ctx.now + g.paused; g.paused = null; }
      return true;
    }
    default:
      return false;
  }
}

export function nextTimer(g: FateState): Timer | null {
  if (g.paused != null) return null;
  if (g.phase === 'question' && g.deadline) return { at: g.deadline + FATE_GRACE_MS, action: { t: 'timeUp' } };
  if (g.phase === 'verdict' && g.nextAt) return { at: g.nextAt, action: { t: 'revealStep' } };
  return null;
}

// 順位：最後まで残った人が1位。そのあとは落ちるのが遅かった順。同じ問題で落ちた人は同じ順位
export function fateRanks(ids: readonly string[], out: Record<string, number>): Record<string, number> {
  const at = (id: string) => out[id] ?? Infinity;
  return Object.fromEntries(ids.map(id => [id, 1 + ids.filter(x => at(x) > at(id)).length]));
}
