// セレクトファイブで各参加者に見せてよい情報。正解・ダミーは、作者と、答え合わせでめくった分だけ送る
import { answers, roundOf, type FiveState } from './rules';

export interface FiveRevealView {
  shown: number[];            // めくった選択肢（めくった順）
  dummyCount: number | null;  // めくり終えるまでは null（ダミーの数は見せない：Q15）
  rows: { id: string; name: string; picks: number[]; hits: number | null; pts: number | null }[]; // 点はめくり終えてから
  timeouts: string[];
  suspense: boolean;
  done: boolean;
}

export interface FiveView {
  round: number;
  rounds: number;
  title: string;
  options: string[];
  authorId: string | null;
  authorName: string;
  answering: boolean;               // 自分が答える番か（作者は答えない）
  myPicks: number[] | null;
  correct: (boolean | null)[] | null; // 分かっている分だけ（null = まだ見せない）
  reveal: FiveRevealView | null;
}

export function fiveView(g: FiveState, id: string): FiveView {
  const rd = roundOf(g);
  const r = g.phase === 'reveal' ? g.reveal : null;
  const isAuthor = rd?.authorId === id;
  let correct: (boolean | null)[] | null = null;
  if (rd && (isAuthor || r)) {
    const known = new Set(isAuthor || r?.done ? rd.options.map((_, i) => i) : r!.order.slice(0, r!.shown));
    correct = rd.correct.map((c, i) => known.has(i) ? c : null);
  }
  return {
    round: g.round,
    rounds: g.rounds.length,
    title: rd?.title ?? '',
    options: rd?.options ?? [],
    authorId: rd?.authorId ?? null,
    authorName: rd?.authorName ?? '',
    answering: g.phase === 'answer' && answers(g, id),
    myPicks: g.phase !== 'result' ? g.picks[id] ?? null : null,
    correct,
    reveal: r ? {
      shown: r.order.slice(0, r.shown),
      dummyCount: r.done ? r.order.length - r.nCorrect : null,
      rows: r.rows.map(x => ({ id: x.id, name: x.name, picks: x.picks, hits: r.done ? x.hits : null, pts: r.done ? x.pts : null })),
      timeouts: r.timeouts,
      suspense: r.suspense,
      done: r.done,
    } : null,
  };
}
