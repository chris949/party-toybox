// まぎれろ！のルール（このフォルダの README.md の15章）。画面・通信・ブラウザの機能は使わない（時刻と乱数は ctx で受け取る）
import { BLEND_D, BLEND_FIND, BLEND_READY_MS, BLEND_SPEED, BLEND_STAR_R, BLEND_STARS, BLEND_TICK_MS, BLEND_W, CHARA_COUNT } from '../../core/constants';
import { shuffle } from '../../core/random';
import type { ActionFrom, Ctx, RoomState, Timer } from '../../core/types';

export type BlendPhase = 'hide' | 'found' | 'result';

// 舞台にいる1体。人が動かす1体も、CPU が動かすほかの全員も、同じ形で持つ（見分けがつく情報を、状態にも通信にも入れない）
export interface Mob {
  x: number; z: number;   // いまの位置
  tx: number; tz: number; // 向かっている場所
  wait: number;           // 着いてから、次に動き出すまでの時間（ミリ秒）。CPU だけが使う
}

export interface BlendState {
  kind: 'blend';
  phase: BlendPhase;
  ring: string[];                  // かくれる順（参加者のID）
  names: Record<string, string>;   // 開始時の名前
  round: number;
  hiderId: string;
  auto: boolean;                   // かくれる人が CPU の参加者（そのときは、ルールが代わりに動かす）
  chara: number;                   // このラウンドの、全員の見た目
  mobs: Mob[];
  me: number;                      // 人が動かしている1体の番号
  star: { x: number; z: number } | null;
  starAt: number;                  // 次のほしが出る時刻
  stars: number;                   // 集めたほしの数
  guesses: Record<string, number>; // さがす人が「これだ」と選んでいる番号（時間内は変えられる）
  startAt: number;                 // 動き出す時刻（それまでは全員止まっている）
  deadline: number;
  lastTick: number;
  tick: number;                    // 位置を進めた回数（画面が、新しい位置が届いたかを見分ける）
  void: boolean;                   // かくれる人がいなくなって、流れた回
  gained: Record<string, number>;  // この回にもらった点（発表で見せる）
}

const online = (room: RoomState) => room.players.filter(p => p.online);
const isOnline = (room: RoomState, id: string) => !!room.players.find(p => p.id === id)?.online;
const HX = BLEND_W / 2 - 0.5, HZ = BLEND_D / 2 - 0.5; // 歩ける範囲（ふちから少し内側）
const clamp = (v: number, h: number) => Math.max(-h, Math.min(h, Number.isFinite(v) ? v : 0));
const spot = (ctx: Ctx) => ({ x: (ctx.random() * 2 - 1) * HX, z: (ctx.random() * 2 - 1) * HZ });
// さがす人（かくれる人以外で、つながっている人）
export const seekers = (room: RoomState, g: BlendState) => online(room).filter(p => p.id !== g.hiderId);
export const onStar = (g: BlendState, m: Mob) => !!g.star && Math.hypot(m.x - g.star.x, m.z - g.star.z) <= BLEND_STAR_R;

export function startError(room: RoomState): string | null {
  const n = online(room).length;
  if (n < room.minPlayers) return `あと${room.minPlayers - n}人必要です（${room.minPlayers}〜10人）`;
  return null;
}

// 新しいラウンド：かくれる人を決め（つながっている人まで飛ばす）、全員をばらばらの場所に置く
function deal(room: RoomState, g: BlendState, ctx: Ctx) {
  const n = g.ring.length;
  let hider = g.ring[g.round % n];
  for (let i = 0; i < n && !isOnline(room, hider); i++) hider = g.ring[(g.round + i + 1) % n];
  g.hiderId = hider;
  g.auto = !!room.players.find(p => p.id === hider)?.bot;
  g.chara = Math.floor(ctx.random() * CHARA_COUNT);
  g.mobs = Array.from({ length: room.blendCrowd }, () => {
    const p = spot(ctx);
    return { x: p.x, z: p.z, tx: p.x, tz: p.z, wait: ctx.random() * 2000 };
  });
  g.me = Math.floor(ctx.random() * g.mobs.length);
  g.star = null;
  g.stars = 0;
  g.guesses = {};
  g.void = false;
  g.gained = {};
  g.phase = 'hide';
  g.startAt = ctx.now + BLEND_READY_MS;
  g.starAt = g.startAt + 1500;
  g.deadline = g.startAt + room.blendTime * 1000;
  g.lastTick = ctx.now;
  g.tick = 0;
}

export function start(room: RoomState, ctx: Ctx): BlendState {
  const players = shuffle(online(room), ctx.random);
  room.players.forEach(p => { p.score = 0; });
  const g: BlendState = {
    kind: 'blend', phase: 'hide', ring: players.map(p => p.id), names: Object.fromEntries(players.map(p => [p.id, p.name])),
    round: 0, hiderId: '', auto: false, chara: 0, mobs: [], me: 0, star: null, starAt: 0, stars: 0, guesses: {},
    startAt: 0, deadline: 0, lastTick: 0, tick: 0, void: false, gained: {},
  };
  deal(room, g, ctx);
  return g;
}

