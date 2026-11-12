import { describe, expect, it } from 'vitest';
import { BOMB_FUSES, BOMB_HEATS, BOMB_WORD_MAX, DEFAULT_BOMB_FUSE, DEFAULT_BOMB_ROUNDS } from '../src/core/constants';
import { nextTimer } from '../src/core/room';
import { viewFor } from '../src/core/view';
import type { BombState } from '../src/modes/bomb/rules';
import { BOMB_THEMES, normalizeWord } from '../src/modes/bomb/themes';
import { samples, testRoom } from './helpers';

function bombRoom(n: number, opts: { seed?: number; rounds?: number; fuse?: number } = {}) {
  const t = testRoom(Array.from({ length: n }, () => samples()), { seed: opts.seed });
  t.host({ t: 'game', mode: 'bomb' });
  if (opts.rounds) t.host({ t: 'bombRounds', n: opts.rounds });
  if (opts.fuse != null) t.host({ t: 'bombFuse', n: opts.fuse });
  t.host({ t: 'start' });
  const g = () => t.room.game as BombState;
  return {
    ids: t.ids, ctx: t.ctx, act: t.act, host: t.host, advance: t.advance,
    get room() { return t.room; },
    get g() { return g(); },
    others() { return t.ids.filter(id => id !== g().holderId); },
    // 持っている人が、言葉を言って渡す
    toss(word: string, to = t.ids.find(id => id !== g().holderId)!) { return t.act(g().holderId, { t: 'toss', round: g().round, word, to }); },
    // ホストのタイマーが鳴ったことにする
    fire() { const tm = nextTimer(t.room)!; t.ctx.now = tm.at; t.host(tm.action); },
    // 爆発まで進める
    boom() { for (let i = 0; i < 10 && g().phase === 'hot'; i++) this.fire(); },
    score(id: string) { return t.room.players.find(p => p.id === id)!.score; },
  };
}

describe('爆弾まわし：お題', () => {
  it('お題は30個以上あり、重複がない。それぞれに、CPU が言う言葉の例が6つ以上ある', () => {
    expect(BOMB_THEMES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(BOMB_THEMES.map(t => t.text)).size).toBe(BOMB_THEMES.length);
    for (const t of BOMB_THEMES) {
      expect(t.words.length).toBeGreaterThanOrEqual(6);
      expect(new Set(t.words.map(normalizeWord)).size).toBe(t.words.length);
      expect(t.words.every(w => w.length <= BOMB_WORD_MAX)).toBe(true);
    }
  });
});

describe('爆弾まわし：まわす', () => {
  it('始まり：誰か1人が爆弾を持つ。導火線の長さは、設定の幅の中', () => {
    const r = bombRoom(4);
    expect(r.g.phase).toBe('hot');
    expect(r.ids).toContain(r.g.holderId);
    expect(r.g.rounds).toBe(DEFAULT_BOMB_ROUNDS);
    const [min, max] = BOMB_FUSES[DEFAULT_BOMB_FUSE];
    expect(r.g.boomAt - r.g.startAt).toBeGreaterThanOrEqual(min * 1000);
    expect(r.g.boomAt - r.g.startAt).toBeLessThanOrEqual(max * 1000);
  });
  it('持っている人だけが、言葉を言って、ほかの人に渡せる', () => {
    const r = bombRoom(3);
    const holder = r.g.holderId, [a, b] = r.others();
    r.act(a, { t: 'toss', round: r.g.round, word: 'りんご', to: b });      // 持っていない人
    r.act(holder, { t: 'toss', round: r.g.round, word: 'りんご', to: holder }); // 自分に渡す
    r.act(holder, { t: 'toss', round: r.g.round, word: 'りんご', to: 'nobody' });
    r.act(holder, { t: 'toss', round: r.g.round + 1, word: 'りんご', to: a });
    r.act(holder, { t: 'toss', round: r.g.round, word: '   ', to: a });      // 言葉がない
    expect(r.g.holderId).toBe(holder);
    expect(r.g.words).toEqual([]);
    r.act(holder, { t: 'toss', round: r.g.round, word: '  りんご ', to: a });
    expect(r.g.holderId).toBe(a);
    expect(r.g.words).toEqual([{ id: holder, text: 'りんご' }]);
  });
  it('同じ言葉は、もう言えない（ひらがな・カタカナ・前後の空白のちがいは同じとみなす）。長すぎる言葉は切る', () => {
    const r = bombRoom(2);
    r.toss('トマト');
    const holder = r.g.holderId;
    r.toss('とまと');
    r.toss(' トマト ');
    expect(r.g.holderId).toBe(holder);
    r.toss('あ'.repeat(50));
    expect(r.g.words[1].text).toHaveLength(BOMB_WORD_MAX);
  });
  it('切れている人には渡せない。持っている人が切れたら、爆弾はほかの人に飛ぶ', () => {
    const r = bombRoom(3);
    const holder = r.g.holderId, [a, b] = r.others().filter(id => id !== r.ids[0]).concat(r.others());
    if (holder === r.ids[0] || a === r.ids[0]) return; // ホストが抜けると部屋がなくなるので、この種では確かめない
    r.act(a, { t: 'leave' });
    r.act(holder, { t: 'toss', round: r.g.round, word: 'りんご', to: a });
    expect(r.g.holderId).toBe(holder);
    r.act(holder, { t: 'leave' });
    expect(r.g.holderId).not.toBe(holder);
    expect(r.g.holderId).not.toBe(a);
    expect(b).toBeDefined();
  });
});

