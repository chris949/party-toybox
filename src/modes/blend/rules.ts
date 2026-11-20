// まぎれろ！のルール（このフォルダの README.md の15章）。画面・通信・ブラウザの機能は使わない（時刻と乱数は ctx で受け取る）
import { BLEND_D, BLEND_FIND, BLEND_GAP, BLEND_SAY_MAX, BLEND_SAY_MS, BLEND_READY_MS, BLEND_SPEED, BLEND_STAR_R, BLEND_STARS, BLEND_TICK_MS, BLEND_W, CHARA_COUNT } from '../../core/constants';
import { shuffle } from '../../core/random';
import type { ActionFrom, Ctx, RoomState, Timer } from '../../core/types';
import { SAMPLE_LINES } from './lines';

export type BlendPhase = 'hide' | 'found' | 'result';

// 舞台にいる1体。人が動かす1体も、CPU が動かすほかの全員も、同じ形で持つ（見分けがつく情報を、状態にも通信にも入れない）
export interface Mob {
  x: number; z: number;   // いまの位置
  tx: number; tz: number; // 向かっている場所
  wait: number;           // 着いてから、次に動き出すまでの時間（ミリ秒）。CPU だけが使う
}

export interface Shot { by: string; i: number; hit: boolean }
// 終わり方：hit = さがす人が当てた／stars = ほしを集めきった／empty = 全員が弾を使いきった／time = 時間切れ（引き分け）
export type BlendEnd = 'hit' | 'stars' | 'empty' | 'time';

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
  ammo: Record<string, number>;    // さがす人の、残りの弾
  aims: Record<string, { x: number; z: number }>; // さがす人が狙っている場所（床の上。全員に見せる）
  lines: string[];                 // みんなが持ってきたセリフ（15.10）
  says: { i: number; text: string; until: number }[]; // いま、しゃべっている1体と、そのセリフ
  sayAt: number;                   // 次に、誰かがしゃべる時刻
  down: number[];                  // 撃たれて倒れた番号（人ではなかった1体。もう動かず、撃てない）
  shots: Shot[];                   // 撃った記録（順に）
  end: BlendEnd | null;            // このラウンドの終わり方
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
  g.mobs = [];
  for (let i = 0; i < room.blendCrowd; i++) {
    // ほかの1体と重ならない場所に置く（見つからなければ、最後の候補に置く）
    let p = spot(ctx);
    for (let n = 0; n < 30 && g.mobs.some(m => Math.hypot(m.x - p.x, m.z - p.z) < BLEND_GAP); n++) p = spot(ctx);
    g.mobs.push({ x: p.x, z: p.z, tx: p.x, tz: p.z, wait: ctx.random() * 2000 });
  }
  g.me = Math.floor(ctx.random() * g.mobs.length);
  g.star = null;
  g.stars = 0;
  g.ammo = Object.fromEntries(g.ring.filter(id => id !== hider).map(id => [id, room.blendAmmo]));
  g.aims = {};
  g.says = [];
  g.down = [];
  g.shots = [];
  g.end = null;
  g.void = false;
  g.gained = {};
  g.phase = 'hide';
  g.startAt = ctx.now + BLEND_READY_MS;
  g.starAt = g.startAt + 1500;
  g.sayAt = g.startAt + 800;
  g.deadline = g.startAt + room.blendTime * 1000;
  g.lastTick = ctx.now;
  g.tick = 0;
}

export function start(room: RoomState, ctx: Ctx): BlendState {
  const players = shuffle(online(room), ctx.random);
  room.players.forEach(p => { p.score = 0; });
  const g: BlendState = {
    kind: 'blend', phase: 'hide', ring: players.map(p => p.id), names: Object.fromEntries(players.map(p => [p.id, p.name])),
    round: 0, hiderId: '', auto: false, chara: 0, mobs: [], me: 0, star: null, starAt: 0, stars: 0, ammo: {}, aims: {}, lines: [...new Set(online(room).flatMap(p => room.blendLinesBy[p.id] ?? []))], says: [], sayAt: 0, down: [], shots: [], end: null,
    startAt: 0, deadline: 0, lastTick: 0, tick: 0, void: false, gained: {},
  };
  deal(room, g, ctx);
  return g;
}

// 発表へ：当てた人に点。かくれた人は、逃げ切っていれば（ほしを集めきった／全員が弾を使いきった）、さがす人の人数ぶんの点
function toFound(room: RoomState, g: BlendState, end: BlendEnd) {
  g.phase = 'found';
  g.end = end;
  g.says = [];
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
  if (end === 'hit') add(g.shots[g.shots.length - 1].by, BLEND_FIND);
  else if (end === 'stars' || end === 'empty') add(g.hiderId, seekers(room, g).length);
}
// さがす人の全員が、弾を使いきった（さがす人がいないときは、数えない）
const allEmpty = (room: RoomState, g: BlendState) => {
  const s = seekers(room, g);
  return s.length > 0 && s.every(p => !(g.ammo[p.id] > 0));
};

