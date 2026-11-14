import { BOARD, TILE_INFO } from './data/board';
import { CARD_MAP, CARDS } from './data/cards';
import { CHIP_MAP, CHIPS } from './data/chips';
import { CLASSES } from './data/classes';
import {
  BOSS, BOSS_AURA, CARD_PRICE, CHIP_SLOTS_MAX, ENEMIES, HAND_MAX, LEVEL_MAX, MODES, SKILL_COOLDOWN,
  START_PASS_COINS, SUPPLY_EVERY, CHIP_SLOTS_BASE, CHIP_SELL_COINS, BONUS_EVERY, BONUS_COINS, BONUS_CATCHUP, GIFT_COINS,
} from './data/config';
import { d6, pickWeighted, random } from './rng';
import {
  attackPower, calcDef, calcEvd, calcMaxHp, calcMoveBonus, contributionScore, evadeChance, expectedDefend, focusMax,
  hasChip, levelCost, tagCount,
} from './stats';
import type {
  Action, AttackTarget, BattleResult, BossIntent, BossIntentKind, ClassId, Draft, Enemy, EnemyKind, EntityRef,
  GameEvent, GameState, Mode, PendingAttack, Phase, Player, ReactChoice, TurnState,
} from './types';

interface Ctx {
  s: GameState;
  ev: GameEvent[];
}

export interface PlayerSetup {
  name: string;
  classId: ClassId;
  isCpu: boolean;
}

// ───────────────────────── 生成 ─────────────────────────

export function createGame(opts: { seed: number; mode: Mode; players: PlayerSetup[] }): GameState {
  const cfg = MODES[opts.mode];
  const players: Player[] = opts.players.map((ps, id) => {
    const cls = CLASSES[ps.classId];
    return {
      id,
      name: ps.name,
      classId: ps.classId,
      isCpu: ps.isCpu,
      hp: cls.hp,
      maxHp: cls.hp,
      level: 1,
      coins: 0,
      focus: 0,
      hand: [],
      chips: [cls.startChip],
      chipSlots: 4,
      tile: BOARD.startTile,
      prevTile: null,
      skillCooldown: 0,
      skillLevel: 1,
      fireStacks: 0,
      cursed: false,
      statBonus: { atk: 0, def: 0, maxHp: 0 },
      buffs: { power: false, shield: 0, moveBonus: 0, taunt: false },
      contrib: { damage: 0, kills: 0, support: 0, ko: 0 },
      luck: { rolls: 0, sum: 0 },
    };
  });
  const s: GameState = {
    seed: opts.seed,
    rng: opts.seed,
    mode: opts.mode,
    config: { maxRounds: cfg.maxRounds, bossRound: cfg.bossRound, bossHp: cfg.bossHp, teamLife: cfg.teamLife },
    round: 1,
    phase: 'prep',
    current: 0,
    step: 'roll',
    players,
    enemies: [],
    nextEnemyId: 1,
    boss: null,
    teamLife: cfg.teamLife,
    teamDie: 3,
    teamDieOwner: null,
    teamDieUsed: false,
    turn: freshTurn(),
    queue: [],
    phases: [],
    drafts: [],
    result: null,
    log: [],
  };
  const ctx: Ctx = { s, ev: [] };
  respawnEnemies(ctx);
  log(ctx, `ラウンド1開始。ボス出現まであと${cfg.bossRound - 1}ラウンド`);
  startTurn(ctx);
  return s;
}

function freshTurn(): TurnState {
  return {
    dice: null, doubles: false, moveValue: 0, actionValue: 0, moveRemaining: 0, branchOptions: [],
    focusUsed: false, actionUsed: false, knockedOut: false, shopOffers: [], passedAllies: [], giftedTo: [],
  };
}

// ───────────────────────── 公開API ─────────────────────────

/** 今、操作すべきプレイヤー（ドラフト待ち → 防御/回避の選択 → 手番の順） */
export function getActorId(s: GameState): number | null {
  if (s.result) return null;
  if (s.drafts.length) return s.drafts[0].playerId;
  if (s.step === 'react') {
    const a = s.queue[0];
    return a && a.target.kind === 'player' ? a.target.id : null;
  }
  return s.players[s.current].id;
}

export function applyAction(prev: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  const s = structuredClone(prev);
  const ctx: Ctx = { s, ev: [] };
  const err = validate(s, action);
  if (err) throw new Error(`不正な操作 ${action.type}: ${err}`);
  const p = s.players[action.playerId];

  switch (action.type) {
    case 'roll': doRoll(ctx, p); break;
    case 'adjust': {
      p.focus -= 1;
      s.turn.focusUsed = true;
      const dice = s.turn.dice!;
      dice[action.die] = Math.max(1, dice[action.die] + action.delta);
      log(ctx, `${p.name}は集中して出目を${action.delta > 0 ? '+1' : '-1'}（${dice.join('・')}）`);
      break;
    }
    case 'reroll': {
      p.focus -= 2;
      s.turn.focusUsed = true;
      s.turn.dice![action.die] = rollDie(ctx, p);
      log(ctx, `${p.name}はダイスを振り直した（${s.turn.dice!.join('・')}）`);
      ctx.ev.push({ t: 'roll', pid: p.id, dice: [...s.turn.dice!], doubles: false });
      break;
    }
    case 'swapTeamDie': doSwapTeamDie(ctx, p, action.die); break;
    case 'assign': doAssign(ctx, p, action.moveDie); break;
    case 'branch': {
      s.turn.branchOptions = [];
      const path = [action.to];
      stepTo(ctx, p, action.to);
      continueMove(ctx, p, path);
      break;
    }
    case 'useCard': doUseCard(ctx, p, action.index, action.targetId); break;
    case 'levelUp': doLevelUp(ctx, p, action.choice); break;
    case 'buyCard': {
      const id = s.turn.shopOffers.splice(action.index, 1)[0];
      p.coins -= CARD_PRICE;
      p.hand.push(id);
      log(ctx, `${p.name}は「${CARD_MAP[id].name}」を購入`);
      break;
    }
    case 'leaveShop':
      if (s.turn.actionUsed || s.turn.knockedOut) s.phases.push({ k: 'endTurn' });
      else s.step = 'act';
      break;
    case 'attack': startAttack(ctx, p, action.target); s.phases.push({ k: 'endTurn' }); break;
    case 'skill': doSkill(ctx, p, action.target); s.phases.push({ k: 'endTurn' }); break;
    case 'prepare': {
      p.focus = Math.min(focusMax(p), p.focus + 1);
      heal(ctx, p, 3);
      log(ctx, `${p.name}は態勢を整えた（集中+1・HP回復）`);
      ctx.ev.push({ t: 'text', text: '🎯+1', at: { kind: 'player', id: p.id } });
      s.phases.push({ k: 'endTurn' });
      break;
    }
    case 'react': resolveAttack(ctx, action.choice); break;
    case 'giveCoins': {
      const to = s.players[action.targetId];
      p.coins -= GIFT_COINS;
      to.coins += GIFT_COINS;
      s.turn.giftedTo.push(to.id);
      p.contrib.support += 2;
      ctx.ev.push({ t: 'text', text: `🪙+${GIFT_COINS}`, at: { kind: 'player', id: to.id } });
      log(ctx, `${p.name}は${to.name}にコインを${GIFT_COINS}枚送った`);
      break;
    }
    case 'pickChip': doPickChip(ctx, p, action.index, action.replace); break;
  }
  advance(ctx);
  return { state: s, events: ctx.ev };
}

