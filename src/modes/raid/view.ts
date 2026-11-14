// ダイスレイドで各参加者に見せてよい情報。協力ゲームで隠す情報がないので、ゲームの中身は全員に同じものを送る
import type { GameEvent, GameState } from './engine';
import { seatOf, type RaidState } from './rules';

export interface RaidView {
  game: GameState;
  events: GameEvent[];
  seq: number;
  seats: (string | null)[];
  mySeat: number;   // 自分の席（座っていなければ -1。見ているだけ）
}

export const raidView = (g: RaidState, id: string): RaidView => ({ game: g.game, events: g.events, seq: g.seq, seats: g.seats, mySeat: seatOf(g, id) });
