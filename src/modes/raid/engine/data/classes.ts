import type { ClassId, Tag } from '../types';

export interface ClassDef {
  id: ClassId;
  name: string;
  icon: string;
  hp: number;
  atk: number;
  def: number;
  /** 回避判定への補正 */
  evd: number;
  range: number;
  tag: Tag;
  startChip: string;
  passive: string;
  skillName: string;
  skillDesc: string;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior', name: '戦士', icon: '⚔️', hp: 30, atk: 3, def: 2, evd: 0, range: 1, tag: 'guard', startChip: 'iron_skin',
    passive: '不屈：HPが半分以下なら攻撃+2',
    skillName: 'ウォークライ', skillDesc: 'このラウンド中、ボスの狙いを自分に引きつけ、DEF+2。HPを回復',
  },
  mage: {
    id: 'mage', name: '魔法使い', icon: '🔮', hp: 20, atk: 3, def: 0, evd: 0, range: 2, tag: 'fire', startChip: 'ember',
    passive: '魔力集中：行動ダイスが5以上なら攻撃+1（遠距離攻撃は反撃を受けない）',
    skillName: 'メテオ', skillDesc: '射程内のすべての敵とボスに攻撃（威力70%）',
  },
  priest: {
    id: 'priest', name: '僧侶', icon: '✝️', hp: 24, atk: 2, def: 1, evd: 1, range: 1, tag: 'fate', startChip: 'meditation',
    passive: '祝福：チームダイスに預けた出目が+1される',
    skillName: '祈り', skillDesc: '全員のHPを回復し、集中トークン+1',
  },
  archer: {
    id: 'archer', name: '弓兵', icon: '🏹', hp: 22, atk: 3, def: 1, evd: 1, range: 3, tag: 'thunder', startChip: 'quick',
    passive: '狙撃：距離2以上の敵への攻撃+2（遠距離攻撃は反撃を受けない）',
    skillName: '連射', skillDesc: '1体に2回攻撃（各70%）',
  },
};

export const CLASS_IDS: ClassId[] = ['warrior', 'mage', 'priest', 'archer'];
