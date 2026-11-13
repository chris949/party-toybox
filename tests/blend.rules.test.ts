import { describe, expect, it } from 'vitest';
import { BLEND_D, BLEND_FIND, BLEND_READY_MS, BLEND_SPEED, BLEND_STARS, BLEND_TICK_MS, BLEND_W, DEFAULT_BLEND_CROWD, DEFAULT_BLEND_TIME } from '../src/core/constants';
import { nextTimer } from '../src/core/room';
import { viewFor } from '../src/core/view';
import type { BlendState } from '../src/modes/blend/rules';
import { samples, testRoom } from './helpers';

// ゲーム開始まで。bots = CPU の参加者にする人（番号）
function blendRoom(n: number, opts: { seed?: number; bots?: number[] } = {}) {
  const t = testRoom(Array.from({ length: n }, () => samples()), { seed: opts.seed });
  // CPU の参加者の印を付ける（本番では、ホストがロビーで足したときに付く）
  if (opts.bots) { const room = structuredClone(t.room); for (const i of opts.bots) room.players[i].bot = true; t.room = room; }
  t.host({ t: 'game', mode: 'blend' });
  t.host({ t: 'start' });
  const g = () => t.room.game as BlendState;
  const tick = () => { t.advance(BLEND_TICK_MS); t.host({ t: 'tick' }); };
  return {
    ids: t.ids, ctx: t.ctx, act: t.act, host: t.host, advance: t.advance, tick,
    get room() { return t.room; },
    get g() { return g(); },
    seekerIds() { return t.ids.filter(id => id !== g().hiderId); },
    // 動き出すところまで進める
    ready() { while (t.ctx.now < g().startAt) tick(); },
    // かくれる人を、ほしまで歩かせて取る
    collect() {
      for (let i = 0; i < 400 && !g().star; i++) tick();
      const s = g().star!, round = g().round;
      t.act(g().hiderId, { t: 'go', round, x: s.x, z: s.z });
      for (let i = 0; i < 400 && (g().mobs[g().me].x !== s.x || g().mobs[g().me].z !== s.z); i++) tick();
      t.act(g().hiderId, { t: 'grab', round });
    },
    // 時間切れまで進める
    finish() { for (let i = 0; i < 2000 && g().phase === 'hide'; i++) tick(); },
    score(id: string) { return t.room.players.find(p => p.id === id)!.score; },
  };
}

describe('まぎれろ！：始まり', () => {
  it('決めた数のキャラクターが舞台にいて、1体だけが人。最初は全員止まっている', () => {
    const r = blendRoom(3);
    expect(r.g.phase).toBe('hide');
    expect(r.g.mobs).toHaveLength(DEFAULT_BLEND_CROWD);
    expect(r.g.me).toBeGreaterThanOrEqual(0);
    expect(r.g.me).toBeLessThan(DEFAULT_BLEND_CROWD);
    expect(r.g.deadline - r.g.startAt).toBe(DEFAULT_BLEND_TIME * 1000);
    const before = JSON.stringify(r.g.mobs.map(m => [m.x, m.z]));
    r.tick(); r.tick();
    expect(r.ctx.now).toBeLessThan(r.g.startAt);
    expect(JSON.stringify(r.g.mobs.map(m => [m.x, m.z]))).toBe(before);
    expect(nextTimer(r.room)).toEqual({ at: r.g.lastTick + BLEND_TICK_MS, action: { t: 'tick' } });
  });
  it('どれが人かは、かくれている本人にだけ送る。位置は全員に同じものを送る', () => {
    const r = blendRoom(3);
    const hider = viewFor(r.room, r.g.hiderId, r.ctx.now).blend!;
    expect(hider.me).toBe(r.g.me);
    for (const id of r.seekerIds()) {
      const v = viewFor(r.room, id, r.ctx.now).blend!;
      expect(v.me).toBeNull();
      expect(v.canGrab).toBe(false);
      expect(v.pos).toEqual(hider.pos);
      expect(v.pos).toHaveLength(DEFAULT_BLEND_CROWD * 2);
      expect(JSON.stringify(v)).not.toContain('"auto"');
    }
  });
});