function validate(s: GameState, a: Action): string | null {
  if (s.result) return '試合は終了しています';
  if (getActorId(s) !== a.playerId) return '手番ではありません';
  const p = s.players[a.playerId];
  if (s.drafts.length) return a.type === 'pickChip' ? validatePick(s, p, a) : 'チップを選んでください';
  if (s.step === 'react') {
    if (a.type !== 'react') return '防御か回避を選んでください';
    return a.choice === 'evade' && s.queue[0].noEvade ? 'この攻撃は回避できません' : null;
  }
  const t = s.turn;
  switch (a.type) {
    case 'roll': return s.step === 'roll' ? null : 'いまは振れません';
    case 'adjust':
      if (s.step !== 'assign') return '割り当て前だけ使えます';
      if (t.focusUsed) return '集中はターンに1回までです';
      if (p.focus < 1) return '集中トークンが足りません';
      if (a.delta < 0 && t.dice![a.die] <= 1) return 'これ以上下げられません';
      return null;
    case 'reroll':
      if (s.step !== 'assign') return '割り当て前だけ使えます';
      if (t.focusUsed) return '集中はターンに1回までです';
      return p.focus >= 2 ? null : '集中トークンが足りません';
    case 'swapTeamDie':
      if (s.step !== 'assign') return '割り当て前だけ使えます';
      return s.teamDieUsed ? 'チームダイスはこのラウンド使用済みです' : null;
    case 'assign': return s.step === 'assign' ? null : 'いまは割り当てられません';
    case 'branch': return s.step === 'branch' && t.branchOptions.includes(a.to) ? null : 'その道には進めません';
    case 'useCard': {
      const id = p.hand[a.index];
      if (!id) return 'カードがありません';
      const card = CARD_MAP[id];
      if (card.timing === 'pre' && s.step !== 'assign') return 'ダイスの割り当て前だけ使えます';
      if (!['assign', 'act', 'shop'].includes(s.step)) return 'いまはカードを使えません';
      if (card.target === 'ally' && (a.targetId === undefined || !s.players[a.targetId])) return '対象を選んでください';
      return null;
    }
    case 'levelUp':
      // 自分のターン中なら（移動の途中を除き）どこでもレベルアップできる
      if (!['roll', 'shop', 'act'].includes(s.step) || s.players[s.current].id !== p.id) return 'いまはレベルアップできません';
      if (p.level >= LEVEL_MAX) return '最大レベルです';
      return p.coins >= levelCost(p) ? null : 'コインが足りません';
    case 'giveCoins':
      if (!['act', 'shop'].includes(s.step)) return '移動のあとに送れます';
      if (!t.passedAllies.includes(a.targetId)) return 'このターンにすれ違った仲間にだけ送れます';
      if (t.giftedTo.includes(a.targetId)) return 'この仲間にはもう送りました';
      return p.coins >= GIFT_COINS ? null : 'コインが足りません';
    case 'buyCard':
      if (s.step !== 'shop' || !t.shopOffers[a.index]) return '購入できません';
      if (p.hand.length >= HAND_MAX) return '手札がいっぱいです';
      return p.coins >= CARD_PRICE ? null : 'コインが足りません';
    case 'leaveShop': return s.step === 'shop' ? null : 'ショップにいません';
    case 'attack': {
      if (s.step !== 'act') return 'いまは攻撃できません';
      return targetsInRange(s, p).some((x) => sameTarget(x, a.target)) ? null : '射程外です';
    }
    case 'skill': {
      if (s.step !== 'act') return 'いまはスキルを使えません';
      if (p.skillCooldown > 0) return 'スキルは準備中です';
      if (p.classId === 'archer' && !(a.target && targetsInRange(s, p).some((x) => sameTarget(x, a.target!)))) {
        return '対象を選んでください';
      }
      if (p.classId === 'mage' && targetsInRange(s, p).length === 0) return '射程内に敵がいません';
      return null;
    }
    case 'prepare': return s.step === 'act' ? null : 'いまは選べません';
    case 'react': return '攻撃を受けていません';
    case 'pickChip': return 'ドラフト中ではありません';
  }
}

function validatePick(s: GameState, p: Player, a: Extract<Action, { type: 'pickChip' }>): string | null {
  const d = s.drafts[0];
  if (a.index === null) return null;
  if (!d.options[a.index]) return '選択肢がありません';
  if (p.chips.length >= p.chipSlots && (a.replace === undefined || !p.chips[a.replace])) return '入れ替えるチップを選んでください';
  return null;
}

// ───────────────────────── 進行ドライバ ─────────────────────────

/**
 * 攻撃キューと処理キューを進める。プレイヤーの入力が必要になったら止まる。
 * （防御/回避の選択、ダイス、分岐、ショップ、行動）
 */
function advance(ctx: Ctx) {
  const { s } = ctx;
  for (let guard = 0; guard < 2000 && !s.result; guard++) {
    if (s.queue.length) {
      const a = s.queue[0];
      if (!entityAlive(s, a.attacker) || !entityAlive(s, a.target)) {
        s.queue.shift();
        continue;
      }
      if (a.target.kind === 'player' && !s.players[a.target.id].isCpu) {
        s.step = 'react';
        return;
      }
      const choice = a.target.kind === 'player' ? suggestReaction(s, s.players[a.target.id], a) : enemyReaction(s, a);
      resolveAttack(ctx, choice);
      continue;
    }
    if (s.step === 'react') s.step = 'act';
    const next = s.phases.shift();
    if (!next) return;
    runPhase(ctx, next);
  }
  if (s.result) s.step = 'gameover';
}

function runPhase(ctx: Ctx, ph: Phase) {
  const { s } = ctx;
  const p = s.players[s.current];
  switch (ph.k) {
    case 'land': land(ctx, p); break;
    case 'postLand': {
      const type = BOARD.tiles[p.tile].type;
      if (s.turn.knockedOut) s.phases.unshift({ k: 'endTurn' });
      else if (type === 'shop' || type === 'start') {
        if (type === 'shop' && !s.turn.shopOffers.length) s.turn.shopOffers = [0, 1, 2].map(() => randomCard(s));
        s.step = 'shop';
      } else if (s.turn.actionUsed) s.phases.unshift({ k: 'endTurn' });
      else s.step = 'act';
      break;
    }
    case 'endTurn': endTurn(ctx); break;
    case 'enemyAct': enemyAct(ctx, ph.id); break;
    case 'bossAura': bossAura(ctx); break;
    case 'bossIntent': if (s.boss?.intent) executeIntent(ctx, s.boss.intent); break;
    case 'roundEnd': roundEnd(ctx); break;
  }
}

function entityAlive(s: GameState, e: EntityRef): boolean {
  if (e.kind === 'player') return true;
  if (e.kind === 'boss') return !!s.boss && s.boss.hp > 0;
  return s.enemies.some((x) => x.id === e.id);
}

// ───────────────────────── 射程・ターゲット ─────────────────────────

export function classRange(p: Player): number {
  return CLASSES[p.classId].range;
}

