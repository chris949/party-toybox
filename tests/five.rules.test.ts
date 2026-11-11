import { describe, expect, it } from 'vitest';
import { DEFAULT_TIME_LIMIT, PERFECT_BONUS, PICK_GRACE_MS } from '../src/core/constants';
import { dummyRange, FIVE_PICK, fiveKey, SAMPLE_FIVES, sanitizeFives, type FiveTopic } from '../src/core/fives';
import { seeded } from '../src/core/random';
import { deal, roundOf, validPicks } from '../src/modes/five/rules';
import { fiveView } from '../src/modes/five/view';
import { samples, testRoom } from './helpers';

const five = (title: string, nA = 6, nD = 6, size = 10, dummy: number | null = 4): FiveTopic => ({
  title, answers: Array.from({ length: nA }, (_, i) => `${title}-正${i}`), dummies: Array.from({ length: nD }, (_, i) => `${title}-偽${i}`), size, dummy,
});
// ゲーム開始まで。fives[i] は i 番目の人が持ってくるお題
function fiveRoom(fives: FiveTopic[][], opts: { seed?: number } = {}) {
  const t = testRoom(fives.map(() => samples()), { seed: opts.seed });
  t.ids.forEach((id, i) => t.act(id, { t: 'join', name: `プレイヤー${i}`, key: `k${i}`, topics: samples(), fives: fives[i], version: 'test' }));
  t.host({ t: 'game', mode: 'five' });
  return t;
}
const correctIdx = (t: ReturnType<typeof fiveRoom>) => roundOf(t.five).correct.flatMap((c, i) => c ? [i] : []);
const dummyIdx = (t: ReturnType<typeof fiveRoom>) => roundOf(t.five).correct.flatMap((c, i) => c ? [] : [i]);
const answerers = (t: ReturnType<typeof fiveRoom>) => t.ids.filter(id => roundOf(t.five).authorId !== id);

describe('お題の検査', () => {
  it('正解5個以上・ダミー1個以上・合計7個以上で、数は範囲に収める', () => {
    expect(sanitizeFives([five('ok', 6, 2, 99, 99)])).toEqual([{ ...five('ok', 6, 2), size: 8, dummy: 2 }]);
    expect(sanitizeFives([five('正解不足', 4, 6)])).toEqual([]);
    expect(sanitizeFives([five('ダミーなし', 9, 0)])).toEqual([]);
    expect(sanitizeFives([five('少なすぎ', 5, 1)])).toEqual([]);
    expect(sanitizeFives([{ ...five('重複'), dummies: ['重複-正0', 'x', 'y'] }])[0].dummies).toEqual(['x', 'y']);
    expect(sanitizeFives([five('おまかせ', 6, 6, 10, null)])[0].dummy).toBeNull();
  });
  it('同梱のサンプルはすべて正しい形', () => {
    expect(sanitizeFives(SAMPLE_FIVES)).toHaveLength(SAMPLE_FIVES.length);
    expect(new Set(SAMPLE_FIVES.map(fiveKey)).size).toBe(SAMPLE_FIVES.length);
  });
  it('出題のたびに、決めた数の正解とダミーを抜き出す（おまかせは範囲内でばらける）', () => {
    const ctx = { now: 0, random: seeded(3) };
    for (let i = 0; i < 50; i++) {
      const d = deal(five('a', 8, 8, 10, 3), ctx);
      expect(d.options).toHaveLength(10);
      expect(d.correct.filter(c => !c)).toHaveLength(3);
    }
    const counts = new Set(Array.from({ length: 200 }, () => deal(five('b', 8, 8, 10, null), ctx).correct.filter(c => !c).length));
    const r = dummyRange(10, 8, 8);
    expect([...counts].every(n => n >= r.lo && n <= r.hi)).toBe(true);
    expect(counts.size).toBeGreaterThan(1);
  });
});

