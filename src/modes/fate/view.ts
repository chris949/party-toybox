// 運命の二者択一で各参加者に見せてよい情報。正解の側は、発表までは、お立ち台に立っている人（出題者）にだけ送る
import { cardOf, type FateState, type Pos, type Side } from './rules';

export interface FateView {
  round: number;
  text: string;
  left: string;   // 左に出す答え
  right: string;  // 右に出す答え
  authorIds: string[]; // お立ち台に立つ人（自動でセーフ）
  answer: Side | null; // 自分がお立ち台にいるときだけ：正解の側
  authorName: string;
  pos: Record<string, Pos>;
  out: Record<string, number>; // 脱落した人 → 落ちた問題の番号（0始まり）
  lives: Record<string, number>; // 残りのライフ
  verdict: { rightSide: Side; fallen: string[]; out: string[]; saved: boolean } | null; // 発表してから（fallen = 落ちた人、out = そのうち脱落した人）
  paused: boolean;
}

export function fateView(g: FateState, id: string): FateView {
  const c = cardOf(g);
  const leftIsRight = c.rightSide === 'L';
  return {
    round: g.round,
    text: c.text,
    left: leftIsRight ? c.right : c.wrong,
    right: leftIsRight ? c.wrong : c.right,
    authorIds: c.authorIds,
    answer: g.phase === 'question' && c.authorIds.includes(id) ? c.rightSide : null,
    authorName: c.authorName,
    pos: g.pos,
    out: g.out,
    lives: g.lives,
    verdict: g.verdict && g.phase !== 'question' ? { rightSide: c.rightSide, fallen: g.verdict.fallen, out: g.verdict.out, saved: g.verdict.saved } : null,
    paused: g.paused != null,
  };
}
