// セレクトファイブのルール（docs/spec.md の10章）。画面・通信・ブラウザの機能は使わない（時刻と乱数は ctx で受け取る）
import { PERFECT_BONUS, PICK_GRACE_MS, REVEAL_FIRST_MS, REVEAL_STEP_MS } from '../../core/constants';
import { dummyRange, FIVE_PICK, fiveKey, SAMPLE_FIVE_KEYS, SAMPLE_FIVES, type FiveTopic } from '../../core/fives';
import { shuffle } from '../../core/random';
import type { ActionFrom, Ctx, RoomState, Timer } from '../../core/types';

export type FivePhase = 'answer' | 'reveal' | 'result';

export interface FiveRound {
  title: string;
  options: string[];   // 出題する選択肢（正解とダミーを混ぜてシャッフルしたもの）
  correct: boolean[];  // options と同じ並び。true = 正解（答え合わせまで答える人には送らない）
  authorId: string | null; // null = サンプル
  authorName: string;
}

export interface FiveRow { id: string; name: string; picks: number[]; hits: number; pts: number }

export interface FiveReveal {
  order: number[];   // めくる順（正解をすべて → ダミーをすべて）。ダミーは、最後の正解と同時にまとめて明かす
  nCorrect: number;
  rows: FiveRow[];
  timeouts: string[]; // 時間切れで答えなかった人の名前
  shown: number;      // めくり済みの数
  suspense: boolean;  // 使わない（ティアリストと形をそろえるため残す）
  done: boolean;
  nextAt: number;
}

export interface FiveState {
  kind: 'five';
  phase: FivePhase;
  rounds: FiveRound[];
  round: number;
  picks: Record<string, number[]>;
  reveal: FiveReveal | null;
  deadline: number; // 答える締め切り（0 = なし）
}

const online = (room: RoomState) => room.players.filter(p => p.online);
const limitMs = (room: RoomState) => room.timeLimit * 1000;
export const roundOf = (g: FiveState) => g.rounds[g.round];

// 選んだ番号が正しい形か（重複なし・範囲内）。partial なら1〜5個、そうでなければちょうど5個
export const validPicks = (p: unknown, n: number, partial = false): p is number[] =>
  Array.isArray(p) && (partial ? p.length >= 1 && p.length <= FIVE_PICK : p.length === FIVE_PICK)
  && new Set(p).size === p.length && p.every(i => Number.isInteger(i) && i >= 0 && i < n);

// 持ち込まれたお題をまとめる。同じお題は1つにし、先に入った人を作成者にする。手を加えていないサンプルは除く（あとで同梱分から補う）
export function fivePool(room: RoomState) {
  const seen = new Set<string>(SAMPLE_FIVE_KEYS);
  return online(room).flatMap(p => (room.fivesBy[p.id] ?? []).flatMap(t => {
    const key = fiveKey(t);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...t, authorId: p.id as string | null, authorName: p.name }];
  }));
}

export function startError(room: RoomState): string | null {
  const n = online(room).length;
  if (n < room.minPlayers) return `あと${room.minPlayers - n}人必要です（${room.minPlayers}〜10人）`;
  return null;
}

// 1つのお題から、決めた数だけ正解とダミーを抜き出して混ぜる
export function deal(t: FiveTopic, ctx: Ctx): { options: string[]; correct: boolean[] } {
  const size = Math.min(t.size, t.answers.length + t.dummies.length);
  const r = dummyRange(size, t.answers.length, t.dummies.length);
  const nd = t.dummy == null ? r.lo + Math.floor(ctx.random() * (r.hi - r.lo + 1)) : Math.max(r.lo, Math.min(r.hi, t.dummy));
  const picked = [
    ...shuffle(t.answers, ctx.random).slice(0, size - nd).map(o => ({ o, c: true })),
    ...shuffle(t.dummies, ctx.random).slice(0, nd).map(o => ({ o, c: false })),
  ];
  const mixed = shuffle(picked, ctx.random);
  return { options: mixed.map(x => x.o), correct: mixed.map(x => x.c) };
}

export function start(room: RoomState, ctx: Ctx): FiveState {
  const n = online(room).length;
  // 自作のお題を優先する（柱3）。「作成者ごとに1つずつ」なら作成者から1つずつ先に選ぶ。
  // 足りなければ、たくさん持ってきた人のお題から多めに出し、それでも足りなければ同梱のサンプルで埋める
  const custom = shuffle(fivePool(room), ctx.random);
  const first = room.pickMode === 'each' ? custom.filter((t, i) => custom.findIndex(x => x.authorId === t.authorId) === i) : [];
  const rest = custom.filter(t => !first.includes(t));
  const samples = shuffle(SAMPLE_FIVES, ctx.random).map(t => ({ ...t, authorId: null as string | null, authorName: 'サンプル' }));
  const chosen = shuffle([...shuffle(first, ctx.random), ...rest, ...samples].slice(0, n), ctx.random);
  const rounds = chosen.map(t => ({ title: t.title, ...deal(t, ctx), authorId: t.authorId, authorName: t.authorName }));
  room.players.forEach(p => { p.score = 0; });
  return { kind: 'five', phase: 'answer', rounds, round: 0, picks: {}, reveal: null, deadline: ctx.now + limitMs(room) };
}

