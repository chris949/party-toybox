// スタンプ伝言のルール（このフォルダの README.md の17章）。画面・通信・ブラウザの機能は使わない（時刻と乱数は ctx で受け取る）
import { PICK_GRACE_MS, RELAY_GUESS_SEC, RELAY_MAX_STEPS } from '../../core/constants';
import { shuffle } from '../../core/random';
import type { ActionFrom, Ctx, RoomState, Timer } from '../../core/types';
import { cleanAnswer, normalizeAnswer, RELAY_WORDS, sanitizeStamps, type Stamp } from './stamps';

export type RelayPhase = 'work' | 'unfold' | 'result';
export type RelayKind = 'draw' | 'guess';

// 紙に足していく1つ分：絵（スタンプ）か、答え（言葉）。auto = 時間切れなどで、ホストが埋めた
export type Entry = { by: string; auto: boolean } & ({ kind: 'draw'; stamps: Stamp[] } | { kind: 'guess'; text: string });
export interface Book {
  ownerId: string;      // 最初に持っていた人（発表で読み上げる人）
  word: string;         // 最初のお題
  entries: Entry[];
  hit: boolean | null;  // 最後の答えが、最初のお題と合っていたか（発表でめくり終わったら決まる）
}

export interface RelayState {
  kind: 'relay';
  phase: RelayPhase;
  ring: string[];                 // 紙を回す順（参加者のID）。紙 i は、ring[i] から始まる
  names: Record<string, string>;
  books: Book[];
  step: number;                   // いま何回目か（0始まり。偶数 = 絵を作る、奇数 = 言葉で答える）
  steps: number;                  // 1枚の紙が回る回数
  drafts: Record<string, Entry>;  // この回に、各自が出したもの
  deadline: number;
  show: { idx: number; shown: number } | null; // 発表：何枚目の紙の、何個目までめくったか
}

const online = (room: RoomState) => room.players.filter(p => p.online);
export const kindOf = (step: number): RelayKind => step % 2 === 0 ? 'draw' : 'guess';
// 紙 i を、いま持っている人（1回ごとに、隣へ回る）
export const holderOf = (g: RelayState, book: number) => g.ring[(book + g.step) % g.ring.length];
// その人の手元にある紙（参加していない人は -1）
export const bookOf = (g: RelayState, id: string) => {
  const i = g.ring.indexOf(id), n = g.ring.length;
  return i < 0 ? -1 : ((i - g.step) % n + n) % n;
};
// この回に出す人（参加していて、つながっている人）
export const workers = (room: RoomState, g: RelayState) => online(room).filter(p => g.ring.includes(p.id));

export function startError(room: RoomState): string | null {
  const n = online(room).length;
  if (n < room.minPlayers) return `あと${room.minPlayers - n}人必要です（${room.minPlayers}〜10人）`;
  return null;
}

const deadlineFor = (room: RoomState, step: number, now: number) => now + (kindOf(step) === 'draw' ? room.relayTime : RELAY_GUESS_SEC) * 1000;

export function start(room: RoomState, ctx: Ctx): RelayState {
  const players = shuffle(online(room), ctx.random);
  const words = shuffle(RELAY_WORDS, ctx.random);
  room.players.forEach(p => { p.score = 0; });
  return {
    kind: 'relay', phase: 'work', ring: players.map(p => p.id), names: Object.fromEntries(players.map(p => [p.id, p.name])),
    books: players.map((p, i) => ({ ownerId: p.id, word: words[i % words.length], entries: [], hit: null })),
    // 同じ人に同じ紙が2回まわらないよう、人数まで。長くなりすぎないよう、上限も付ける
    step: 0, steps: Math.min(players.length, RELAY_MAX_STEPS), drafts: {}, deadline: deadlineFor(room, 0, ctx.now), show: null,
  };
}

// この回を締める：出していない人の分は、空の絵か「？？？」で埋める。全部の紙を隣へ回す
function commit(room: RoomState, g: RelayState, ctx: Ctx) {
  const kind = kindOf(g.step);
  g.books.forEach((b, i) => {
    const by = holderOf(g, i);
    b.entries.push(g.drafts[by] ?? (kind === 'draw' ? { by, auto: true, kind, stamps: [] } : { by, auto: true, kind, text: '？？？' }));
  });
  g.drafts = {};
  g.step++;
  if (g.step >= g.steps) { g.phase = 'unfold'; g.deadline = 0; g.show = { idx: 0, shown: 0 }; return; }
  g.deadline = deadlineFor(room, g.step, ctx.now);
}

// 全員が出したら、時間を待たずに次へ
export function checkAdvance(room: RoomState, g: RelayState, ctx: Ctx) {
  if (g.phase !== 'work') return;
  const w = workers(room, g);
  if (w.length && w.every(p => p.id in g.drafts)) commit(room, g, ctx);
}

// 紙をめくり終わった：最後の答えが、最初のお題と合っていたら、その紙に関わった全員に1点
function settle(room: RoomState, b: Book) {
  const last = [...b.entries].reverse().find(e => e.kind === 'guess');
  b.hit = !!last && last.kind === 'guess' && !last.auto && normalizeAnswer(last.text) === normalizeAnswer(b.word);
  if (!b.hit) return;
  for (const id of new Set(b.entries.filter(e => !e.auto).map(e => e.by))) {
    const p = room.players.find(x => x.id === id);
    if (p) p.score += 1;
  }
}

export function reduce(room: RoomState, g: RelayState, a: ActionFrom, ctx: Ctx): boolean {
  const isHost = a.from === room.hostId;
  const canSubmit = (kind: RelayKind, step: number) =>
    g.phase === 'work' && step === g.step && kindOf(g.step) === kind && g.ring.includes(a.from) && !(a.from in g.drafts);
  switch (a.t) {
    case 'relayDraw': {
      if (!canSubmit('draw', a.step)) return false;
      const stamps = sanitizeStamps(a.stamps);
      if (!stamps.length) return false; // 1つも置いていない絵は出せない
      g.drafts[a.from] = { by: a.from, auto: false, kind: 'draw', stamps };
      checkAdvance(room, g, ctx);
      return true;
    }
    case 'relayGuess': {
      if (!canSubmit('guess', a.step)) return false;
      const text = cleanAnswer(a.text);
      if (!text) return false;
      g.drafts[a.from] = { by: a.from, auto: false, kind: 'guess', text };
      checkAdvance(room, g, ctx);
      return true;
    }
    case 'force':
      if (!isHost || g.phase !== 'work') return false;
      commit(room, g, ctx);
      return true;
    case 'timeUp':
      if (!isHost || g.phase !== 'work' || !g.deadline || ctx.now < g.deadline + PICK_GRACE_MS) return false;
      commit(room, g, ctx);
      return true;
    case 'next': {
      // 発表：ホストが1つずつめくる。めくり終わったら次の紙へ。最後の紙が終わったら結果へ
      if (!isHost || g.phase !== 'unfold' || !g.show) return false;
      const b = g.books[g.show.idx];
      if (g.show.shown < b.entries.length) {
        g.show.shown++;
        if (g.show.shown === b.entries.length) settle(room, b);
      } else if (g.show.idx + 1 < g.books.length) g.show = { idx: g.show.idx + 1, shown: 0 };
      else g.phase = 'result';
      return true;
    }
    default:
      return false;
  }
}

export function nextTimer(g: RelayState): Timer | null {
  if (g.phase === 'work' && g.deadline) return { at: g.deadline + PICK_GRACE_MS, action: { t: 'timeUp' } };
  return null;
}
