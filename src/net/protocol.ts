// ホストと参加者がやり取りするメッセージ。形は v0.8 と同じにして、古い版の人ともつながるようにする
// （版が違うと、ロビーで警告が出る）
import { DEFAULT_FATE_LIVES, FATE_LIVES, DEFAULT_FATE_QUOTA, DEFAULT_FATE_TIME, DEFAULT_TIME_LIMIT, FATE_QUOTAS, FATE_TIMES, TIME_LIMITS } from '../core/constants';
import { GAME_MODES, type GameMode } from '../core/types';
import type { FateView } from '../modes/fate/view';
import type { HaikuView, HaikuWork } from '../modes/haiku/view';
import type { BluffView } from '../modes/bluff/view';
import type { BouquetView } from '../modes/bouquet/view';
import type { BlendView } from '../modes/blend/view';
import type { BombView } from '../modes/bomb/view';
import type { RelayItem, RelayView } from '../modes/relay/view';
import type { RaidView } from '../modes/raid/view';
import { sanitizeRaidAction } from '../modes/raid/actions';
import { sanitizeStamps } from '../modes/relay/stamps';
import { BOUQUET_HANDS, DEFAULT_BOUQUET_HAND, BOUQUET_GOALS, BOUQUET_TIMES, DEFAULT_BOUQUET_TIME } from '../core/constants';
import { DEFAULT_RELAY_TIME, RELAY_TEXT_MAX, RELAY_TIMES, BOMB_FUSES, BOMB_ROUNDS, DEFAULT_BOMB_FUSE, DEFAULT_BOMB_ROUNDS, BLEND_CROWDS, BLEND_TIMES, BLUFF_TIMES, DEFAULT_BLEND_CROWD, DEFAULT_BLEND_TIME, DEFAULT_BLUFF_TIME } from '../core/constants';
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

