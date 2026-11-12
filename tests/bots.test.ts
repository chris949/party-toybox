// CPU の参加者（docs/spec.md の2.1）と、最少人数
import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, MIN_PLAYERS_DEFAULT } from '../src/core/constants';
import { createRoom, reduce, startErrorOf } from '../src/core/room';
import { seeded } from '../src/core/random';
import type { Action, RoomState } from '../src/core/types';
import { viewFor } from '../src/core/view';
import { samples } from './helpers';

function lobby() {
  const ctx = { now: 1_000_000, random: seeded(1) };
  let room: RoomState = createRoom('TEST01', 'host', MIN_PLAYERS_DEFAULT);
  const act = (from: string, a: Action) => { room = reduce(room, { ...a, from } as never, ctx); return room; };
  act('host', { t: 'join', name: 'ホスト', key: 'k', topics: samples(), version: 'test' });
  const addBot = (n: number) => act(`bot${n}`, { t: 'join', name: `CPU${n}`, key: 'bot', topics: [], version: 'test', bot: true });
  return { act, addBot, get room() { return room; } };
}

describe('最少人数', () => {
  it('2人から始められる', () => {
    expect(MIN_PLAYERS_DEFAULT).toBe(2);
    const t = lobby();
    expect(startErrorOf(t.room)).toContain('あと1人');
    t.act('p1', { t: 'join', name: 'たろう', key: 'k1', topics: samples(), version: 'test' });
    expect(startErrorOf(t.room)).toBeNull();
    t.act('host', { t: 'start' });
    expect(t.room.game?.kind).toBe('tier');
  });
});

describe('CPU の参加者', () => {
  it('お題を持たずに入れる。名前の一覧では CPU だと分かる', () => {
    const t = lobby();
    t.addBot(1);
    expect(t.room.players.map(p => [p.id, !!p.bot])).toEqual([['host', false], ['bot1', true]]);
    expect(viewFor(t.room, 'host', 0).players.map(p => p.bot)).toEqual([false, true]);
    // 人は、お題なしでは入れない（今までどおり）
    t.act('p1', { t: 'join', name: 'たろう', key: 'k1', topics: [], version: 'test' });
    expect(t.room.players).toHaveLength(2);
  });
  it('CPU が動くのは、運命の二者択一とハイカー575 だけ。ほかのモードでは始められない', () => {
    const t = lobby();
    t.addBot(1);
    expect(startErrorOf(t.room)).toContain('CPU');
    t.act('host', { t: 'start' });
    expect(t.room.game).toBeNull();
    for (const mode of ['fate', 'haiku'] as const) {
      t.act('host', { t: 'game', mode });
      expect(startErrorOf(t.room)).toBeNull(); // 人1人＋CPU1人でも始められる
    }
    t.act('host', { t: 'game', mode: 'five' });
    expect(startErrorOf(t.room)).toContain('CPU');
    t.act('host', { t: 'kick', id: 'bot1' }); // 外せば、人数の条件に戻る
    expect(t.room.players).toHaveLength(1);
    expect(startErrorOf(t.room)).toContain('あと1人');
  });
  it('部屋は合わせて10人まで', () => {
    const t = lobby();
    for (let n = 1; n <= 12; n++) t.addBot(n);
    expect(t.room.players).toHaveLength(MAX_PLAYERS);
  });
  it('人とCPUで、ハイカー575 を始められる（CPU の短冊はサンプルのお題になる）', () => {
    const t = lobby();
    t.addBot(1); t.addBot(2);
    t.act('host', { t: 'game', mode: 'haiku' });
    t.act('host', { t: 'start' });
    expect(t.room.game?.kind).toBe('haiku');
    if (t.room.game?.kind === 'haiku') expect(t.room.game.sheets.every(s => s.themeBy === 'サンプル')).toBe(true);
  });
});
