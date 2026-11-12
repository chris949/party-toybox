import { describe, expect, it } from 'vitest';
import { PERFECT_BONUS, PICK_GRACE_MS, DEFAULT_TIME_LIMIT } from '../src/core/constants';
import { joinError, nextTimer, reduce } from '../src/core/room';
import { seeded } from '../src/core/random';
import { fillRandom, validOrder } from '../src/modes/tier/rules';
import { viewFor } from '../src/core/view';
import { custom, samples, testRoom } from './helpers';

const identity = (n: number) => [...Array(n).keys()];

describe('参加', () => {
  it('同じIDでも鍵が違えば断る（なりすまし防止）', () => {
    const t = testRoom([samples(), samples()]);
    expect(joinError(t.room, 'p1', { t: 'join', name: 'x', key: 'wrong', topics: samples(), version: '' })).toBe('この参加者は既に部屋にいます');
    expect(joinError(t.room, 'p1', { t: 'join', name: 'x', key: 'k1', topics: samples(), version: '' })).toBeNull();
  });
  it('ゲーム中の新規参加・満員・お題なしを断る', () => {
    const t = testRoom(Array.from({ length: 10 }, () => samples()));
    expect(joinError(t.room, 'new', { t: 'join', name: 'x', key: 'k', topics: samples(), version: '' })).toMatch('満員');
    const t2 = testRoom([samples(), samples()]);
    expect(joinError(t2.room, 'new', { t: 'join', name: 'x', key: 'k', topics: [], version: '' })).toMatch('お題');
    t2.host({ t: 'start' });
    expect(joinError(t2.room, 'new', { t: 'join', name: 'x', key: 'k', topics: samples(), version: '' })).toMatch('進行中');
  });
  it('ホスト以外は開始・設定変更できない', () => {
    const t = testRoom([samples(), samples()]);
    t.act('p1', { t: 'mode', mode: 'each' });
    t.act('p1', { t: 'start' });
    expect(t.room.pickMode).toBe('random');
    expect(t.room.game).toBeNull();
  });
});

describe('お題の配り方', () => {
  it('同じお題は1つにまとめる。全員サンプルなら作成者は「サンプル」', () => {
    const t = testRoom([samples(), samples(), samples(), samples()], { minPlayers: 4 });
    t.host({ t: 'start' });
    const titles = Object.values(t.tier.assign).map(a => a.title);
    expect(new Set(titles).size).toBe(4);
    expect(Object.values(t.tier.assign).every(a => a.authorName === 'サンプル')).toBe(true);
  });
  it('自作のお題を優先する', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const t = testRoom([samples(), [...samples(), custom('B')], samples(), [...samples(), custom('D')]], { seed, minPlayers: 4 });
      t.host({ t: 'start' });
      const titles = Object.values(t.tier.assign).map(a => a.title);
      expect(titles).toContain('B');
      expect(titles).toContain('D');
    }
  });
  it('「作成者ごとに1つずつ」なら、自作のお題を持ってきた人のお題が必ず出る', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const t = testRoom([['A1', 'A2', 'A3', 'A4', 'A5'].map(n => custom(n)), [custom('B1')], samples(), [custom('D1')]], { seed, minPlayers: 4 });
      t.host({ t: 'mode', mode: 'each' });
      t.host({ t: 'start' });
      const authors = Object.values(t.tier.assign).map(a => a.authorId);
      expect(authors).toContain('p1');
      expect(authors).toContain('p3');
      // 自分のお題が自分に当たらない
      expect(Object.entries(t.tier.assign).every(([id, a]) => a.authorId !== id)).toBe(true);
    }
  });
  it('出題数だけ選択肢を出す', () => {
    const t = testRoom([[custom('20択', 20, 6)], samples()]);
    t.host({ t: 'start' });
    const a = Object.values(t.tier.assign).find(x => x.title === '20択')!;
    expect(a.options).toHaveLength(6);
    expect(new Set(a.options).size).toBe(6);
  });
  it('お題が人数より少ないと開始できない', () => {
    const t = testRoom([[custom('X')], [custom('X')]]);
    t.host({ t: 'start' });
    expect(t.room.game).toBeNull();
  });
});

