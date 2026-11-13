// 各参加者に見せてよい情報を作る（ロビーと、どちらのモードでも共通）。他人の順位・正解は答え合わせまで送らない
import type { RoomState } from './types';
import { startErrorOf } from './room';
import { currentTarget, type Assigned, type Reveal, type TierPhase, type TierState } from '../modes/tier/rules';
import { answers, type FivePhase, type FiveState } from '../modes/five/rules';
import { fiveView, type FiveView } from '../modes/five/view';
import type { FatePhase, FateState } from '../modes/fate/rules';
import { fateView, type FateView } from '../modes/fate/view';
import { currentSheet, type HaikuPhase, type HaikuState } from '../modes/haiku/rules';
import { haikuView, type HaikuView } from '../modes/haiku/view';
import type { HaikuStyle } from '../modes/haiku/themes';
import type { BluffPhase, BluffState } from '../modes/bluff/rules';
import { bluffView, type BluffView } from '../modes/bluff/view';
import { totalRounds, type BouquetPhase, type BouquetState } from '../modes/bouquet/rules';
import { bouquetView, type BouquetView } from '../modes/bouquet/view';
import type { BlendPhase, BlendState } from '../modes/blend/rules';
import { blendView, type BlendView } from '../modes/blend/view';
import type { BombPhase, BombState, BombStyle } from '../modes/bomb/rules';
import { bombView, type BombView } from '../modes/bomb/view';
import type { RelayPhase, RelayState } from '../modes/relay/rules';
import { relayView, type RelayView } from '../modes/relay/view';

export type ViewPhase = 'lobby' | TierPhase | FivePhase | FatePhase | HaikuPhase | BluffPhase | BouquetPhase | BlendPhase | BombPhase | RelayPhase;

export interface PlayerSummary {
  id: string;
  name: string;
  score: number;
  online: boolean;
  version: string;
  topics: number;
  fives: number;    // セレクトファイブのお題の数
  fates: number;    // 運命の二者択一の問題の数
  haikus: number;   // ハイカー575 のお題の数
  bouquets: number; // ワードブーケのお題の数
  bouquetWords: number; // ワードブーケの、持ち寄りの言葉の数
  chara: number;    // キャラクターの番号
  editing: boolean; // ロビーでお題を編集中か
  bot: boolean;     // CPU の参加者か
  done: boolean | null; // 提出済みか（対象外なら null）
}

export interface PlayerView {
  phase: ViewPhase;
  gameNo: number;
  mode: RoomState['pickMode'];
  gameMode: RoomState['gameMode']; // ロビーで選んでいる、次に遊ぶモード
  game: RoomState['gameMode'] | null; // 進行中のゲームのモード
  timeLimit: number;
  fateTime: number; // 運命の二者択一の1問の制限時間（秒）
  fateQuota: number; // 運命の二者択一で、1人がお立ち台に立つ回数
  fateLives: number; // 運命の二者択一のライフ（残機）
  haikuStyle: HaikuStyle; // ハイカー575 の遊び方
  haikuTime: number;      // ハイカー575 の1文字の制限時間（秒）
  bluffTime: number;      // ブラインドブラフの、しゃべる時間（秒）
  bouquetTime: number;    // ワードブーケの、文を作る時間（秒）
  bouquetGoal: number;    // ワードブーケの終わり方
  bouquetHand: number;    // ワードブーケの、手札の枚数
  bouquetMix: boolean;    // ワードブーケの言葉：プリセットと混ぜるか
  blendTime: number;      // まぎれろ！の、かくれる時間（秒）
  blendCrowd: number;     // まぎれろ！の、舞台にいるキャラクターの数
  bombRounds: number;     // 爆弾まわしの、爆発の回数
  bombFuse: number;       // 爆弾まわしの、導火線の長さ（番号）
  bombStyle: BombStyle;   // 爆弾まわしの答え方
  relayTime: number;      // スタンプ伝言の、絵を作る時間（秒）
  code: string;
  hostId: string;
  me: string;
  players: PlayerSummary[];
  startError: string | null;
  timeLeft: number | null;
  myTopic: Assigned | null;
  myRank: number[] | null;
  round: number;
  rounds: number;
  target: { id: string; name: string; topic: Assigned } | null;
  myGuess: number[] | null;
  reveal: Reveal | null;
  five: FiveView | null; // セレクトファイブのとき
  fate: FateView | null; // 運命の二者択一のとき
  haiku: HaikuView | null; // ハイカー575 のとき
  bluff: BluffView | null; // ブラインドブラフのとき
  bouquet: BouquetView | null; // ワードブーケのとき
  blend: BlendView | null; // まぎれろ！のとき
  bomb: BombView | null;   // 爆弾まわしのとき
  relay: RelayView | null; // スタンプ伝言のとき
}

