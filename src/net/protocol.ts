// ホストと参加者がやり取りするメッセージ。形は v0.8 と同じにして、古い版の人ともつながるようにする
// （版が違うと、ロビーで警告が出る）
import { DEFAULT_FATE_LIVES, FATE_LIVES, DEFAULT_FATE_QUOTA, DEFAULT_FATE_TIME, DEFAULT_TIME_LIMIT, FATE_QUOTAS, FATE_TIMES, TIME_LIMITS } from '../core/constants';
import { GAME_MODES, type GameMode } from '../core/types';
import type { FateView } from '../modes/fate/view';
import type { HaikuView, HaikuWork } from '../modes/haiku/view';
import { DEFAULT_HAIKU_TIME, HAIKU_TIMES } from '../core/constants';
import type { Action } from '../core/types';
import type { PlayerView } from '../core/view';
import type { FiveView } from '../modes/five/view';

export const PREFIX = 'tierlistwars-v1-';
export const ROOM_CODE_LEN = 6;
export const HEARTBEAT_MS = 3000, DEAD_MS = 10000, GIVEUP_MS = 15000; // 合図の間隔／切れたとみなす時間／再接続をあきらめる時間

export type HostMsg =
  | { t: 'state'; state: PlayerView }
  | { t: 'ping' }
  | { t: 'error'; msg: string };

export type JoinMsg = { t: 'join'; id: string; key: string; name: string; topics: unknown; fives?: unknown; fates?: unknown; haikus?: unknown; chara?: unknown; version: string };
export type GuestMsg = JoinMsg | { t: 'pong' } | Action;

export const genCode = () => {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい I, O, 0, 1 は使わない
  return Array.from({ length: ROOM_CODE_LEN }, () => c[Math.floor(Math.random() * c.length)]).join('');
};

// 参加者IDは画面に出すので英数字だけにする
export const cleanId = (id: unknown) => String(id ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 64);

// 参加者から届いたゲームの操作を検査する。おかしなものは null
export function parseAction(m: any): Action | null {
  if (!m || typeof m !== 'object') return null;
  switch (m.t) {
    case 'start': case 'force': case 'next': case 'lobby': case 'reveal-all': case 'pause':
      return { t: m.t };
    case 'mode': return typeof m.mode === 'string' ? { t: 'mode', mode: m.mode } : null;
    case 'game': return typeof m.mode === 'string' ? { t: 'game', mode: m.mode } : null;
    case 'five': return Array.isArray(m.picks) && Number.isInteger(m.round) ? { t: 'five', round: m.round, picks: m.picks.slice(0, 8), partial: !!m.partial } : null;
    case 'move': return m.side === 'L' || m.side === 'R' ? { t: 'move', side: m.side } : null;
    case 'chara': return Number.isInteger(m.n) ? { t: 'chara', n: m.n } : null;
    case 'topics': return { t: 'topics', topics: m.topics, fives: m.fives, fates: m.fates, haikus: m.haikus }; // 中身はホストが検査して整える
    case 'editing': return { t: 'editing', on: !!m.on };
    case 'retract': return Number.isInteger(m.round) ? { t: 'retract', round: m.round } : null;
    case 'haikuStyle': return m.style === 'theme' || m.style === 'free' ? { t: 'haikuStyle', style: m.style } : null;
    case 'haikuTime': return Number.isInteger(m.sec) ? { t: 'haikuTime', sec: m.sec } : null;
    case 'kana': return Number.isInteger(m.step) && typeof m.ch === 'string' ? { t: 'kana', step: m.step, ch: m.ch.slice(0, 4) } : null;
    case 'rate': return Number.isInteger(m.round) && Number.isInteger(m.n) ? { t: 'rate', round: m.round, n: m.n } : null;
    case 'fateTime': return Number.isInteger(m.sec) ? { t: 'fateTime', sec: m.sec } : null;
    case 'fateQuota': return Number.isInteger(m.n) ? { t: 'fateQuota', n: m.n } : null;
    case 'fateLives': return Number.isInteger(m.n) ? { t: 'fateLives', n: m.n } : null;
    case 'time': return Number.isInteger(m.sec) ? { t: 'time', sec: m.sec } : null;
    case 'kick': return { t: 'kick', id: cleanId(m.id) };
    case 'rank': return Array.isArray(m.order) ? { t: 'rank', order: m.order.slice(0, 64), partial: !!m.partial } : null;
    case 'guess': return Array.isArray(m.order) && Number.isInteger(m.round) ? { t: 'guess', round: m.round, order: m.order.slice(0, 64) } : null;
    default: return null; // join・leave・タイマーの操作は、参加者からは受け付けない
  }
}

