import { CHIP_MAP } from './data/chips';
import { CLASSES } from './data/classes';
import { FOCUS_BASE_MAX, LEVEL_COSTS } from './data/config';
import type { Player, Tag } from './types';

export function hasChip(p: Player, id: string): boolean {
  return p.chips.includes(id);
}

export function tagCount(p: Player, tag: Tag): number {
  return p.chips.filter((c) => CHIP_MAP[c]?.tag === tag).length;
}

export function tagCounts(p: Player): Record<Tag, number> {
  return {
    fire: tagCount(p, 'fire'),
    thunder: tagCount(p, 'thunder'),
    guard: tagCount(p, 'guard'),
    gold: tagCount(p, 'gold'),
    fate: tagCount(p, 'fate'),
  };
}

export function calcMaxHp(p: Player): number {
  return CLASSES[p.classId].hp + p.statBonus.maxHp + (tagCount(p, 'guard') >= 4 ? 6 : 0);
}

export function calcDef(p: Player): number {
  const guard = tagCount(p, 'guard');
  return (
    CLASSES[p.classId].def +
    p.statBonus.def +
    (hasChip(p, 'iron_skin') ? 1 : 0) +
    (guard >= 4 ? 2 : guard >= 2 ? 1 : 0) +
    (p.buffs.taunt ? 2 : 0)
  );
}

/** ダイスを含まない、素の攻撃力 */
export function calcAtk(p: Player): number {
  const fire = tagCount(p, 'fire');
  let atk = CLASSES[p.classId].atk + p.statBonus.atk;
  if (hasChip(p, 'flame_blade')) atk += 2;
  if (fire >= 4) atk += 3;
  else if (fire >= 2) atk += 1;
  if (tagCount(p, 'thunder') >= 4) atk += 2;
  atk += p.fireStacks;
  if (hasChip(p, 'blaze') && p.fireStacks >= 5) atk += 4;
  if (hasChip(p, 'golden_fist')) atk += Math.floor(p.coins / 8);
  if (hasChip(p, 'fortress')) atk += calcDef(p);
  if (hasChip(p, 'destiny')) atk += p.focus;
  return atk;
}

export function calcMoveBonus(p: Player): number {
  return (hasChip(p, 'quick') ? 1 : 0) + (tagCount(p, 'thunder') >= 2 ? 1 : 0) + p.buffs.moveBonus;
}

export function focusMax(p: Player): number {
  return FOCUS_BASE_MAX + (hasChip(p, 'meditation') ? 2 : 0);
}

export function levelCost(p: Player): number {
  const base = LEVEL_COSTS[p.level - 1] ?? Infinity;
  return hasChip(p, 'midas') ? Math.ceil(base / 2) : base;
}

export function calcEvd(p: Player): number {
  return CLASSES[p.classId].evd;
}

export interface AttackContext {
  actionValue: number;
  dist: number;
  isBoss: boolean;
  /** スキル等による倍率 */
  scale?: number;
}

/** 防御前の攻撃力（予測表示・CPU・実際の処理で共通） */
export function attackPower(p: Player, ctx: AttackContext): number {
  let dmg = calcAtk(p) + ctx.actionValue;
  if (p.classId === 'mage' && ctx.actionValue >= 5) dmg += 1;
  if (p.classId === 'archer' && ctx.dist >= 2) dmg += 2;
  if (p.classId === 'warrior' && p.hp <= p.maxHp / 2) dmg += 2;
  if (hasChip(p, 'static') && ctx.actionValue % 2 === 0) dmg += 2;
  if (hasChip(p, 'underdog') && ctx.actionValue <= 2) dmg *= 2;
  if (p.buffs.power) dmg *= 2;
  if (ctx.isBoss && hasChip(p, 'inferno')) dmg *= 1.5;
  if (ctx.scale) dmg *= ctx.scale;
  return Math.max(1, Math.floor(dmg));
}

/** 防御を選んだときの被ダメージの期待値 */
export function expectedDefend(power: number, def: number): number {
  let sum = 0;
  for (let r = 1; r <= 6; r++) sum += Math.max(1, power - def - r);
  return sum / 6;
}

/** 回避の成功率（出目6は必ず成功） */
export function evadeChance(attackRoll: number, evd: number): number {
  let ok = 0;
  for (let r = 1; r <= 6; r++) if (r === 6 || r + evd > attackRoll) ok++;
  return ok / 6;
}

export function contributionScore(p: Player): number {
  const c = p.contrib;
  return c.damage + c.kills * 5 + c.support - c.ko * 5;
}
