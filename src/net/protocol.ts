// ホストと参加者がやり取りするメッセージ。形は v0.8 と同じにして、古い版の人ともつながるようにする
// （版が違うと、ロビーで警告が出る）
import { DEFAULT_TIME_LIMIT, TIME_LIMITS } from '../core/constants';
import type { Action } from '../core/types';
import type { PlayerView } from '../modes/tier/view';
import type { FiveView } from '../modes/five/view';

export const PREFIX = 'tierlistwars-v1-';
export const ROOM_CODE_LEN = 6;
export const HEARTBEAT_MS = 3000, DEAD_MS = 10000, GIVEUP_MS = 15000; // 合図の間隔／切れたとみなす時間／再接続をあきらめる時間

export type HostMsg =
  | { t: 'state'; state: PlayerView }
  | { t: 'ping' }
  | { t: 'error'; msg: string };

export type JoinMsg = { t: 'join'; id: string; key: string; name: string; topics: unknown; fives?: unknown; version: string };
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
    case 'start': case 'force': case 'next': case 'lobby': case 'reveal-all':
      return { t: m.t };
    case 'mode': return typeof m.mode === 'string' ? { t: 'mode', mode: m.mode } : null;
    case 'game': return typeof m.mode === 'string' ? { t: 'game', mode: m.mode } : null;
    case 'five': return Array.isArray(m.picks) && Number.isInteger(m.round) ? { t: 'five', round: m.round, picks: m.picks.slice(0, 8), partial: !!m.partial } : null;
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
    gameMode: s.gameMode === 'five' ? 'five' : 'tier',
    game: s.game === 'five' ? 'five' : s.game === 'tier' ? 'tier' : null,
    timeLimit: (TIME_LIMITS as readonly number[]).includes(int(s.timeLimit)) ? int(s.timeLimit) : DEFAULT_TIME_LIMIT,
    code: str(s.code),
    hostId: str(s.hostId),
    me: str(s.me),
    players: (Array.isArray(s.players) ? s.players : []).map((p: any) => ({
      id: str(p.id), name: str(p.name), score: int(p.score), online: p.online !== false, version: str(p.version),
      topics: int(p.topics), fives: int(p.fives), done: p.done === true ? true : p.done === false ? false : null,
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