export function distTo(s: GameState, fromTile: number, target: AttackTarget): number {
  if (target.kind === 'boss') return BOARD.bossDist[fromTile];
  const e = s.enemies.find((x) => x.id === target.id);
  return e ? BOARD.dist[fromTile][e.tile] : Infinity;
}

export function targetsInRange(s: GameState, p: Player, fromTile = p.tile): AttackTarget[] {
  const r = classRange(p);
  const out: AttackTarget[] = s.enemies.filter((e) => BOARD.dist[fromTile][e.tile] <= r).map((e) => ({ kind: 'enemy', id: e.id }));
  if (s.boss && BOARD.bossDist[fromTile] <= r) out.push({ kind: 'boss' });
  return out;
}

function sameTarget(a: AttackTarget, b: AttackTarget): boolean {
  return a.kind === b.kind && (a.kind === 'boss' || (b.kind === 'enemy' && a.id === b.id));
}

export function targetDef(s: GameState, t: AttackTarget): number {
  if (t.kind === 'boss') return s.boss ? s.boss.def : 0;
  return s.enemies.find((e) => e.id === t.id)?.def ?? 0;
}

/** 防御前の攻撃力の予測（UI・CPU用） */
export function previewPower(s: GameState, p: Player, target: AttackTarget, actionValue = s.turn.actionValue, fromTile = p.tile, scale?: number): number {
  return attackPower(p, { actionValue, dist: distTo(s, fromTile, target), isBoss: target.kind === 'boss', scale });
}

/** 敵が防御した場合のダメージ予測 */
export function previewDamage(s: GameState, p: Player, target: AttackTarget, actionValue = s.turn.actionValue, fromTile = p.tile, scale?: number): number {
  return Math.max(1, previewPower(s, p, target, actionValue, fromTile, scale) - targetDef(s, target));
}

/** 近接（距離1以内）なら反撃を受ける。遠距離攻撃は反撃されない */
export function isMelee(dist: number): boolean {
  return dist <= 1;
}

// ───────────────────────── 戦闘 ─────────────────────────

/** プレイヤーの攻撃を開始する（行動ダイスが攻撃の出目になる） */
function startAttack(ctx: Ctx, p: Player, target: AttackTarget, scale?: number, counterable = true, label = '攻撃') {
  const { s } = ctx;
  const dist = distTo(s, p.tile, target);
  const power = previewPower(s, p, target, s.turn.actionValue, p.tile, scale);
  p.buffs.power = false;
  if (hasChip(p, 'ember') && p.fireStacks < 6) p.fireStacks++;
  const attacker: EntityRef = { kind: 'player', id: p.id };
  s.queue.push({
    attacker, target, roll: s.turn.actionValue, power, noEvade: false,
    counter: counterable && target.kind === 'enemy' && isMelee(dist), label,
  });
  if (s.turn.doubles && hasChip(p, 'chain') && label === '攻撃') {
    const chainScale = tagCount(p, 'thunder') >= 4 ? 1 : 0.5;
    s.queue.push({ attacker, target, roll: s.turn.actionValue, power: Math.max(1, Math.floor(power * chainScale)), noEvade: false, counter: false, label: '⚡連鎖' });
  }
}

/** CPU（と自動操作）の防御/回避の判断。期待ダメージが小さい方を選び、防御で倒れるなら回避に賭ける */
export function suggestReaction(_s: GameState, p: Player, a: PendingAttack): ReactChoice {
  if (a.noEvade) return 'defend';
  const def = calcDef(p);
  const defendDmg = expectedDefend(a.power, def);
  const chance = evadeChance(a.roll, calcEvd(p));
  const evadeDmg = (1 - chance) * a.power;
  const bestDefend = Math.max(1, a.power - def - 6);
  if (bestDefend >= p.hp && chance > 0) return 'evade';
  return evadeDmg < defendDmg ? 'evade' : 'defend';
}

function enemyReaction(_s: GameState, a: PendingAttack): ReactChoice {
  if (a.target.kind === 'boss' || a.noEvade) return 'defend';
  // ザコは出目の低い攻撃なら回避を狙う（プレイヤーにとっての不運）
  return a.roll <= 3 ? 'evade' : 'defend';
}

function resolveAttack(ctx: Ctx, choice: ReactChoice) {
  const { s } = ctx;
  const a = s.queue.shift()!;
  const defRoll = d6(s);
  let evaded = false;
  let guard = 0;
  let damage: number;
  if (a.target.kind === 'player') {
    const p = s.players[a.target.id];
    if (choice === 'evade' && !a.noEvade) {
      evaded = defRoll === 6 || defRoll + calcEvd(p) > a.roll;
      damage = evaded ? 0 : a.power;
    } else {
      guard = calcDef(p) + defRoll;
      damage = Math.max(1, a.power - guard);
    }
  } else if (a.target.kind === 'enemy') {
    const id = a.target.id;
    const e = s.enemies.find((x) => x.id === id)!;
    guard = e.def;
    if (choice === 'evade') {
      evaded = defRoll === 6 || defRoll > a.roll;
      damage = evaded ? 0 : Math.max(1, a.power - e.def);
    } else {
      damage = Math.max(1, a.power - e.def);
    }
  } else {
    guard = s.boss!.def;
    damage = Math.max(1, a.power - guard);
  }
  const result: BattleResult = {
    attacker: a.attacker, target: a.target, label: a.label, roll: a.roll, power: a.power, choice,
    defRoll: a.target.kind === 'boss' ? 0 : defRoll, guard, evaded, damage, noEvade: a.noEvade,
  };
  ctx.ev.push({ t: 'battle', result });
  const attackerName = entityName(s, a.attacker);
  const targetName = entityName(s, a.target);
  log(ctx, evaded ? `${targetName}は${attackerName}の${a.label}を回避！` : `${attackerName}の${a.label} → ${targetName}に${damage}ダメージ`);

  let targetKnockedOut = false;
  if (a.target.kind === 'player') {
    const p = s.players[a.target.id];
    if (evaded) {
      if (a.attacker.kind === 'boss') p.contrib.support += 2;
    } else {
      const koBefore = p.contrib.ko;
      damagePlayer(ctx, p, damage, a.attacker);
      targetKnockedOut = p.contrib.ko > koBefore;
    }
  } else if (!evaded) {
    const attacker = a.attacker.kind === 'player' ? s.players[a.attacker.id] : null;
    if (a.target.kind === 'boss') damageBoss(ctx, attacker, damage);
    else damageEnemy(ctx, attacker, a.target.id, damage);
  }

  // 反撃（KOされた側・倒された側は反撃しない）
  if (!a.counter || s.result || targetKnockedOut || !entityAlive(s, a.target) || !entityAlive(s, a.attacker)) return;
  const roll = d6(s);
  let power: number;
  if (a.target.kind === 'player') {
    power = attackPower(s.players[a.target.id], { actionValue: roll, dist: 0, isBoss: false });
  } else if (a.target.kind === 'enemy') {
    const id = a.target.id;
    power = s.enemies.find((x) => x.id === id)!.atk + roll;
  } else {
    return;
  }
  s.queue.unshift({ attacker: a.target, target: a.attacker, roll, power, noEvade: false, counter: false, label: '反撃' });
}

