import { describe, expect, it } from 'vitest';
import { BLUFF_ROUNDS, BLUFF_START, DEFAULT_BLUFF_TIME, MAX_PLAYERS, PICK_GRACE_MS } from '../src/core/constants';
import { nextTimer } from '../src/core/room';
import { seeded } from '../src/core/random';
import type { RoomState } from '../src/core/types';
import { viewFor } from '../src/core/view';
import type { BluffState } from '../src/modes/bluff/rules';
import { samples, testRoom } from './helpers';

function bluffRoom(n: number, opts: { seed?: number } = {}) {
  const t = testRoom(Array.from({ length: n }, () => samples()), { seed: opts.seed });
  t.host({ t: 'game', mode: 'bluff' });
  const g = () => t.room.game as BluffState;
  return {
    ids: t.ids, ctx: t.ctx, act: t.act, host: t.host,
    get room() { return t.room; },
    get g() { return g(); },
    scores() { return Object.fromEntries(t.room.players.map(p => [p.id, p.score])); },
    // カードを決め打ちにする（配り直す）
    setCards(cards: number[]) {
      const r: RoomState = structuredClone(t.room);
      (r.game as BluffState).cards = Object.fromEntries(t.ids.map((id, i) => [id, cards[i]]));
      t.room = r;
    },
    setScores(scores: number[]) {
      const r: RoomState = structuredClone(t.room);
      r.players.forEach((p, i) => { p.score = scores[i]; });
      t.room = r;
    },
    bet(choices: (boolean | null)[]) { choices.forEach((go, i) => { if (go != null) t.act(t.ids[i], { t: 'bet', round: g().round, go }); }); },
  };
}

describe('ロビー', () => {
  it('しゃべる時間は、ホストが 20／30／45 秒から選ぶ。お題がなくても始められる', () => {
    const t = bluffRoom(2);
    expect(t.room.bluffTime).toBe(DEFAULT_BLUFF_TIME);
    t.host({ t: 'bluffTime', sec: 25 });
    t.act(t.ids[1], { t: 'bluffTime', sec: 45 });
    expect(t.room.bluffTime).toBe(DEFAULT_BLUFF_TIME);
    t.host({ t: 'bluffTime', sec: 45 });
    t.host({ t: 'start' });
    expect(t.g.phase).toBe('talk');
    expect(t.g.deadline).toBe(t.ctx.now + 45_000);
    expect(t.room.players.every(p => p.score === BLUFF_START)).toBe(true);
  });
});

describe('配る・見せる', () => {
  it('1〜13 から、同じ数字なしで1枚ずつ配る', () => {
    const t = bluffRoom(10, { seed: 3 });
    t.host({ t: 'start' });
    const cards = Object.values(t.g.cards);
    expect(cards).toHaveLength(10);
    expect(new Set(cards).size).toBe(10);
    expect(cards.every(c => Number.isInteger(c) && c >= 1 && c <= 13)).toBe(true);
  });
  it('自分のカードだけ見えない。ほかの人が何を選んだかは、発表まで見えない', () => {
    const t = bluffRoom(3);
    t.host({ t: 'start' });
    t.setCards([5, 9, 2]);
    t.bet([null, true, null]);
    const v = viewFor(t.room, t.ids[0], t.ctx.now);
    expect(v.phase).toBe('talk');
    expect(v.bluff!.cards).toEqual({ [t.ids[0]]: null, [t.ids[1]]: 9, [t.ids[2]]: 2 });
    expect(v.bluff).toMatchObject({ dealt: true, myBet: null, bets: null, show: null, round: 0, rounds: BLUFF_ROUNDS });
    expect(v.players.map(p => p.done)).toEqual([false, true, false]); // 選び終わったかどうかだけ見える
    expect(v.timeLeft).toBe(DEFAULT_BLUFF_TIME * 1000);
    expect(viewFor(t.room, t.ids[1], t.ctx.now).bluff!.myBet).toBe(true);
    t.bet([true, null, false]);
    const open = viewFor(t.room, t.ids[0], t.ctx.now);
    expect(open.phase).toBe('show');
    expect(open.bluff!.cards[t.ids[0]]).toBe(5); // 発表で、自分のカードも見える
    expect(open.bluff!.bets).toEqual({ [t.ids[0]]: true, [t.ids[1]]: true, [t.ids[2]]: false });
  });
});

describe('選ぶ', () => {
  it('選んだら変えられない。全員が選ぶと、時間を待たずに発表へ', () => {
    const t = bluffRoom(3);
    t.host({ t: 'start' });
    t.bet([true, null, null]);
    const before = t.room;
    t.act(t.ids[0], { t: 'bet', round: 0, go: false });       // 変えられない
    t.act(t.ids[1], { t: 'bet', round: 1, go: true });        // 回が違う
    t.act(t.ids[1], { t: 'bet', round: 0, go: 'x' as never }); // おかしな値
    t.act('nobody', { t: 'bet', round: 0, go: true });
    expect(t.room).toBe(before);
    t.bet([null, false, false]);
    expect(t.g.phase).toBe('show');
  });
  it('時間切れ・切断中の人は「降りる」になる。ホストは待たずに進められる', () => {
    const t = bluffRoom(3);
    t.host({ t: 'start' });
    t.setCards([3, 8, 12]);
    t.bet([true, null, null]);
    t.host({ t: 'timeUp' }); // まだ時間ではない
    expect(t.g.phase).toBe('talk');
    t.ctx.now = t.g.deadline + PICK_GRACE_MS;
    t.act(t.ids[1], { t: 'timeUp' }); // 参加者は締められない
    expect(t.g.phase).toBe('talk');
    const timer = nextTimer(t.room)!;
    t.host(timer.action);
    expect(t.g.phase).toBe('show');
    expect(viewFor(t.room, t.ids[0], t.ctx.now).bluff!.bets).toEqual({ [t.ids[0]]: true, [t.ids[1]]: false, [t.ids[2]]: false });
    // 次のラウンド：切断した人は待たず、ホストは途中で締められる
    t.host({ t: 'next' });
    t.act(t.ids[2], { t: 'leave' });
    expect(t.ids[2] in t.g.cards).toBe(true);
    t.bet([true, null, null]);
    expect(t.g.phase).toBe('talk');
    t.host({ t: 'force' });
    expect(t.g.phase).toBe('show');
  });
});