describe('ゲームの流れ', () => {
  it('ラウンド数＝人数。自作のお題を優先し、足りなければサンプルで埋める', () => {
    const t = fiveRoom([[five('A1'), five('A2'), five('A3')], [], []]);
    t.host({ t: 'start' });
    const rounds = t.five.rounds;
    expect(rounds).toHaveLength(3);
    expect(rounds.every(r => r.authorId === 'p0')).toBe(true); // たくさん持ってきた人から多めに出す
    const t2 = fiveRoom([[five('B1')], [], []]);
    t2.host({ t: 'start' });
    expect(t2.five.rounds.filter(r => r.authorId === null)).toHaveLength(2);
  });
  it('作者は答えず、答える人が全員そろうと答え合わせへ。正解をめくってから、溜めてダミーをめくる', () => {
    const t = fiveRoom([[five('A')], [five('B')], [five('C')]], { seed: 2 });
    t.host({ t: 'start' });
    const author = roundOf(t.five).authorId!;
    t.act(author, { t: 'five', round: 0, picks: correctIdx(t).slice(0, 5) });
    expect(t.five.picks[author]).toBeUndefined();
    const [a, b] = answerers(t);
    t.act(a, { t: 'five', round: 0, picks: correctIdx(t).slice(0, 5) });        // 全部正解
    t.act(b, { t: 'five', round: 0, picks: [...correctIdx(t).slice(0, 3), ...dummyIdx(t).slice(0, 2)] });
    expect(t.five.phase).toBe('reveal');
    const r = t.five.reveal!;
    expect(r.order.slice(0, r.nCorrect).every(i => roundOf(t.five).correct[i])).toBe(true);
    // 正解を1つずつめくり、最後の正解と同時にダミーもまとめて明かす（溜めはない）
    let steps = 0;
    while (!t.five.reveal!.done) {
      t.host({ t: 'revealStep' });
      steps++;
      expect(t.five.reveal!.suspense).toBe(false);
    }
    expect(steps).toBe(r.nCorrect);
    expect(t.five.reveal!.shown).toBe(r.order.length);
    const score = (id: string) => t.room.players.find(p => p.id === id)!.score;
    expect(score(a)).toBe(FIVE_PICK + PERFECT_BONUS);
    expect(score(b)).toBe(3); // ダミーを選んでも減点しない
    expect(score(author)).toBe(0);
  });
  it('ちょうど5つでないと受け付けない。時間切れのときは選んだ分だけで出せる', () => {
    expect(validPicks([0, 1, 2, 3], 10)).toBe(false);
    expect(validPicks([0, 1, 2, 3, 3], 10)).toBe(false);
    expect(validPicks([0, 1, 2, 3, 10], 10)).toBe(false);
    expect(validPicks([0, 1], 10, true)).toBe(true);
    const t = fiveRoom([[five('A')], [five('B')], [five('C')]]);
    t.host({ t: 'start' });
    const [a, b] = answerers(t);
    t.act(a, { t: 'five', round: 0, picks: [correctIdx(t)[0], dummyIdx(t)[0]], partial: true });
    t.advance(DEFAULT_TIME_LIMIT * 1000 + PICK_GRACE_MS);
    t.host({ t: 'timeUp' });
    const r = t.five.reveal!;
    expect(r.rows.map(x => [x.id, x.hits])).toEqual([[a, 1]]);
    expect(r.timeouts).toEqual([t.room.players.find(p => p.id === b)!.name]);
  });
  it('答える人には、答え合わせまで正解とダミーを見せない。作者には見せる', () => {
    const t = fiveRoom([[five('A')], [five('B')], [five('C')]]);
    t.host({ t: 'start' });
    const author = roundOf(t.five).authorId!;
    const [a] = answerers(t);
    expect(fiveView(t.five, a).correct).toBeNull();
    expect(JSON.stringify(fiveView(t.five, a))).not.toContain('"correct":[');
    expect(fiveView(t.five, author).correct!.every(c => c !== null)).toBe(true);
    t.host({ t: 'force' });
    t.host({ t: 'revealStep' });
    const v = fiveView(t.five, a);
    expect(v.correct!.filter(c => c !== null)).toHaveLength(1);
    expect(v.correct!.filter(c => c === false)).toHaveLength(0); // ダミーは、最後の正解と同時に明かす
    expect(v.reveal!.dummyCount).toBeNull();
  });
  it('最後まで遊んでロビーに戻ると、モードと持ち込んだお題を引き継ぐ', () => {
    const t = fiveRoom([[five('A')], [five('B')]]);
    t.host({ t: 'start' });
    while (t.five.phase !== 'result') {
      if (t.five.phase === 'answer') t.host({ t: 'force' });
      else { t.host({ t: 'reveal-all' }); t.host({ t: 'next' }); }
    }
    t.host({ t: 'lobby' });
    expect(t.room.game).toBeNull();
    expect(t.room.gameMode).toBe('five');
    expect(t.room.fivesBy.p1.map(x => x.title)).toEqual(['B']);
  });
  it('ゲーム中はモードを変えられず、ホスト以外も変えられない', () => {
    const t = fiveRoom([[five('A')], [five('B')]]);
    t.act('p1', { t: 'game', mode: 'tier' });
    expect(t.room.gameMode).toBe('five');
    t.host({ t: 'start' });
    t.host({ t: 'game', mode: 'tier' });
    expect(t.room.gameMode).toBe('five');
  });
});

describe('選び直す（v0.16）', () => {
  it('決定したあとも、答える人が全員そろうまでは取り消して選び直せる', () => {
    const t = fiveRoom([[five('A')], [five('B')], [five('C')]]);
    t.host({ t: 'start' });
    const [a, b] = answerers(t);
    t.act(a, { t: 'five', round: 0, picks: correctIdx(t).slice(0, 5) });
    t.act(a, { t: 'retract', round: 1 });               // 違うラウンドの取り消しは受け付けない
    expect(t.five.picks[a]).toBeDefined();
    t.act(a, { t: 'retract', round: 0 });
    expect(t.five.picks[a]).toBeUndefined();
    t.act(a, { t: 'five', round: 0, picks: [...correctIdx(t).slice(0, 4), dummyIdx(t)[0]] });
    expect(t.five.picks[a]).toHaveLength(5);
    t.act(b, { t: 'five', round: 0, picks: correctIdx(t).slice(0, 5) });
    expect(t.five.phase).toBe('reveal');
    t.act(a, { t: 'retract', round: 0 });               // 答え合わせに入ったら直せない
    expect(t.five.reveal!.rows.find(r => r.id === a)!.hits).toBe(4);
  });
});