describe('並び替えと時間切れ', () => {
  it('準備フェーズの時間切れは、並べた分を残して残りをランダムで埋め、問題数＝参加人数になる', () => {
    const t = testRoom([samples(), samples(), samples()]);
    t.host({ t: 'start' });
    const g = () => t.tier;
    t.host({ t: 'rank', order: identity(g().assign.p0.options.length) });
    const n1 = g().assign.p1.options.length;
    t.act('p1', { t: 'rank', order: [3, 1, ...Array(n1 - 2).fill(null)], partial: true });
    expect(g().ranks.p1.slice(0, 2)).toEqual([3, 1]);
    expect(validOrder(g().ranks.p1, n1)).toBe(true);
    // p2 は何もしない → 締め切りでランダムに埋まる
    t.advance(DEFAULT_TIME_LIMIT * 1000 + PICK_GRACE_MS);
    t.host({ t: 'timeUp' });
    expect(g().phase).toBe('guess');
    expect(g().order).toHaveLength(3);
  });
  it('ホストが選んだ制限時間で、準備と予想の締め切りが決まる', () => {
    const t = testRoom([samples(), samples(), samples()]);
    t.act('p1', { t: 'time', sec: 30 });            // ホスト以外は変えられない
    expect(t.room.timeLimit).toBe(DEFAULT_TIME_LIMIT);
    t.host({ t: 'time', sec: 45 });                  // 選択肢にない長さは受け付けない
    expect(t.room.timeLimit).toBe(DEFAULT_TIME_LIMIT);
    t.host({ t: 'time', sec: 30 });
    t.host({ t: 'start' });
    expect(t.tier.deadline).toBe(t.ctx.now + 30_000);
    t.host({ t: 'time', sec: 90 });                  // ゲーム中は変えられない
    expect(t.room.timeLimit).toBe(30);
    t.advance(30_000 + PICK_GRACE_MS);
    t.host({ t: 'timeUp' });
    expect(t.tier.phase).toBe('guess');
    expect(t.tier.deadline).toBe(t.ctx.now + 30_000);
  });
  it('制限時間はロビーに戻っても引き継ぐ', () => {
    const t = testRoom([samples(), samples()]);
    t.host({ t: 'time', sec: 90 });
    t.host({ t: 'start' });
    while (t.tier.phase !== 'result') {
      if (t.tier.phase === 'ranking' || t.tier.phase === 'guess') t.host({ t: 'force' });
      else if (t.tier.phase === 'reveal') { t.host({ t: 'reveal-all' }); t.host({ t: 'next' }); }
    }
    t.host({ t: 'lobby' });
    expect(t.room.timeLimit).toBe(90);
  });
  it('締め切り前の timeUp は無視する', () => {
    const t = testRoom([samples(), samples()]);
    t.host({ t: 'start' });
    t.advance(1000);
    t.host({ t: 'timeUp' });
    expect(t.tier.phase).toBe('ranking');
  });
  it('予想フェーズの時間切れは0点で、名前が出る', () => {
    const t = testRoom([samples(), samples(), samples()]);
    t.host({ t: 'start' });
    for (const id of t.ids) t.act(id, { t: 'rank', order: identity(t.tier.assign[id].options.length) });
    const g = t.tier;
    const tgt = g.order[0];
    const [guesser, idle] = t.ids.filter(id => id !== tgt);
    t.act(guesser, { t: 'guess', round: 0, order: identity(g.assign[tgt].options.length) });
    t.advance(DEFAULT_TIME_LIMIT * 1000 + PICK_GRACE_MS);
    t.host({ t: 'timeUp' });
    const r = t.tier.reveal!;
    expect(r.rows.map(x => x.id)).toEqual([guesser]);
    expect(r.timeouts).toEqual([t.room.players.find(p => p.id === idle)!.name]);
  });
  it('当てられる本人は予想できず、古いラウンドの予想は受け付けない', () => {
    const t = testRoom([samples(), samples(), samples()]);
    t.host({ t: 'start' });
    for (const id of t.ids) t.act(id, { t: 'rank', order: identity(t.tier.assign[id].options.length) });
    const tgt = t.tier.order[0];
    const n = t.tier.assign[tgt].options.length;
    t.act(tgt, { t: 'guess', round: 0, order: identity(n) });
    const other = t.ids.find(id => id !== tgt)!;
    t.act(other, { t: 'guess', round: 5, order: identity(n) });
    expect(t.tier.guesses).toEqual({});
  });
});

describe('答え合わせと得点', () => {
  it('最下位からめくり、1位の前に溜め、めくり終わってから得点する', () => {
    const t = testRoom([samples(), samples()]);
    t.host({ t: 'start' });
    for (const id of t.ids) t.act(id, { t: 'rank', order: identity(t.tier.assign[id].options.length) });
    const tgt = t.tier.order[0];
    const other = t.ids.find(id => id !== tgt)!;
    const n = t.tier.assign[tgt].options.length;
    t.act(other, { t: 'guess', round: 0, order: identity(n) });
    expect(t.tier.phase).toBe('reveal');
    const seen: string[] = [];
    while (!t.tier.reveal!.done) {
      const timer = nextTimer(t.room)!;
      t.ctx.now = timer.at;
      t.host(timer.action);
      const r = t.tier.reveal!;
      seen.push(r.suspense ? 'suspense' : String(r.shown));
      if (!r.done) expect(t.room.players.find(p => p.id === other)!.score).toBe(0);
    }
    expect(seen.at(-2)).toBe('suspense');
    expect(seen.at(-1)).toBe(String(n));
    expect(t.room.players.find(p => p.id === other)!.score).toBe(n + PERFECT_BONUS);
  });
  it('「残りを一気に」はホストと本人だけ', () => {
    const t = testRoom([samples(), samples(), samples()]);
    t.host({ t: 'start' });
    for (const id of t.ids) t.act(id, { t: 'rank', order: identity(t.tier.assign[id].options.length) });
    t.host({ t: 'force' });
    const tgt = t.tier.order[0];
    const other = t.ids.find(id => id !== tgt && id !== 'p0');
    if (other) {
      t.act(other, { t: 'reveal-all' });
      expect(t.tier.reveal!.done).toBe(false);
    }
    t.act(tgt, { t: 'reveal-all' });
    expect(t.tier.reveal!.done).toBe(true);
  });
});

