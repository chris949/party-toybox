// 運命の二者択一で各参加者に見せてよい情報。正解の側は、発表まで誰にも送らない
import { cardOf, type FateState, type Pos, type Side } from './rules';

export interface FateView {
  round: number;
  text: string;
  left: string;   // 左に出す答え
  right: string;  // 右に出す答え
  authorIds: string[]; // 作った人（自動でセーフ）
  authorName: string;
  pos: Record<string, Pos>;
  out: Record<string, number>; // 脱落した人 → 落ちた問題の番号（0始まり）
  verdict: { rightSide: Side; fallen: string[]; saved: boolean } | null; // 発表してから
  paused: boolean;
}

export function fateView(g: FateState): FateView {
  const c = cardOf(g);
  const leftIsRight = c.rightSide === 'L';
  return {
    round: g.round,
    text: c.text,
    left: leftIsRight ? c.right : c.wrong,
    right: leftIsRight ? c.wrong : c.right,
    authorIds: c.authorIds,
    authorName: c.authorName,
    pos: g.pos,
    out: g.out,
    verdict: g.verdict && g.phase !== 'question' ? { rightSide: c.rightSide, fallen: g.verdict.fallen, saved: g.verdict.saved } : null,
    paused: g.paused != null,
  };
}