// ホストから届いた状態の数値を数値に揃える（文字列は画面で表示するとき React が無害化する）
export function normalizeView(s: any): PlayerView {
  const int = (v: unknown) => Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0;
  const ints = (a: unknown) => Array.isArray(a) ? a.map(int) : [];
  const str = (v: unknown) => String(v ?? '');
  const topic = (t: any) => t ? { title: str(t.title), options: Array.isArray(t.options) ? t.options.map(str) : [], authorId: t.authorId ?? null, authorName: str(t.authorName) } : null;
  return {
    phase: s.phase,
    gameNo: int(s.gameNo),
    mode: s.mode === 'each' ? 'each' : 'random',
    gameMode: s.gameMode in GAME_MODES ? s.gameMode as GameMode : 'tier',
    game: s.game in GAME_MODES ? s.game as GameMode : null,
    timeLimit: (TIME_LIMITS as readonly number[]).includes(int(s.timeLimit)) ? int(s.timeLimit) : DEFAULT_TIME_LIMIT,
    fateTime: (FATE_TIMES as readonly number[]).includes(int(s.fateTime)) ? int(s.fateTime) : DEFAULT_FATE_TIME,
    fateQuota: (FATE_QUOTAS as readonly number[]).includes(int(s.fateQuota)) ? int(s.fateQuota) : DEFAULT_FATE_QUOTA,
    fateLives: (FATE_LIVES as readonly number[]).includes(int(s.fateLives)) ? int(s.fateLives) : DEFAULT_FATE_LIVES,
    haikuStyle: s.haikuStyle === 'free' ? 'free' : 'theme',
    haikuTime: (HAIKU_TIMES as readonly number[]).includes(int(s.haikuTime)) ? int(s.haikuTime) : DEFAULT_HAIKU_TIME,
    code: str(s.code),
    hostId: str(s.hostId),
    me: str(s.me),
    players: (Array.isArray(s.players) ? s.players : []).map((p: any) => ({
      id: str(p.id), name: str(p.name), score: int(p.score), online: p.online !== false, version: str(p.version),
      topics: int(p.topics), fives: int(p.fives), fates: int(p.fates), haikus: int(p.haikus), chara: Math.max(0, int(p.chara)), editing: p.editing === true, bot: p.bot === true, done: p.done === true ? true : p.done === false ? false : null,
    })),
    startError: s.startError == null ? null : str(s.startError),
    timeLeft: s.timeLeft == null ? null : int(s.timeLeft),
    myTopic: topic(s.myTopic),
    myRank: s.myRank ? ints(s.myRank) : null,
    round: int(s.round),
    rounds: int(s.rounds),
    target: s.target ? { id: str(s.target.id), name: str(s.target.name), topic: topic(s.target.topic)! } : null,
    myGuess: s.myGuess ? ints(s.myGuess) : null,
    reveal: s.reveal ? {
      answer: ints(s.reveal.answer),
      rows: (Array.isArray(s.reveal.rows) ? s.reveal.rows : []).map((r: any) => ({ id: str(r.id), name: str(r.name), order: ints(r.order), hits: int(r.hits), pts: int(r.pts) })),
      timeouts: Array.isArray(s.reveal.timeouts) ? s.reveal.timeouts.map(str) : [],
      shown: int(s.reveal.shown), suspense: !!s.reveal.suspense, done: !!s.reveal.done, nextAt: 0,
    } : null,
    five: s.five ? normalizeFive(s.five) : null,
    fate: s.fate ? normalizeFate(s.fate) : null,
    haiku: s.haiku ? normalizeHaiku(s.haiku) : null,
  };
}

