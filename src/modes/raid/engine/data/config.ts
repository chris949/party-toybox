import type { EnemyKind, Mode, ModeConfig } from '../types';

export const MODES: Record<Mode, ModeConfig & { label: string }> = {
  quick: { label: 'クイック（約10分）', maxRounds: 7, bossRound: 4, bossHp: 150, teamLife: 2 },
  standard: { label: 'スタンダード（15〜20分）', maxRounds: 12, bossRound: 7, bossHp: 500, teamLife: 3 },
};

/** speed：敵フェイズに進むマス数 */
export const ENEMIES: Record<EnemyKind, { name: string; icon: string; hp: number; atk: number; def: number; coins: number; speed: number }> = {
  slime: { name: 'スライム', icon: '🟢', hp: 9, atk: 4, def: 0, coins: 4, speed: 1 },
  goblin: { name: 'ゴブリン', icon: '👺', hp: 14, atk: 6, def: 1, coins: 7, speed: 2 },
  orc: { name: 'コボルト', icon: '🐺', hp: 22, atk: 8, def: 2, coins: 11, speed: 1 },
};

export const BOSS = { name: '魔竜ヴォルグ', icon: '🐉', def: 1 };
/** 威圧（隣接しているプレイヤーへの毎ラウンドの攻撃）の固定部分 */
export const BOSS_AURA = 4;

export const HAND_MAX = 3;
export const FOCUS_BASE_MAX = 5;
export const SKILL_COOLDOWN = 3;
export const CARD_PRICE = 5;
export const START_PASS_COINS = 2;
export const LEVEL_MAX = 5;
export const LEVEL_COSTS = [15, 22, 30, 40]; // Lv1→2, 2→3, ...
export const CHIP_SLOTS_MAX = 8;
export const SUPPLY_EVERY = 2;
/** チップ枠：レベル＋3（Lv1で4、Lv5で8） */
export const CHIP_SLOTS_BASE = 3;
/** チップを見送ると売却してコインになる */
export const CHIP_SELL_COINS = 3;
/** このラウンドごとに全員へボーナス（コイン＋カード）。いちばん貧しい人は追加でもらえる */
export const BONUS_EVERY = 3;
export const BONUS_COINS = 4;
export const BONUS_CATCHUP = 3;
/** すれ違った仲間へ一度に送るコイン */
export const GIFT_COINS = 5;
