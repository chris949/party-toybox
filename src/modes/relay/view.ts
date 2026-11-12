// スタンプ伝言で各参加者に見せてよい情報。作っている間は、自分の手元の紙の「1つ前」だけを送る（その前や、最初のお題は送らない）
import { bookOf, kindOf, type Entry, type RelayKind, type RelayState } from './rules';
import type { Stamp } from './stamps';

// 画面に出す1つ分
export type RelayItem = { by: string; byId: string; auto: boolean } & ({ kind: 'draw'; stamps: Stamp[] } | { kind: 'guess'; text: string });

export interface RelayView {
  step: number;
  steps: number;
  kind: RelayKind;              // いま作るもの
  // 手元の紙の、1つ前のもの（最初の回は、お題の言葉）。参加していない人は null
  from: { word: string } | { stamps: Stamp[] } | { text: string } | null;
  submitted: boolean;
  // 発表
  show: {
    idx: number; count: number;
    ownerId: string; ownerName: string;
    word: string;
    items: RelayItem[];         // めくったところまで
    total: number;
    hit: boolean | null;        // めくり終わったら：最後の答えが、お題と合っていたか
  } | null;
}

export function relayView(g: RelayState, id: string): RelayView {
  const name = (pid: string) => g.names[pid] ?? '???';
  const item = (e: Entry): RelayItem => e.kind === 'draw'
    ? { by: name(e.by), byId: e.by, auto: e.auto, kind: 'draw', stamps: e.stamps }
    : { by: name(e.by), byId: e.by, auto: e.auto, kind: 'guess', text: e.text };
  let from: RelayView['from'] = null;
  const bi = g.phase === 'work' ? bookOf(g, id) : -1;
  if (bi >= 0) {
    const b = g.books[bi], prev = b.entries[g.step - 1];
    from = !prev ? { word: b.word } : prev.kind === 'draw' ? { stamps: prev.stamps } : { text: prev.text };
  }
  const sb = g.show ? g.books[g.show.idx] : null;
  return {
    step: g.step, steps: g.steps, kind: kindOf(g.step),
    from, submitted: id in g.drafts,
    show: g.show && sb ? {
      idx: g.show.idx, count: g.books.length, ownerId: sb.ownerId, ownerName: name(sb.ownerId), word: sb.word,
      items: sb.entries.slice(0, g.show.shown).map(item), total: sb.entries.length, hit: g.show.shown >= sb.entries.length ? sb.hit : null,
    } : null,
  };
}
