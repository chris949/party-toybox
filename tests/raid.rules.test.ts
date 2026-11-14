import { describe, expect, it } from 'vitest';
import { RAID_CPU_MS, RAID_SEATS } from '../src/core/constants';
import { nextTimer } from '../src/core/room';
import { viewFor } from '../src/core/view';
import { sanitizeRaidAction } from '../src/modes/raid/actions';
import { decideAction, getActorId, playOut } from '../src/modes/raid/engine';
import type { RaidState } from '../src/modes/raid/rules';
import { custom, testRoom } from './helpers';

// ゲーム開始まで。操作のたびに部屋を丸ごと写すので、お題は小さいもの1つにする
function raidRoom(n: number, opts: { seed?: number; mode?: 'quick' | 'standard'; bots?: number[] } = {}) {
  const t = testRoom(Array.from({ length: n }, () => [custom('軽いお題')]), { seed: opts.seed });
  if (opts.bots) { const room = structuredClone(t.room); for (const i of opts.bots) room.players[i].bot = true; t.room = room; }
  t.host({ t: 'game', mode: 'raid' });
  if (opts.mode) t.host({ t: 'raidMode', mode: opts.mode });
  t.host({ t: 'start' });
  const g = () => t.room.game as RaidState;
  return {
    ids: t.ids, ctx: t.ctx, act: t.act, host: t.host, advance: t.advance,
    get room() { return t.room; },
    get g() { return g(); },
    actorId() { const a = getActorId(g().game); return a == null ? null : g().seats[a]; },
    // 番の人が、CPU と同じ決め方で一手進める（人の席）。CPU の席なら、時間を進めて合図を出す
    step() {
      const id = this.actorId();
      if (id && !t.room.players.find(p => p.id === id)?.bot) return t.act(id, { t: 'raidAct', seq: g().seq, action: decideAction(g().game) });
      t.advance(RAID_CPU_MS);
      return t.host({ t: 'tick' });
    },
    score(id: string) { return t.room.players.find(p => p.id === id)!.score; },
  };
}

describe('ダイスレイド：持ち込んだルール', () => {
  it('CPU だけで、最後まで進む（どちらの長さでも）', () => {
    for (const mode of ['quick', 'standard'] as const) for (let seed = 1; seed <= 5; seed++) {
      const { state } = playOut(seed * 7919, mode);
      expect(['win', 'lose']).toContain(state.result);
      expect(state.players).toHaveLength(RAID_SEATS);
    }
  });
  it('同じ種なら、同じ試合になる（ホストだけが進めても、結果がぶれない）', () => {
    expect(playOut(42, 'quick').state).toEqual(playOut(42, 'quick').state);
  });
});

describe('ダイスレイド：席', () => {
  it('席は4つ。人が座らない席は、CPU が埋める', () => {
    const r = raidRoom(2);
    expect(r.g.seats).toHaveLength(RAID_SEATS);
    expect(r.g.seats.filter(Boolean).sort()).toEqual([...r.ids].sort());
    expect(r.g.game.players).toHaveLength(RAID_SEATS);
    r.g.seats.forEach((id, seat) => expect(r.g.game.players[seat].isCpu).toBe(id == null));
    expect(new Set(r.g.game.players.map(p => p.classId)).size).toBe(RAID_SEATS);
  });
  it('職業：ロビーで選んだ人は、その職業。選んでいない人と CPU の席は、まだ誰も使っていない職業', () => {
    const t = testRoom(Array.from({ length: 3 }, () => [custom('軽いお題')]));
    t.host({ t: 'game', mode: 'raid' });
    t.act(t.ids[0], { t: 'raidClass', classId: 'archer' });
    t.act(t.ids[1], { t: 'raidClass', classId: 'archer' }); // 同じ職業を選んでもよい
    t.act(t.ids[2], { t: 'raidClass', classId: 'ninja' as never }); // 知らない職業は、選ばなかったことになる
    expect(viewFor(t.room, t.ids[0], t.ctx.now).players.map(p => p.raidClass)).toEqual(['archer', 'archer', null]);
    t.host({ t: 'start' });
    const g = t.room.game as RaidState;
    const classOf = (id: string | null) => g.game.players[g.seats.indexOf(id)].classId;
    expect(classOf(t.ids[0])).toBe('archer');
    expect(classOf(t.ids[1])).toBe('archer');
    const rest = [classOf(t.ids[2]), classOf(null)];
    expect(rest).not.toContain('archer');
    expect(new Set(rest).size).toBe(2);
    // ゲームが始まったあとは、変えられない
    const before = t.room;
    t.act(t.ids[0], { t: 'raidClass', classId: 'mage' });
    expect(t.room).toBe(before);
  });
  it('5人以上では、始められない。長さは、ホストだけが変えられる', () => {
    const t = testRoom(Array.from({ length: 5 }, () => [custom('軽いお題')]));
    t.host({ t: 'game', mode: 'raid' });
    expect(viewFor(t.room, t.ids[0], t.ctx.now).startError).toContain('4人まで');
    t.host({ t: 'start' });
    expect(t.room.game).toBeNull();
    t.act(t.ids[1], { t: 'raidMode', mode: 'standard' });
    t.host({ t: 'raidMode', mode: 'long' as never });
    expect(t.room.raidMode).toBe('quick');
    t.host({ t: 'raidMode', mode: 'standard' });
    expect(t.room.raidMode).toBe('standard');
  });
  it('全員に、同じ盤面を送る。自分の席だけが、人によって違う', () => {
    const r = raidRoom(3);
    const views = r.ids.map(id => viewFor(r.room, id, r.ctx.now).raid!);
    expect(views[1].game).toEqual(views[0].game);
    expect(views.map(v => v.mySeat).sort()).toEqual(r.ids.map(id => r.g.seats.indexOf(id)).sort());
    expect(views.every(v => v.mySeat >= 0)).toBe(true);
  });
});

