import { describe, expect, it } from 'vitest';
import { DEFAULT_RELAY_TIME, PICK_GRACE_MS, RELAY_GUESS_SEC, RELAY_MAX_STAMPS, RELAY_MAX_STEPS, RELAY_TEXT_MAX } from '../src/core/constants';
import { nextTimer } from '../src/core/room';
import { viewFor } from '../src/core/view';
import { bookOf, holderOf, type RelayState } from '../src/modes/relay/rules';
import { RELAY_WORDS, sanitizeStamps, STAMPS, type Stamp } from '../src/modes/relay/stamps';
import { samples, testRoom } from './helpers';

const pic = (k = 0): Stamp[] => [{ k, x: 50, y: 50, s: 3, r: 0 }];

function relayRoom(n: number, opts: { seed?: number } = {}) {
  const t = testRoom(Array.from({ length: n }, () => samples()), { seed: opts.seed });
  t.host({ t: 'game', mode: 'relay' });
  t.host({ t: 'start' });
  const g = () => t.room.game as RelayState;
  return {
    ids: t.ids, ctx: t.ctx, act: t.act, host: t.host, advance: t.advance,
    get room() { return t.room; },
    get g() { return g(); },
    // 全員が、この回のものを出す。答える番は answer(紙の番号) の言葉を出す
    submitAll(answer: (book: number) => string = () => 'こたえ') {
      const step = g().step;
      for (const id of [...g().ring]) {
        if (g().phase !== 'work' || g().step !== step) break;
        t.act(id, step % 2 === 0 ? { t: 'relayDraw', step, stamps: pic(step) } : { t: 'relayGuess', step, text: answer(bookOf(g(), id)) });
      }
    },
    score(id: string) { return t.room.players.find(p => p.id === id)!.score; },
  };
}

describe('スタンプ伝言：スタンプとお題', () => {
  it('スタンプは150個以上、お題は80個以上あり、重複がない', () => {
    expect(STAMPS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(STAMPS).size).toBe(STAMPS.length);
    expect(RELAY_WORDS.length).toBeGreaterThanOrEqual(80);
    expect(new Set(RELAY_WORDS).size).toBe(RELAY_WORDS.length);
    expect(RELAY_WORDS.every(w => w.length <= RELAY_TEXT_MAX)).toBe(true);
  });
  it('届いた絵は、検査して整える（知らないスタンプは捨て、位置と大きさは範囲に収め、数は上限まで）', () => {
    expect(sanitizeStamps('x')).toEqual([]);
    expect(sanitizeStamps([{ k: 1, x: -5, y: 300, s: 9, r: 20 }, { k: STAMPS.length, x: 1, y: 1, s: 1, r: 0 }, null, { k: 1.5 }]))
      .toEqual([{ k: 1, x: 0, y: 100, s: 5, r: 7 }]);
    expect(sanitizeStamps(Array.from({ length: 40 }, () => pic()[0]))).toHaveLength(RELAY_MAX_STAMPS);
  });
});

describe('スタンプ伝言：回す', () => {
  it('始まり：1人に1枚、ちがうお題の紙。回す回数は、人数まで（上限6）', () => {
    const r = relayRoom(4);
    expect(r.g.books).toHaveLength(4);
    expect(new Set(r.g.books.map(b => b.word)).size).toBe(4);
    expect(r.g.steps).toBe(4);
    expect(relayRoom(2).g.steps).toBe(2);
    expect(relayRoom(9).g.steps).toBe(RELAY_MAX_STEPS);
    expect(r.g.deadline - r.ctx.now).toBe(DEFAULT_RELAY_TIME * 1000);
  });
  it('絵 → 答え → 絵 …と交互に進む。全員が出すと、紙が隣へ回る。答える番は時間が短い', () => {
    const r = relayRoom(3);
    const first = r.g.ring.map(id => bookOf(r.g, id));
    r.submitAll();
    expect(r.g.step).toBe(1);
    expect(r.g.deadline - r.ctx.now).toBe(RELAY_GUESS_SEC * 1000);
    expect(r.g.ring.map(id => bookOf(r.g, id))).not.toEqual(first);
    for (let i = 0; i < 3; i++) expect(bookOf(r.g, holderOf(r.g, i))).toBe(i);
    // 1枚の紙を、同じ人が2回持つことはない
    r.submitAll(); r.submitAll();
    expect(r.g.phase).toBe('unfold');
    for (const b of r.g.books) {
      expect(b.entries.map(e => e.kind)).toEqual(['draw', 'guess', 'draw']);
      expect(new Set(b.entries.map(e => e.by)).size).toBe(3);
      expect(b.entries[0].by).toBe(b.ownerId);
    }
  });
  it('番がちがうもの・空のもの・2回目は受け取らない', () => {
    const r = relayRoom(3);
    const [a] = r.g.ring;
    r.act(a, { t: 'relayGuess', step: 0, text: 'こたえ' });        // 絵の番に、答え
    r.act(a, { t: 'relayDraw', step: 0, stamps: [] });              // 何も置いていない
    r.act(a, { t: 'relayDraw', step: 1, stamps: pic() });           // 回がちがう
    expect(r.g.drafts).toEqual({});
    r.act(a, { t: 'relayDraw', step: 0, stamps: pic(3) });
    r.act(a, { t: 'relayDraw', step: 0, stamps: pic(4) });
    expect(r.g.drafts[a]).toMatchObject({ kind: 'draw', stamps: pic(3) });
    r.submitAll();
    r.act(a, { t: 'relayGuess', step: 1, text: '   ' });
    expect(r.g.drafts).toEqual({});
  });
  it('作っている間に見えるのは、手元の紙の「1つ前」だけ。最初のお題は、最初の人にしか見えない', () => {
    const r = relayRoom(3);
    for (const id of r.ids) {
      const v = viewFor(r.room, id, r.ctx.now).relay!;
      expect(v.from).toEqual({ word: r.g.books[bookOf(r.g, id)].word });
      expect(v.kind).toBe('draw');
      expect(v.show).toBeNull();
    }
    r.submitAll();
    for (const id of r.ids) {
      const v = viewFor(r.room, id, r.ctx.now).relay!;
      const b = r.g.books[bookOf(r.g, id)];
      expect(v.from).toEqual({ stamps: pic(0) });
      expect(JSON.stringify(v)).not.toContain(b.word);
    }
    const a = r.g.ring[0];
    r.act(a, { t: 'relayGuess', step: 1, text: 'ねこ' });
    expect(viewFor(r.room, a, r.ctx.now).relay!.submitted).toBe(true);
    expect(viewFor(r.room, a, r.ctx.now).players.find(p => p.id === a)!.done).toBe(true);
  });
  it('時間切れ：出していない人の分は、空の絵や「？？？」で埋めて進む', () => {
    const r = relayRoom(3);
    const [a] = r.g.ring;
    r.act(a, { t: 'relayDraw', step: 0, stamps: pic() });
    expect(nextTimer(r.room)).toEqual({ at: r.g.deadline + PICK_GRACE_MS, action: { t: 'timeUp' } });
    r.host({ t: 'timeUp' }); // まだ早い
    expect(r.g.step).toBe(0);
    r.advance(DEFAULT_RELAY_TIME * 1000 + PICK_GRACE_MS);
    r.host({ t: 'timeUp' });
    expect(r.g.step).toBe(1);
    expect(r.g.books.filter(b => b.entries[0].auto)).toHaveLength(2);
    r.host({ t: 'force' });
    expect(r.g.books.every(b => b.entries[1].kind === 'guess' && b.entries[1].auto)).toBe(true);
  });
});

