// 運命の二者択一のルール（docs/spec.md の11章）。画面・通信・ブラウザの機能は使わない（時刻と乱数は ctx で受け取る）
import { FATE_GRACE_MS, FATE_VERDICT_MS } from '../../core/constants';
import { fateKey, SAMPLE_FATE_KEYS, SAMPLE_FATES, type FateQuestion } from '../../core/fates';
import { fiveKey, SAMPLE_FIVE_KEYS, SAMPLE_FIVES, type FiveTopic } from '../../core/fives';
import { shuffle } from '../../core/random';
import type { ActionFrom, Ctx, RoomState, Timer } from '../../core/types';

export type FatePhase = 'question' | 'verdict' | 'result';
export type Side = 'L' | 'R';
export type Pos = Side | 'C'; // C = 真ん中（動いていない）

export interface FateCard extends FateQuestion {
  rightSide: Side;      // 正解を出す側（発表まで参加者には送らない）
  authorIds: string[];  // この問題でお立ち台に立つ人（自動でセーフ）。持ってきた人か、サンプルを割り当てられた人。空なら全員が答える
  authorName: string;
  sample: boolean;      // 同梱のサンプルか（誰かに割り当てていても true）
}

export interface FateVerdict {
  fallen: string[]; // この問題で落ちた人（ライフが1つ減る）
  out: string[];    // そのうち、ライフが尽きて脱落した人
  saved: boolean;   // 全員が不正解だったので、全員セーフにした
}

export interface FateState {
  kind: 'fate';
  phase: FatePhase;
  deck: FateCard[];             // 1ゲーム分の問題の束
  round: number;
  pos: Record<string, Pos>;     // 全員の位置（ゴーストも含む）
  out: Record<string, number>;  // 脱落した人 → 落ちた問題の番号（0始まり）
  lives: Record<string, number>; // 残りのライフ
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
      else byKey.set(key, { ...q, authorIds: [p.id], authorName: p.name, sample: false });
    }
  }
  return [...byKey.values()];
}

// セレクトファイブのお題から、正解1つとダミー1つを抜いて2択の問題にする（1つのお題から出すのは、1ゲームに1問）
export function fromFive(t: FiveTopic, ctx: Ctx): FateQuestion {
  const pick = (list: string[]) => list[Math.floor(ctx.random() * list.length)];
  return { text: t.title, right: pick(t.answers), wrong: pick(t.dummies) };
}