describe('見せる情報', () => {
  it('他人の順位は答え合わせまで送らない', () => {
    const t = testRoom([samples(), samples(), samples()]);
    t.host({ t: 'start' });
    for (const id of t.ids) t.act(id, { t: 'rank', order: identity(t.tier.assign[id].options.length) });
    const tgt = t.tier.order[0];
    const other = t.ids.find(id => id !== tgt)!;
    const v = viewFor(t.room, other, t.ctx.now);
    expect(JSON.stringify(v)).not.toContain('"ranks"');
    expect(v.myRank).toEqual(t.tier.ranks[other]);
    expect(v.reveal).toBeNull();
  });
  it('鍵は誰にも送らない', () => {
    const t = testRoom([samples(), samples()]);
    expect(JSON.stringify(viewFor(t.room, 'p1', 0))).not.toContain('"key"');
  });
});

describe('fillRandom', () => {
  it('おかしな値や重複は捨てて、必ず正しい並びにする', () => {
    const ctx = { now: 0, random: seeded(3) };
    for (const input of [[], [9, 9, 9], [1, 1, null, -1], ['x', 2] as unknown[]]) {
      expect(validOrder(fillRandom(input, 5, ctx), 5)).toBe(true);
    }
  });
});

describe('ロビーに戻る', () => {
  it('オンラインの人だけ残り、得点0・設定とお題は引き継ぐ', () => {
    const t = testRoom([samples(), samples(), samples()]);
    t.host({ t: 'mode', mode: 'each' });
    t.host({ t: 'start' });
    t.act('p2', { t: 'leave' });
    t.host({ t: 'force' });
    while (t.tier.phase !== 'result') {
      if (t.tier.phase === 'guess') t.host({ t: 'force' });
      else if (t.tier.phase === 'reveal') { t.host({ t: 'reveal-all' }); t.host({ t: 'next' }); }
    }
    const before = t.room;
    t.host({ t: 'lobby' });
    expect(t.room.game).toBeNull();
    expect(t.room.players.map(p => p.id)).toEqual(['p0', 'p1']);
    expect(t.room.players.every(p => p.score === 0)).toBe(true);
    expect(t.room.pickMode).toBe('each');
    expect(t.room.gameNo).toBe(before.gameNo + 1);
    expect(t.room.topicsBy.p1).toEqual(before.topicsBy.p1);
  });
  it('reduce は渡された状態を書き換えない', () => {
    const t = testRoom([samples(), samples()]);
    const frozen = JSON.stringify(t.room);
    reduce(t.room, { t: 'start', from: 'p0' }, t.ctx);
    expect(JSON.stringify(t.room)).toBe(frozen);
  });
});

describe('予想を直す・ロビーでお題を送り直す（v0.16）', () => {
  it('決定した予想は、全員がそろうまで取り消せる', () => {
    const t = testRoom([samples(), samples(), samples()]);
    t.host({ t: 'start' });
    for (const id of t.ids) t.act(id, { t: 'rank', order: identity(t.tier.assign[id].options.length) });
    const tgt = t.tier.order[0];
    const [g1, g2] = t.ids.filter(id => id !== tgt);
    const n = t.tier.assign[tgt].options.length;
    t.act(g1, { t: 'guess', round: 0, order: identity(n) });
    t.act(g1, { t: 'retract', round: 0 });
    expect(t.tier.guesses[g1]).toBeUndefined();
    t.act(g1, { t: 'guess', round: 0, order: identity(n).reverse() });
    t.act(g2, { t: 'guess', round: 0, order: identity(n) });
    expect(t.tier.phase).toBe('reveal');
    expect(t.tier.reveal!.rows.find(r => r.id === g1)!.order).toEqual(identity(n).reverse());
  });
  it('ロビーでは持っていくお題を送り直せる。編集中の印は開始で消える。ゲーム中は送り直せない', () => {
    const t = testRoom([samples(), samples()]);
    t.act('p1', { t: 'editing', on: true });
    expect(t.room.players.find(p => p.id === 'p1')!.editing).toBe(true);
    t.act('p1', { t: 'topics', topics: [custom('新しいお題')], fives: [], fates: [] });
    expect(t.room.topicsBy.p1.map(x => x.title)).toEqual(['新しいお題']);
    t.host({ t: 'start' });
    expect(t.room.players.every(p => !p.editing)).toBe(true);
    expect(Object.values(t.tier.assign).some(a => a.title === '新しいお題')).toBe(true);
    t.act('p1', { t: 'topics', topics: samples() });
    expect(t.room.topicsBy.p1.map(x => x.title)).toEqual(['新しいお題']);
    t.act('p1', { t: 'editing', on: true });
    expect(t.room.players.find(p => p.id === 'p1')!.editing).toBeFalsy();
  });
});
