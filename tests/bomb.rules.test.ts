import { describe, expect, it } from 'vitest';
import { BOMB_FUSES, BOMB_HEATS, BOMB_LOCK_MS, DEFAULT_BOMB_FUSE, DEFAULT_BOMB_ROUNDS } from '../src/core/constants';
import { nextTimer } from '../src/core/room';
import { viewFor } from '../src/core/view';
import { matchOption, normalizeWord } from '../src/modes/bomb/quiz';
import type { BombState } from '../src/modes/bomb/rules';
import type { FiveTopic } from '../src/modes/five/topics';
import { samples, testRoom } from './helpers';

const five = (title: string): FiveTopic => ({
  title, answers: [1, 2, 3, 4, 5, 6].map(i => `${title}の正解${i}`), dummies: [1, 2, 3].map(i => `${title}のダミー${i}`), size: 8, dummy: 3,
});

// fives[i] は i 番目の人が持ってくるセレクトファイブのお題
function bombRoom(n: number, opts: { seed?: number; rounds?: number; fuse?: number; fives?: FiveTopic[][]; style?: 'tap' | 'type' } = {}) {
  const t = testRoom(Array.from({ length: n }, () => samples()), { seed: opts.seed });
  if (opts.fives) t.ids.forEach((id, i) => t.act(id, { t: 'topics', topics: samples(), fives: opts.fives![i] ?? [] }));
  t.host({ t: 'game', mode: 'bomb' });
  if (opts.rounds) t.host({ t: 'bombRounds', n: opts.rounds });
  if (opts.fuse != null) t.host({ t: 'bombFuse', n: opts.fuse });
  if (opts.style) t.host({ t: 'bombStyle', style: opts.style });
  t.host({ t: 'start' });
  const g = () => t.room.game as BombState;
  const quiz = () => g().quizzes[g().holderId];
  const open = (right: boolean) => quiz().options.map((_, i) => i).filter(i => quiz().correct[i] === right && !quiz().used[i] && !quiz().wrong[i]);
  return {
    ids: t.ids, ctx: t.ctx, act: t.act, host: t.host, advance: t.advance, quiz, open,
    get room() { return t.room; },
    get g() { return g(); },
    others() { return t.ids.filter(id => id !== g().holderId); },
    // 持っている人が、正解（right = false ならダミー）を1つ選ぶ
    pick(right = true) { return t.act(g().holderId, { t: 'bombPick', round: g().round, i: open(right)[0] }); },
    // 持っている人が、正解を当てて渡す
    pass(to = t.ids.find(id => id !== g().holderId)!) { this.pick(); return t.act(g().holderId, { t: 'toss', round: g().round, to }); },
    // ホストのタイマーが鳴ったことにする
    fire() { const tm = nextTimer(t.room)!; t.ctx.now = tm.at; t.host(tm.action); },
    // 爆発まで進める
    boom() { for (let i = 0; i < 10 && g().phase === 'hot'; i++) this.fire(); },
    score(id: string) { return t.room.players.find(p => p.id === id)!.score; },
  };
}

describe('爆弾まわし：お題', () => {
  it('1人に1つ、別々のお題。みんなが持ってきたセレクトファイブのお題を使い、自分が作ったお題は自分に当たらない', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = bombRoom(3, { seed: seed * 104729, fives: [[five('い')], [five('ろ')], [five('は')]] });
      const titles = r.ids.map(id => r.g.quizzes[id].title);
      expect(new Set(titles).size).toBe(3);
      r.ids.forEach((id, i) => expect(r.g.quizzes[id].title).not.toBe(['い', 'ろ', 'は'][i]));
      // 選択肢には、正解とダミーが混ざっている
      for (const id of r.ids) {
        const q = r.g.quizzes[id];
        expect(q.correct.some(Boolean)).toBe(true);
        expect(q.correct.some(c => !c)).toBe(true);
      }
    }
  });
  it('持ってきたお題がなくても、サンプルで遊べる', () => {
    const r = bombRoom(4);
    expect(new Set(r.ids.map(id => r.g.quizzes[id].title)).size).toBe(4);
    expect(r.ids.every(id => r.g.quizzes[id].by === 'サンプル')).toBe(true);
  });
  it('入力式：打ち込んだ文字と合う選択肢を探す（ひらがな・カタカナ・大文字小文字・空白のちがいは同じ）', () => {
    expect(normalizeWord(' トマト ')).toBe('とまと');
    expect(matchOption(['りんご', 'トマト', 'Apple pie'], 'とまと')).toBe(1);
    expect(matchOption(['りんご', 'トマト', 'Apple pie'], 'applePie')).toBe(2);
    expect(matchOption(['りんご', 'トマト'], 'みかん')).toBe(-1);
    expect(matchOption(['りんご', 'トマト'], '  ')).toBe(-1);
  });
});

