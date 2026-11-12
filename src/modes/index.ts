// ゲームモードの一覧。モードを足すときは、同じ形のものをここに並べる
import type { Ctx, ActionFrom, GameMode, RoomState, Timer } from '../core/types';
import * as tier from './tier/rules';
import * as five from './five/rules';
import * as fate from './fate/rules';
import * as haiku from './haiku/rules';
import * as bluff from './bluff/rules';

type Game = NonNullable<RoomState['game']>;
interface Mode<G extends Game> {
  name: string;
  start(room: RoomState, ctx: Ctx): G;
  startError(room: RoomState): string | null;
  reduce(room: RoomState, g: G, a: ActionFrom, ctx: Ctx): boolean;
  checkAdvance(room: RoomState, g: G, ctx: Ctx): void;
  nextTimer(g: G): Timer | null;
}

const tierMode: Mode<tier.TierState> = { name: 'ティアリスト', ...pick(tier) };
const fiveMode: Mode<five.FiveState> = { name: 'セレクトファイブ', ...pick(five) };
const fateMode: Mode<fate.FateState> = { name: '運命の二者択一', ...pick(fate) };
const haikuMode: Mode<haiku.HaikuState> = { name: 'ハイカー575', ...pick(haiku) };
const bluffMode: Mode<bluff.BluffState> = { name: 'ブラインドブラフ', ...pick(bluff) };
function pick<M extends { start: any; startError: any; reduce: any; checkAdvance: any; nextTimer: any }>(m: M) {
  return { start: m.start, startError: m.startError, reduce: m.reduce, checkAdvance: m.checkAdvance, nextTimer: m.nextTimer };
}

export const MODES: { [K in GameMode]: Mode<any> } = { tier: tierMode, five: fiveMode, fate: fateMode, haiku: haikuMode, bluff: bluffMode };
// 進行中のゲームのモード
export const modeOf = (g: Game) => MODES[g.kind];