// ほしを取る（人はボタンで、CPU の参加者は乗ったらすぐ）。集めきったら、その場で発表へ
// （集めたあとは、さがす人に手がかりが増えないので、残りの時間を待たせない。さがす人は、集めきられる前に撃つ必要がある）
function grab(room: RoomState, g: BlendState, now: number) {
  g.stars++;
  g.star = null;
  g.starAt = now + 1500;
  if (g.stars >= BLEND_STARS) toFound(room, g, 'stars');
}

// CPU の次の行き先：ときどき、ほしのあたりへ行く（ほしのまわりに人だかりを作って、かくれる人がまぎれられるようにする）
// spread = ほしの輪に対する、行き先の広がり。CPU の群れは、輪の外まで広げる（輪の中をふさいで、かくれる人が乗れなくならないように）
function wander(g: BlendState, m: Mob, ctx: Ctx, starRate: number, spread: number) {
  if (g.star && ctx.random() < starRate) {
    const a = ctx.random() * Math.PI * 2, r = ctx.random() * BLEND_STAR_R * spread;
    m.tx = clamp(g.star.x + Math.cos(a) * r, HX);
    m.tz = clamp(g.star.z + Math.sin(a) * r, HZ);
  } else {
    const p = spot(ctx);
    m.tx = p.x; m.tz = p.z;
  }
  m.wait = 300 + ctx.random() * 2200;
}

// キャラクターが、ときどきひとことしゃべる（15.10）。誰がしゃべるかは、でたらめに決める。
// 人が動かす1体も、ほかの1体も、同じ割合で選ぶ（しゃべり方で、人だと分からないように）
function talk(g: BlendState, ctx: Ctx) {
  g.says = g.says.filter(s => s.until > ctx.now && !g.down.includes(s.i));
  if (ctx.now < g.sayAt) return;
  g.sayAt = ctx.now + 900 + ctx.random() * 1500;
  if (g.says.length >= BLEND_SAY_MAX) return;
  const quiet = g.mobs.map((_, i) => i).filter(i => !g.down.includes(i) && !g.says.some(s => s.i === i));
  if (!quiet.length) return;
  // 持ってきたセリフがあれば、6割をそこから選ぶ。残りは、同梱のセリフ
  const pool = g.lines.length && ctx.random() < 0.6 ? g.lines : SAMPLE_LINES;
  g.says.push({ i: quiet[Math.floor(ctx.random() * quiet.length)], text: pool[Math.floor(ctx.random() * pool.length)], until: ctx.now + BLEND_SAY_MS });
}

