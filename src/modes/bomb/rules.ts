// 爆弾まわしのルール（このフォルダの README.md の16章）。画面・通信・ブラウザの機能は使わない（時刻と乱数は ctx で受け取る）
import { BOMB_FUSES, BOMB_HEATS, BOMB_LOCK_MS } from '../../core/constants';
import { shuffle } from '../../core/random';
import type { ActionFrom, Ctx, RoomState, Timer } from '../../core/types';
import { dealQuiz, hasAnswer, type Quiz } from './quiz';

export type BombPhase = 'hot' | 'boom' | 'result';
export type BombStyle = 'tap' | 'type'; // 選択式／入力式

export interface BombState {
  kind: 'bomb';
  phase: BombPhase;
  style: BombStyle;
  ring: string[];                  // 開始時の参加者
  names: Record<string, string>;
  round: number;
  rounds: number;                  // 爆発の回数
  usedTitles: string[];            // 配ったお題（なるべく重ならないようにする）
  quizzes: Record<string, Quiz>;   // 1人に1つのお題
  holderId: string;                // いま爆弾を持っている人
  armed: boolean;                  // 持っている人が正解を当てて、渡せる状態か
  lockUntil: number;               // はずれを選んだあと、この時刻までは選べない
  startAt: number;
  boomAt: number;                  // 爆発する時刻（参加者には送らない）
  heat: number;                    // 0〜3。導火線がどこまで燃えたか（音と見た目の強さ。これだけを送る）
  log: { id: string; text: string; ok: boolean }[]; // この回に選ばれたもの（選んだ人と、当たり・はずれ）
  passes: number;
  loserId: string | null;          // 爆発したときに持っていた人
}

const online = (room: RoomState) => room.players.filter(p => p.online);
const isOnline = (room: RoomState, id: string) => !!room.players.find(p => p.id === id)?.online;
const pick = <T>(list: readonly T[], ctx: Ctx) => list[Math.floor(ctx.random() * list.length)];

export function startError(room: RoomState): string | null {
  const n = online(room).length;
  if (n < room.minPlayers) return `あと${room.minPlayers - n}人必要です（${room.minPlayers}〜10人）`;
  return null;
}

// 導火線がどこまで燃えたか
const heatAt = (g: BombState, now: number) => {
  const f = (now - g.startAt) / (g.boomAt - g.startAt);
  return BOMB_HEATS.filter(h => f >= h).length;
};

// その人のお題（なければ配る。途中から入った人や、正解を使い切った人）
function quizOf(room: RoomState, g: BombState, id: string, ctx: Ctx): Quiz {
  if (!g.quizzes[id] || !hasAnswer(g.quizzes[id])) g.quizzes[id] = dealQuiz(room, id, g.usedTitles, ctx);
  return g.quizzes[id];
}
// 爆弾を渡す
function give(room: RoomState, g: BombState, to: string, ctx: Ctx) {
  g.holderId = to;
  g.armed = false;
  g.lockUntil = 0;
  quizOf(room, g, to, ctx);
}

// 新しいラウンド：1人に1つ、別々のお題を配り、導火線の長さをこっそり決めて、火をつける
function light(room: RoomState, g: BombState, ctx: Ctx, holder: string) {
  g.quizzes = {};
  for (const p of online(room)) g.quizzes[p.id] = dealQuiz(room, p.id, g.usedTitles, ctx);
  const [min, max] = BOMB_FUSES[room.bombFuse] ?? BOMB_FUSES[1];
  g.startAt = ctx.now;
  g.boomAt = ctx.now + Math.round((min + ctx.random() * (max - min)) * 1000);
  g.heat = 0;
  g.log = [];
  g.passes = 0;
  g.loserId = null;
  g.phase = 'hot';
  give(room, g, isOnline(room, holder) ? holder : pick(online(room), ctx)?.id ?? holder, ctx);
}

export function start(room: RoomState, ctx: Ctx): BombState {
  const players = shuffle(online(room), ctx.random);
  room.players.forEach(p => { p.score = 0; });
  const g: BombState = {
    kind: 'bomb', phase: 'hot', style: room.bombStyle, ring: players.map(p => p.id), names: Object.fromEntries(players.map(p => [p.id, p.name])),
    round: 0, rounds: room.bombRounds, usedTitles: [], quizzes: {}, holderId: '', armed: false, lockUntil: 0,
    startAt: 0, boomAt: 0, heat: 0, log: [], passes: 0, loserId: null,
  };
  light(room, g, ctx, players[0].id);
  return g;
}

// 爆発：持っていた人以外の、つながっている全員に1点
function explode(room: RoomState, g: BombState) {
  g.phase = 'boom';
  g.heat = 3;
  g.loserId = g.holderId;
  for (const p of online(room)) if (p.id !== g.loserId && g.ring.includes(p.id)) p.score += 1;
}

// 持っている人がいなくなったら、爆弾は、つながっている誰かに飛ぶ
export function checkAdvance(room: RoomState, g: BombState, ctx: Ctx) {
  if (g.phase !== 'hot' || isOnline(room, g.holderId)) return;
  const next = pick(online(room).filter(p => p.id !== g.holderId), ctx);
  if (next) give(room, g, next.id, ctx);
}

export function reduce(room: RoomState, g: BombState, a: ActionFrom, ctx: Ctx): boolean {
  const isHost = a.from === room.hostId;
  const holding = g.phase === 'hot' && a.from === g.holderId;
  switch (a.t) {
    case 'bombPick': {
      // 選択肢を1つ選ぶ（入力式でも、打ち込んだ文字と合った選択肢の番号が届く）
      const q = g.quizzes[a.from];
      if (!holding || a.round !== g.round || g.armed || ctx.now < g.lockUntil || !q) return false;
      if (!Number.isInteger(a.i) || a.i < 0 || a.i >= q.options.length || q.used[a.i] || q.wrong[a.i]) return false;
      const ok = q.correct[a.i];
      if (ok) { q.used[a.i] = true; g.armed = true; }
      else { q.wrong[a.i] = true; g.lockUntil = ctx.now + BOMB_LOCK_MS; }
      g.log.push({ id: a.from, text: q.options[a.i], ok });
      return true;
    }
    case 'toss':
      // 正解を当てたあと、爆弾を渡す
      if (!holding || a.round !== g.round || !g.armed || a.to === a.from || !isOnline(room, a.to)) return false;
      give(room, g, a.to, ctx);
      g.passes++;
      return true;
    case 'tick':
      // 導火線を進める（ホストのタイマーが出す）
      if (!isHost || g.phase !== 'hot') return false;
      if (ctx.now >= g.boomAt) { explode(room, g); return true; }
      if (heatAt(g, ctx.now) === g.heat) return false;
      g.heat = heatAt(g, ctx.now);
      return true;
    case 'next':
      if (!isHost || g.phase !== 'boom') return false;
      if (g.round + 1 >= g.rounds) { g.phase = 'result'; return true; }
      g.round++;
      light(room, g, ctx, g.loserId ?? g.holderId); // 爆発した人から、次が始まる
      return true;
    default:
      return false;
  }
}

// 次に音と見た目を強くする時刻か、爆発の時刻
export function nextTimer(g: BombState): Timer | null {
  if (g.phase !== 'hot') return null;
  const span = g.boomAt - g.startAt;
  const at = g.heat < BOMB_HEATS.length ? g.startAt + Math.ceil(span * BOMB_HEATS[g.heat]) : g.boomAt;
  return { at: Math.min(at, g.boomAt), action: { t: 'tick' } };
}
