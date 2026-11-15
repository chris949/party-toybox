import { describe, expect, it } from 'vitest';
import { BLEND_D, BLEND_FIND, BLEND_GAP, BLEND_READY_MS, BLEND_SPEED, BLEND_STAR_R, BLEND_STARS, BLEND_TICK_MS, BLEND_W, DEFAULT_BLEND_AMMO, DEFAULT_BLEND_CROWD, DEFAULT_BLEND_TIME } from '../src/core/constants';
import { nextTimer } from '../src/core/room';
import { viewFor } from '../src/core/view';
import type { BlendState } from '../src/modes/blend/rules';
import { samples, testRoom } from './helpers';

// ゲーム開始まで。bots = CPU の参加者にする人（番号）
function blendRoom(n: number, opts: { seed?: number; bots?: number[]; crowd?: number } = {}) {
  const t = testRoom(Array.from({ length: n }, () => samples()), { seed: opts.seed });
  // CPU の参加者の印を付ける（本番では、ホストがロビーで足したときに付く）
  if (opts.bots) { const room = structuredClone(t.room); for (const i of opts.bots) room.players[i].bot = true; t.room = room; }
  t.host({ t: 'game', mode: 'blend' });
  if (opts.crowd) t.host({ t: 'blendCrowd', n: opts.crowd });
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
      // ほかの1体にふさがれて止まることがあるので、乗れるまで、行き先を出し直す
      const on = () => Math.hypot(g().mobs[g().me].x - s.x, g().mobs[g().me].z - s.z) <= BLEND_STAR_R;
      for (let i = 0; i < 400 && !on(); i++) { t.act(g().hiderId, { t: 'go', round, x: s.x, z: s.z }); tick(); }
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
    expect([me().x, me().z]).toEqual([me().tx, me().tz]); // 着いたか、ふさがれて、その場で止まっている
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

describe('まぎれろ！：撃つ', () => {
  it('外すと、その1体が倒れて、弾が減る。倒れた1体は動かず、もう撃てない。かくれる人は撃てない', () => {
    const r = blendRoom(4);
    const [a, b] = r.seekerIds(), miss = (r.g.me + 1) % DEFAULT_BLEND_CROWD;
    r.act(a, { t: 'shoot', round: r.g.round, i: miss }); // よーいの間は撃てない
    expect(r.g.shots).toHaveLength(0);
    r.ready();
    r.act(a, { t: 'shoot', round: r.g.round, i: DEFAULT_BLEND_CROWD });
    r.act(a, { t: 'shoot', round: r.g.round, i: -1 });
    r.act(r.g.hiderId, { t: 'shoot', round: r.g.round, i: miss });
    expect(r.g.shots).toHaveLength(0);
    r.act(a, { t: 'shoot', round: r.g.round, i: miss });
    expect(r.g.phase).toBe('hide');
    expect(r.g.down).toEqual([miss]);
    expect(r.g.ammo[a]).toBe(0);
    r.act(a, { t: 'shoot', round: r.g.round, i: r.g.me }); // 弾切れ
    r.act(b, { t: 'shoot', round: r.g.round, i: miss });   // 倒れた1体は撃てない
    expect(r.g.shots).toHaveLength(1);
    expect(r.g.ammo[b]).toBe(1);
    const at = { ...r.g.mobs[miss] };
    for (let i = 0; i < 20; i++) r.tick();
    expect([r.g.mobs[miss].x, r.g.mobs[miss].z]).toEqual([at.x, at.z]);
    // 誰が撃ったか・倒れた1体・残りの弾は、全員に見える。どれが人かは、まだ見えない
    const v = viewFor(r.room, b, r.ctx.now).blend!;
    expect(v.down).toEqual([miss]);
    expect(v.shots).toEqual([{ id: a, name: r.g.names[a], i: miss, hit: false }]);
    expect([v.ammo, v.ammoMax, v.loaded, v.me, v.end]).toEqual([1, 1, 2, null, null]);
    expect(viewFor(r.room, a, r.ctx.now).blend!.ammo).toBe(0);
  });
  it('当たったら、その場で発表。当てた人だけに3点、かくれた人は0点', () => {
    const r = blendRoom(4);
    r.ready();
    const hider = r.g.hiderId, [a, b, c] = r.seekerIds(), me = r.g.me;
    r.act(a, { t: 'shoot', round: r.g.round, i: (me + 1) % DEFAULT_BLEND_CROWD });
    r.act(b, { t: 'shoot', round: r.g.round, i: me });
    expect(r.g.phase).toBe('found');
    expect(r.g.end).toBe('hit');
    r.act(c, { t: 'shoot', round: r.g.round, i: me }); // 発表のあとは、撃てない
    expect([r.score(a), r.score(b), r.score(c), r.score(hider)]).toEqual([0, BLEND_FIND, 0, 0]);
    const v = viewFor(r.room, c, r.ctx.now).blend!;
    expect(v.me).toBe(me);               // 発表では、全員に答えを見せる
    expect(v.end).toBe('hit');
    expect(v.gained).toEqual({ [b]: BLEND_FIND });
  });
  it('全員が弾を使いきったら、その場で発表。かくれた人に、さがす人の人数ぶんの点', () => {
    const r = blendRoom(4);
    r.ready();
    const hider = r.g.hiderId, me = r.g.me;
    r.seekerIds().forEach((id, n) => r.act(id, { t: 'shoot', round: r.g.round, i: (me + 1 + n) % DEFAULT_BLEND_CROWD }));
    expect(r.g.phase).toBe('found');
    expect(r.g.end).toBe('empty');
    expect(r.score(hider)).toBe(3);
    expect(r.g.down).toHaveLength(3);
  });
  it('弾の数を増やすと、その数だけ撃てる', () => {
    const t = testRoom([samples(), samples()]);
    t.act(t.ids[1], { t: 'blendAmmo', n: 3 });
    t.host({ t: 'blendAmmo', n: 4 });
    expect(t.room.blendAmmo).toBe(DEFAULT_BLEND_AMMO);
    t.host({ t: 'blendAmmo', n: 2 });
    t.host({ t: 'game', mode: 'blend' });
    t.host({ t: 'start' });
    const g = () => t.room.game as BlendState;
    t.advance(BLEND_READY_MS);
    const seeker = t.ids.find(id => id !== g().hiderId)!, me = g().me;
    t.act(seeker, { t: 'shoot', round: 0, i: (me + 1) % DEFAULT_BLEND_CROWD });
    expect(g().phase).toBe('hide');
    t.act(seeker, { t: 'shoot', round: 0, i: (me + 2) % DEFAULT_BLEND_CROWD });
    expect(g().end).toBe('empty');
  });
  it('ほしを集めきったら逃げ切り：かくれた人に、さがす人の人数ぶんの点', () => {
    const r = blendRoom(4);
    r.ready();
    const hider = r.g.hiderId;
    for (let n = 0; n < BLEND_STARS; n++) r.collect();
    expect(r.g.end).toBe('stars');
    expect(r.score(hider)).toBe(3);
  });
  it('時間切れは引き分け：ほしを集めきれなければ、かくれた人は0点', () => {
    const r = blendRoom(3);
    r.ready();
    r.collect(); r.collect();
    const hider = r.g.hiderId;
    r.finish();
    expect(r.g.stars).toBe(2);
    expect(r.g.end).toBe('time');
    expect(r.room.players.every(p => p.score === 0)).toBe(true);
    expect(r.score(hider)).toBe(0);
  });
});

describe('まぎれろ！：体が重ならない', () => {
  it('最初の位置も、動いている間も、決めた近さより近づかない（人が動かす1体も同じ）', () => {
    for (const seed of [3, 11, 29]) {
      const r = blendRoom(3, { seed, crowd: 16 });
      expect(r.g.mobs).toHaveLength(16);
      // 最初は、きっちり離れている
      const nearest = () => {
        const m = r.g.mobs;
        let min = Infinity;
        for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) min = Math.min(min, Math.hypot(m[i].x - m[j].x, m[i].z - m[j].z));
        return min;
      };
      expect(nearest()).toBeGreaterThan(BLEND_GAP - 0.001);
      r.ready();
      // 動いている間は、何体かが同じ場所へ集まった瞬間だけ、少し近づくことがある。すぐに押し離される
      let ticks = 0, close = 0;
      for (let i = 0; i < 300 && r.g.phase === 'hide'; i++) {
        // かくれる人は、ほかの1体のいる場所へ、わざと歩いていく
        if (i % 10 === 0) { const o = r.g.mobs[(r.g.me + 1 + i / 10) % 16 | 0]; r.act(r.g.hiderId, { t: 'go', round: r.g.round, x: o.x, z: o.z }); }
        r.tick();
        ticks++;
        if (nearest() < BLEND_GAP * 0.8) close++;
        expect(nearest()).toBeGreaterThan(BLEND_GAP * 0.3);
      }
      expect(close / ticks).toBeLessThan(0.1);
    }
  });
  it('ほしの輪は、近づける近さより広い（真ん中に誰かがいても、となりで乗れる）', () => {
    expect(BLEND_STAR_R).toBeGreaterThan(BLEND_GAP);
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
  it('30ゲーム：CPU だけでも止まらず、かくれる CPU はほしを集め、位置はいつも舞台の中（撃つ回も混ぜる）', () => {
    let collected = 0, rounds = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const n = 2 + seed % 4;
      const r = blendRoom(n, { seed: seed * 104729, bots: Array.from({ length: n - 1 }, (_, i) => i + 1) });
      for (let round = 0; round < n; round++) {
        expect(r.g.phase).toBe('hide');
        r.advance(BLEND_READY_MS);
        // 半分のゲームでは、さがす人がでたらめに撃つ（当たる・全員が弾切れ、で終わる回も通す）
        if (seed % 2) for (const id of r.seekerIds()) r.act(id, { t: 'shoot', round: r.g.round, i: Math.floor(r.ctx.random() * r.g.mobs.length) });
        const shot = r.g.shots.length > 0;
        r.finish();
        expect(r.g.phase).toBe('found');
        expect(r.g.end).not.toBeNull();
        if (r.g.end === 'hit') expect(r.g.shots[r.g.shots.length - 1].hit).toBe(true);
        expect(r.g.mobs.every(m => Math.abs(m.x) <= BLEND_W / 2 && Math.abs(m.z) <= BLEND_D / 2)).toBe(true);
        if (r.g.auto && !shot) { collected += r.g.stars; rounds++; }
        r.host({ t: 'next' });
      }
      expect(r.g.phase).toBe('result');
      expect(r.room.players.every(p => p.score >= 0)).toBe(true);
    }
    expect(collected / rounds).toBeGreaterThan(2); // かくれる CPU は、たいてい3つ集めきる
  }, 120_000);
});
