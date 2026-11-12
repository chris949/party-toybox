// 舞台に何を描くか（2D表示と3D表示で共通）。ルールの状態（view.ts）から screens.tsx が組み立てて、どちらの描き方にも同じものを渡す
import type { Pos } from './rules';

export type FloorState = '' | 'ok' | 'open' | 'blink'; // ふつう／正解で光る／開く／開いてすぐ閉じる（救済）
export type StagePos = Pos | 'P'; // P = お立ち台（その問題を作った人）
export interface StagePiece {
  id: string; name: string; chara: number; color: string; pos: StagePos;
  lives: number;   // 残りのライフ（名前の札に ♥ で出す）
  variant: number; // 同じキャラクターを選んだ人のうち何人目か（0 = 1人目。2人目からは色合いを変える）
  me: boolean; ghost: boolean; author: boolean;
  fate: 'fall' | 'shock' | 'safe' | null; // 発表のとき：落ちる／床は開いたが助かった／正解
}
export interface StageState { pieces: StagePiece[]; floors: Record<Pos, FloorState>; mySide: Pos }
