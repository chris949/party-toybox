// 各参加者に見せてよい情報を作る。他人の順位（正解）は答え合わせまで送らない
import type { RoomState } from '../../core/types';
import { currentTarget, startError, type Assigned, type Reveal, type TierPhase, type TierState } from './rules';

export type ViewPhase = 'lobby' | TierPhase;

export interface PlayerSummary {
  id: string;
  name: string;
  score: number;
  online: boolean;
  version: string;
  topics: number;
  done: boolean | null; // 提出済みか（対象外なら null）
}

export interface PlayerView {
  phase: ViewPhase;
  gameNo: number;
  mode: RoomState['pickMode'];
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
}

export function viewFor(room: RoomState, id: string, now: number): PlayerView {
  const g: TierState | null = room.game;
  const tgt = g ? currentTarget(g) : undefined;
  const nameOf = (pid: string) => room.players.find(p => p.id === pid)?.name ?? '???';
  return {
    phase: g ? g.phase : 'lobby',
    gameNo: room.gameNo,
    mode: room.pickMode,
    code: room.code,
    hostId: room.hostId,
    me: id,
    players: room.players.map(p => ({
      id: p.id, name: p.name, score: p.score, online: p.online, version: p.version,
      topics: room.topicsBy[p.id]?.length ?? 0,
      done: !g ? null : g.phase === 'ranking' ? !!g.ranks[p.id] : g.phase === 'guess' && p.id !== tgt ? !!g.guesses[p.id] : null,
    })),
    startError: g ? null : startError(room),
    timeLeft: g && (g.phase === 'ranking' || g.phase === 'guess') && g.deadline ? Math.max(0, g.deadline - now) : null,
    myTopic: g?.assign[id] ?? null,
    myRank: g?.ranks[id] ?? null,
    round: g?.round ?? 0,
    rounds: g?.order.length ?? 0,
    target: g && tgt ? { id: tgt, name: nameOf(tgt), topic: g.assign[tgt] } : null,
    myGuess: g?.guesses[id] ?? null,
    reveal: g?.phase === 'reveal' ? g.reveal : null,
  };
}
