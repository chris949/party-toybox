import { createRoom, reduce } from '../src/core/room';
import { seeded } from '../src/core/random';
import type { Action, Ctx, RoomState } from '../src/core/types';
import type { TierState } from '../src/modes/tier/rules';
import type { FiveState } from '../src/modes/five/rules';
import type { Topic } from '../src/core/topics';
import { SAMPLE_TOPICS } from '../src/core/topics';

export const samples = (): Topic[] => SAMPLE_TOPICS.map(([title, options]) => ({ title, options, count: options.length }));
export const custom = (title: string, n = 5, count = 5): Topic => ({ title, options: Array.from({ length: n }, (_, i) => `${title}-${i + 1}`), count });

// 時刻と乱数を自由に動かせるテスト用の部屋
export function testRoom(topicsByPlayer: Topic[][], opts: { seed?: number; minPlayers?: number } = {}) {
  const ctx: Ctx = { now: 1_000_000, random: seeded(opts.seed ?? 1) };
  const ids = topicsByPlayer.map((_, i) => `p${i}`);
  let room: RoomState = createRoom('TEST01', ids[0], opts.minPlayers ?? 2);
  topicsByPlayer.forEach((topics, i) => {
    room = reduce(room, { t: 'join', from: ids[i], name: `プレイヤー${i}`, key: `k${i}`, topics, version: 'test' }, ctx);
  });
  const act = (from: string, a: Action) => { room = reduce(room, { ...a, from } as never, ctx); return room; };
  return {
    ids, ctx,
    get room() { return room; },
    get tier() { return room.game as TierState; },
    get five() { return room.game as FiveState; },
    set room(r: RoomState) { room = r; },
    act,
    host: (a: Action) => act(ids[0], a),
    advance(ms: number) { ctx.now += ms; },
  };
}