export type JoinMsg = { t: 'join'; id: string; key: string; name: string; topics: unknown; fives?: unknown; fates?: unknown; haikus?: unknown; bouquets?: unknown; bouquetWords?: unknown; chara?: unknown; version: string };
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
    case 'topics': return { t: 'topics', topics: m.topics, fives: m.fives, fates: m.fates, haikus: m.haikus, bouquets: m.bouquets, bouquetWords: m.bouquetWords }; // 中身はホストが検査して整える
    case 'editing': return { t: 'editing', on: !!m.on };
    case 'retract': return Number.isInteger(m.round) ? { t: 'retract', round: m.round } : null;
    case 'haikuStyle': return m.style === 'theme' || m.style === 'free' ? { t: 'haikuStyle', style: m.style } : null;
    case 'bouquetTime': return Number.isInteger(m.sec) ? { t: 'bouquetTime', sec: m.sec } : null;
    case 'bouquetHand': return Number.isInteger(m.n) ? { t: 'bouquetHand', n: m.n } : null;
    case 'bouquetMix': return typeof m.on === 'boolean' ? { t: 'bouquetMix', on: m.on } : null;
    case 'bouquetGoal': return Number.isInteger(m.n) ? { t: 'bouquetGoal', n: m.n } : null;
    case 'phrase': return Number.isInteger(m.round) && Array.isArray(m.tokens) ? { t: 'phrase', round: m.round, tokens: m.tokens.slice(0, 16) } : null;
    case 'redraw': return Number.isInteger(m.round) ? { t: 'redraw', round: m.round } : null;
    case 'choose': return Number.isInteger(m.round) ? { t: 'choose', round: m.round, id: cleanId(m.id) } : null;
    case 'raidMode': return m.mode === 'quick' || m.mode === 'standard' ? { t: 'raidMode', mode: m.mode } : null;
    case 'raidAct': { const action = sanitizeRaidAction(m.action); return Number.isInteger(m.seq) && action ? { t: 'raidAct', seq: m.seq, action } : null; }
    case 'relayTime': return Number.isInteger(m.sec) ? { t: 'relayTime', sec: m.sec } : null;
    case 'relayDraw': return Number.isInteger(m.step) && Array.isArray(m.stamps) ? { t: 'relayDraw', step: m.step, stamps: sanitizeStamps(m.stamps) } : null;
    case 'relayGuess': return Number.isInteger(m.step) && typeof m.text === 'string' ? { t: 'relayGuess', step: m.step, text: m.text.slice(0, RELAY_TEXT_MAX * 2) } : null;
    case 'bombRounds': return Number.isInteger(m.n) ? { t: 'bombRounds', n: m.n } : null;
    case 'bombFuse': return Number.isInteger(m.n) ? { t: 'bombFuse', n: m.n } : null;
    case 'toss': return Number.isInteger(m.round) && typeof m.to === 'string' ? { t: 'toss', round: m.round, to: cleanId(m.to) } : null;
    case 'bombPick': return Number.isInteger(m.round) && Number.isInteger(m.i) ? { t: 'bombPick', round: m.round, i: m.i } : null;
    case 'bombStyle': return m.style === 'tap' || m.style === 'type' ? { t: 'bombStyle', style: m.style } : null;
    case 'blendTime': return Number.isInteger(m.sec) ? { t: 'blendTime', sec: m.sec } : null;
    case 'blendCrowd': return Number.isInteger(m.n) ? { t: 'blendCrowd', n: m.n } : null;
    // まぎれろ！：行き先は、ホストのルールが舞台の中に収める。tick はホストのタイマーだけが出すので、参加者からは受け取らない
    case 'go': return Number.isInteger(m.round) && Number.isFinite(m.x) && Number.isFinite(m.z) ? { t: 'go', round: m.round, x: m.x, z: m.z } : null;
    case 'grab': return Number.isInteger(m.round) ? { t: 'grab', round: m.round } : null;
    case 'suspect': return Number.isInteger(m.round) && Number.isInteger(m.i) ? { t: 'suspect', round: m.round, i: m.i } : null;
    case 'bluffTime': return Number.isInteger(m.sec) ? { t: 'bluffTime', sec: m.sec } : null;
    case 'bet': return Number.isInteger(m.round) && typeof m.go === 'boolean' ? { t: 'bet', round: m.round, go: m.go } : null;
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
    bouquetTime: (BOUQUET_TIMES as readonly number[]).includes(int(s.bouquetTime)) ? int(s.bouquetTime) : DEFAULT_BOUQUET_TIME,
    bouquetHand: (BOUQUET_HANDS as readonly number[]).includes(int(s.bouquetHand)) ? int(s.bouquetHand) : DEFAULT_BOUQUET_HAND,
    bouquetMix: s.bouquetMix !== false,
    bouquetGoal: (BOUQUET_GOALS as readonly number[]).includes(int(s.bouquetGoal)) ? int(s.bouquetGoal) : 0,
    raidMode: s.raidMode === 'standard' ? 'standard' : 'quick',
    relayTime: (RELAY_TIMES as readonly number[]).includes(int(s.relayTime)) ? int(s.relayTime) : DEFAULT_RELAY_TIME,
    bombRounds: (BOMB_ROUNDS as readonly number[]).includes(int(s.bombRounds)) ? int(s.bombRounds) : DEFAULT_BOMB_ROUNDS,
    bombStyle: s.bombStyle === 'type' ? 'type' : 'tap',
    bombFuse: int(s.bombFuse) >= 0 && int(s.bombFuse) < BOMB_FUSES.length ? int(s.bombFuse) : DEFAULT_BOMB_FUSE,
    blendTime: (BLEND_TIMES as readonly number[]).includes(int(s.blendTime)) ? int(s.blendTime) : DEFAULT_BLEND_TIME,
    blendCrowd: (BLEND_CROWDS as readonly number[]).includes(int(s.blendCrowd)) ? int(s.blendCrowd) : DEFAULT_BLEND_CROWD,
    bluffTime: (BLUFF_TIMES as readonly number[]).includes(int(s.bluffTime)) ? int(s.bluffTime) : DEFAULT_BLUFF_TIME,
    haikuStyle: s.haikuStyle === 'free' ? 'free' : 'theme',
    haikuTime: (HAIKU_TIMES as readonly number[]).includes(int(s.haikuTime)) ? int(s.haikuTime) : DEFAULT_HAIKU_TIME,
    code: str(s.code),
    hostId: str(s.hostId),
    me: str(s.me),
    players: (Array.isArray(s.players) ? s.players : []).map((p: any) => ({
      id: str(p.id), name: str(p.name), score: int(p.score), online: p.online !== false, version: str(p.version),
      topics: int(p.topics), fives: int(p.fives), fates: int(p.fates), haikus: int(p.haikus), bouquets: int(p.bouquets), bouquetWords: int(p.bouquetWords), chara: Math.max(0, int(p.chara)), editing: p.editing === true, bot: p.bot === true, done: p.done === true ? true : p.done === false ? false : null,
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
    bluff: s.bluff ? normalizeBluff(s.bluff) : null,
    bouquet: s.bouquet ? normalizeBouquet(s.bouquet) : null,
    blend: s.blend ? normalizeBlend(s.blend) : null,
    bomb: s.bomb ? normalizeBomb(s.bomb) : null,
    relay: s.relay ? normalizeRelay(s.relay) : null,
    // ダイスレイドの中身は、入れ子が深いので、形だけ確かめてそのまま使う（ホストは、部屋を作った友人。docs/spec.md の 7.5）
    raid: s.raid && typeof s.raid.game === 'object' && Array.isArray(s.raid.game?.players) ? s.raid as RaidView : null,
  };
}

function normalizeRelay(r: any): RelayView {
  const int = (v: unknown) => Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0;
  const str = (v: unknown) => String(v ?? '');
  const f = r.from, sh = r.show;
  const item = (e: any): RelayItem => e?.kind === 'draw'
    ? { by: str(e.by), byId: str(e.byId), auto: !!e.auto, kind: 'draw', stamps: sanitizeStamps(e.stamps) }
    : { by: str(e?.by), byId: str(e?.byId), auto: !!e?.auto, kind: 'guess', text: str(e?.text) };
  return {
    step: int(r.step), steps: int(r.steps), kind: r.kind === 'guess' ? 'guess' : 'draw',
    from: !f || typeof f !== 'object' ? null : 'word' in f ? { word: str(f.word) } : 'stamps' in f ? { stamps: sanitizeStamps(f.stamps) } : { text: str(f.text) },
    submitted: !!r.submitted,
    show: sh ? {
      idx: int(sh.idx), count: int(sh.count), ownerId: str(sh.ownerId), ownerName: str(sh.ownerName), word: str(sh.word),
      items: Array.isArray(sh.items) ? sh.items.map(item) : [], total: int(sh.total), hit: sh.hit == null ? null : !!sh.hit,
    } : null,
  };
}

function normalizeBomb(b: any): BombView {
  const int = (v: unknown) => Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0;
  const str = (v: unknown) => String(v ?? '');
  const q = b.quiz;
  const mark = (v: unknown) => v === 'ok' || v === 'ng' || v === 'ans' ? v : '';
  return {
    round: int(b.round), rounds: int(b.rounds), style: b.style === 'type' ? 'type' : 'tap', holderId: str(b.holderId), holderName: str(b.holderName),
    heat: Math.max(0, Math.min(3, int(b.heat))),
    quiz: q && Array.isArray(q.options) ? { title: str(q.title), by: str(q.by), options: q.options.map(str), mark: q.options.map((_: unknown, i: number) => mark(q.mark?.[i])) } : null,
    armed: !!b.armed, lockMs: Math.max(0, int(b.lockMs)),
    log: Array.isArray(b.log) ? b.log.map((w: any) => ({ id: str(w.id), name: str(w.name), text: str(w.text), ok: !!w.ok })) : [],
    passes: int(b.passes),
    loserId: b.loserId == null ? null : str(b.loserId), loserName: b.loserName == null ? null : str(b.loserName),
  };
}

function normalizeBlend(b: any): BlendView {
  const int = (v: unknown) => Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0;
  const str = (v: unknown) => String(v ?? '');
  const nint = (v: unknown) => v == null ? null : int(v);
  return {
    round: int(b.round), rounds: int(b.rounds), hiderId: str(b.hiderId), hiderName: str(b.hiderName), chara: Math.max(0, int(b.chara)),
    pos: Array.isArray(b.pos) ? b.pos.slice(0, 64).map(int) : [],
    tick: int(b.tick), ready: !!b.ready, me: nint(b.me),
    star: Array.isArray(b.star) && b.star.length === 2 ? [int(b.star[0]), int(b.star[1])] : null,
    stars: int(b.stars), goal: int(b.goal), canGrab: !!b.canGrab, myGuess: nint(b.myGuess), guessed: int(b.guessed),
    guesses: Array.isArray(b.guesses) ? b.guesses.map((x: any) => ({ id: str(x.id), name: str(x.name), i: nint(x.i), ok: !!x.ok })) : null,
    gained: b.gained && typeof b.gained === 'object' ? Object.fromEntries(Object.entries(b.gained).map(([k, v]) => [k, int(v)])) : null,
    void: !!b.void,
  };
}

function normalizeBouquet(b: any): BouquetView {
  const int = (v: unknown) => Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0;
  const str = (v: unknown) => String(v ?? '');
  return {
    round: int(b.round), rounds: int(b.rounds), goal: int(b.goal),
    parentId: str(b.parentId), parentName: str(b.parentName), theme: str(b.theme), themeBy: str(b.themeBy),
    hand: Array.isArray(b.hand) ? b.hand.map(str) : null,
    redrawn: !!b.redrawn,
    myPhrase: b.myPhrase == null ? null : str(b.myPhrase),
    phrases: Array.isArray(b.phrases) ? b.phrases.map((p: any) => ({ id: str(p.id), name: str(p.name), text: str(p.text) })) : null,
    winner: b.winner == null ? null : str(b.winner),
  };
}

function normalizeBluff(b: any): BluffView {
  const int = (v: unknown) => Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0;
  const map = <T>(o: unknown, f: (v: unknown) => T): Record<string, T> =>
    Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).map(([k, v]) => [k, f(v)]));
  const sh = b.show;
  return {
    round: int(b.round), rounds: int(b.rounds),
    cards: map(b.cards, v => v == null ? null : int(v)),
    dealt: !!b.dealt,
    myBet: b.myBet == null ? null : !!b.myBet,
    bets: b.bets ? map(b.bets, v => !!v) : null,
    show: sh ? { winner: sh.winner == null ? null : String(sh.winner), strongFold: sh.strongFold == null ? null : String(sh.strongFold), delta: map(sh.delta, int) } : null,
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
