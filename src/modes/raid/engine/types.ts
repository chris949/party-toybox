export type Tag = 'fire' | 'thunder' | 'guard' | 'gold' | 'fate';
export type ClassId = 'warrior' | 'mage' | 'priest' | 'archer';
export type TileType =
  | 'start' | 'coin' | 'card' | 'chest' | 'heal' | 'shop'
  | 'trap' | 'thief' | 'curse' | 'fate' | 'warp' | 'ambush';
export type Mode = 'quick' | 'standard';
export type Step = 'roll' | 'assign' | 'branch' | 'shop' | 'act' | 'react' | 'gameover';
export type EnemyKind = 'slime' | 'goblin' | 'orc';
export type LevelUpChoice = 'stats' | 'skill';
export type ReactChoice = 'defend' | 'evade';

export interface Tile {
  id: number;
  x: number;
  y: number;
  type: TileType;
  zone: 'outer' | 'inner' | 'spoke';
  /** 進める方向の隣接マス（直前にいたマスへは戻れない） */
  next: number[];
}

export interface Board {
  tiles: Tile[];
  /** ボスが陣取る座標（マスではない） */
  bossPos: { x: number; y: number };
  startTile: number;
  spawnPoints: number[];
  /** 向きを無視した隣接マス（敵の移動用） */
  adj: number[][];
  /** dist[a][b]：マス間の最短距離（向きを無視） */
  dist: number[][];
  /** bossDist[a]：マス a からボスまでの距離 */
  bossDist: number[];
}

export interface Contribution {
  damage: number;
  kills: number;
  support: number;
  ko: number;
}

export interface Player {
  id: number;
  name: string;
  classId: ClassId;
  isCpu: boolean;
  hp: number;
  maxHp: number;
  level: number;
  coins: number;
  focus: number;
  hand: string[];
  chips: string[];
  chipSlots: number;
  tile: number;
  prevTile: number | null;
  skillCooldown: number;
  skillLevel: number;
  /** 🔥火種チップで溜まる永続の攻撃ボーナス */
  fireStacks: number;
  /** 呪い：次に振るダイスの1個が「1」になる */
  cursed: boolean;
  statBonus: { atk: number; def: number; maxHp: number };
  buffs: { power: boolean; shield: number; moveBonus: number; taunt: boolean };
  contrib: Contribution;
  luck: { rolls: number; sum: number };
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  tile: number;
}

export type BossIntentKind = 'sweep' | 'quake' | 'meteor' | 'target' | 'roar' | 'summon' | 'charge';

export interface BossIntent {
  kind: BossIntentKind;
  label: string;
  /** 範囲攻撃の対象マス */
  tiles: number[];
  targetId?: number;
  /** 攻撃力の固定部分（実際はこれ＋ダイス1個） */
  base: number;
  noEvade?: boolean;
}

export interface Boss {
  name: string;
  hp: number;
  maxHp: number;
  def: number;
  enraged: boolean;
  charged: boolean;
  intent: BossIntent | null;
  lastIntent: BossIntentKind | null;
}

export interface TurnState {
  dice: [number, number] | null;
  doubles: boolean;
  moveValue: number;
  actionValue: number;
  moveRemaining: number;
  branchOptions: number[];
  /** 集中トークンはターンに1回まで */
  focusUsed: boolean;
  /** 接敵で行動ダイスを使った */
  actionUsed: boolean;
  /** 自分のターン中にKOされた */
  knockedOut: boolean;
  /** このターンにすれ違った（同じマスを通った・止まった）仲間。コインを送れる */
  passedAllies: number[];
  /** このターンにコインを送った相手 */
  giftedTo: number[];
  shopOffers: string[];
}

export interface Draft {
  playerId: number;
  options: string[];
  source: 'supply' | 'kill' | 'chest' | 'boss' | 'fate';
}

export interface ModeConfig {
  maxRounds: number;
  bossRound: number;
  bossHp: number;
  teamLife: number;
}

export type EntityRef = { kind: 'player' | 'enemy'; id: number } | { kind: 'boss' };