export function entityName(s: GameState, e: EntityRef): string {
  if (e.kind === 'player') return s.players[e.id].name;
  if (e.kind === 'boss') return s.boss?.name ?? BOSS.name;
  const id = e.id;
  const en = s.enemies.find((x) => x.id === id);
  return en ? ENEMIES[en.kind].name : '敵';
}

// ───────────────────────── ターン進行 ─────────────────────────

function startTurn(ctx: Ctx) {
  const { s } = ctx;
  const p = s.players[s.current];
  s.step = 'roll';
  s.turn = freshTurn();
  p.buffs.moveBonus = 0;
  if (p.skillCooldown > 0) p.skillCooldown--;
  let income = 0;
  if (hasChip(p, 'interest')) income += 1;
  const gold = tagCount(p, 'gold');
  if (gold >= 4) income += 3;
  else if (gold >= 2) income += 1;
  if (income) {
    p.coins += income;
    ctx.ev.push({ t: 'text', text: `🪙+${income}`, at: { kind: 'player', id: p.id } });
  }
}

function endTurn(ctx: Ctx) {
  const { s } = ctx;
  s.players[s.current].buffs.moveBonus = 0;
  s.current++;
  if (s.current < s.players.length) {
    startTurn(ctx);
    return;
  }
  // 敵フェイズ：ザコが動く → ボスの威圧 → ボスの予告攻撃 → ラウンド終了
  s.current = s.players.length - 1;
  const phases: Phase[] = s.enemies.map((e) => ({ k: 'enemyAct', id: e.id }));
  if (s.boss) phases.push({ k: 'bossAura' }, { k: 'bossIntent' });
  phases.push({ k: 'roundEnd' });
  s.phases.unshift(...phases);
}

function rollDie(ctx: Ctx, p: Player): number {
  const v = d6(ctx.s);
  return v === 1 && hasChip(p, 'lucky_one') ? 7 : v;
}

function doRoll(ctx: Ctx, p: Player) {
  const { s } = ctx;
  const raw: [number, number] = [d6(s), d6(s)];
  if (p.cursed) {
    raw[0] = 1;
    p.cursed = false;
    ctx.ev.push({ t: 'text', text: '💀呪いで出目が1に', at: { kind: 'player', id: p.id } });
  }
  const dice = raw.map((v) => (v === 1 && hasChip(p, 'lucky_one') ? 7 : v)) as [number, number];
  const doubles = raw[0] === raw[1];
  p.luck.rolls += 2;
  p.luck.sum += raw[0] + raw[1];
  // 不運の救済：出目1〜2ごとに集中トークン
  const low = dice.filter((v) => v <= 2).length;
  if (low) {
    const per = 1 + (hasChip(p, 'meditation') ? 1 : 0) + (tagCount(p, 'fate') >= 2 ? 1 : 0);
    const before = p.focus;
    p.focus = Math.min(focusMax(p), p.focus + low * per);
    if (p.focus > before) ctx.ev.push({ t: 'text', text: `🎯集中+${p.focus - before}`, at: { kind: 'player', id: p.id } });
  }
  if (doubles) {
    const bonus = hasChip(p, 'thunderclap') ? 5 : 2;
    dice[0] += bonus;
    dice[1] += bonus;
  }
  s.turn.dice = dice;
  s.turn.doubles = doubles;
  s.step = 'assign';
  ctx.ev.push({ t: 'roll', pid: p.id, dice: [...dice], doubles });
  log(ctx, `${p.name}のダイス：${raw.join('・')}${doubles ? '（ゾロ目！）' : ''}`);
}

function doSwapTeamDie(ctx: Ctx, p: Player, die: 0 | 1) {
  const { s } = ctx;
  const dice = s.turn.dice!;
  const taken = s.teamDie;
  const deposited = dice[die] + (p.classId === 'priest' ? 1 : 0);
  if (s.teamDieOwner !== null && s.teamDieOwner !== p.id && taken >= 5) s.players[s.teamDieOwner].contrib.support += 3;
  dice[die] = taken;
  s.teamDie = deposited;
  s.teamDieOwner = p.id;
  s.teamDieUsed = true;
  log(ctx, `${p.name}はチームダイスの${taken}を受け取り、${deposited}を預けた`);
}

function doAssign(ctx: Ctx, p: Player, moveDie: 0 | 1) {
  const { s } = ctx;
  const dice = s.turn.dice!;
  let action = dice[moveDie === 0 ? 1 : 0];
  if (tagCount(p, 'fate') >= 4 && action <= 2) action += 3;
  s.turn.moveValue = dice[moveDie] + calcMoveBonus(p);
  s.turn.actionValue = action;
  s.turn.moveRemaining = s.turn.moveValue;
  log(ctx, `${p.name}：移動${s.turn.moveValue}／行動${action}`);
  continueMove(ctx, p, []);
}

function stepTo(ctx: Ctx, p: Player, to: number) {
  const { s } = ctx;
  p.prevTile = p.tile;
  p.tile = to;
  s.turn.moveRemaining--;
  // すれ違った仲間を覚えておく（あとでコインを送れる）
  for (const o of s.players) if (o !== p && o.tile === to && !s.turn.passedAllies.includes(o.id)) s.turn.passedAllies.push(o.id);
  if (to === BOARD.startTile && s.turn.moveRemaining > 0) {
    p.coins += START_PASS_COINS;
    ctx.ev.push({ t: 'text', text: `通過ボーナス🪙+${START_PASS_COINS}`, at: { kind: 'player', id: p.id } });
  }
}

/** 分岐に着く・敵に接触する・歩き終わる、のいずれかまで進む */
function continueMove(ctx: Ctx, p: Player, path: number[]) {
  const { s } = ctx;
  // 敵のいるマスに入ったら足止めされて戦闘
  if (path.length && encounter(ctx, p, path)) return;
  while (s.turn.moveRemaining > 0) {
    const options = nextTiles(p.tile, p.prevTile);
    if (options.length > 1) {
      if (path.length) ctx.ev.push({ t: 'move', pid: p.id, path });
      s.step = 'branch';
      s.turn.branchOptions = options;
      return;
    }
    stepTo(ctx, p, options[0]);
    path.push(options[0]);
    if (encounter(ctx, p, path)) return;
  }
  if (path.length) ctx.ev.push({ t: 'move', pid: p.id, path });
  s.phases.unshift({ k: 'land' });
}

function encounter(ctx: Ctx, p: Player, path: number[]): boolean {
  const { s } = ctx;
  const foe = s.enemies.find((e) => e.tile === p.tile);
  if (!foe) return false;
  s.turn.moveRemaining = 0;
  s.turn.actionUsed = true;
  ctx.ev.push({ t: 'move', pid: p.id, path });
  ctx.ev.push({ t: 'text', text: '接敵！', at: { kind: 'player', id: p.id } });
  log(ctx, `${p.name}は${ENEMIES[foe.kind].name}と遭遇した！`);
  startAttack(ctx, p, { kind: 'enemy', id: foe.id });
  s.phases.unshift({ k: 'land' });
  return true;
}

export function nextTiles(tile: number, prev: number | null): number[] {
  return BOARD.tiles[tile].next.filter((n) => n !== prev);
}

// ───────────────────────── マスのイベント ─────────────────────────