describe('爆弾まわし：まわす', () => {
  it('始まり：誰か1人が爆弾を持つ。導火線の長さは、設定の幅の中', () => {
    const r = bombRoom(4);
    expect(r.g.phase).toBe('hot');
    expect(r.ids).toContain(r.g.holderId);
    expect(r.g.rounds).toBe(DEFAULT_BOMB_ROUNDS);
    expect(r.g.style).toBe('tap');
    expect(bombRoom(2, { style: 'type' }).g.style).toBe('type');
    const [min, max] = BOMB_FUSES[DEFAULT_BOMB_FUSE];
    expect(r.g.boomAt - r.g.startAt).toBeGreaterThanOrEqual(min * 1000);
    expect(r.g.boomAt - r.g.startAt).toBeLessThanOrEqual(max * 1000);
  });
  it('正解を当てるまでは渡せない。当てたら、ほかの人に渡せる', () => {
    const r = bombRoom(3);
    const holder = r.g.holderId, [a, b] = r.others();
    r.act(holder, { t: 'toss', round: r.g.round, to: a });   // まだ当てていない
    r.act(a, { t: 'bombPick', round: r.g.round, i: 0 });      // 持っていない人
    expect(r.g.holderId).toBe(holder);
    expect(r.g.log).toEqual([]);
    r.pick();
    expect(r.g.armed).toBe(true);
    expect(r.g.log).toHaveLength(1);
    expect(r.g.log[0]).toMatchObject({ id: holder, ok: true });
    r.pick(); // 当てたあとは、もう選べない
    expect(r.g.log).toHaveLength(1);
    r.act(holder, { t: 'toss', round: r.g.round, to: holder });
    r.act(holder, { t: 'toss', round: r.g.round, to: 'nobody' });
    r.act(holder, { t: 'toss', round: r.g.round + 1, to: a });
    expect(r.g.holderId).toBe(holder);
    r.act(holder, { t: 'toss', round: r.g.round, to: b });
    expect(r.g.holderId).toBe(b);
    expect(r.g.armed).toBe(false);
    expect(r.g.passes).toBe(1);
  });
  it('はずれ（ダミー）を選ぶと、2秒間は選べない。同じ選択肢は、もう選べない', () => {
    const r = bombRoom(2);
    const wrong = r.open(false)[0];
    r.act(r.g.holderId, { t: 'bombPick', round: r.g.round, i: wrong });
    expect(r.g.armed).toBe(false);
    expect(r.g.log[0].ok).toBe(false);
    expect(r.quiz().wrong[wrong]).toBe(true);
    r.pick(); // まだ選べない
    expect(r.g.log).toHaveLength(1);
    r.advance(BOMB_LOCK_MS);
    r.act(r.g.holderId, { t: 'bombPick', round: r.g.round, i: wrong }); // 同じダミー
    r.act(r.g.holderId, { t: 'bombPick', round: r.g.round, i: 99 });
    expect(r.g.log).toHaveLength(1);
    r.pick();
    expect(r.g.armed).toBe(true);
  });
  it('一度当てた正解は、もう使えない。正解を使い切ったら、新しいお題が配られる', () => {
    const r = bombRoom(2);
    const a = r.g.holderId, title = r.g.quizzes[a].title;
    const total = r.g.quizzes[a].correct.filter(Boolean).length;
    for (let k = 0; k < total; k++) {
      expect(r.g.holderId).toBe(a);
      expect(r.g.quizzes[a].title).toBe(title);
      expect(r.g.quizzes[a].used.filter(Boolean)).toHaveLength(k);
      r.pass(); // a → 相手
      r.pass(); // 相手 → a
    }
    expect(r.g.holderId).toBe(a);
    expect(r.g.quizzes[a].title).not.toBe(title);
    expect(r.g.quizzes[a].used.some(Boolean)).toBe(false);
  });
  it('切れている人には渡せない。持っている人が切れたら、爆弾はほかの人に飛ぶ', () => {
    const r = bombRoom(3);
    const holder = r.g.holderId, [a] = r.others().filter(id => id !== r.ids[0]);
    if (holder === r.ids[0]) return; // ホストが抜けると部屋がなくなるので、この種では確かめない
    r.act(a, { t: 'leave' });
    r.pick();
    r.act(holder, { t: 'toss', round: r.g.round, to: a });
    expect(r.g.holderId).toBe(holder);
    r.act(holder, { t: 'leave' });
    expect(r.g.holderId).toBe(r.ids[0]);
    expect(r.g.armed).toBe(false);
  });
});

