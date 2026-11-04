import type { Random } from './random';
import type { Topic } from './topics';
import type { TierState } from '../modes/tier/rules';

export interface Player {
  id: string;
  key: string;      // なりすまし防止の鍵（本人とホストだけが知る）
  name: string;
  online: boolean;
  score: number;
  version: string;  // 参加者が開いているアプリの版
}

export const PICK_MODES = { random: '全部からランダム', each: '作成者ごとに1つずつ' } as const;
export type PickMode = keyof typeof PICK_MODES;

// ホストだけが持つ部屋の状態
export interface RoomState {
  code: string;
  hostId: string;
  minPlayers: number;
  gameNo: number;
  pickMode: PickMode;
  players: Player[];
  topicsBy: Record<string, Topic[]>;
  game: TierState | null; // null = ロビー
}

// 状態を進める操作。from は操作した人（タイマーはホスト）
export type Action =
  | { t: 'join'; name: string; key: string; topics: Topic[]; version: string }
  | { t: 'leave' }
  | { t: 'mode'; mode: PickMode }
  | { t: 'start' }
  | { t: 'kick'; id: string }
  | { t: 'lobby' }
  | { t: 'rank'; order: (number | null)[]; partial?: boolean }
  | { t: 'guess'; round: number; order: number[] }
  | { t: 'force' }
  | { t: 'reveal-all' }
  | { t: 'next' }
  | { t: 'timeUp' }
  | { t: 'revealStep' };

export type ActionFrom = Action & { from: string };

export interface Ctx {
  now: number;
  random: Random;
}

export interface Timer {
  at: number;
  action: Action;
}
