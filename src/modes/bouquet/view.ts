// ワードブーケで各参加者に見せてよい情報。作っている間は、自分の手札と自分の文だけを送る（ほかの人の文は、全員が出そろってから）
import { totalRounds, type BouquetState } from './rules';

export interface BouquetView {
  round: number;
  rounds: number;        // 全部で何ラウンドか（先取のときは 0）
  goal: number;          // 0 = 全員が親を1回。1以上 = 先取の点
  parentId: string;
  parentName: string;
  theme: string;
  themeBy: string;
  hand: string[] | null; // 自分の手札（親や、途中から見ている人は null）
  redrawn: boolean;      // 手札を引き直したか
  myPhrase: string | null;
  phrases: { id: string; name: string; text: string }[] | null; // 出そろってから：作った人の名前と一緒に
  winner: string | null; // 親が選んだ人（発表から）
}

export function bouquetView(g: BouquetState, id: string): BouquetView {
  const open = g.phase === 'choose' || g.phase === 'bloom';
  return {
    round: g.round, rounds: totalRounds(g), goal: g.goal,
    parentId: g.parentId, parentName: g.names[g.parentId] ?? '???',
    theme: g.theme, themeBy: g.themeBy,
    hand: g.phase === 'compose' ? g.hands[id] ?? null : null,
    redrawn: !!g.redrawn[id],
    myPhrase: g.phrases[id] ?? null,
    phrases: open ? g.ring.filter(pid => pid in g.phrases).map(pid => ({ id: pid, name: g.names[pid] ?? '???', text: g.phrases[pid] })) : null,
    winner: g.phase === 'bloom' ? g.winner : null,
  };
}
