export interface CardDef {
  id: string;
  name: string;
  /** pre：ダイスの割り当て前だけ使える / any：自分のターン中いつでも */
  timing: 'pre' | 'any';
  /** ally：仲間を対象に選ぶ */
  target?: 'ally';
  desc: string;
  weight: number;
}

export const CARDS: CardDef[] = [
  { id: 'dash', name: '疾走', timing: 'pre', desc: 'このターンの移動+2', weight: 3 },
  { id: 'reroll', name: '振り直し', timing: 'pre', desc: 'ダイスを2個とも振り直す', weight: 3 },
  { id: 'fix', name: '調律', timing: 'pre', desc: '小さい方のダイスを6にする', weight: 1 },
  { id: 'power', name: '渾身', timing: 'any', desc: '次の攻撃ダメージ×2', weight: 3 },
  { id: 'potion', name: '回復薬', timing: 'any', desc: 'HP+8', weight: 3 },
  { id: 'bell', name: '癒しの鐘', timing: 'any', desc: '全員HP+4', weight: 2 },
  { id: 'ward', name: '守りの札', timing: 'any', target: 'ally', desc: '仲間1人の次の被ダメージ-6', weight: 2 },
  { id: 'coin_bag', name: '金袋', timing: 'any', desc: 'コイン+6', weight: 2 },
];

export const CARD_MAP: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));