// このラウンドで答える人か（作者は答えない）
export const answers = (g: FiveState, id: string) => roundOf(g)?.authorId !== id;

function toReveal(room: RoomState, g: FiveState, ctx: Ctx) {
  const rd = roundOf(g);
  const rows = room.players.filter(p => g.picks[p.id]).map(p => {
    const picks = g.picks[p.id];
    const hits = picks.filter(i => rd.correct[i]).length;
    return { id: p.id, name: p.name, picks, hits, pts: hits + (hits === FIVE_PICK ? PERFECT_BONUS : 0) };
  });
  const timeouts = room.players.filter(p => p.online && answers(g, p.id) && !g.picks[p.id]).map(p => p.name);
  const idx = rd.options.map((_, i) => i);
  const order = [...idx.filter(i => rd.correct[i]), ...idx.filter(i => !rd.correct[i])];
  g.reveal = { order, nCorrect: order.filter(i => rd.correct[i]).length, rows, timeouts, shown: 0, suspense: false, done: false, nextAt: ctx.now + REVEAL_FIRST_MS };
  g.phase = 'reveal';
  g.deadline = 0;
}

// 全部めくり終わった時点で得点を加算する
function finishReveal(room: RoomState, r: FiveReveal) {
  r.shown = r.order.length; r.suspense = false; r.nextAt = 0;
  if (r.done) return;
  r.done = true;
  for (const row of r.rows) {
    const p = room.players.find(x => x.id === row.id);
    if (p) p.score += row.pts;
  }
}

// 答える人が全員そろったら、時間を待たずに答え合わせへ
export function checkAdvance(room: RoomState, g: FiveState, ctx: Ctx) {
  if (g.phase === 'answer' && online(room).filter(p => answers(g, p.id)).every(p => g.picks[p.id])) toReveal(room, g, ctx);
}

export function reduce(room: RoomState, g: FiveState, a: ActionFrom, ctx: Ctx): boolean {
  const isHost = a.from === room.hostId;
  switch (a.t) {
    case 'five': {
      if (g.phase !== 'answer' || a.round !== g.round || !answers(g, a.from) || g.picks[a.from]) return false;
      if (!validPicks(a.picks, roundOf(g).options.length, a.partial)) return false;
      g.picks[a.from] = a.picks;
      checkAdvance(room, g, ctx);
      return true;
    }
    case 'retract': // 決定した回答を取り消す（答える人が全員そろうと答え合わせに進むので、それまでの間だけ）
      if (g.phase !== 'answer' || a.round !== g.round || !g.picks[a.from]) return false;
      delete g.picks[a.from];
      return true;
    case 'force':
      if (!isHost || g.phase !== 'answer') return false;
      toReveal(room, g, ctx);
      return true;
    case 'timeUp':
      if (!isHost || g.phase !== 'answer' || !g.deadline || ctx.now < g.deadline + PICK_GRACE_MS) return false;
      toReveal(room, g, ctx);
      return true;
    case 'revealStep': {
      const r = g.phase === 'reveal' ? g.reveal : null;
      if (!isHost || !r || r.done) return false;
      // 正解を1つずつめくる。最後の正解をめくるときに、ダミーもまとめて明かして終わる（溜めると、テンポが悪くなるため）
      r.shown++;
      if (r.shown >= r.nCorrect) finishReveal(room, r);
      else r.nextAt = ctx.now + REVEAL_STEP_MS;
      return true;
    }
    case 'reveal-all':
      if (g.phase !== 'reveal' || !g.reveal || g.reveal.done || (!isHost && a.from !== roundOf(g).authorId)) return false;
      finishReveal(room, g.reveal);
      return true;
    case 'next':
      if (!isHost || g.phase !== 'reveal' || !g.reveal?.done) return false;
      g.round++; g.picks = {}; g.reveal = null;
      g.phase = g.round < g.rounds.length ? 'answer' : 'result';
      g.deadline = g.phase === 'answer' ? ctx.now + limitMs(room) : 0;
      return true;
    default:
      return false;
  }
}

export function nextTimer(g: FiveState): Timer | null {
  if (g.phase === 'answer' && g.deadline) return { at: g.deadline + PICK_GRACE_MS, action: { t: 'timeUp' } };
  if (g.phase === 'reveal' && g.reveal && !g.reveal.done && g.reveal.nextAt) return { at: g.reveal.nextAt, action: { t: 'revealStep' } };
  return null;
}