// 持ち込まれたセレクトファイブのお題をまとめる（同じお題は1つにし、持ってきた人を全員「作った人」として覚える。同梱のサンプルと同じものは除く）
export function fiveTopicsForFate(room: RoomState) {
  const byKey = new Map<string, { topic: FiveTopic; authorIds: string[]; authorName: string }>();
  for (const p of online(room)) {
    for (const t of room.fivesBy[p.id] ?? []) {
      const key = fiveKey(t);
      if (SAMPLE_FIVE_KEYS.has(key)) continue;
      const had = byKey.get(key);
      if (had) had.authorIds.push(p.id);
      else byKey.set(key, { topic: t, authorIds: [p.id], authorName: p.name });
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
  // 持ってきた問題と、同梱のサンプルを、それぞれランダムに並べる。
  // セレクトファイブのお題も、正解とダミーを1つずつ抜いた2択にして、それぞれの側に混ぜる
  const custom = shuffle([
    ...fatePool(room),
    ...fiveTopicsForFate(room).map(x => ({ ...fromFive(x.topic, ctx), authorIds: x.authorIds, authorName: x.authorName, sample: false })),
  ], ctx.random);
  const samples = shuffle([...SAMPLE_FATES, ...SAMPLE_FIVES.map(t => fromFive(t, ctx))], ctx.random)
    .map(q => ({ ...q, authorIds: [] as string[], authorName: 'サンプル', sample: true }));
  // お立ち台のローテーション：全員が同じ回数ずつ、順番に出題者になる。自分の問題がある人はそれを、ない人・足りない人はサンプルを受け持つ。
  // 回数を超えた分の持ち込みは、このゲームでは出さない（1人がたくさん持ってきても、その人だけがお立ち台に立ち続けないように）
  const order = shuffle(online(room), ctx.random);
  const own = new Map(order.map(p => [p.id, [] as typeof custom]));
  for (const c of custom) own.get(c.authorIds[0])?.push(c);
  const rotation: typeof custom = [];
  for (let k = 0; k < room.fateQuota; k++) {
    for (const p of order) {
      const c = own.get(p.id)![k] ?? (samples.length ? { ...samples.shift()!, authorIds: [p.id] } : null);
      if (c) rotation.push(c);
    }
  }
  // 全員の回数が終わったら、残りのサンプルを出す（誰もお立ち台に立たない）
  const deck = [...rotation, ...samples].map(q => ({ ...q, rightSide: (ctx.random() < 0.5 ? 'L' : 'R') as Side }));
  room.players.forEach(p => { p.score = 0; });
  const g: FateState = {
    kind: 'fate', phase: 'question', deck, round: 0, pos: centered(room), out: {},
    lives: Object.fromEntries(room.players.map(p => [p.id, room.fateLives])),
    verdict: null, deadline: ctx.now + limitMs(room), nextAt: 0, paused: null,
  };
  settle(room, g);
  return g;
}

// 生き残りが2人以下のときは、生き残りをお立ち台に立たせない（答える人が1人だけになると、不正解でも救済されて決着が付かないため）。
// 今の番号の問題がそれに当たるなら、サンプルは割り当てを外し、生き残りが持ってきた問題は後回しにして、出せる問題と入れ替える。
// 出せる問題が残っていなければ false
function settle(room: RoomState, g: FateState): boolean {
  const alive = new Set(survivors(room, g).map(p => p.id));
  if (alive.size > 2) return true;
  for (let j = g.round; j < g.deck.length; j++) {
    const c = g.deck[j];
    if (c.sample) c.authorIds = c.authorIds.filter(id => !alive.has(id));
    else if (c.authorIds.some(id => alive.has(id))) continue;
    [g.deck[g.round], g.deck[j]] = [g.deck[j], g.deck[g.round]];
    return true;
  }
  return false;
}

// 締め切り：その瞬間にいた側を答えとする。真ん中のままの人は不正解。作った人は結果に関わらない
function judge(room: RoomState, g: FateState, ctx: Ctx) {
  const card = cardOf(g);
  const judged = survivors(room, g).filter(p => !card.authorIds.includes(p.id));
  const wrong = judged.filter(p => g.pos[p.id] !== card.rightSide);
  const saved = judged.length > 0 && wrong.length === judged.length; // 全員が不正解なら、全員セーフ
  const fallen = saved ? [] : wrong.map(p => p.id);
  // 落ちるたびにライフが1つ減り、0になったら脱落
  const out = fallen.filter(id => (g.lives[id] = Math.max(0, (g.lives[id] ?? 1) - 1)) === 0);
  for (const id of out) g.out[id] = g.round;
  g.verdict = { fallen, out, saved };
  g.phase = 'verdict';
  g.deadline = 0;
  g.nextAt = ctx.now + FATE_VERDICT_MS;
}

// 発表のあと：生き残りが1人なら終わり。問題がなくなったら、残った全員の勝ち
function advance(room: RoomState, g: FateState, ctx: Ctx) {
  g.nextAt = 0;
  if (survivors(room, g).length <= 1 || g.round + 1 >= g.deck.length) { g.phase = 'result'; return; }
  g.round++;
  if (!settle(room, g)) { g.round--; g.phase = 'result'; return; }
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
      // ゴーストは動ける（結果には関わらない）。作った人は、お立ち台に立っていて動けない
      if (g.phase !== 'question' || !isSide(a.side) || !room.players.some(p => p.id === a.from)) return false;
      if (cardOf(g).authorIds.includes(a.from)) return false;
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