/** 解決待ちの攻撃。プレイヤーが受ける側なら「防御／回避」の選択を待つ */
export interface PendingAttack {
  attacker: EntityRef;
  target: EntityRef;
  /** 攻撃側のダイス（回避判定に使う） */
  roll: number;
  /** 防御前の攻撃力 */
  power: number;
  noEvade: boolean;
  /** 解決後、生きていれば受けた側が反撃する */
  counter: boolean;
  label: string;
}

/** 攻撃の解決後に進める処理 */
export type Phase =
  | { k: 'land' }
  | { k: 'postLand' }
  | { k: 'endTurn' }
  | { k: 'enemyAct'; id: number }
  | { k: 'bossAura' }
  | { k: 'bossIntent' }
  | { k: 'roundEnd' };

export interface GameState {
  seed: number;
  rng: number;
  mode: Mode;
  config: ModeConfig;
  round: number;
  phase: 'prep' | 'boss';
  current: number;
  step: Step;
  players: Player[];
  enemies: Enemy[];
  nextEnemyId: number;
  boss: Boss | null;
  teamLife: number;
  teamDie: number;
  teamDieOwner: number | null;
  /** チームダイスはチームで1ラウンド1回 */
  teamDieUsed: boolean;
  turn: TurnState;
  queue: PendingAttack[];
  phases: Phase[];
  drafts: Draft[];
  result: 'win' | 'lose' | null;
  log: string[];
}

export type AttackTarget = { kind: 'enemy'; id: number } | { kind: 'boss' };

export type Action =
  | { type: 'roll'; playerId: number }
  | { type: 'adjust'; playerId: number; die: 0 | 1; delta: 1 | -1 }
  | { type: 'reroll'; playerId: number; die: 0 | 1 }
  | { type: 'swapTeamDie'; playerId: number; die: 0 | 1 }
  | { type: 'assign'; playerId: number; moveDie: 0 | 1 }
  | { type: 'branch'; playerId: number; to: number }
  | { type: 'useCard'; playerId: number; index: number; targetId?: number }
  | { type: 'levelUp'; playerId: number; choice: LevelUpChoice }
  | { type: 'buyCard'; playerId: number; index: number }
  | { type: 'leaveShop'; playerId: number }
  | { type: 'attack'; playerId: number; target: AttackTarget }
  | { type: 'skill'; playerId: number; target?: AttackTarget }
  | { type: 'prepare'; playerId: number }
  | { type: 'react'; playerId: number; choice: ReactChoice }
  | { type: 'giveCoins'; playerId: number; targetId: number }
  | { type: 'pickChip'; playerId: number; index: number | null; replace?: number };

export interface BattleResult {
  attacker: EntityRef;
  target: EntityRef;
  label: string;
  roll: number;
  power: number;
  choice: ReactChoice;
  defRoll: number;
  /** 防御時の軽減量（DEF＋出目） */
  guard: number;
  evaded: boolean;
  damage: number;
  noEvade: boolean;
}

export type GameEvent =
  | { t: 'roll'; pid: number; dice: [number, number]; doubles: boolean }
  | { t: 'move'; pid: number; path: number[] }
  | { t: 'enemyMove'; enemyId: number; path: number[] }
  | { t: 'tile'; pid: number; tile: number; text: string }
  | { t: 'event'; pid: number; icon: string; title: string; text: string; good: boolean }
  | { t: 'battle'; result: BattleResult }
  | { t: 'damage'; target: EntityRef; amount: number }
  | { t: 'heal'; pid: number; amount: number }
  | { t: 'ko'; pid: number }
  | { t: 'kill'; enemyId: number }
  | { t: 'spawn'; enemyId: number }
  | { t: 'warp'; pid: number; tile: number }
  | { t: 'bossSpawn' }
  | { t: 'bossEnrage' }
  | { t: 'bossAttack'; intent: BossIntent }
  | { t: 'roundStart'; round: number }
  | { t: 'text'; text: string; at?: EntityRef }
  | { t: 'gameover'; result: 'win' | 'lose' };
