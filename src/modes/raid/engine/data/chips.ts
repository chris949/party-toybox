import type { Tag } from '../types';

export interface ChipDef {
  id: string;
  name: string;
  tag: Tag;
  /** 1=コモン, 2=レア, 3=エピック。ラウンドが進むほど高ティアが出やすい */
  tier: 1 | 2 | 3;
  desc: string;
}

export const TAGS: Record<Tag, { name: string; icon: string; set2: string; set4: string }> = {
  fire: { name: '炎', icon: '🔥', set2: '攻撃+1', set4: '攻撃+3' },
  thunder: { name: '雷', icon: '⚡', set2: '移動+1', set4: '攻撃+2・連鎖の追撃が全力に' },
  guard: { name: '守護', icon: '🛡', set2: 'DEF+1', set4: 'DEF+2・最大HP+6' },
  gold: { name: '黄金', icon: '💰', set2: 'ターン開始時コイン+1', set4: 'ターン開始時コイン+3' },
  fate: { name: '運命', icon: '🎲', set2: '低い出目での集中+1', set4: '行動ダイスが2以下なら+3' },
};

export const CHIPS: ChipDef[] = [
  { id: 'ember', name: '火種', tag: 'fire', tier: 1, desc: '攻撃するたびに火力+1（最大6、試合中ずっと累積）' },
  { id: 'flame_blade', name: '炎刃', tag: 'fire', tier: 1, desc: '攻撃+2' },
  { id: 'blaze', name: '業火', tag: 'fire', tier: 2, desc: '火力が5以上なら攻撃+4' },
  { id: 'inferno', name: '煉獄', tag: 'fire', tier: 3, desc: 'ボスへの攻撃ダメージ×1.5' },

  { id: 'quick', name: '疾風', tag: 'thunder', tier: 1, desc: '移動+1' },
  { id: 'static', name: '静電', tag: 'thunder', tier: 1, desc: '行動ダイスが偶数なら攻撃+2' },
  { id: 'chain', name: '連鎖雷', tag: 'thunder', tier: 2, desc: 'ゾロ目のとき、攻撃後に半分の威力で追撃' },
  { id: 'thunderclap', name: '雷鳴', tag: 'thunder', tier: 3, desc: 'ゾロ目のボーナスが+2→+5になる' },

  { id: 'iron_skin', name: '鉄皮', tag: 'guard', tier: 1, desc: 'DEF+1' },
  { id: 'counter', name: '反撃', tag: 'guard', tier: 1, desc: '攻撃を受けると相手に3ダメージ' },
  { id: 'bulwark', name: '守りの陣', tag: 'guard', tier: 2, desc: '同じマスの仲間の被ダメージ-2' },
  { id: 'fortress', name: '要塞', tag: 'guard', tier: 3, desc: 'DEFの値だけ攻撃にも加算' },

  { id: 'interest', name: '利息', tag: 'gold', tier: 1, desc: 'ターン開始時コイン+1' },
  { id: 'bounty', name: '賞金稼ぎ', tag: 'gold', tier: 1, desc: 'ザコ撃破時コイン+5' },
  { id: 'golden_fist', name: '黄金の拳', tag: 'gold', tier: 2, desc: '所持コイン8枚ごとに攻撃+1' },
  { id: 'midas', name: '王者の財', tag: 'gold', tier: 3, desc: 'レベルアップ費用が半分' },

  { id: 'meditation', name: '瞑想', tag: 'fate', tier: 1, desc: '低い出目での集中+1、集中の上限+2' },
  { id: 'underdog', name: '逆境', tag: 'fate', tier: 1, desc: '行動ダイスが2以下なら攻撃×2' },
  { id: 'lucky_one', name: '一の奇跡', tag: 'fate', tier: 2, desc: '出目の1を7として扱う' },
  { id: 'destiny', name: '天命', tag: 'fate', tier: 3, desc: '集中トークン1つにつき攻撃+1' },
];

export const CHIP_MAP: Record<string, ChipDef> = Object.fromEntries(CHIPS.map((c) => [c.id, c]));
