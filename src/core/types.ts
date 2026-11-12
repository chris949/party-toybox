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
import type { BouquetState } from '../modes/bouquet/rules';
import type { BlendState } from '../modes/blend/rules';
import type { BombState } from '../modes/bomb/rules';

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

export const GAME_MODES = { tier: 'ティアリスト', five: 'セレクトファイブ', fate: '運命の二者択一', haiku: 'ハイカー575', bluff: 'ブラインドブラフ', bouquet: 'ワードブーケ', blend: 'まぎれろ！', bomb: '爆弾まわし' } as const;
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
  bouquetTime: number;    // ワードブーケの、文を作る時間（秒）
  bouquetGoal: number;    // ワードブーケの終わり方（0 = 全員が親を1回。3・5 = 先取）
  bouquetsBy: Record<string, string[]>; // ワードブーケのお題
  blendTime: number;      // まぎれろ！の、かくれる時間（秒）
  blendCrowd: number;     // まぎれろ！の、舞台にいるキャラクターの数
  bombRounds: number;     // 爆弾まわしの、爆発の回数
  bombFuse: number;       // 爆弾まわしの、導火線の長さ（BOMB_FUSES の番号）
  haikusBy: Record<string, string[]>; // ハイカー575 のお題（上の五文字）
  players: Player[];
  topicsBy: Record<string, Topic[]>;
  fivesBy: Record<string, FiveTopic[]>; // セレクトファイブのお題
  fatesBy: Record<string, FateQuestion[]>; // 運命の二者択一の問題
  game: TierState | FiveState | FateState | HaikuState | BluffState | BouquetState | BlendState | BombState | null; // null = ロビー
}

// 状態を進める操作。from は操作した人（タイマーはホスト）
export type Action =
  | { t: 'join'; name: string; key: string; topics: Topic[]; fives?: FiveTopic[]; fates?: FateQuestion[]; haikus?: string[]; bouquets?: string[]; chara?: number; version: string; bot?: boolean }
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
  | { t: 'bouquetTime'; sec: number }
  | { t: 'bouquetGoal'; n: number }
  | { t: 'blendTime'; sec: number }
  | { t: 'blendCrowd'; n: number }
  | { t: 'bombRounds'; n: number }
  | { t: 'bombFuse'; n: number }
  | { t: 'toss'; round: number; word: string; to: string } // 爆弾まわし：言葉を言って、爆弾を渡す
  | { t: 'tick' }                                  // まぎれろ！：位置を進める／爆弾まわし：導火線を進める（ホストのタイマーが出す）
  | { t: 'go'; round: number; x: number; z: number } // まぎれろ！：かくれる人の行き先
  | { t: 'grab'; round: number }                   // まぎれろ！：ほしを取る
  | { t: 'suspect'; round: number; i: number }     // まぎれろ！：「これが人だ」と選ぶ
  | { t: 'phrase'; round: number; tokens: number[] } // ワードブーケ：並べた文を提出する（0以上 = 手札の番号、負の数 = 助詞）
  | { t: 'redraw'; round: number }                    // ワードブーケ：手札を引き直す
  | { t: 'choose'; round: number; id: string }        // ワードブーケ：親が、いちばん刺さったものを選ぶ
  | { t: 'bet'; round: number; go: boolean }  // ブラインドブラフ：勝負（true）か、降りる（false）か
  | { t: 'kana'; step: number; ch: string }   // ハイカー575：1文字書く
  | { t: 'rate'; round: number; n: number }   // ハイカー575：作品に★を付ける
  | { t: 'chara'; n: number }
  | { t: 'topics'; topics: Topic[]; fives?: FiveTopic[]; fates?: FateQuestion[]; haikus?: string[]; bouquets?: string[] } // ロビーで持っていくお題を送り直す
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