describe('爆弾まわし：見せる情報', () => {
  it('持っている人のお題は全員に見える。どれが正解かは、選ぶまで送らない', () => {
    const r = bombRoom(3);
    const holder = r.g.holderId, [a] = r.others();
    for (const id of r.ids) {
      const v = viewFor(r.room, id, r.ctx.now).bomb!;
      expect(v.quiz!.title).toBe(r.quiz().title);
      expect(v.quiz!.mark.every(m => m === '')).toBe(true);
      expect(JSON.stringify(v)).not.toContain('correct');
      expect(JSON.stringify(v)).not.toContain(r.g.quizzes[a].title); // まだ持っていない人のお題は送らない
    }
    r.pick(false);
    expect(viewFor(r.room, a, r.ctx.now).bomb!.quiz!.mark.filter(m => m === 'ng')).toHaveLength(1);
    expect(viewFor(r.room, holder, r.ctx.now).bomb!.lockMs).toBe(BOMB_LOCK_MS);
    r.advance(500);
    expect(viewFor(r.room, holder, r.ctx.now).bomb!.lockMs).toBe(BOMB_LOCK_MS - 500);
    r.advance(BOMB_LOCK_MS);
    r.pick();
    const v = viewFor(r.room, a, r.ctx.now).bomb!;
    expect(v.quiz!.mark.filter(m => m === 'ok')).toHaveLength(1);
    expect(v.armed).toBe(true);
    expect(v.log.map(x => x.ok)).toEqual([false, true]);
  });
  it('爆発したら、持っていた人のお題の、残りの正解を見せる', () => {
    const r = bombRoom(2);
    const n = r.quiz().correct.filter(Boolean).length;
    r.boom();
    const v = viewFor(r.room, r.ids[0], r.ctx.now).bomb!;
    expect(v.quiz!.mark.filter(m => m === 'ans')).toHaveLength(n);
    expect(v.lockMs).toBe(0);
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
  it('爆発：持っていた人以外の全員に1点。次は、爆発した人から、新しいお題で始まる', () => {
    const r = bombRoom(4);
    r.pass();
    const loser = r.g.holderId;
    const titles = r.ids.map(id => r.g.quizzes[id].title);
    r.boom();
    expect(r.g.phase).toBe('boom');
    expect(r.g.loserId).toBe(loser);
    expect(nextTimer(r.room)).toBeNull();
    for (const id of r.ids) expect(r.score(id)).toBe(id === loser ? 0 : 1);
    r.pick(); // 爆発のあとは選べない
    expect(r.g.log).toHaveLength(1);
    r.act(r.ids[1], { t: 'next' });
    expect(r.g.phase).toBe('boom');
    r.host({ t: 'next' });
    expect(r.g.phase).toBe('hot');
    expect(r.g.round).toBe(1);
    expect(r.g.holderId).toBe(loser);
    expect(r.ids.map(id => r.g.quizzes[id].title).some(t => titles.includes(t))).toBe(false);
    expect(r.g.log).toEqual([]);
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
  it('設定：答え方・爆発の回数・導火線の長さは、ホストだけが、決まった値に変えられる', () => {
    const t = testRoom([samples(), samples()]);
    t.act(t.ids[1], { t: 'bombRounds', n: 8 });
    t.act(t.ids[1], { t: 'bombStyle', style: 'type' });
    t.host({ t: 'bombRounds', n: 4 });
    t.host({ t: 'bombFuse', n: 3 });
    t.host({ t: 'bombStyle', style: 'voice' as never });
    expect([t.room.bombRounds, t.room.bombFuse, t.room.bombStyle]).toEqual([DEFAULT_BOMB_ROUNDS, DEFAULT_BOMB_FUSE, 'tap']);
    t.host({ t: 'bombRounds', n: 8 });
    t.host({ t: 'bombFuse', n: 0 });
    t.host({ t: 'bombStyle', style: 'type' });
    expect([t.room.bombRounds, t.room.bombFuse, t.room.bombStyle]).toEqual([8, 0, 'type']);
  });
});

describe('シミュレーション', () => {
  it('100ゲーム：止まらず、毎回だれか1人が爆発し、持っている人にはいつも当てられる正解がある', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const n = 2 + seed % 9, rounds = [3, 5, 8][seed % 3];
      const r = bombRoom(n, { seed: seed * 104729, rounds, fuse: seed % 3 });
      for (let round = 0; round < rounds; round++) {
        // 爆発までのあいだに、当てたり、はずしたり、渡したりする
        const moves = Math.floor(r.ctx.random() * 40);
        for (let k = 0; k < moves && r.g.phase === 'hot'; k++) {
          expect(r.open(true).length).toBeGreaterThan(0);
          if (r.ctx.random() < 0.3 && r.open(false).length) { r.pick(false); r.advance(BOMB_LOCK_MS); }
          else r.pass(r.others()[Math.floor(r.ctx.random() * (n - 1))]);
          if (r.ctx.random() < 0.15) r.fire();
        }
        r.boom();
        expect(r.g.phase).toBe('boom');
        expect(r.ids).toContain(r.g.loserId);
        r.host({ t: 'next' });
      }
      expect(r.g.phase).toBe('result');
      expect(r.ids.reduce((s, id) => s + r.score(id), 0)).toBe(rounds * (n - 1));
    }
  }, 120_000);
});
