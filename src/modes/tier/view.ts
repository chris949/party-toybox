// 各参加者に見せてよい情報を作る（ロビーと、どちらのモードでも共通）。他人の順位・正解は答え合わせまで送らない
import type { RoomState } from '../../core/types';
import { startErrorOf } from '../../core/room';
import { currentTarget, type Assigned, type Reveal, type TierPhase, type TierState } from './rules';
import { answers, type FivePhase, type FiveState } from '../five/rules';
import { fiveView, type FiveView } from '../five/view';
import type { FatePhase, FateState } from '../fate/rules';
import { fateView, type FateView } from '../fate/view';

export type ViewPhase = 'lobby' | TierPhase | FivePhase | FatePhase;

export interface PlayerSummary {
  id: string;
  name: string;
  score: number;
  online: boolean;
  version: string;
  topics: number;
  fives: number;    // セレクトファイブのお題の数
  fates: number;    // 運命の二者択一の問題の数
  chara: number;    // キャラクターの番号
  editing: boolean; // ロビーでお題を編集中か
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
}

export function viewFor(room: RoomState, id: string, now: number): PlayerView {
  const g: TierState | null = room.game?.kind === 'tier' ? room.game : null;
  const f: FiveState | null = room.game?.kind === 'five' ? room.game : null;
  const d: FateState | null = room.game?.kind === 'fate' ? room.game : null;
  const deadline = room.game && (room.game.phase === 'ranking' || room.game.phase === 'guess' || room.game.phase === 'answer' || room.game.phase === 'question') ? room.game.deadline : 0;
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
    code: room.code,
    hostId: room.hostId,
    me: id,
    players: room.players.map(p => ({
      id: p.id, name: p.name, score: p.score, online: p.online, version: p.version,
      topics: room.topicsBy[p.id]?.length ?? 0, fives: room.fivesBy[p.id]?.length ?? 0,
      fates: room.fatesBy[p.id]?.length ?? 0, chara: p.chara, editing: !!p.editing,
      done: f ? (f.phase === 'answer' && answers(f, p.id) ? !!f.picks[p.id] : null)
        : !g ? null : g.phase === 'ranking' ? !!g.ranks[p.id] : g.phase === 'guess' && p.id !== tgt ? !!g.guesses[p.id] : null,
    })),
    startError: room.game ? null : startErrorOf(room),
    timeLeft: deadline ? Math.max(0, deadline - now) : null,
    myTopic: g?.assign[id] ?? null,
    myRank: g?.ranks[id] ?? null,
    round: g?.round ?? f?.round ?? d?.round ?? 0,
    rounds: g?.order.length ?? f?.rounds.length ?? d?.deck.length ?? 0,
    target: g && tgt ? { id: tgt, name: nameOf(tgt), topic: g.assign[tgt] } : null,
    myGuess: g?.guesses[id] ?? null,
    reveal: g?.phase === 'reveal' ? g.reveal : null,
    five: f ? fiveView(f, id) : null,
    fate: d ? fateView(d, id) : null,
  };
}
