import type { Random } from './random';
import type { Topic } from '../modes/tier/topics';
import type { FiveTopic } from '../modes/five/topics';
import type { TierState } from '../modes/tier/rules';
import type { FiveState } from '../modes/five/rules';
import type { FateQuestion } from '../modes/fate/questions';
import type { FateState, Side } from '../modes/fate/rules';
import type { HaikuStyle } from '../modes/haiku/themes';
import type { HaikuState } from '../modes/haiku/rules';
import type { BluffState } from '../modes/bluff/rules';

export interface Player {
  id: string;
  key: string;      // なりすまし防止の鍵（本人とホストだけが知る）
  name: string;
  online: boolean;
  score: number;
  version: string;  // 参加者が開いているアプリの版
  chara: number;    // 運命の二者択一で使うキャラクターの番号
  editing?: boolean; // ロビーでお題を編集中か
  bot?: boolean;     // CPU の参加者か（ホストが足す。運命の二者択一とハイカー575 でだけ動く）
}

export const PICK_MODES = { random: '全部からランダム', each: '作成者ごとに1つずつ' } as const;
export type PickMode = keyof typeof PICK_MODES;

export const GAME_MODES = { tier: 'ティアリスト', five: 'セレクトファイブ', fate: '運命の二者択一', haiku: 'ハイカー575', bluff: 'ブラインドブラフ' } as const;
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
  fateQuota: number; // 運命の二者択一で、1人がお立ち台に立つ回数
  fateLives: number; // 運命の二者択一のライフ（残機）
  haikuStyle: HaikuStyle; // ハイカー575 の遊び方（お題持ち寄り／17文字ぜんぶ）
  haikuTime: number;      // ハイカー575 の1文字の制限時間（秒）
  bluffTime: number;      // ブラインドブラフの、しゃべる時間（秒）
  haikusBy: Record<string, string[]>; // ハイカー575 のお題（上の五文字）
  players: Player[];
  topicsBy: Record<string, Topic[]>;
  fivesBy: Record<string, FiveTopic[]>; // セレクトファイブのお題
  fatesBy: Record<string, FateQuestion[]>; // 運命の二者択一の問題
  game: TierState | FiveState | FateState | HaikuState | BluffState | null; // null = ロビー
}

// 状態を進める操作。from は操作した人（タイマーはホスト）
export type Action =
  | { t: 'join'; name: string; key: string; topics: Topic[]; fives?: FiveTopic[]; fates?: FateQuestion[]; haikus?: string[]; chara?: number; version: string; bot?: boolean }
  | { t: 'leave' }
  | { t: 'mode'; mode: PickMode }
  | { t: 'time'; sec: number }
  | { t: 'game'; mode: GameMode }
  | { t: 'fateTime'; sec: number }
  | { t: 'fateQuota'; n: number }
  | { t: 'fateLives'; n: number }
  | { t: 'haikuStyle'; style: HaikuStyle }
  | { t: 'haikuTime'; sec: number }
  | { t: 'bluffTime'; sec: number }
  | { t: 'bet'; round: number; go: boolean }  // ブラインドブラフ：勝負（true）か、降りる（false）か
  | { t: 'kana'; step: number; ch: string }   // ハイカー575：1文字書く
  | { t: 'rate'; round: number; n: number }   // ハイカー575：作品に★を付ける
  | { t: 'chara'; n: number }
  | { t: 'topics'; topics: Topic[]; fives?: FiveTopic[]; fates?: FateQuestion[]; haikus?: string[] } // ロビーで持っていくお題を送り直す
  | { t: 'editing'; on: boolean }
  | { t: 'retract'; round: number } // 決定した予想・回答を取り消す
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