describe('爆弾まわし：導火線', () => {
  it('燃え具合は4段階。爆発の時刻は、参加者に送らない', () => {
    const r = bombRoom(3);
    const span = r.g.boomAt - r.g.startAt;
    expect(JSON.stringify(viewFor(r.room, r.ids[1], r.ctx.now))).not.toContain(String(r.g.boomAt));
    expect(viewFor(r.room, r.ids[1], r.ctx.now).timeLeft).toBeNull();
    BOMB_HEATS.forEach((h, i) => {
      expect(nextTimer(r.room)!.at).toBe(r.g.startAt + Math.ceil(span * h));
      r.fire();
      expect(r.g.heat).toBe(i + 1);
      expect(r.g.phase).toBe('hot');
      expect(viewFor(r.room, r.ids[1], r.ctx.now).bomb!.heat).toBe(i + 1);
    });
    expect(nextTimer(r.room)!.at).toBe(r.g.boomAt);
  });
  it('時間より前の合図や、ホスト以外の合図では、何も起きない', () => {
    const r = bombRoom(3);
    const before = r.room;
    r.host({ t: 'tick' });
    r.act(r.ids[1], { t: 'tick' });
    expect(r.room).toBe(before);
  });
  it('爆発：持っていた人以外の全員に1点。次は、爆発した人から始まる', () => {
    const r = bombRoom(4);
    r.toss('りんご');
    const loser = r.g.holderId;
    r.boom();
    expect(r.g.phase).toBe('boom');
    expect(r.g.loserId).toBe(loser);
    expect(nextTimer(r.room)).toBeNull();
    for (const id of r.ids) expect(r.score(id)).toBe(id === loser ? 0 : 1);
    r.toss('みかん'); // 爆発のあとは渡せない
    expect(r.g.words).toHaveLength(1);
    const theme = r.g.theme;
    r.act(r.ids[1], { t: 'next' });
    expect(r.g.phase).toBe('boom');
    r.host({ t: 'next' });
    expect(r.g.phase).toBe('hot');
    expect(r.g.round).toBe(1);
    expect(r.g.holderId).toBe(loser);
    expect(r.g.theme).not.toBe(theme);
    expect(r.g.words).toEqual([]);
    expect(r.g.heat).toBe(0);
  });
});

describe('爆弾まわし：進行', () => {
  it('決めた回数だけ爆発したら終わり', () => {
    const r = bombRoom(3, { rounds: 3 });
    for (let i = 0; i < 3; i++) { expect(r.g.round).toBe(i); r.boom(); r.host({ t: 'next' }); }
    expect(r.g.phase).toBe('result');
    expect(r.ids.reduce((s, id) => s + r.score(id), 0)).toBe(3 * 2);
    r.host({ t: 'lobby' });
    expect(r.room.game).toBeNull();
  });
  it('設定：爆発の回数と導火線の長さは、ホストだけが、決まった値に変えられる', () => {
    const t = testRoom([samples(), samples()]);
    t.act(t.ids[1], { t: 'bombRounds', n: 8 });
    t.host({ t: 'bombRounds', n: 4 });
    t.host({ t: 'bombFuse', n: 3 });
    expect([t.room.bombRounds, t.room.bombFuse]).toEqual([DEFAULT_BOMB_ROUNDS, DEFAULT_BOMB_FUSE]);
    t.host({ t: 'bombRounds', n: 8 });
    t.host({ t: 'bombFuse', n: 0 });
    expect([t.room.bombRounds, t.room.bombFuse]).toEqual([8, 0]);
  });
});

describe('シミュレーション', () => {
  it('100ゲーム：止まらず、毎回だれか1人が爆発し、お題はゲームの中で重ならない', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const n = 2 + seed % 9, rounds = [3, 5, 8][seed % 3];
      const r = bombRoom(n, { seed: seed * 104729, rounds, fuse: seed % 3 });
      const themes: string[] = [];
      for (let round = 0; round < rounds; round++) {
        themes.push(r.g.theme);
        // 爆発までのあいだに、何回か渡す
        const passes = Math.floor(r.ctx.random() * 12);
        for (let k = 0; k < passes; k++) {
          const to = r.others()[Math.floor(r.ctx.random() * (n - 1))];
          r.toss(`ことば${k}`, to);
          if (r.ctx.random() < 0.3 && r.g.phase === 'hot') r.fire();
        }
        r.boom();
        expect(r.g.phase).toBe('boom');
        expect(r.ids).toContain(r.g.loserId);
        r.host({ t: 'next' });
      }
      expect(r.g.phase).toBe('result');
      expect(new Set(themes).size).toBe(rounds);
      expect(r.ids.reduce((s, id) => s + r.score(id), 0)).toBe(rounds * (n - 1));
    }
  }, 120_000);
});
