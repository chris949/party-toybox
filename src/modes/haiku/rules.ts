// ハイカー575 のルール（src/modes/haiku/README.md の12章）。画面・通信・ブラウザの機能は使わない（時刻と乱数は ctx で受け取る）
import { HAIKU_RATE_SEC, HAIKU_REVEAL_FIRST_MS, HAIKU_REVEAL_STEP_MS, PICK_GRACE_MS } from '../../core/constants';
import { HAIKU_LEN, RANDOM_KANA, SAMPLE_HAIKUS, THEME_LEN, toKana, type HaikuStyle } from './themes';
import { shuffle } from '../../core/random';
import type { ActionFrom, Ctx, RoomState, Timer } from '../../core/types';

export type HaikuPhase = 'write' | 'recite' | 'result';

export interface Cell { ch: string; by: string; auto: boolean } // auto = 時間切れなどで、ランダムに埋めた文字
export interface Sheet {
  ownerId: string;       // 担当者（発表で読み上げる人。作品の点が入る）
  ownerName: string;
  theme: string | null;  // お題（上の五文字）。「17文字ぜんぶ」なら null
  themeBy: string;       // お題を持ってきた人の名前（サンプルなら「サンプル」）
  cells: Cell[];         // みんなが書いた文字（お題は含まない）
  ratings: Record<string, number>; // 採点（★1〜5）
  pts: number | null;    // 作品の点（採点を締め切ってから）
}

export interface HaikuShow {
  order: number[];   // 発表する順（短冊の番号）
  idx: number;       // いま発表している作品（order の何番目か）
  shown: number;     // めくった行の数（0〜3）
  rating: boolean;   // 採点を受け付けているか
  done: boolean;     // 採点を締め切ったか
  nextAt: number;    // 次の行をめくる時刻（0 = なし）
  deadline: number;  // 採点の締め切り（0 = なし）
}

export interface HaikuState {
  kind: 'haiku';
  phase: HaikuPhase;
  style: HaikuStyle;
  ring: string[];                 // 短冊を回す順（参加者のID）。短冊 i の担当者は ring[i]
  names: Record<string, string>;  // 開始時の名前（途中で抜けた人の文字にも名前を出せるように）
  sheets: Sheet[];
  step: number;                   // いま書いているのが何文字目か（0始まり。お題は数えない）
  steps: number;                  // 書く文字の数（12 または 17）
  drafts: Record<string, string>; // この回に、各自が書いた文字
  deadline: number;               // 書く締め切り（0 = なし）
  show: HaikuShow | null;
}

const online = (room: RoomState) => room.players.filter(p => p.online);
// 短冊 i を、いま書いている人（1文字ごとに、隣へ回る）
export const writerOf = (g: HaikuState, sheet: number) => g.ring[(sheet + g.step) % g.ring.length];
// その人の手元にある短冊（参加していない人は -1）
export const sheetOf = (g: HaikuState, id: string) => {
  const i = g.ring.indexOf(id), n = g.ring.length;
  return i < 0 ? -1 : ((i - g.step) % n + n) % n;
};
export const currentSheet = (g: HaikuState) => g.show ? g.sheets[g.show.order[g.show.idx]] : null;
export const textOf = (s: Sheet) => (s.theme ?? '') + s.cells.map(c => c.ch).join('');

export function startError(room: RoomState): string | null {
  const n = online(room).length;
  if (n < room.minPlayers) return `あと${room.minPlayers - n}人必要です（${room.minPlayers}〜10人）`;
  return null;
}

export function start(room: RoomState, ctx: Ctx): HaikuState {
  const players = shuffle(online(room), ctx.random);
  const style = room.haikuStyle;
  // お題持ち寄り：担当者が持ってきたお題から1つ。なければサンプル。同じお題は1ゲームに1回まで
  const used = new Set<string>();
  const samples = shuffle(SAMPLE_HAIKUS, ctx.random);
  const sheets = players.map((p): Sheet => {
    let theme: string | null = null, themeBy = '';
    if (style === 'theme') {
      const own = shuffle(room.haikusBy[p.id] ?? [], ctx.random).find(t => !used.has(t));
      theme = own ?? samples.find(t => !used.has(t)) ?? SAMPLE_HAIKUS[0];
      themeBy = own ? p.name : 'サンプル';
      used.add(theme);
    }
    return { ownerId: p.id, ownerName: p.name, theme, themeBy, cells: [], ratings: {}, pts: null };
  });
  room.players.forEach(p => { p.score = 0; });
  return {
    kind: 'haiku', phase: 'write', style, ring: players.map(p => p.id), names: Object.fromEntries(players.map(p => [p.id, p.name])),
    sheets, step: 0, steps: style === 'theme' ? HAIKU_LEN - THEME_LEN : HAIKU_LEN, drafts: {}, deadline: ctx.now + room.haikuTime * 1000, show: null,
  };
}

