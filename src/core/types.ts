import type { Random } from './random';
import type { Topic } from './topics';
import type { FiveTopic } from './fives';
import type { TierState } from '../modes/tier/rules';
import type { FiveState } from '../modes/five/rules';
import type { FateQuestion } from './fates';
import type { FateState, Side } from '../modes/fate/rules';

export interface Player {
  id: string;
  key: string;      // なりすまし防止の鍵（本人とホストだけが知る）
  name: string;
  online: boolean;
  score: number;
  version: string;  // 参加者が開いているアプリの版
  chara: number;    // 運命の二者択一で使うキャラクターの番号
}

export const PICK_MODES = { random: '全部からランダム', each: '作成者ごとに1つずつ' } as const;
export type PickMode = keyof typeof PICK_MODES;

export const GAME_MODES = { tier: 'ティアリスト', five: 'セレクトファイブ', fate: '運命の二者択一' } as const;
export type GameMode = keyof typeof GAME_MODES;

// ホストだけが持つ部屋の状態
export interface RoomState {
  code: string;
  hostId: string;
  minPlayers: number;
  gameNo: number;
  gameMode: GameMode; // 次に遊ぶモード
  pickMode: PickMode;
  timeLimit: number; // 並び替えの制限時間（秒）
  fateTime: number;  // 運命の二者択一の1問の制限時間（秒）
  players: Player[];
  topicsBy: Record<string, Topic[]>;
  fivesBy: Record<string, FiveTopic[]>; // セレクトファイブのお題
  fatesBy: Record<string, FateQuestion[]>; // 運命の二者択一の問題
  game: TierState | FiveState | FateState | null; // null = ロビー
}

// 状態を進める操作。from は操作した人（タイマーはホスト）
export type Action =
  | { t: 'join'; name: string; key: string; topics: Topic[]; fives?: FiveTopic[]; fates?: FateQuestion[]; chara?: number; version: string }
  | { t: 'leave' }
  | { t: 'mode'; mode: PickMode }
  | { t: 'time'; sec: number }
  | { t: 'game'; mode: GameMode }
  | { t: 'fateTime'; sec: number }
  | { t: 'chara'; n: number }
  | { t: 'move'; side: Side }
  | { t: 'pause' }
  | { t: 'five'; round: number; picks: number[]; partial?: boolean }
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