describe('ダイスレイド：操作', () => {
  it('自分の席の番のときだけ、操作できる。誰の操作かは、席で決まる', () => {
    const r = raidRoom(4);
    const actor = r.actorId()!, other = r.ids.find(id => id !== actor)!;
    const action = decideAction(r.g.game);
    const before = r.room;
    r.act(other, { t: 'raidAct', seq: r.g.seq, action });                 // 番でない人
    r.act(actor, { t: 'raidAct', seq: r.g.seq + 1, action });             // 古い・先の番号
    r.act(actor, { t: 'raidAct', seq: r.g.seq, action: { type: 'attack', playerId: 0, target: { kind: 'boss' } } }); // いまはできない行動
    expect(r.room).toBe(before);
    // 届いた playerId が他人の番号でも、送ってきた人の席として扱う
    r.act(actor, { t: 'raidAct', seq: r.g.seq, action: { ...action, playerId: (r.g.seats.indexOf(actor) + 1) % RAID_SEATS } });
    expect(r.g.seq).toBe(1);
    expect(r.g.events.length).toBeGreaterThan(0);
  });
  it('届いた操作は、検査して整える（知らない形は捨てる）', () => {
    expect(sanitizeRaidAction(null)).toBeNull();
    expect(sanitizeRaidAction({ type: 'hack' })).toBeNull();
    expect(sanitizeRaidAction({ type: 'adjust', die: 2, delta: 1 })).toBeNull();
    expect(sanitizeRaidAction({ type: 'attack', target: { kind: 'enemy', id: 'x' } })).toBeNull();
    expect(sanitizeRaidAction({ type: 'attack', target: { kind: 'enemy', id: 3 }, extra: 'x' })).toEqual({ type: 'attack', playerId: 0, target: { kind: 'enemy', id: 3 } });
    expect(sanitizeRaidAction({ type: 'pickChip', index: null })).toEqual({ type: 'pickChip', playerId: 0, index: null });
    expect(sanitizeRaidAction({ type: 'roll', playerId: 3 })).toEqual({ type: 'roll', playerId: 0 });
  });
  it('CPU の席は、少し間を置いて、ホストの合図で進む。人の番では、合図は何もしない', () => {
    const r = raidRoom(1 + 1); // 人2人＋CPU の席2つ
    // CPU の席の番になるまで、人の席を進める
    for (let i = 0; i < 400 && r.actorId() != null; i++) r.step();
    expect(r.actorId()).toBeNull(); // 番の人の席が CPU
    expect(r.g.phase).toBe('raid');
    expect(nextTimer(r.room)).toEqual({ at: r.g.actAt + RAID_CPU_MS, action: { t: 'tick' } });
    const seq = r.g.seq;
    r.host({ t: 'tick' });            // まだ早い
    r.act(r.ids[1], { t: 'tick' });   // ホスト以外
    expect(r.g.seq).toBe(seq);
    r.advance(RAID_CPU_MS);
    r.host({ t: 'tick' });
    expect(r.g.seq).toBe(seq + 1);
  });
  it('切断した人の席は、CPU が代わりに動かす', () => {
    const r = raidRoom(3);
    for (let i = 0; i < 400 && (r.actorId() == null || r.actorId() === r.ids[0]); i++) r.step();
    const gone = r.actorId()!;
    expect(gone).not.toBe(r.ids[0]);
    r.act(gone, { t: 'leave' });
    const seq = r.g.seq;
    r.advance(RAID_CPU_MS);
    r.host({ t: 'tick' });
    expect(r.g.seq).toBe(seq + 1);
  });
});

describe('シミュレーション', () => {
  it('12ゲーム：人と CPU が混ざっても、最後まで進み、貢献度が点になる', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const n = 1 + seed % 4 === 0 ? 2 : 2 + seed % 3;
      const r = raidRoom(n, { seed: seed * 104729, mode: 'quick', bots: seed % 2 ? [n - 1] : [] });
      for (let i = 0; i < 6000 && r.g.phase === 'raid'; i++) r.step();
      expect(r.g.phase).toBe('result');
      expect(['win', 'lose']).toContain(r.g.game.result);
      expect(nextTimer(r.room)).toBeNull();
      expect(r.ids.every(id => r.score(id) >= 0)).toBe(true);
      r.host({ t: 'lobby' });
      expect(r.room.game).toBeNull();
    }
  }, 120_000);
});