describe('スタンプ伝言：発表', () => {
  it('ホストが1つずつめくる。最後の答えがお題と合っていたら、その紙に関わった全員に1点', () => {
    const r = relayRoom(2);
    r.submitAll();
    // 紙0 は当たり（カタカナ・空白のちがいは同じとみなす）、紙1 ははずれ
    r.submitAll(book => book === 0 ? ` ${r.g.books[0].word} ` : 'ぜんぜんちがう');
    expect(r.g.phase).toBe('unfold');
    expect(nextTimer(r.room)).toBeNull();
    const v0 = viewFor(r.room, r.ids[1], r.ctx.now).relay!.show!;
    expect(v0).toMatchObject({ idx: 0, count: 2, word: r.g.books[0].word, items: [], total: 2, hit: null });
    r.act(r.ids[1], { t: 'next' }); // ホストだけがめくれる
    expect(r.g.show).toEqual({ idx: 0, shown: 0 });
    r.host({ t: 'next' });
    expect(viewFor(r.room, r.ids[1], r.ctx.now).relay!.show!.items).toHaveLength(1);
    expect(r.ids.map(id => r.score(id))).toEqual([0, 0]);
    r.host({ t: 'next' });
    expect(viewFor(r.room, r.ids[1], r.ctx.now).relay!.show!.hit).toBe(true);
    expect(r.ids.map(id => r.score(id))).toEqual([1, 1]);
    r.host({ t: 'next' }); // 次の紙へ
    expect(r.g.show).toEqual({ idx: 1, shown: 0 });
    r.host({ t: 'next' }); r.host({ t: 'next' });
    expect(viewFor(r.room, r.ids[0], r.ctx.now).relay!.show!.hit).toBe(false);
    expect(r.ids.map(id => r.score(id))).toEqual([1, 1]);
    r.host({ t: 'next' });
    expect(r.g.phase).toBe('result');
    r.host({ t: 'lobby' });
    expect(r.room.game).toBeNull();
  });
  it('設定：絵を作る時間は、ホストだけが、決まった値に変えられる', () => {
    const t = testRoom([samples(), samples()]);
    t.act(t.ids[1], { t: 'relayTime', sec: 90 });
    t.host({ t: 'relayTime', sec: 10 });
    expect(t.room.relayTime).toBe(DEFAULT_RELAY_TIME);
    t.host({ t: 'relayTime', sec: 90 });
    expect(t.room.relayTime).toBe(90);
  });
});

describe('シミュレーション', () => {
  it('100ゲーム：止まらず、どの紙も決めた回数だけ回り、同じ人が同じ紙を2回持たない', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const n = 2 + seed % 9;
      const r = relayRoom(n, { seed: seed * 104729 });
      const steps = r.g.steps;
      for (let s = 0; s < steps; s++) {
        expect(r.g.phase).toBe('work');
        if (r.ctx.random() < 0.3) r.host({ t: 'force' }); else r.submitAll(b => r.ctx.random() < 0.3 ? r.g.books[b].word : 'ちがう');
      }
      expect(r.g.phase).toBe('unfold');
      for (const b of r.g.books) {
        expect(b.entries).toHaveLength(steps);
        expect(new Set(b.entries.map(e => e.by)).size).toBe(steps);
      }
      for (let i = 0; i < n * (steps + 1) && r.g.phase === 'unfold'; i++) r.host({ t: 'next' });
      expect(r.g.phase).toBe('result');
      expect(r.g.books.every(b => b.hit !== null)).toBe(true);
    }
  }, 120_000);
});
