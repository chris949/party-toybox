// 爆弾まわしのルール（このフォルダの README.md の16章）。画面・通信・ブラウザの機能は使わない（時刻と乱数は ctx で受け取る）
import { BOMB_FUSES, BOMB_HEATS, BOMB_WORD_MAX } from '../../core/constants';
import { shuffle } from '../../core/random';
import type { ActionFrom, Ctx, RoomState, Timer } from '../../core/types';
import { BOMB_THEMES, normalizeWord } from './themes';

export type BombPhase = 'hot' | 'boom' | 'result';

export interface BombState {
  kind: 'bomb';
  phase: BombPhase;
  ring: string[];                  // 開始時の参加者
  names: Record<string, string>;
  round: number;
  rounds: number;                  // 爆発の回数
  theme: string;
  used: string[];                  // 使ったお題
  holderId: string;                // いま爆弾を持っている人
  startAt: number;
  boomAt: number;                  // 爆発する時刻（参加者には送らない）
  heat: number;                    // 0〜3。導火線がどこまで燃えたか（音と見た目の強さ。これだけを送る）
  words: { id: string; text: string }[]; // この回に出た言葉（言った人と一緒に）
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

// 新しいラウンド：お題を決め、導火線の長さをこっそり決めて、火をつける
function light(room: RoomState, g: BombState, ctx: Ctx, holder: string) {
  const fresh = BOMB_THEMES.filter(t => !g.used.includes(t.text));
  g.theme = pick(fresh.length ? fresh : BOMB_THEMES, ctx).text;
  g.used.push(g.theme);
  g.holderId = isOnline(room, holder) ? holder : pick(online(room), ctx)?.id ?? holder;
  const [min, max] = BOMB_FUSES[room.bombFuse] ?? BOMB_FUSES[1];
  g.startAt = ctx.now;
  g.boomAt = ctx.now + Math.round((min + ctx.random() * (max - min)) * 1000);
  g.heat = 0;
  g.words = [];
  g.passes = 0;
  g.loserId = null;
  g.phase = 'hot';
}

export function start(room: RoomState, ctx: Ctx): BombState {
  const players = shuffle(online(room), ctx.random);
  room.players.forEach(p => { p.score = 0; });
  const g: BombState = {
    kind: 'bomb', phase: 'hot', ring: players.map(p => p.id), names: Object.fromEntries(players.map(p => [p.id, p.name])),
    round: 0, rounds: room.bombRounds, theme: '', used: [], holderId: '', startAt: 0, boomAt: 0, heat: 0, words: [], passes: 0, loserId: null,
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
  if (next) g.holderId = next.id;
}

// 言葉を整える。使えないときは null（空・同じ言葉がもう出ている）
export function cleanWord(g: BombState, raw: unknown): string | null {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, BOMB_WORD_MAX);
  if (!text) return null;
  const key = normalizeWord(text);
  return g.words.some(w => normalizeWord(w.text) === key) ? null : text;
}

export function reduce(room: RoomState, g: BombState, a: ActionFrom, ctx: Ctx): boolean {
  const isHost = a.from === room.hostId;
  switch (a.t) {
    case 'toss': {
      // 言葉を1つ言って、爆弾を渡す
      if (g.phase !== 'hot' || a.round !== g.round || a.from !== g.holderId || a.to === a.from || !isOnline(room, a.to)) return false;
      const text = cleanWord(g, a.word);
      if (!text) return false;
      g.words.push({ id: a.from, text });
      g.holderId = a.to;
      g.passes++;
      return true;
    }
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
