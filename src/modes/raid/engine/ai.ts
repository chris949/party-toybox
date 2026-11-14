import { BOARD } from './data/board';
import { CHIP_MAP } from './data/chips';
import { CLASSES } from './data/classes';
import { CARD_PRICE, GIFT_COINS, HAND_MAX, LEVEL_MAX } from './data/config';
import { getActorId, isMelee, nextTiles, previewDamage, suggestReaction, targetsInRange, distTo } from './engine';
import { calcDef, calcMoveBonus, expectedDefend, levelCost, tagCount } from './stats';
import type { Action, AttackTarget, GameState, Player, TileType } from './types';

/** CPU：現在の状態から次の1手を決める（ルールエンジンと同じ純粋関数） */
export function decideAction(s: GameState): Action {
  const pid = getActorId(s);
  if (pid === null) throw new Error('操作できるプレイヤーがいません');
  const p = s.players[pid];
  if (s.drafts.length) return decideDraft(s, p);
  if (s.step === 'react') return { type: 'react', playerId: pid, choice: suggestReaction(s, p, s.queue[0]) };

  const card = decideCard(s, p);
  if (card) return card;

  // レベルアップはターン中いつでもできるので、コインが貯まったらすぐ上げる
  if (['roll', 'act', 'shop'].includes(s.step) && p.level < LEVEL_MAX && p.coins >= levelCost(p)) {
    return { type: 'levelUp', playerId: pid, choice: p.level === 3 ? 'skill' : 'stats' };
  }
  const gift = decideGift(s, p);
  if (gift) return gift;

  switch (s.step) {
    case 'roll': return { type: 'roll', playerId: pid };
    case 'assign': return decideAssign(s, p);
    case 'branch': return decideBranch(s, p);
    case 'shop': return decideShop(s, p);
    case 'act': return decideAct(s, p);
    default: throw new Error(`CPUが扱えない状態: ${s.step}`);
  }
}

// ───────────────────────── 移動先の評価 ─────────────────────────

export interface Destination {
  tile: number;
  path: number[];
}

/** from から steps 歩いたときの到着先をすべて列挙。blocked（敵のいるマス）に入るとそこで止まる */
export function walkDestinations(from: number, prev: number | null, steps: number, blocked: ReadonlySet<number> = new Set()): Destination[] {
  if (steps <= 0) return [{ tile: from, path: [] }];
  const out: Destination[] = [];
  for (const n of nextTiles(from, prev)) {
    if (blocked.has(n)) {
      out.push({ tile: n, path: [n] });
      continue;
    }
    for (const d of walkDestinations(n, from, steps - 1, blocked)) out.push({ tile: d.tile, path: [n, ...d.path] });
  }
  return out;
}

export function enemyTiles(s: GameState): Set<number> {
  return new Set(s.enemies.map((e) => e.tile));
}

const TILE_VALUE: Record<TileType, number> = {
  start: 2, coin: 3, card: 3, chest: 9, heal: 0, shop: 2, trap: -5, thief: -3, curse: -3, fate: 1, warp: 0, ambush: -6,
};

function tileScore(s: GameState, p: Player, tile: number): number {
  const t = BOARD.tiles[tile];
  let v = TILE_VALUE[t.type];
  if (t.type === 'card' && p.hand.length >= HAND_MAX) v = 0;
  if (t.type === 'thief') v = -Math.max(3, p.coins * 0.3) * 0.5;
  if (t.type === 'heal') v = Math.min(6, p.maxHp - p.hp) * 0.8;
  if ((t.type === 'shop' || t.type === 'start') && p.level < LEVEL_MAX && p.coins >= levelCost(p)) v += 8;
  // 準備フェーズ終盤は内周の近くに寄せておく
  if (s.phase === 'prep' && s.round >= s.config.bossRound - 1) v -= BOARD.bossDist[tile] * 0.8;
  return v;
}

function dangerAt(s: GameState, p: Player, tile: number, killedEnemy: number | null): number {
  let dmg = 0;
  const intent = s.boss?.intent;
  if (intent && intent.tiles.includes(tile)) dmg += expectedDefend(intent.base + 3.5, calcDef(p));
  if (s.boss && BOARD.bossDist[tile] === 1) dmg += expectedDefend(6.5, calcDef(p));
  for (const e of s.enemies) {
    if (e.id !== killedEnemy && BOARD.dist[e.tile][tile] <= 1) dmg += expectedDefend(e.atk + 3.5, calcDef(p)) * 0.6;
  }
  let score = dmg * 1.3;
  if (dmg >= p.hp) score += 25;
  return score;
}