describe('点', () => {
  const play = (cards: number[], choices: boolean[]) => {
    const t = bluffRoom(cards.length);
    t.host({ t: 'start' });
    t.setCards(cards);
    t.bet(choices);
    return t;
  };
  it('勝負した人の中でいちばん強い人が、負けた人（−2）と降りた人（−1）の点をもらう', () => {
    const t = play([5, 9, 2, 7], [true, true, true, false]);
    expect(t.g.show).toEqual({ winner: t.ids[1], strongFold: null, delta: { [t.ids[0]]: -2, [t.ids[1]]: 5, [t.ids[2]]: -2, [t.ids[3]]: -1 } });
    expect(t.scores()).toEqual({ [t.ids[0]]: 8, [t.ids[1]]: 15, [t.ids[2]]: 8, [t.ids[3]]: 9 });
  });
  it('いちばん強いカードなのに降りた人は、さらに −2', () => {
    const t = play([5, 13, 2], [true, false, true]);
    expect(t.g.show).toEqual({ winner: t.ids[0], strongFold: t.ids[1], delta: { [t.ids[0]]: 5, [t.ids[1]]: -3, [t.ids[2]]: -2 } });
  });
  it('勝負したのが1人だけなら、降りた人の点をもらう', () => {
    const t = play([1, 13, 9], [true, false, false]);
    expect(t.g.show!.winner).toBe(t.ids[0]);
    expect(t.g.show!.delta).toEqual({ [t.ids[0]]: 4, [t.ids[1]]: -3, [t.ids[2]]: -1 });
  });
  it('全員が降りたら、点は動かない', () => {
    const t = play([4, 13, 9], [false, false, false]);
    expect(t.g.show).toEqual({ winner: null, strongFold: null, delta: { [t.ids[0]]: 0, [t.ids[1]]: 0, [t.ids[2]]: 0 } });
    expect(Object.values(t.scores())).toEqual([10, 10, 10]);
  });
  it('持ち点より多くは払わない（0点より下にはならない）', () => {
    const t = bluffRoom(3);
    t.host({ t: 'start' });
    t.setCards([12, 5, 13]);
    t.setScores([10, 1, 0]);
    t.bet([true, true, false]); // 2人目は −2 のはずが1点だけ、3人目は −3 のはずが0点
    expect(t.g.show!.delta).toEqual({ [t.ids[0]]: 1, [t.ids[1]]: -1, [t.ids[2]]: 0 });
    expect(Object.values(t.scores())).toEqual([11, 0, 0]);
  });
});

describe('終わり方', () => {
  it('8ラウンドで結果へ。次へ進めるのはホストだけ。ロビーに戻れる', () => {
    const t = bluffRoom(3);
    t.host({ t: 'start' });
    for (let r = 0; r < BLUFF_ROUNDS; r++) {
      expect(t.g.round).toBe(r);
      expect(t.g.phase).toBe('talk');
      t.bet([true, r % 2 === 0, false]);
      expect(t.g.phase).toBe('show');
      expect(nextTimer(t.room)).toBeNull();
      t.act(t.ids[1], { t: 'next' });
      expect(t.g.phase).toBe('show');
      t.host({ t: 'next' });
    }
    expect(t.g.phase).toBe('result');
    expect(t.room.players.reduce((a, p) => a + p.score, 0)).toBe(BLUFF_START * 3); // 点は、人から人へ動くだけ
    t.host({ t: 'lobby' });
    expect(t.room.game).toBeNull();
    expect(t.room.gameMode).toBe('bluff');
  });
});

describe('シミュレーション', () => {
  it('300ゲーム：止まらず、点の合計は変わらず、0点より下にならない', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rnd = seeded(seed * 7919);
      const n = 2 + Math.floor(rnd() * (MAX_PLAYERS - 1));
      const t = bluffRoom(n, { seed });
      t.host({ t: 'start' });
      let steps = 0;
      while (t.g.phase !== 'result') {
        if (++steps > 200) throw new Error(`止まった: seed=${seed}`);
        if (t.g.phase === 'talk') {
          for (const p of t.room.players.filter(x => x.online)) {
            const r = rnd();
            if (p.id !== t.ids[0] && r < 0.02) t.act(p.id, { t: 'leave' });
            else if (r < 0.85) t.act(p.id, { t: 'bet', round: t.g.round, go: rnd() < 0.6 });
          }
          if (t.g.phase === 'talk') { const timer = nextTimer(t.room)!; t.ctx.now = timer.at; t.host(timer.action); }
        } else t.host({ t: 'next' });
      }
      expect(t.room.players.every(p => p.score >= 0)).toBe(true);
      expect(t.room.players.reduce((a, p) => a + p.score, 0)).toBe(BLUFF_START * n);
    }
  }, 120_000);
});