export function viewFor(room: RoomState, id: string, now: number): PlayerView {
  const g: TierState | null = room.game?.kind === 'tier' ? room.game : null;
  const f: FiveState | null = room.game?.kind === 'five' ? room.game : null;
  const d: FateState | null = room.game?.kind === 'fate' ? room.game : null;
  const h: HaikuState | null = room.game?.kind === 'haiku' ? room.game : null;
  const bl: BluffState | null = room.game?.kind === 'bluff' ? room.game : null;
  const bq: BouquetState | null = room.game?.kind === 'bouquet' ? room.game : null;
  const bd: BlendState | null = room.game?.kind === 'blend' ? room.game : null;
  const bm: BombState | null = room.game?.kind === 'bomb' ? room.game : null;
  const rl: RelayState | null = room.game?.kind === 'relay' ? room.game : null;
  const hOwner = h?.phase === 'recite' ? currentSheet(h)?.ownerId : undefined;
  const deadline = rl ? rl.deadline : bm ? 0 : bd ? bd.deadline : bq ? bq.deadline : bl ? bl.deadline : h ? (h.phase === 'write' ? h.deadline : h.phase === 'recite' ? h.show?.deadline ?? 0 : 0) : room.game && (room.game.phase === 'ranking' || room.game.phase === 'guess' || room.game.phase === 'answer' || room.game.phase === 'question') ? room.game.deadline : 0;
  const tgt = g ? currentTarget(g) : undefined;
  const nameOf = (pid: string) => room.players.find(p => p.id === pid)?.name ?? '???';
  return {
    phase: room.game ? room.game.phase : 'lobby',
    gameNo: room.gameNo,
    mode: room.pickMode,
    gameMode: room.gameMode,
    game: room.game?.kind ?? null,
    timeLimit: room.timeLimit,
    fateTime: room.fateTime,
    fateQuota: room.fateQuota,
    fateLives: room.fateLives,
    haikuStyle: room.haikuStyle,
    haikuTime: room.haikuTime,
    bluffTime: room.bluffTime,
    bouquetTime: room.bouquetTime,
    bouquetGoal: room.bouquetGoal,
    bouquetHand: room.bouquetHand,
    bouquetMix: room.bouquetMix,
    blendTime: room.blendTime,
    blendCrowd: room.blendCrowd,
    bombRounds: room.bombRounds,
    bombFuse: room.bombFuse,
    bombStyle: room.bombStyle,
    relayTime: room.relayTime,
    code: room.code,
    hostId: room.hostId,
    me: id,
    players: room.players.map(p => ({
      id: p.id, name: p.name, score: p.score, online: p.online, version: p.version,
      topics: room.topicsBy[p.id]?.length ?? 0, fives: room.fivesBy[p.id]?.length ?? 0,
      fates: room.fatesBy[p.id]?.length ?? 0, haikus: room.haikusBy[p.id]?.length ?? 0, bouquets: room.bouquetsBy[p.id]?.length ?? 0, bouquetWords: room.bouquetWordsBy[p.id]?.length ?? 0, chara: p.chara, editing: !!p.editing, bot: !!p.bot,
      done: rl ? (rl.phase === 'work' && rl.ring.includes(p.id) ? p.id in rl.drafts : null)
        : bm ? null
        : bd ? (bd.phase === 'hide' && p.id !== bd.hiderId && p.online ? p.id in bd.guesses : null)
        : bq ? (bq.phase === 'compose' && p.id in bq.hands ? p.id in bq.phrases : null)
        : bl ? (bl.phase === 'talk' && p.id in bl.cards ? p.id in bl.bets : null)
        : h ? (h.phase === 'write' ? (h.ring.includes(p.id) ? p.id in h.drafts : null) : h.show?.rating && p.id !== hOwner ? p.id in currentSheet(h)!.ratings : null)
        : f ? (f.phase === 'answer' && answers(f, p.id) ? !!f.picks[p.id] : null)
        : !g ? null : g.phase === 'ranking' ? !!g.ranks[p.id] : g.phase === 'guess' && p.id !== tgt ? !!g.guesses[p.id] : null,
    })),
    startError: room.game ? null : startErrorOf(room),
    timeLeft: deadline ? Math.max(0, deadline - now) : null,
    myTopic: g?.assign[id] ?? null,
    myRank: g?.ranks[id] ?? null,
    round: rl ? (rl.phase === 'work' ? rl.step : rl.show?.idx ?? 0) : bm ? bm.round : bd ? bd.round : bq ? bq.round : bl ? bl.round : h ? (h.phase === 'write' ? h.step : h.show?.idx ?? 0) : g?.round ?? f?.round ?? d?.round ?? 0,
    rounds: rl ? (rl.phase === 'work' ? rl.steps : rl.books.length) : bm ? bm.rounds : bd ? bd.ring.length : bq ? totalRounds(bq) : bl ? bl.rounds : h ? (h.phase === 'write' ? h.steps : h.sheets.length) : g?.order.length ?? f?.rounds.length ?? d?.deck.length ?? 0,
    target: g && tgt ? { id: tgt, name: nameOf(tgt), topic: g.assign[tgt] } : null,
    myGuess: g?.guesses[id] ?? null,
    reveal: g?.phase === 'reveal' ? g.reveal : null,
    five: f ? fiveView(f, id) : null,
    fate: d ? fateView(d, id) : null,
    haiku: h ? haikuView(h, id) : null,
    bluff: bl ? bluffView(bl, id) : null,
    bouquet: bq ? bouquetView(bq, id) : null,
    blend: bd ? blendView(bd, id, now) : null,
    bomb: bm ? bombView(bm, now) : null,
    relay: rl ? relayView(rl, id) : null,
  };
}