// 時間を進める：全員を、行き先へ同じ速さで歩かせる
function advance(room: RoomState, g: BlendState, ctx: Ctx) {
  const dt = Math.max(0, Math.min(1000, ctx.now - g.lastTick));
  g.lastTick = ctx.now;
  g.tick++;
  if (ctx.now < g.startAt) return;
  if (!g.star && g.stars < BLEND_STARS && ctx.now >= g.starAt) g.star = spot(ctx);
  talk(g, ctx);
  const step = BLEND_SPEED * dt / 1000;
  const from = g.mobs.map(m => ({ x: m.x, z: m.z }));
  const standing = g.mobs.map(m => Math.hypot(m.tx - m.x, m.tz - m.z) <= 1e-6);
  const walking = standing.map(s => !s); // この回に、行き先へ歩いた1体
  const isDown = g.mobs.map((_, i) => g.down.includes(i)); // 倒れた1体は、もう動かない
  g.mobs.forEach((m, i) => {
    if (isDown[i]) return;
    const human = i === g.me && !g.auto;
    if (standing[i]) {
      if (human) return;
      m.wait -= dt;
      if (m.wait <= 0) { i === g.me ? wander(g, m, ctx, 0.7, 0.75) : wander(g, m, ctx, 0.2, 1.6); standing[i] = false; } // 次の行き先を決めた
    }
  });
  // 歩く → 体が重ならないように押し離す（15.5）を、小分けにしてくり返す（1回で大きく動かすと、向かい合った2体がすれ違ってしまう）
  // 人が動かす1体も、CPU の1体も、同じ決まり。立っている1体は、歩いてきた1体に場所をゆずる形になる（かたまって動けなくなるのを防ぐ）
  const SUB = 4, sub = step / SUB;
  for (let n = 0; n < SUB; n++) {
    g.mobs.forEach((m, i) => {
      if (isDown[i] || standing[i]) return; // 立っている1体は、押されるだけ
      const d = Math.hypot(m.tx - m.x, m.tz - m.z);
      if (d <= sub) { m.x = m.tx; m.z = m.tz; } else { m.x += (m.tx - m.x) / d * sub; m.z += (m.tz - m.z) / d * sub; }
    });
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < g.mobs.length; i++) for (let j = i + 1; j < g.mobs.length; j++) {
      const a = g.mobs[i], b = g.mobs[j];
      if (isDown[i] && isDown[j]) continue;
      let dx = b.x - a.x, dz = b.z - a.z, gap = Math.hypot(dx, dz);
      if (gap >= BLEND_GAP) continue;
      if (gap < 1e-6) { dx = Math.cos(i * 2.4 + j); dz = Math.sin(i * 2.4 + j); gap = 1; } // ぴったり重なったら、決まった向きへ離す
      const push = (BLEND_GAP - Math.hypot(b.x - a.x, b.z - a.z)) / gap;
      const ka = isDown[i] ? 0 : isDown[j] ? 1 : 0.5, kb = isDown[j] ? 0 : isDown[i] ? 1 : 0.5; // 倒れた1体は動かさない
      a.x -= dx * push * ka; a.z -= dz * push * ka;
      b.x += dx * push * kb; b.z += dz * push * kb;
    }
  }
  g.mobs.forEach((m, i) => {
    if (isDown[i]) return;
    // 押されても、1回に進める長さは超えない（速さの違いで、人だと分からないように）。舞台の外にも出ない
    const moved = Math.hypot(m.x - from[i].x, m.z - from[i].z);
    if (moved > step) { m.x = from[i].x + (m.x - from[i].x) / moved * step; m.z = from[i].z + (m.z - from[i].z) / moved * step; }
    m.x = clamp(m.x, HX); m.z = clamp(m.z, HZ);
    // 立っていて押された1体は、押された先に立つ。歩いていて、ほとんど進めなかった1体は、その場で止まる（その場で震え続けないように）
    if (standing[i] || (walking[i] && Math.hypot(m.x - from[i].x, m.z - from[i].z) < step * 0.25)) { m.tx = m.x; m.tz = m.z; }
  });
  if (g.auto && onStar(g, g.mobs[g.me])) grab(room, g, ctx.now);
  if (g.phase === 'hide' && ctx.now >= g.deadline) toFound(room, g, 'time');
}

// かくれる人がいなくなったら、その回は流す（点なし）。弾の残っている人が抜けて、全員が弾切れになったら、逃げ切り
export function checkAdvance(room: RoomState, g: BlendState, _ctx: Ctx) {
  if (g.phase !== 'hide') return;
  if (!isOnline(room, g.hiderId)) { g.void = true; toFound(room, g, 'time'); }
  else if (g.shots.length && allEmpty(room, g)) toFound(room, g, 'empty');
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
    case 'aim': {
      // さがす人が狙っている場所。舞台の少し外まで（ふちのキャラクターも狙えるように）
      if (g.phase !== 'hide' || a.round !== g.round || a.from === g.hiderId || !isOnline(room, a.from) || !(g.ammo[a.from] > 0)) return false;
      if (!a.on) { if (!(a.from in g.aims)) return false; delete g.aims[a.from]; return true; }
      const x = clamp(a.x, BLEND_W / 2 + 1), z = clamp(a.z, BLEND_D / 2 + 1), old = g.aims[a.from];
      if (old && old.x === x && old.z === z) return false;
      g.aims[a.from] = { x, z };
      return true;
    }
    case 'shoot': {
      // さがす人が撃つ：当たれば、その場で発表へ。外れたら、その1体は倒れる
      if (g.phase !== 'hide' || a.round !== g.round || a.from === g.hiderId || !isOnline(room, a.from) || ctx.now < g.startAt) return false;
      if (!(g.ammo[a.from] > 0) || !Number.isInteger(a.i) || a.i < 0 || a.i >= g.mobs.length || g.down.includes(a.i)) return false;
      g.ammo[a.from]--;
      if (!(g.ammo[a.from] > 0)) delete g.aims[a.from]; // 弾を使いきったら、レーザーを消す
      const hit = a.i === g.me;
      g.shots.push({ by: a.from, i: a.i, hit });
      if (hit) toFound(room, g, 'hit');
      else {
        g.down.push(a.i);
        if (allEmpty(room, g)) toFound(room, g, 'empty');
      }
      return true;
    }
    case 'force':
      if (!isHost || g.phase !== 'hide') return false;
      toFound(room, g, 'time');
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