function normalizeHaiku(h: any): HaikuView {
  const int = (v: unknown) => Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0;
  const str = (v: unknown) => String(v ?? '');
  const nint = (v: unknown) => v == null ? null : int(v);
  const work = (w: any): HaikuWork => ({ ownerId: str(w.ownerId), ownerName: str(w.ownerName), themeBy: str(w.themeBy), text: str(w.text), pts: nint(w.pts) });
  const w = h.work;
  return {
    style: h.style === 'free' ? 'free' : 'theme', step: int(h.step), steps: int(h.steps),
    writing: !!h.writing, text: str(h.text), themeLen: int(h.themeLen), myDraft: h.myDraft == null ? null : str(h.myDraft),
    work: w ? {
      ...work(w), idx: int(w.idx), total: int(w.total), shown: int(w.shown),
      lines: Array.isArray(w.lines) ? w.lines.map(str) : [],
      cells: Array.isArray(w.cells) ? w.cells.map((c: any) => ({ ch: str(c.ch), by: c.by == null ? null : str(c.by), byName: str(c.byName), auto: !!c.auto })) : null,
      rating: !!w.rating, done: !!w.done, myRating: nint(w.myRating),
      ratings: Array.isArray(w.ratings) ? w.ratings.map((r: any) => ({ id: str(r.id), name: str(r.name), n: int(r.n) })) : null,
    } : null,
    gallery: Array.isArray(h.gallery) ? h.gallery.map(work) : null,
  };
}

function normalizeFate(f: any): FateView {
  const int = (v: unknown) => Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0;
  const str = (v: unknown) => String(v ?? '');
  const strs = (a: unknown) => Array.isArray(a) ? a.map(str) : [];
  const side = (v: unknown) => v === 'L' ? 'L' : 'R';
  const map = <T>(o: unknown, f: (v: unknown) => T): Record<string, T> =>
    Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).map(([k, v]) => [k, f(v)]));
  const v = f.verdict;
  return {
    round: int(f.round), text: str(f.text), left: str(f.left), right: str(f.right),
    authorIds: strs(f.authorIds), authorName: str(f.authorName),
    answer: f.answer === 'L' || f.answer === 'R' ? f.answer : null,
    pos: map(f.pos, p => p === 'L' || p === 'R' ? p : 'C'),
    out: map(f.out, int),
    lives: map(f.lives, int),
    verdict: v ? { rightSide: side(v.rightSide), fallen: strs(v.fallen), out: strs(v.out), saved: !!v.saved } : null,
    paused: !!f.paused,
  };
}

function normalizeFive(f: any): FiveView {
  const int = (v: unknown) => Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0;
  const ints = (a: unknown) => Array.isArray(a) ? a.map(int) : [];
  const str = (v: unknown) => String(v ?? '');
  const nint = (v: unknown) => v == null ? null : int(v);
  const r = f.reveal;
  return {
    round: int(f.round), rounds: int(f.rounds), title: str(f.title),
    options: Array.isArray(f.options) ? f.options.map(str) : [],
    authorId: f.authorId == null ? null : str(f.authorId), authorName: str(f.authorName),
    answering: !!f.answering,
    myPicks: f.myPicks ? ints(f.myPicks) : null,
    correct: Array.isArray(f.correct) ? f.correct.map((c: unknown) => c == null ? null : !!c) : null,
    reveal: r ? {
      shown: ints(r.shown), dummyCount: nint(r.dummyCount),
      rows: (Array.isArray(r.rows) ? r.rows : []).map((x: any) => ({ id: str(x.id), name: str(x.name), picks: ints(x.picks), hits: nint(x.hits), pts: nint(x.pts) })),
      timeouts: Array.isArray(r.timeouts) ? r.timeouts.map(str) : [],
      suspense: !!r.suspense, done: !!r.done,
    } : null,
  };
}