type EventFn = (title: string, text: string, good: boolean, icon?: string) => void;

function land(ctx: Ctx, p: Player) {
  const { s } = ctx;
  s.phases.unshift({ k: 'postLand' });
  if (s.turn.knockedOut) return;
  const tile = BOARD.tiles[p.tile];
  const info = TILE_INFO[tile.type];
  const event: EventFn = (title, text, good, icon = info.icon) => {
    ctx.ev.push({ t: 'event', pid: p.id, icon, title, text, good });
    log(ctx, `${p.name}：${title}（${text}）`);
  };
  switch (tile.type) {
    case 'coin': {
      const gain = 3 + Math.floor(s.round / 2);
      p.coins += gain;
      event('コイン', `🪙+${gain}`, true);
      break;
    }
    case 'card':
      event('カード', drawCard(ctx, p) ? `「${CARD_MAP[p.hand[p.hand.length - 1]].name}」を引いた` : '手札がいっぱいだった', true);
      break;
    case 'chest':
      event('宝箱', 'チップを1つ選べる', true);
      addDraft(ctx, p, 'chest');
      break;
    case 'heal': {
      event('回復の泉', 'HPを回復', true);
      for (const m of s.players.filter((o) => o.tile === p.tile)) {
        const healed = heal(ctx, m, 7);
        if (m !== p) p.contrib.support += healed;
      }
      break;
    }
    case 'trap': {
      const dmg = 4 + Math.floor(s.round / 2);
      event('罠', `${dmg}ダメージ（防御不可）`, false);
      applyPlayerDamage(ctx, p, dmg);
      break;
    }
    case 'thief': {
      const lost = Math.min(p.coins, Math.max(3, Math.floor(p.coins * 0.3)));
      p.coins -= lost;
      event('盗賊', lost ? `コインを${lost}枚盗まれた` : '盗まれる物がなかった', false);
      break;
    }
    case 'curse':
      p.cursed = true;
      event('呪い', '次のターン、ダイス1個が「1」になる（集中は貯まる）', false);
      break;
    case 'warp': {
      const candidates = BOARD.tiles.filter((t) => t.id !== p.tile && t.type !== 'warp' && !s.enemies.some((e) => e.tile === t.id));
      const to = candidates[Math.floor(random(s) * candidates.length)];
      p.prevTile = null;
      p.tile = to.id;
      event('ワープ', `${TILE_INFO[to.type].name}のマスへ飛ばされた`, true);
      ctx.ev.push({ t: 'warp', pid: p.id, tile: to.id });
      break;
    }
    case 'ambush': {
      const kind: EnemyKind = s.round >= 5 ? 'orc' : s.round >= 3 ? 'goblin' : 'slime';
      event('待ち伏せ', `${ENEMIES[kind].name}が襲ってきた！`, false);
      const e = spawnEnemy(ctx, kind, p.tile);
      enemyAttack(ctx, e, p);
      break;
    }
    case 'fate': fateEvent(ctx, p, event); break;
    case 'start':
      event('拠点', 'レベルアップできる', true);
      break;
    case 'shop':
      event('ショップ', 'カード購入・レベルアップ', true);
      break;
  }
}

/** 運命マス：良いことも悪いことも起きる */
function fateEvent(ctx: Ctx, p: Player, event: EventFn) {
  const { s } = ctx;
  const table: { weight: number; run: () => void }[] = [
    { weight: 3, run: () => { event('流れ星', '全員のHPが5回復', true, '🌠'); for (const m of s.players) heal(ctx, m, 5); } },
    { weight: 3, run: () => { const g = 8 + s.round; p.coins += g; event('金脈', `🪙+${g}`, true, '💰'); } },
    { weight: 2, run: () => { event('神託', 'レアなチップを選べる', true, '🔮'); addDraft(ctx, p, 'fate'); } },
    { weight: 2, run: () => { p.focus = focusMax(p); event('覚醒', '集中トークンが満タンに', true, '✨'); } },
    { weight: 3, run: () => { const d = 5 + Math.floor(s.round / 2); event('落石', `${d}ダメージ`, false, '🪨'); applyPlayerDamage(ctx, p, d); } },
    { weight: 2, run: () => { const lost = Math.floor(p.coins / 2); p.coins -= lost; event('財布を落とした', `コインが半分に（-${lost}）`, false, '👛'); } },
    {
      weight: 2, run: () => {
        event('魔物の群れ', '近くにザコが2体現れた', false, '👾');
        const near = BOARD.adj[p.tile].filter((t) => !s.enemies.some((e) => e.tile === t) && t !== BOARD.startTile);
        for (const t of near.slice(0, 2)) spawnEnemy(ctx, s.round >= 4 ? 'goblin' : 'slime', t);
      },
    },
    {
      weight: 2, run: () => {
        if (s.boss) {
          const h = 12;
          s.boss.hp = Math.min(s.boss.maxHp, s.boss.hp + h);
          event('不吉な予兆', `ボスのHPが${h}回復した`, false, '🌑');
        } else {
          event('不吉な予兆', '全員の集中トークンが0に', false, '🌑');
          for (const m of s.players) m.focus = 0;
        }
      },
    },
    { weight: 2, run: () => { event('施し', '全員にコイン+4', true, '🎁'); for (const m of s.players) m.coins += 4; } },
  ];
  pickWeighted(s, table.map((t) => ({ item: t, weight: t.weight }))).run();
}

// ───────────────────────── 行動 ─────────────────────────

function doSkill(ctx: Ctx, p: Player, target?: AttackTarget) {
  const { s } = ctx;
  const lv = p.skillLevel;
  p.skillCooldown = SKILL_COOLDOWN;
  const cls = CLASSES[p.classId];
  log(ctx, `${p.name}のスキル「${cls.skillName}」！`);
  ctx.ev.push({ t: 'text', text: `✨${cls.skillName}`, at: { kind: 'player', id: p.id } });
  switch (p.classId) {
    case 'warrior':
      p.buffs.taunt = true;
      heal(ctx, p, 4 + lv * 2);
      break;
    case 'mage': {
      const scale = 0.7 + (lv - 1) * 0.15;
      for (const t of targetsInRange(s, p)) startAttack(ctx, p, t, scale, false, 'メテオ');
      break;
    }
    case 'priest': {
      const amount = 3 + lv * 2;
      for (const m of s.players) {
        const healed = heal(ctx, m, amount);
        if (m !== p) p.contrib.support += healed;
        m.focus = Math.min(focusMax(m), m.focus + 1);
      }
      break;
    }
    case 'archer': {
      const scale = 0.7 + (lv - 1) * 0.15;
      startAttack(ctx, p, target!, scale, false, '連射');
      startAttack(ctx, p, target!, scale, false, '連射');
      break;
    }
  }
}

