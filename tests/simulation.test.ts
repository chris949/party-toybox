// CPU の参加者で何百回も遊ばせて、途中で止まらないか・問題数・得点に偏りがないかを見る
import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS } from '../src/core/constants';
import { nextTimer } from '../src/core/room';
import { seeded } from '../src/core/random';
import { validOrder } from '../src/modes/tier/rules';
import { custom, samples, testRoom } from './helpers';

function playOne(seed: number) {
  const rnd = seeded(seed * 7919);
  const n = 4 + Math.floor(rnd() * (MAX_PLAYERS - 3));
  const topics = Array.from({ length: n }, (_, i) => rnd() < 0.5 ? samples() : [custom(`P${i}`, 5 + Math.floor(rnd() * 20), 5 + Math.floor(rnd() * 6))]);
  const t = testRoom(topics, { seed, minPlayers: 4 });
  if (rnd() < 0.5) t.host({ t: 'mode', mode: 'each' });
  t.host({ t: 'start' });
  if (!t.room.game) return { started: false, n };
  let steps = 0;
  const g = () => t.room.game!;
  while (g().phase !== 'result') {
    if (++steps > 5000) throw new Error(`止まった: seed=${seed} phase=${g().phase}`);
    const phase = g().phase;
    if (phase === 'ranking' || phase === 'guess') {
      // それぞれ、決定する／途中で時間切れ／何もしない／切断する をランダムに
      for (const p of t.room.players.filter(x => x.online)) {
        const r = rnd();
        if (p.id !== t.ids[0] && r < 0.03) { t.act(p.id, { t: 'leave' }); continue; }
        if (phase === 'ranking' && !g().ranks[p.id]) {
          const len = g().assign[p.id].options.length;
          if (r < 0.7) t.act(p.id, { t: 'rank', order: [...Array(len).keys()].sort(() => rnd() - 0.5) });
          else if (r < 0.85) t.act(p.id, { t: 'rank', order: [0, ...Array(len - 1).fill(null)], partial: true });
        } else if (phase === 'guess' && g().phase === 'guess' && g().order[g().round] !== p.id && !g().guesses[p.id]) {
          const len = g().assign[g().order[g().round]].options.length;
          if (r < 0.8) t.act(p.id, { t: 'guess', round: g().round, order: [...Array(len).keys()].sort(() => rnd() - 0.5) });
        }
        if (t.room.game!.phase !== phase) break;
      }
      if (g().phase === phase) { const timer = nextTimer(t.room)!; t.ctx.now = timer.at; t.host(timer.action); }
    } else if (phase === 'reveal') {
      const timer = nextTimer(t.room);
      if (timer) { t.ctx.now = timer.at; t.host(timer.action); }
      else t.host({ t: 'next' });
    }
  }
  return { started: true, n, rounds: g().order.length, assigned: Object.keys(g().assign).length, ranks: g().ranks, assign: g().assign, scores: t.room.players.map(p => p.score) };
}

describe('シミュレーション', () => {
  it('300ゲーム：止まらず、問題数＝配った人数、並びはすべて正しい', () => {
    let started = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = playOne(seed);
      if (!r.started) continue;
      started++;
      expect(r.rounds).toBe(r.assigned);
      for (const [id, order] of Object.entries(r.ranks!)) expect(validOrder(order, r.assign![id].options.length)).toBe(true);
      expect(r.scores!.every(s => s >= 0)).toBe(true);
    }
    expect(started).toBeGreaterThan(250);
  }, 120_000);
});