function bestAttackFrom(s: GameState, p: Player, tile: number, actionValue: number): { target: AttackTarget | null; value: number; killed: number | null } {
  let best: { target: AttackTarget | null; value: number; killed: number | null } = {
    target: null, value: Math.ceil(actionValue / 2) * 0.5, killed: null,
  };
  for (const t of targetsInRange(s, p, tile)) {
    const dmg = previewDamage(s, p, t, actionValue, tile);
    let value: number;
    let killed: number | null = null;
    if (t.kind === 'boss') {
      value = Math.min(dmg, s.boss!.hp) * 1.4 + (dmg >= s.boss!.hp ? 100 : 0);
    } else {
      const e = s.enemies.find((x) => x.id === t.id)!;
      value = Math.min(dmg, e.hp) * 0.8;
      if (dmg >= e.hp) {
        value += 12;
        killed = e.id;
      } else if (isMelee(distTo(s, tile, t))) {
        value -= expectedDefend(e.atk + 3.5, calcDef(p)) * 0.8; // 反撃のリスク
      }
    }
    if (value > best.value) best = { target: t, value, killed };
  }
  return best;
}

function scoreDestination(s: GameState, p: Player, tile: number, actionValue: number): number {
  // 敵のいるマスに止まる＝接敵（行動ダイスで先制攻撃、生き残られると反撃）
  const foe = s.enemies.find((e) => e.tile === tile);
  if (foe) {
    const dmg = previewDamage(s, p, { kind: 'enemy', id: foe.id }, actionValue, tile);
    let v = Math.min(dmg, foe.hp) * 0.8 * (actionValue <= 3 ? 0.6 : 1);
    if (dmg >= foe.hp) v += 12;
    else v -= expectedDefend(foe.atk + 3.5, calcDef(p));
    return v + tileScore(s, p, tile) * 0.5 - dangerAt(s, p, tile, dmg >= foe.hp ? foe.id : null);
  }
  const atk = bestAttackFrom(s, p, tile, actionValue);
  return atk.value + tileScore(s, p, tile) - dangerAt(s, p, tile, atk.killed);
}

function bestForSplit(s: GameState, p: Player, move: number, action: number): number {
  const dests = walkDestinations(p.tile, p.prevTile, move + calcMoveBonus(p), enemyTiles(s));
  let best = -Infinity;
  for (const d of dests) best = Math.max(best, scoreDestination(s, p, d.tile, action));
  return best;
}

function bestAssignment(s: GameState, p: Player, dice: [number, number]): { moveDie: 0 | 1; score: number } {
  const fate4 = tagCount(p, 'fate') >= 4;
  const adj = (v: number) => (fate4 && v <= 2 ? v + 3 : v);
  const a = bestForSplit(s, p, dice[0], adj(dice[1]));
  const b = bestForSplit(s, p, dice[1], adj(dice[0]));
  return a >= b ? { moveDie: 0, score: a } : { moveDie: 1, score: b };
}

// ───────────────────────── 各ステップ ─────────────────────────

function decideAssign(s: GameState, p: Player): Action {
  const dice = s.turn.dice!;
  const base = bestAssignment(s, p, dice);
  let best: { action: Action; score: number } = { action: { type: 'assign', playerId: p.id, moveDie: base.moveDie }, score: base.score };

  // チームダイスとの交換
  if (!s.teamDieUsed) {
    for (const die of [0, 1] as const) {
      const swapped: [number, number] = [...dice];
      swapped[die] = s.teamDie;
      const r = bestAssignment(s, p, swapped);
      // 大きい出目を預けると仲間の助けになるので少しだけ加点
      const gift = dice[die] >= 5 ? 1 : 0;
      if (r.score + gift > best.score + 1.5) best = { action: { type: 'swapTeamDie', playerId: p.id, die }, score: r.score + gift };
    }
  }
  // 集中トークンで ±1
  if (p.focus >= 1 && !s.turn.focusUsed) {
    for (const die of [0, 1] as const) {
      for (const delta of [1, -1] as const) {
        if (delta < 0 && dice[die] <= 1) continue;
        const changed: [number, number] = [...dice];
        changed[die] += delta;
        const r = bestAssignment(s, p, changed);
        const cost = p.focus >= 4 ? 1 : 2.5;
        if (r.score - cost > best.score + 1) best = { action: { type: 'adjust', playerId: p.id, die, delta }, score: r.score - cost };
      }
    }
  }
  return best.action;
}

function decideBranch(s: GameState, p: Player): Action {
  const remaining = s.turn.moveRemaining;
  let best = { to: s.turn.branchOptions[0], score: -Infinity };
  for (const to of s.turn.branchOptions) {
    const dests = enemyTiles(s).has(to) ? [{ tile: to, path: [to] }] : walkDestinations(to, p.tile, remaining - 1, enemyTiles(s));
    for (const d of dests) {
      const score = scoreDestination(s, p, d.tile, s.turn.actionValue);
      if (score > best.score) best = { to, score };
    }
  }
  return { type: 'branch', playerId: p.id, to: best.to };
}

/** すれ違った仲間が、もう少しでレベルアップできるならコインを送る */
function decideGift(s: GameState, p: Player): Action | null {
  if (!['act', 'shop'].includes(s.step) || p.coins < GIFT_COINS) return null;
  const myGap = p.level < LEVEL_MAX ? levelCost(p) - p.coins : Infinity;
  for (const id of s.turn.passedAllies) {
    if (s.turn.giftedTo.includes(id)) continue;
    const m = s.players[id];
    if (m.level >= LEVEL_MAX) continue;
    const gap = levelCost(m) - m.coins;
    if (gap > 0 && gap <= GIFT_COINS && myGap > GIFT_COINS * 2) return { type: 'giveCoins', playerId: p.id, targetId: id };
  }
  return null;
}