// 発表へ：当てた人に点。かくれた人は、ほしを集めきっていれば、だませた人数ぶんの点
function toFound(room: RoomState, g: BlendState) {
  g.phase = 'found';
  g.deadline = 0;
  g.star = null;
  g.gained = {};
  if (g.void) return;
  const add = (id: string, n: number) => {
    const p = room.players.find(x => x.id === id);
    if (!p || !n) return;
    p.score += n;
    g.gained[id] = n;
  };
  let fooled = 0;
  for (const p of seekers(room, g)) {
    if (g.guesses[p.id] === g.me) add(p.id, BLEND_FIND); else fooled++;
  }
  if (g.stars >= BLEND_STARS) add(g.hiderId, fooled);
}

// ほしを取る（人はボタンで、CPU の参加者は乗ったらすぐ）。集めきったら、その場で発表へ
// （集めたあとは、さがす人に手がかりが増えないので、残りの時間を待たせない。さがす人は、集めきられる前に選んでおく必要がある）
function grab(room: RoomState, g: BlendState, now: number) {
  g.stars++;
  g.star = null;
  g.starAt = now + 1500;
  if (g.stars >= BLEND_STARS) toFound(room, g);
}

// CPU の次の行き先：ときどき、ほしの上へ行く（ほしのまわりに人だかりを作って、かくれる人がまぎれられるようにする）
function wander(g: BlendState, m: Mob, ctx: Ctx, starRate: number) {
  if (g.star && ctx.random() < starRate) {
    const a = ctx.random() * Math.PI * 2, r = ctx.random() * BLEND_STAR_R * 0.75;
    m.tx = clamp(g.star.x + Math.cos(a) * r, HX);
    m.tz = clamp(g.star.z + Math.sin(a) * r, HZ);
  } else {
    const p = spot(ctx);
    m.tx = p.x; m.tz = p.z;
  }
  m.wait = 300 + ctx.random() * 2200;
}

// 時間を進める：全員を、行き先へ同じ速さで歩かせる
function advance(room: RoomState, g: BlendState, ctx: Ctx) {
  const dt = Math.max(0, Math.min(1000, ctx.now - g.lastTick));
  g.lastTick = ctx.now;
  g.tick++;
  if (ctx.now < g.startAt) return;
  if (!g.star && g.stars < BLEND_STARS && ctx.now >= g.starAt) g.star = spot(ctx);
  const step = BLEND_SPEED * dt / 1000;
  g.mobs.forEach((m, i) => {
    const human = i === g.me && !g.auto;
    const d = Math.hypot(m.tx - m.x, m.tz - m.z);
    if (d <= step) {
      m.x = m.tx; m.z = m.tz;
      if (human) return;
      m.wait -= dt;
      if (m.wait <= 0) wander(g, m, ctx, i === g.me ? 0.7 : 0.3);
    } else {
      m.x += (m.tx - m.x) / d * step;
      m.z += (m.tz - m.z) / d * step;
    }
  });
  if (g.auto && onStar(g, g.mobs[g.me])) grab(room, g, ctx.now);
  if (g.phase === 'hide' && ctx.now >= g.deadline) toFound(room, g);
}

// かくれる人がいなくなったら、その回は流す（点なし）
export function checkAdvance(room: RoomState, g: BlendState, _ctx: Ctx) {
  if (g.phase === 'hide' && !isOnline(room, g.hiderId)) { g.void = true; toFound(room, g); }
}

export function reduce(room: RoomState, g: BlendState, a: ActionFrom, ctx: Ctx): boolean {
  const isHost = a.from === room.hostId;
  switch (a.t) {
    case 'tick':
      if (!isHost || g.phase !== 'hide') return false;
      advance(room, g, ctx);
      return true;
    case 'go': {
      // かくれる人が、床をタップして行き先を決める
      if (g.phase !== 'hide' || a.round !== g.round || a.from !== g.hiderId || g.auto) return false;
      const m = g.mobs[g.me];
      m.tx = clamp(a.x, HX); m.tz = clamp(a.z, HZ);
      return true;
    }
    case 'grab':
      if (g.phase !== 'hide' || a.round !== g.round || a.from !== g.hiderId || !onStar(g, g.mobs[g.me])) return false;
      grab(room, g, ctx.now);
      return true;
    case 'suspect':
      if (g.phase !== 'hide' || a.round !== g.round || a.from === g.hiderId || !isOnline(room, a.from)) return false;
      if (!Number.isInteger(a.i) || a.i < 0 || a.i >= g.mobs.length || g.guesses[a.from] === a.i) return false;
      g.guesses[a.from] = a.i;
      return true;
    case 'force':
      if (!isHost || g.phase !== 'hide') return false;
      toFound(room, g);
      return true;
    case 'next':
      if (!isHost || g.phase !== 'found') return false;
      if (g.round + 1 >= g.ring.length) { g.phase = 'result'; return true; }
      g.round++;
      deal(room, g, ctx);
      return true;
    default:
      return false;
  }
}

// かくれている間は、決まった間隔で位置を進める
export function nextTimer(g: BlendState): Timer | null {
  if (g.phase === 'hide') return { at: g.lastTick + BLEND_TICK_MS, action: { t: 'tick' } };
  return null;
}