describe('まぎれろ！：動く', () => {
  it('全員が同じ速さで歩き、舞台の外に出ない。かくれる人は、タップした場所へ歩く', () => {
    const r = blendRoom(3);
    r.ready();
    const me = () => r.g.mobs[r.g.me];
    r.act(r.g.hiderId, { t: 'go', round: r.g.round, x: 99, z: -99 }); // 舞台の外は、ふちに収める
    expect(Math.abs(me().tx)).toBeLessThanOrEqual(BLEND_W / 2);
    expect(Math.abs(me().tz)).toBeLessThanOrEqual(BLEND_D / 2);
    for (let i = 0; i < 100; i++) {
      const before = r.g.mobs.map(m => [m.x, m.z]);
      r.tick();
      r.g.mobs.forEach((m, k) => {
        expect(Math.hypot(m.x - before[k][0], m.z - before[k][1])).toBeLessThanOrEqual(BLEND_SPEED * BLEND_TICK_MS / 1000 + 1e-9);
        expect(Math.abs(m.x)).toBeLessThanOrEqual(BLEND_W / 2);
        expect(Math.abs(m.z)).toBeLessThanOrEqual(BLEND_D / 2);
      });
    }
    expect([me().x, me().z]).toEqual([me().tx, me().tz]);
  });
  it('さがす人は動かせない。かくれる人でも、前のラウンドの操作は効かない', () => {
    const r = blendRoom(3);
    r.ready();
    const before = r.room;
    r.act(r.seekerIds()[0], { t: 'go', round: r.g.round, x: 0, z: 0 });
    r.act(r.g.hiderId, { t: 'go', round: r.g.round + 1, x: 0, z: 0 });
    r.act(r.ids[1], { t: 'tick' }); // 時間を進められるのは、ホストだけ
    expect(r.room).toBe(before);
  });
  it('ほしは、乗っているときだけ取れる。3つ集めきったら、その場で発表へ進む', () => {
    const r = blendRoom(3);
    r.ready();
    for (let i = 0; i < 400 && !r.g.star; i++) r.tick();
    expect(r.g.star).not.toBeNull();
    const s = r.g.star!;
    // 遠くにいるときは取れない
    r.act(r.g.hiderId, { t: 'go', round: r.g.round, x: s.x > 0 ? -5 : 5, z: s.z });
    for (let i = 0; i < 60; i++) r.tick();
    r.act(r.g.hiderId, { t: 'grab', round: r.g.round });
    expect(r.g.stars).toBe(0);
    for (let n = 1; n <= BLEND_STARS; n++) {
      expect(r.g.phase).toBe('hide');
      r.collect();
      expect(r.g.stars).toBe(n);
      expect(r.g.star).toBeNull();
    }
    expect(r.g.phase).toBe('found'); // 時間が残っていても、待たずに終わる
    expect(r.ctx.now).toBeLessThan(r.g.startAt + DEFAULT_BLEND_TIME * 1000);
    expect(nextTimer(r.room)).toBeNull();
  });
  it('CPU がほしに乗っても、ほしは消えない', () => {
    const r = blendRoom(3);
    r.ready();
    for (let i = 0; i < 400 && !r.g.star; i++) r.tick();
    const s = { ...r.g.star! };
    // かくれる人は、ほしから遠い所で動かない
    r.act(r.g.hiderId, { t: 'go', round: r.g.round, x: s.x > 0 ? -5.5 : 5.5, z: s.z > 0 ? -3 : 3 });
    for (let i = 0; i < 150 && r.g.phase === 'hide'; i++) r.tick();
    expect(r.g.star).toEqual(s);
    expect(r.g.stars).toBe(0);
  });
});

describe('まぎれろ！：当てる', () => {
  it('選び直せる。かくれる人は選べない。範囲の外は選べない', () => {
    const r = blendRoom(3);
    const [a] = r.seekerIds();
    r.act(a, { t: 'suspect', round: r.g.round, i: 2 });
    r.act(a, { t: 'suspect', round: r.g.round, i: 5 });
    expect(r.g.guesses[a]).toBe(5);
    r.act(a, { t: 'suspect', round: r.g.round, i: DEFAULT_BLEND_CROWD });
    r.act(a, { t: 'suspect', round: r.g.round, i: -1 });
    r.act(r.g.hiderId, { t: 'suspect', round: r.g.round, i: 1 });
    expect(r.g.guesses).toEqual({ [a]: 5 });
    // ほかの人が誰を選んでいるかは、発表まで送らない
    expect(viewFor(r.room, r.seekerIds()[1], r.ctx.now).blend!.guesses).toBeNull();
    expect(viewFor(r.room, r.seekerIds()[1], r.ctx.now).blend!.myGuess).toBeNull();
    expect(viewFor(r.room, a, r.ctx.now).blend!.myGuess).toBe(5);
  });
  it('当てた人に2点。かくれた人は、ほしを集めきっていれば、だませた人数ぶんの点', () => {
    const r = blendRoom(4);
    r.ready();
    for (let n = 0; n < BLEND_STARS - 1; n++) r.collect();
    const hider = r.g.hiderId, [a, b, c] = r.seekerIds(), me = r.g.me;
    // 集めきられる前に選んでいたもので、判定する
    r.act(a, { t: 'suspect', round: r.g.round, i: me });
    r.act(b, { t: 'suspect', round: r.g.round, i: (me + 1) % DEFAULT_BLEND_CROWD });
    r.collect();
    r.act(c, { t: 'suspect', round: r.g.round, i: me }); // 発表のあとは、選べない
    expect(r.g.phase).toBe('found');
    expect(r.score(a)).toBe(BLEND_FIND);
    expect(r.score(b)).toBe(0);
    expect(r.score(c)).toBe(0);          // 選ばなかった人も、だまされた人に数える
    expect(r.score(hider)).toBe(2);
    const v = viewFor(r.room, b, r.ctx.now).blend!;
    expect(v.me).toBe(me);               // 発表では、全員に答えを見せる
    expect(v.guesses!.find(x => x.id === a)).toMatchObject({ i: me, ok: true });
    expect(v.gained).toEqual({ [a]: BLEND_FIND, [hider]: 2 });
  });
  it('ほしを集めきれなかったら、だませても、かくれた人は0点', () => {
    const r = blendRoom(3);
    r.ready();
    r.collect(); r.collect();
    const hider = r.g.hiderId;
    r.finish();
    expect(r.g.stars).toBe(2);
    expect(r.score(hider)).toBe(0);
  });
});