function doUseCard(ctx: Ctx, p: Player, index: number, targetId?: number) {
  const { s } = ctx;
  const id = p.hand.splice(index, 1)[0];
  const card = CARD_MAP[id];
  log(ctx, `${p.name}は「${card.name}」を使った`);
  ctx.ev.push({ t: 'text', text: `🃏${card.name}`, at: { kind: 'player', id: p.id } });
  switch (id) {
    case 'dash': p.buffs.moveBonus += 2; break;
    case 'reroll':
      s.turn.dice = [rollDie(ctx, p), rollDie(ctx, p)];
      ctx.ev.push({ t: 'roll', pid: p.id, dice: [...s.turn.dice], doubles: false });
      break;
    case 'fix': {
      const d = s.turn.dice!;
      d[d[0] <= d[1] ? 0 : 1] = 6;
      break;
    }
    case 'power': p.buffs.power = true; break;
    case 'potion': heal(ctx, p, 8); break;
    case 'bell':
      for (const m of s.players) {
        const healed = heal(ctx, m, 4);
        if (m !== p) p.contrib.support += healed;
      }
      break;
    case 'ward': {
      const t = s.players[targetId!];
      t.buffs.shield += 6;
      if (t !== p) p.contrib.support += 3;
      break;
    }
    case 'coin_bag': p.coins += 6; break;
  }
}

function doLevelUp(ctx: Ctx, p: Player, choice: 'stats' | 'skill') {
  p.coins -= levelCost(p);
  p.level++;
  // チップ枠はレベルに応じて自動で増える
  p.chipSlots = Math.min(CHIP_SLOTS_MAX, CHIP_SLOTS_BASE + p.level);
  if (choice === 'stats') {
    p.statBonus.atk += 1;
    p.statBonus.def += 1;
    p.statBonus.maxHp += 4;
  } else {
    p.skillLevel++;
    p.skillCooldown = 0;
  }
  p.maxHp = calcMaxHp(p);
  heal(ctx, p, 5);
  const label = { stats: 'ステータス強化', skill: 'スキル強化' }[choice];
  log(ctx, `${p.name}はLv${p.level}に上がった（${label}）`);
  ctx.ev.push({ t: 'text', text: `⬆️Lv${p.level}`, at: { kind: 'player', id: p.id } });
}

function doPickChip(ctx: Ctx, p: Player, index: number | null, replace?: number) {
  const { s } = ctx;
  const d = s.drafts.shift()!;
  if (index === null) {
    // 見送ったチップは売却してコインに
    p.coins += CHIP_SELL_COINS;
    ctx.ev.push({ t: 'text', text: `売却🪙+${CHIP_SELL_COINS}`, at: { kind: 'player', id: p.id } });
    log(ctx, `${p.name}はチップを売却した（コイン+${CHIP_SELL_COINS}）`);
    return;
  }
  const id = d.options[index];
  if (p.chips.length >= p.chipSlots) p.chips.splice(replace!, 1, id);
  else p.chips.push(id);
  p.maxHp = calcMaxHp(p);
  p.hp = Math.min(p.hp, p.maxHp);
  log(ctx, `${p.name}はチップ「${CHIP_MAP[id].name}」を装備`);
}

// ───────────────────────── ダメージ・回復 ─────────────────────────

function heal(ctx: Ctx, p: Player, amount: number): number {
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + amount);
  const healed = p.hp - before;
  if (healed > 0) ctx.ev.push({ t: 'heal', pid: p.id, amount: healed });
  return healed;
}

/** 戦闘で受けるダメージ（盾・守りの陣・反撃チップを適用） */
function damagePlayer(ctx: Ctx, p: Player, amount: number, attacker: EntityRef) {
  const { s } = ctx;
  let dmg = amount;
  if (s.players.some((o) => o !== p && o.tile === p.tile && hasChip(o, 'bulwark'))) dmg = Math.max(1, dmg - 2);
  if (p.buffs.shield > 0) {
    const absorbed = Math.min(p.buffs.shield, dmg);
    p.buffs.shield -= absorbed;
    dmg -= absorbed;
    if (absorbed) ctx.ev.push({ t: 'text', text: `🛡${absorbed}軽減`, at: { kind: 'player', id: p.id } });
  }
  if (hasChip(p, 'counter')) {
    if (attacker.kind === 'boss') damageBoss(ctx, p, 3);
    else if (attacker.kind === 'enemy') damageEnemy(ctx, p, attacker.id, 3);
  }
  applyPlayerDamage(ctx, p, dmg);
}

/** 防御も軽減もない直接ダメージ（罠など） */
function applyPlayerDamage(ctx: Ctx, p: Player, dmg: number) {
  if (ctx.s.result || dmg <= 0) return;
  p.hp -= dmg;
  ctx.ev.push({ t: 'damage', target: { kind: 'player', id: p.id }, amount: dmg });
  if (p.hp <= 0) knockOut(ctx, p);
}

function knockOut(ctx: Ctx, p: Player) {
  const { s } = ctx;
  s.teamLife--;
  p.contrib.ko++;
  p.hp = Math.ceil(p.maxHp / 2);
  p.tile = BOARD.startTile;
  p.prevTile = null;
  p.buffs.taunt = false;
  if (p.hand.length) p.hand.pop();
  if (s.players[s.current] === p) s.turn.knockedOut = true;
  // KOしたプレイヤーが関わる残りの攻撃は取り消す
  s.queue = s.queue.filter((a) => !(a.target.kind === 'player' && a.target.id === p.id) && !(a.attacker.kind === 'player' && a.attacker.id === p.id));
  ctx.ev.push({ t: 'ko', pid: p.id });
  log(ctx, `${p.name}が倒れた！チームライフ残り${s.teamLife}`);
  if (s.teamLife <= 0) endGame(ctx, 'lose');
}

function damageEnemy(ctx: Ctx, p: Player | null, enemyId: number, dmg: number) {
  const { s } = ctx;
  const e = s.enemies.find((x) => x.id === enemyId);
  if (!e) return;
  const dealt = Math.min(e.hp, dmg);
  e.hp -= dmg;
  if (p) p.contrib.damage += dealt;
  ctx.ev.push({ t: 'damage', target: { kind: 'enemy', id: e.id }, amount: dmg });
  if (e.hp > 0) return;
  s.enemies = s.enemies.filter((x) => x !== e);
  s.queue = s.queue.filter((a) => !(a.attacker.kind === 'enemy' && a.attacker.id === e.id) && !(a.target.kind === 'enemy' && a.target.id === e.id));
  ctx.ev.push({ t: 'kill', enemyId: e.id });
  const def = ENEMIES[e.kind];
  log(ctx, `${def.name}を倒した`);
  if (p) {
    const coins = def.coins + (hasChip(p, 'bounty') ? 5 : 0);
    p.coins += coins;
    p.contrib.kills++;
    ctx.ev.push({ t: 'text', text: `🪙+${coins}`, at: { kind: 'player', id: p.id } });
    drawCard(ctx, p);
    addDraft(ctx, p, 'kill');
  }
}

function damageBoss(ctx: Ctx, p: Player | null, dmg: number) {
  const { s } = ctx;
  const b = s.boss;
  if (!b) return;
  const dealt = Math.min(b.hp, dmg);
  b.hp -= dmg;
  if (p) p.contrib.damage += dealt;
  ctx.ev.push({ t: 'damage', target: { kind: 'boss' }, amount: dmg });
  if (!b.enraged && b.hp <= b.maxHp / 2 && b.hp > 0) {
    b.enraged = true;
    b.def += 1;
    ctx.ev.push({ t: 'bossEnrage' });
    log(ctx, `${b.name}が怒り狂った！（攻撃強化）`);
  }
  if (b.hp <= 0) endGame(ctx, 'win');
}