// 1文字ぶんを締める：書かなかった人の分はランダムなひらがなで埋めて、短冊を隣へ回す。全部書き終えたら発表へ
function commitStep(room: RoomState, g: HaikuState, ctx: Ctx) {
  g.sheets.forEach((s, i) => {
    const w = writerOf(g, i), ch = g.drafts[w];
    s.cells.push({ ch: ch ?? RANDOM_KANA[Math.floor(ctx.random() * RANDOM_KANA.length)], by: w, auto: ch == null });
  });
  g.drafts = {};
  g.step++;
  if (g.step < g.steps) { g.deadline = ctx.now + room.haikuTime * 1000; return; }
  g.phase = 'recite';
  g.deadline = 0;
  g.show = { order: shuffle(g.sheets.map((_, i) => i), ctx.random), idx: 0, shown: 0, rating: false, done: false, nextAt: ctx.now + HAIKU_REVEAL_FIRST_MS, deadline: 0 };
}

// 採点する人（担当者以外で、つながっている人）
const raters = (room: RoomState, g: HaikuState) => online(room).filter(p => p.id !== currentSheet(g)!.ownerId);

function openRating(room: RoomState, g: HaikuState, ctx: Ctx) {
  const sh = g.show!;
  sh.shown = 3; sh.nextAt = 0; sh.rating = true;
  sh.deadline = ctx.now + HAIKU_RATE_SEC * 1000;
  checkAdvance(room, g, ctx); // 採点する人が誰もいなければ、すぐ締める
}

// 採点を締める：作品の点 ＝ ★の平均 × 10。担当者の得点になる
function closeRating(room: RoomState, g: HaikuState) {
  const sh = g.show!, sheet = currentSheet(g)!;
  const stars = Object.values(sheet.ratings);
  sheet.pts = stars.length ? Math.round(stars.reduce((a, b) => a + b, 0) / stars.length * 10) : 0;
  const owner = room.players.find(p => p.id === sheet.ownerId);
  if (owner) owner.score += sheet.pts;
  sh.done = true; sh.rating = false; sh.deadline = 0;
}

// 全員がそろったら、時間を待たずに進む
export function checkAdvance(room: RoomState, g: HaikuState, ctx: Ctx) {
  if (g.phase === 'write' && online(room).filter(p => g.ring.includes(p.id)).every(p => p.id in g.drafts)) commitStep(room, g, ctx);
  else if (g.phase === 'recite' && g.show?.rating && raters(room, g).every(p => p.id in currentSheet(g)!.ratings)) closeRating(room, g);
}

export function reduce(room: RoomState, g: HaikuState, a: ActionFrom, ctx: Ctx): boolean {
  const isHost = a.from === room.hostId;
  const sh = g.phase === 'recite' ? g.show : null;
  switch (a.t) {
    case 'kana': {
      if (g.phase !== 'write' || a.step !== g.step || !g.ring.includes(a.from) || a.from in g.drafts) return false;
      const ch = toKana(a.ch);
      if (!ch) return false;
      g.drafts[a.from] = ch;
      checkAdvance(room, g, ctx);
      return true;
    }
    case 'rate': {
      const sheet = currentSheet(g);
      if (!sh?.rating || !sheet || a.round !== sh.idx || a.from === sheet.ownerId || !room.players.some(p => p.id === a.from)) return false;
      if (!Number.isInteger(a.n) || a.n < 1 || a.n > 5 || sheet.ratings[a.from] === a.n) return false;
      sheet.ratings[a.from] = a.n; // 締め切りまでは付け直せる
      checkAdvance(room, g, ctx);
      return true;
    }
    case 'force':
      if (!isHost) return false;
      if (g.phase === 'write') commitStep(room, g, ctx);
      else if (sh?.rating) closeRating(room, g);
      else return false;
      return true;
    case 'timeUp':
      if (!isHost) return false;
      if (g.phase === 'write' && g.deadline && ctx.now >= g.deadline + PICK_GRACE_MS) commitStep(room, g, ctx);
      else if (sh?.rating && sh.deadline && ctx.now >= sh.deadline + PICK_GRACE_MS) closeRating(room, g);
      else return false;
      return true;
    case 'revealStep':
      if (!isHost || !sh || sh.rating || sh.done || !sh.nextAt || ctx.now < sh.nextAt) return false;
      sh.shown++;
      if (sh.shown >= 3) openRating(room, g, ctx); else sh.nextAt = ctx.now + HAIKU_REVEAL_STEP_MS;
      return true;
    case 'reveal-all':
      if (!sh || sh.rating || sh.done || (!isHost && a.from !== currentSheet(g)!.ownerId)) return false;
      openRating(room, g, ctx);
      return true;
    case 'next':
      if (!isHost || !sh?.done) return false;
      if (sh.idx + 1 >= sh.order.length) { g.phase = 'result'; return true; }
      Object.assign(sh, { idx: sh.idx + 1, shown: 0, rating: false, done: false, nextAt: ctx.now + HAIKU_REVEAL_FIRST_MS, deadline: 0 });
      return true;
    default:
      return false;
  }
}

export function nextTimer(g: HaikuState): Timer | null {
  if (g.phase === 'write' && g.deadline) return { at: g.deadline + PICK_GRACE_MS, action: { t: 'timeUp' } };
  const sh = g.phase === 'recite' ? g.show : null;
  if (sh && !sh.done && !sh.rating && sh.nextAt) return { at: sh.nextAt, action: { t: 'revealStep' } };
  if (sh?.rating && sh.deadline) return { at: sh.deadline + PICK_GRACE_MS, action: { t: 'timeUp' } };
  return null;
}