describe('まぎれろ！：進行', () => {
  it('全員が1回ずつかくれたら終わり。ホストが次へ進める', () => {
    const r = blendRoom(3);
    const hiders: string[] = [];
    for (let round = 0; round < 3; round++) {
      expect(r.g.round).toBe(round);
      hiders.push(r.g.hiderId);
      r.act(r.seekerIds()[0], { t: 'next' }); // かくれている間は進めない
      expect(r.g.phase).toBe('hide');
      r.host({ t: 'force' });
      expect(r.g.phase).toBe('found');
      expect(nextTimer(r.room)).toBeNull();
      r.host({ t: 'next' });
    }
    expect(new Set(hiders).size).toBe(3);
    expect(r.g.phase).toBe('result');
    r.host({ t: 'lobby' });
    expect(r.room.game).toBeNull();
  });
  it('かくれる人がいなくなったら、その回は流れる（点なし）', () => {
    const r = blendRoom(3);
    r.ready();
    const hider = r.g.hiderId, [a] = r.seekerIds();
    if (hider === r.ids[0]) return; // ホストが抜けると部屋がなくなるので、この種では確かめない
    r.act(a, { t: 'suspect', round: r.g.round, i: r.g.me });
    r.act(hider, { t: 'leave' });
    expect(r.g.phase).toBe('found');
    expect(r.g.void).toBe(true);
    expect(r.score(a)).toBe(0);
  });
  it('設定：かくれる時間とキャラクターの数は、ホストだけが、決まった値に変えられる', () => {
    const t = testRoom([samples(), samples()]);
    t.act(t.ids[1], { t: 'blendTime', sec: 30 });
    t.host({ t: 'blendCrowd', n: 9 });
    expect([t.room.blendTime, t.room.blendCrowd]).toEqual([DEFAULT_BLEND_TIME, DEFAULT_BLEND_CROWD]);
    t.host({ t: 'blendTime', sec: 30 });
    t.host({ t: 'blendCrowd', n: 16 });
    expect([t.room.blendTime, t.room.blendCrowd]).toEqual([30, 16]);
  });
});

describe('シミュレーション', () => {
  it('30ゲーム：CPU だけでも止まらず、かくれる CPU はほしを集め、位置はいつも舞台の中', () => {
    let collected = 0, rounds = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const n = 2 + seed % 4;
      const r = blendRoom(n, { seed: seed * 104729, bots: Array.from({ length: n - 1 }, (_, i) => i + 1) });
      for (let round = 0; round < n; round++) {
        expect(r.g.phase).toBe('hide');
        r.advance(BLEND_READY_MS);
        for (const id of r.seekerIds()) r.act(id, { t: 'suspect', round: r.g.round, i: Math.floor(r.ctx.random() * r.g.mobs.length) });
        r.finish();
        expect(r.g.phase).toBe('found');
        expect(r.g.mobs.every(m => Math.abs(m.x) <= BLEND_W / 2 && Math.abs(m.z) <= BLEND_D / 2)).toBe(true);
        if (r.g.auto) { collected += r.g.stars; rounds++; }
        r.host({ t: 'next' });
      }
      expect(r.g.phase).toBe('result');
      expect(r.room.players.every(p => p.score >= 0)).toBe(true);
    }
    expect(collected / rounds).toBeGreaterThan(2); // かくれる CPU は、たいてい3つ集めきる
  }, 120_000);
});