function endGame(ctx: Ctx, result: 'win' | 'lose') {
  const { s } = ctx;
  if (s.result) return;
  s.result = result;
  s.step = 'gameover';
  s.drafts = [];
  s.queue = [];
  s.phases = [];
  ctx.ev.push({ t: 'gameover', result });
  log(ctx, result === 'win' ? 'ボスを倒した！勝利！' : '力尽きた……敗北');
}

// ───────────────────────── 敵フェイズ・ラウンド ─────────────────────────

function enemyAttack(ctx: Ctx, e: Enemy, target: Player) {
  const roll = d6(ctx.s);
  ctx.s.queue.push({
    attacker: { kind: 'enemy', id: e.id }, target: { kind: 'player', id: target.id },
    roll, power: e.atk + roll, noEvade: false, counter: true, label: `${ENEMIES[e.kind].name}の攻撃`,
  });
}

/**
 * ザコ：毎ラウンド、いちばん近いプレイヤーへ向かって speed マス進む。
 * プレイヤーのいるマスに入ったら止まって攻撃。狙える相手がいなければうろつく。
 */
function enemyAct(ctx: Ctx, id: number) {
  const { s } = ctx;
  const e = s.enemies.find((x) => x.id === id);
  if (!e) return;
  const victimsAt = (tile: number) => s.players.filter((p) => p.tile === tile && tile !== BOARD.startTile);
  const here = victimsAt(e.tile);
  if (here.length) {
    enemyAttack(ctx, e, here.reduce((a, b) => (b.hp < a.hp ? b : a)));
    return;
  }
  const free = (t: number) => t !== BOARD.startTile && !s.enemies.some((o) => o !== e && o.tile === t);
  const targets = s.players.filter((p) => p.tile !== BOARD.startTile);
  const path: number[] = [];
  for (let i = 0; i < ENEMIES[e.kind].speed; i++) {
    let step: number | undefined;
    if (targets.length) {
      const target = targets.reduce((a, b) => (BOARD.dist[e.tile][b.tile] < BOARD.dist[e.tile][a.tile] ? b : a));
      step = BOARD.adj[e.tile].filter(free).sort((a, b) => BOARD.dist[a][target.tile] - BOARD.dist[b][target.tile])[0];
      if (step !== undefined && BOARD.dist[step][target.tile] >= BOARD.dist[e.tile][target.tile]) step = undefined;
    } else {
      const options = BOARD.adj[e.tile].filter(free);
      step = options.length ? options[Math.floor(random(s) * options.length)] : undefined;
    }
    if (step === undefined) break;
    e.tile = step;
    path.push(step);
    if (victimsAt(step).length) break;
  }
  if (!path.length) return;
  ctx.ev.push({ t: 'enemyMove', enemyId: e.id, path });
  const victims = victimsAt(e.tile);
  if (victims.length) {
    ctx.ev.push({ t: 'text', text: '接敵！', at: { kind: 'enemy', id: e.id } });
    enemyAttack(ctx, e, victims.reduce((a, b) => (b.hp < a.hp ? b : a)));
  }
}

function bossAura(ctx: Ctx) {
  const { s } = ctx;
  const b = s.boss;
  if (!b) return;
  for (const p of s.players) {
    if (BOARD.bossDist[p.tile] !== 1) continue;
    const roll = d6(s);
    s.queue.push({
      attacker: { kind: 'boss' }, target: { kind: 'player', id: p.id }, roll,
      power: BOSS_AURA + (b.enraged ? 2 : 0) + roll, noEvade: false, counter: false, label: '威圧',
    });
  }
}

function roundEnd(ctx: Ctx) {
  const { s } = ctx;
  for (const p of s.players) p.buffs.taunt = false;
  if (s.round % SUPPLY_EVERY === 0) {
    log(ctx, '定期配給：全員がチップを選ぶ');
    for (const p of s.players) addDraft(ctx, p, 'supply');
  }
  if (s.round % BONUS_EVERY === 0) {
    // ボーナス：全員にコインとカード。いちばん貧しい人には上乗せ
    const poorest = s.players.reduce((a, b) => (b.coins < a.coins ? b : a));
    for (const p of s.players) {
      const gain = BONUS_COINS + (p === poorest ? BONUS_CATCHUP : 0);
      p.coins += gain;
      drawCard(ctx, p);
      ctx.ev.push({ t: 'text', text: `ボーナス🪙+${gain}`, at: { kind: 'player', id: p.id } });
    }
    log(ctx, `ボーナス：全員にコイン+${BONUS_COINS}とカード（${poorest.name}は+${BONUS_CATCHUP}）`);
  }
  s.round++;
  s.teamDieUsed = false;
  if (s.round > s.config.maxRounds) {
    endGame(ctx, 'lose');
    return;
  }
  ctx.ev.push({ t: 'roundStart', round: s.round });
  if (s.phase === 'prep' && s.round % 2 === 1) respawnEnemies(ctx);
  if (s.round === s.config.bossRound) spawnBoss(ctx);
  else if (s.phase === 'prep') log(ctx, `ラウンド${s.round}開始。ボス出現まであと${s.config.bossRound - s.round}ラウンド`);
  else log(ctx, `ラウンド${s.round}開始`);
  if (s.boss) chooseIntent(ctx);
  s.current = 0;
  startTurn(ctx);
}

function respawnEnemies(ctx: Ctx) {
  const { s } = ctx;
  for (const tile of BOARD.spawnPoints) {
    if (s.enemies.some((e) => e.tile === tile) || s.players.some((p) => p.tile === tile)) continue;
    const r = random(s);
    const kind: EnemyKind = s.round >= 5 && r < 0.3 ? 'orc' : s.round >= 3 && r < 0.6 ? 'goblin' : 'slime';
    spawnEnemy(ctx, kind, tile);
  }
}

function spawnEnemy(ctx: Ctx, kind: EnemyKind, tile: number): Enemy {
  const { s } = ctx;
  const def = ENEMIES[kind];
  const e: Enemy = { id: s.nextEnemyId++, kind, hp: def.hp, maxHp: def.hp, atk: def.atk, def: def.def, tile };
  s.enemies.push(e);
  ctx.ev.push({ t: 'spawn', enemyId: e.id });
  return e;
}

function spawnBoss(ctx: Ctx) {
  const { s } = ctx;
  s.phase = 'boss';
  s.boss = {
    name: BOSS.name, hp: s.config.bossHp, maxHp: s.config.bossHp, def: BOSS.def,
    enraged: false, charged: false, intent: null, lastIntent: null,
  };
  ctx.ev.push({ t: 'bossSpawn' });
  log(ctx, `${BOSS.name}が降臨した！決戦フェーズ開始`);
  for (const p of s.players) addDraft(ctx, p, 'boss');
}

const QUADRANTS: ((x: number, y: number) => boolean)[] = [
  (x, y) => x <= 3 && y <= 3,
  (x, y) => x >= 3 && y <= 3,
  (x, y) => x >= 3 && y >= 3,
  (x, y) => x <= 3 && y >= 3,
];
const QUADRANT_NAMES = ['北西', '北東', '南東', '南西'];
const HALVES: ((x: number, y: number) => boolean)[] = [(_x, y) => y <= 3, (x) => x >= 3, (_x, y) => y >= 3, (x) => x <= 3];
const HALF_NAMES = ['北', '東', '南', '西'];
const tilesWhere = (f: (x: number, y: number) => boolean) => BOARD.tiles.filter((t) => f(t.x, t.y)).map((t) => t.id);