function decideShop(s: GameState, p: Player): Action {
  if (p.level < LEVEL_MAX && p.coins >= levelCost(p)) {
    const choice = p.level === 3 ? 'skill' : 'stats';
    return { type: 'levelUp', playerId: p.id, choice };
  }
  const reserve = p.level < LEVEL_MAX ? Math.min(levelCost(p), 20) : 0;
  if (p.hand.length < HAND_MAX && p.coins - CARD_PRICE >= reserve * 0.6) {
    const wanted = ['power', 'potion', 'bell', 'ward', 'reroll', 'dash', 'fix', 'coin_bag'];
    const offers = s.turn.shopOffers;
    const idx = wanted.map((w) => offers.indexOf(w)).find((i) => i >= 0);
    if (idx !== undefined && offers.length) return { type: 'buyCard', playerId: p.id, index: idx };
  }
  return { type: 'leaveShop', playerId: p.id };
}

function decideAct(s: GameState, p: Player): Action {
  const atk = bestAttackFrom(s, p, p.tile, s.turn.actionValue);
  if (p.skillCooldown === 0) {
    const skill = decideSkill(s, p, atk.target);
    if (skill) return skill;
  }
  if (atk.target) return { type: 'attack', playerId: p.id, target: atk.target };
  return { type: 'prepare', playerId: p.id };
}

function decideSkill(s: GameState, p: Player, bestTarget: AttackTarget | null): Action | null {
  const skill = (target?: AttackTarget): Action => ({ type: 'skill', playerId: p.id, target });
  const missing = s.players.reduce((a, m) => a + (m.maxHp - m.hp), 0);
  switch (p.classId) {
    case 'warrior': {
      const intent = s.boss?.intent;
      if (intent?.kind === 'target' && intent.targetId !== p.id && p.hp > intent.base + 6) return skill();
      if (p.hp <= p.maxHp * 0.4 && !bestTarget) return skill();
      return null;
    }
    case 'mage':
      return targetsInRange(s, p).length >= 2 ? skill() : null;
    case 'priest':
      return missing >= 14 ? skill() : null;
    case 'archer':
      return bestTarget && s.turn.actionValue >= 3 ? skill(bestTarget) : null;
  }
}

function decideCard(s: GameState, p: Player): Action | null {
  if (!['assign', 'act', 'shop'].includes(s.step)) return null;
  const use = (id: string, targetId?: number): Action | null => {
    const index = p.hand.indexOf(id);
    return index >= 0 ? { type: 'useCard', playerId: p.id, index, targetId } : null;
  };
  if (p.hand.includes('coin_bag')) return use('coin_bag');
  if (p.hp <= p.maxHp * 0.45 && p.hand.includes('potion')) return use('potion');
  const missing = s.players.reduce((a, m) => a + (m.maxHp - m.hp), 0);
  if (missing >= 16 && p.hand.includes('bell')) return use('bell');

  if (s.step === 'assign') {
    const dice = s.turn.dice!;
    if (Math.max(...dice) <= 3 && p.hand.includes('fix')) return use('fix');
    if (dice[0] + dice[1] <= 4 && p.hand.includes('reroll')) return use('reroll');
  }
  if (s.step === 'act') {
    const atk = bestAttackFrom(s, p, p.tile, s.turn.actionValue);
    if (atk.target?.kind === 'boss' && !p.buffs.power && p.hand.includes('power')) return use('power');
    const intent = s.boss?.intent;
    if (intent && p.hand.includes('ward')) {
      const victim = intent.kind === 'target' ? s.players[intent.targetId!] : s.players.find((m) => intent.tiles.includes(m.tile) && m.hp <= intent.base + 4);
      if (victim && victim.buffs.shield === 0) return use('ward', victim.id);
    }
  }
  return null;
}

function chipValue(p: Player, id: string): number {
  const c = CHIP_MAP[id];
  const sameTag = p.chips.filter((x) => x !== id && CHIP_MAP[x].tag === c.tag).length;
  return c.tier * 3 + (c.tag === CLASSES[p.classId].tag ? 3 : 0) + sameTag * 2;
}

function decideDraft(s: GameState, p: Player): Action {
  const d = s.drafts[0];
  let bestIdx = 0;
  d.options.forEach((id, i) => {
    if (chipValue(p, id) > chipValue(p, d.options[bestIdx])) bestIdx = i;
  });
  if (p.chips.length < p.chipSlots) return { type: 'pickChip', playerId: p.id, index: bestIdx };
  let worst = 0;
  p.chips.forEach((id, i) => {
    if (chipValue(p, id) < chipValue(p, p.chips[worst])) worst = i;
  });
  if (chipValue(p, d.options[bestIdx]) > chipValue(p, p.chips[worst]) + 1) {
    return { type: 'pickChip', playerId: p.id, index: bestIdx, replace: worst };
  }
  return { type: 'pickChip', playerId: p.id, index: null };
}