function chooseIntent(ctx: Ctx) {
  const { s } = ctx;
  const b = s.boss!;
  const enr = b.enraged ? 3 : 0;
  const options = ([
    { item: 'sweep', weight: 3 },
    { item: 'quake', weight: 3 },
    { item: 'target', weight: 3 },
    { item: 'roar', weight: 2 },
    { item: 'summon', weight: s.enemies.length < 4 ? 2 : 0 },
    { item: 'charge', weight: b.charged ? 0 : 1 },
    { item: 'meteor', weight: b.enraged ? 3 : 0 },
  ] as { item: BossIntentKind; weight: number }[]).filter((o) => o.weight > 0 && o.item !== b.lastIntent);
  const kind = pickWeighted(s, options);
  let intent: BossIntent;
  switch (kind) {
    case 'sweep':
      intent = { kind, label: '薙ぎ払い：内周すべて', tiles: BOARD.tiles.filter((t) => t.zone === 'inner').map((t) => t.id), base: 12 + enr };
      break;
    case 'quake': {
      const h = Math.floor(random(s) * 4);
      intent = { kind, label: `地割れ：${HALF_NAMES[h]}半分`, tiles: tilesWhere(HALVES[h]), base: 9 + enr };
      break;
    }
    case 'meteor': {
      const safe = Math.floor(random(s) * 4);
      const safeTiles = new Set(tilesWhere(QUADRANTS[safe]));
      intent = {
        kind, label: `流星群：${QUADRANT_NAMES[safe]}以外すべて`,
        tiles: BOARD.tiles.filter((t) => !safeTiles.has(t.id) || t.zone === 'inner').map((t) => t.id), base: 9 + enr,
      };
      break;
    }
    case 'target': {
      const top = s.players.reduce((a, b2) => (contributionScore(b2) > contributionScore(a) ? b2 : a));
      intent = { kind, label: `狙い撃ち：${top.name}（貢献度トップ）`, tiles: [], targetId: top.id, base: 12 + enr };
      break;
    }
    case 'roar':
      intent = { kind, label: '咆哮：全員に攻撃（回避不可）', tiles: [], base: 5 + enr, noEvade: true };
      break;
    case 'summon':
      intent = { kind, label: '召喚：ザコを2体呼ぶ', tiles: [], base: 0 };
      break;
    case 'charge':
    default:
      intent = { kind: 'charge', label: '力を溜める：次の攻撃が1.5倍', tiles: [], base: 0 };
      break;
  }
  if (b.charged && intent.base > 0) {
    intent.base = Math.floor(intent.base * 1.5);
    intent.label += '【溜め】';
  }
  b.intent = intent;
  b.lastIntent = kind;
  log(ctx, `ボスの予告 → ${intent.label}`);
}

function executeIntent(ctx: Ctx, intent: BossIntent) {
  const { s } = ctx;
  const b = s.boss!;
  ctx.ev.push({ t: 'bossAttack', intent });
  log(ctx, `${b.name}の${intent.label.split('：')[0]}！`);
  if (intent.base > 0) b.charged = false;
  const hit = (p: Player) => {
    const roll = d6(s);
    s.queue.push({
      attacker: { kind: 'boss' }, target: { kind: 'player', id: p.id }, roll, power: intent.base + roll,
      noEvade: !!intent.noEvade, counter: false, label: intent.label.split('：')[0],
    });
  };
  switch (intent.kind) {
    case 'sweep':
    case 'quake':
    case 'meteor':
      for (const p of s.players) if (intent.tiles.includes(p.tile)) hit(p);
      break;
    case 'roar':
      for (const p of s.players) hit(p);
      break;
    case 'target': {
      const taunter = s.players.find((p) => p.buffs.taunt);
      const t = taunter ?? s.players[intent.targetId!];
      if (taunter && taunter.id !== intent.targetId) {
        taunter.contrib.support += 5;
        ctx.ev.push({ t: 'text', text: 'かばった！', at: { kind: 'player', id: taunter.id } });
      }
      hit(t);
      break;
    }
    case 'summon': {
      const free = BOARD.tiles.filter((t) => t.zone !== 'inner' && !s.enemies.some((e) => e.tile === t.id) && !s.players.some((p) => p.tile === t.id) && t.id !== BOARD.startTile);
      for (let i = 0; i < 2 && free.length; i++) {
        const tile = free.splice(Math.floor(random(s) * free.length), 1)[0];
        spawnEnemy(ctx, b.enraged ? 'orc' : 'goblin', tile.id);
      }
      break;
    }
    case 'charge':
      b.charged = true;
      break;
  }
}

// ───────────────────────── カード・ドラフト ─────────────────────────

function randomCard(s: GameState): string {
  return pickWeighted(s, CARDS.map((c) => ({ item: c.id, weight: c.weight })));
}

function drawCard(ctx: Ctx, p: Player): boolean {
  if (p.hand.length >= HAND_MAX) return false;
  p.hand.push(randomCard(ctx.s));
  return true;
}

/** ラウンドが進むほど高ティアが出やすい。3択のうち1つは得意タグを優先 */
/**
 * チップのレア度（★1〜★3）の出やすさ。ラウンドの進行とキャラのレベルの両方で上がる。
 * レベルを早く上げるほどレアを引きやすく、序盤にレアを引けばそれだけ有利になる。
 */
export function rarityOdds(s: GameState, p: Player, source: Draft['source'] = 'supply'): [number, number, number] {
  const progress = s.round / s.config.maxRounds;
  const bonus = source === 'boss' || source === 'chest' ? 0.2 : source === 'fate' ? 0.4 : 0;
  const t = Math.min(1, progress * 0.5 + (p.level - 1) * 0.15 + bonus);
  const w: [number, number, number] = [1 - t * 0.75, 0.2 + t * 0.6, 0.02 + t * t * 0.8];
  const sum = w[0] + w[1] + w[2];
  return [w[0] / sum, w[1] / sum, w[2] / sum];
}

function addDraft(ctx: Ctx, p: Player, source: Draft['source']) {
  const { s } = ctx;
  const odds = rarityOdds(s, p, source);
  const weightOf = (tier: number) => odds[tier - 1];
  const pool = CHIPS.filter((c) => !p.chips.includes(c.id));
  const options: string[] = [];
  const affinity = pool.filter((c) => c.tag === CLASSES[p.classId].tag);
  if (affinity.length && random(s) < 0.7) {
    options.push(pickWeighted(s, affinity.map((c) => ({ item: c.id, weight: weightOf(c.tier) }))));
  }
  while (options.length < 3) {
    const rest = pool.filter((c) => !options.includes(c.id));
    if (!rest.length) break;
    options.push(pickWeighted(s, rest.map((c) => ({ item: c.id, weight: weightOf(c.tier) }))));
  }
  if (options.length) s.drafts.push({ playerId: p.id, options, source });
}

function log(ctx: Ctx, text: string) {
  ctx.s.log.push(text);
  if (ctx.s.log.length > 80) ctx.s.log.splice(0, ctx.s.log.length - 80);
}
