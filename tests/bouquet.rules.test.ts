import { describe, expect, it } from 'vitest';
import { BOUQUET_HANDS, BOUQUET_WORD_MAX, BOUQUET_WORDS_PER_PLAYER, BOUQUET_MAX_ROUNDS, DEFAULT_BOUQUET_TIME, MAX_PLAYERS, PICK_GRACE_MS } from '../src/core/constants';
import { nextTimer } from '../src/core/room';
import { seeded } from '../src/core/random';
import { viewFor } from '../src/core/view';
import type { BouquetState } from '../src/modes/bouquet/rules';
import { ALL_WORDS, dealHand, HAND_SIZE, PARTICLES, particleToken, PHRASE_MAX, SAMPLE_BOUQUETS, sanitizeBouquets, sanitizeBouquetWords, toPhrase, WORD_COUNT } from '../src/modes/bouquet/words';
import { samples, testRoom } from './helpers';

// ゲーム開始の手前まで。themes[i] は i 番目の人が持ってくるお題
function bouquetRoom(themes: string[][], opts: { seed?: number } = {}) {
  const t = testRoom(themes.map(() => samples()), { seed: opts.seed });
  t.ids.forEach((id, i) => t.act(id, { t: 'join', name: `プレイヤー${i}`, key: `k${i}`, topics: samples(), bouquets: themes[i], version: 'test' }));
  t.host({ t: 'game', mode: 'bouquet' });
  const g = () => t.room.game as BouquetState;
  return {
    ids: t.ids, ctx: t.ctx, act: t.act, host: t.host,
    get room() { return t.room; },
    get g() { return g(); },
    // 作る人が全員、手札の最初の2枚を「の」でつないで提出する
    submitAll() { for (const id of Object.keys(g().hands)) if (g().phase === 'compose') t.act(id, { t: 'phrase', round: g().round, tokens: [0, particleToken(4), 1] }); },
    score(id: string) { return t.room.players.find(p => p.id === id)!.score; },
  };
}
const none = (n: number): string[][] => Array.from({ length: n }, () => []);

describe('手札の枚数と、言葉の持ち寄り', () => {
  const own = ['筋肉', 'たこ焼き', '月曜日', '無敵', 'ねむい', '課長', '銀河', 'うどん', '奇跡', '全力', '推し', '布団'];
  it('枚数を変えても、重複のない手札になる。プリセットの分は、名詞・言い回し・修飾が混ざる', () => {
    for (const size of BOUQUET_HANDS) {
      const h = dealHand(seeded(size * 7919), size);
      expect(h).toHaveLength(size);
      expect(new Set(h).size).toBe(size);
      expect(h.every(w => ALL_WORDS.includes(w))).toBe(true);
    }
  });
  it('プリセットと混ぜる：持ってきた言葉は、手札の半分まで。残りはプリセット', () => {
    for (const size of BOUQUET_HANDS) {
      const h = dealHand(seeded(size), size, own, true);
      expect(h).toHaveLength(size);
      expect(new Set(h).size).toBe(size);
      expect(h.filter(w => own.includes(w))).toHaveLength(Math.min(own.length, Math.floor(size / 2)));
    }
    // 持ってきた言葉が少ないときは、あるだけ入る
    expect(dealHand(seeded(3), 14, ['筋肉', '筋肉', '銀河'], true).filter(w => ['筋肉', '銀河'].includes(w))).toHaveLength(2);
  });
  it('持ち寄りだけ：手札を持ってきた言葉で配る。足りない分は、プリセットで埋める', () => {
    expect(dealHand(seeded(1), 10, own, false).every(w => own.includes(w))).toBe(true);
    const h = dealHand(seeded(1), 20, own, false);
    expect(h).toHaveLength(20);
    expect(new Set(h).size).toBe(20);
    expect(h.filter(w => own.includes(w))).toHaveLength(own.length);
    expect(dealHand(seeded(1), 14, [], false)).toHaveLength(14); // 誰も持ってきていなければ、全部プリセット
  });
  it('プリセットにある言葉を持ってきても、手札の中で重ならない', () => {
    const h = dealHand(seeded(5), 30, ALL_WORDS.slice(0, 15), true);
    expect(new Set(h).size).toBe(30);
  });
  it('届いた言葉は、検査して整える（空・重複を除き、長さと数を上限に収める）', () => {
    expect(sanitizeBouquetWords('x')).toEqual([]);
    expect(sanitizeBouquetWords([' 筋肉 ', '筋肉', '', null, 'あ'.repeat(30)])).toEqual(['筋肉', 'あ'.repeat(BOUQUET_WORD_MAX)]);
    expect(sanitizeBouquetWords(Array.from({ length: 200 }, (_, i) => `言葉${i}`))).toHaveLength(BOUQUET_WORDS_PER_PLAYER);
  });
  it('ロビーの設定と、みんなが持ってきた言葉で、手札が配られる', () => {
    const t = testRoom([samples(), samples(), samples()]);
    t.act(t.ids[1], { t: 'topics', topics: samples(), bouquetWords: own });
    t.act(t.ids[1], { t: 'bouquetHand', n: 20 }); // ホストだけが変えられる
    t.host({ t: 'bouquetHand', n: 11 });
    expect([t.room.bouquetHand, t.room.bouquetMix]).toEqual([14, true]);
    t.host({ t: 'bouquetHand', n: 20 });
    t.host({ t: 'bouquetMix', on: false });
    expect(viewFor(t.room, t.ids[0], t.ctx.now)).toMatchObject({ bouquetHand: 20, bouquetMix: false });
    expect(viewFor(t.room, t.ids[0], t.ctx.now).players.map(p => p.bouquetWords)).toEqual([0, own.length, 0]);
    t.host({ t: 'game', mode: 'bouquet' });
    t.host({ t: 'start' });
    const g = t.room.game as BouquetState;
    for (const h of Object.values(g.hands)) {
      expect(h).toHaveLength(20);
      expect(h.filter(w => own.includes(w))).toHaveLength(own.length); // 持ってきたのが1人でも、全員の手札に入る
    }
    // 引き直しても、同じ決まりで配られる
    const id = Object.keys(g.hands)[0];
    t.act(id, { t: 'redraw', round: 0 });
    expect((t.room.game as BouquetState).hands[id]).toHaveLength(20);
    // 並べた文には、持ってきた言葉が使える
    const mine = (t.room.game as BouquetState).hands[id];
    t.act(id, { t: 'phrase', round: 0, tokens: [mine.indexOf(own.find(w => mine.includes(w))!)] });
    expect(own).toContain((t.room.game as BouquetState).phrases[id]);
  });
});

describe('言葉とお題', () => {
  it('言葉のカードは300語以上あり、重複がない。手札は14枚で、毎回ちがう', () => {
    expect(WORD_COUNT).toBeGreaterThanOrEqual(300);
    expect(new Set(ALL_WORDS).size).toBe(WORD_COUNT);
    expect(ALL_WORDS.every(w => w.length >= 1 && w.length <= 12)).toBe(true);
    const a = dealHand(seeded(1)), b = dealHand(seeded(2));
    expect(a).toHaveLength(HAND_SIZE);
    expect(new Set(a).size).toBe(HAND_SIZE);
    expect(a).not.toEqual(b);
  });
  it('並べた文：手札は1枚1回まで・助詞は何度でも・手札を1枚以上使う・12個まで', () => {
    const hand = ['君', '味噌汁', '愛してる'];
    const no = particleToken(PARTICLES.indexOf('の')), wo = particleToken(PARTICLES.indexOf('を'));
    expect(toPhrase([0, no, 1, wo, 2], hand)).toBe('君の味噌汁を愛してる');
    expect(toPhrase([1, no, no, 0], hand)).toBe('味噌汁のの君');
    expect(toPhrase([0, 0], hand)).toBeNull();                 // 同じカードを2回
    expect(toPhrase([no, wo], hand)).toBeNull();               // 助詞だけ
    expect(toPhrase([3], hand)).toBeNull();                    // 手札にない
    expect(toPhrase([particleToken(PARTICLES.length)], hand)).toBeNull();
    expect(toPhrase([], hand)).toBeNull();
    expect(toPhrase([0, 1.5], hand)).toBeNull();
    expect(toPhrase('x', hand)).toBeNull();
    expect(toPhrase([0, ...Array(PHRASE_MAX).fill(no)], hand)).toBeNull(); // 長すぎる
  });
  it('お題は60文字まで。同梱のサンプルは24個', () => {
    expect(SAMPLE_BOUQUETS).toHaveLength(24);
    expect(sanitizeBouquets(SAMPLE_BOUQUETS)).toEqual(SAMPLE_BOUQUETS);
    expect(sanitizeBouquets([' あ ', '', 'あ', 'い'.repeat(99), 5])).toEqual(['あ', 'い'.repeat(60), '5']);
  });
});

describe('ロビー', () => {
  it('作る時間と終わり方は、ホストが選ぶ', () => {
    const t = bouquetRoom(none(3));
    expect([t.room.bouquetTime, t.room.bouquetGoal]).toEqual([DEFAULT_BOUQUET_TIME, 0]);
    t.host({ t: 'bouquetTime', sec: 50 });
    t.host({ t: 'bouquetGoal', n: 4 });
    t.act(t.ids[1], { t: 'bouquetGoal', n: 3 });
    expect([t.room.bouquetTime, t.room.bouquetGoal]).toEqual([DEFAULT_BOUQUET_TIME, 0]);
    t.host({ t: 'bouquetTime', sec: 90 });
    t.host({ t: 'bouquetGoal', n: 3 });
    expect([t.room.bouquetTime, t.room.bouquetGoal]).toEqual([90, 3]);
  });
});

describe('1ラウンドの流れ', () => {
  it('親以外に手札を配る。お題は、親が持ってきたもの（なければサンプル）', () => {
    const t = bouquetRoom([['お題A'], ['お題B'], []]);
    t.host({ t: 'start' });
    const g = t.g;
    expect(g.phase).toBe('compose');
    expect(Object.keys(g.hands).sort()).toEqual(t.ids.filter(id => id !== g.parentId).sort());
    expect(Object.values(g.hands).every(h => h.length === HAND_SIZE)).toBe(true);
    const i = t.ids.indexOf(g.parentId);
    expect(g.theme).toBe(i === 2 ? g.theme : ['お題A', 'お題B'][i]);
    expect(g.themeBy).toBe(i === 2 ? 'サンプル' : `プレイヤー${i}`);
    if (i === 2) expect(SAMPLE_BOUQUETS).toContain(g.theme);
    // 見せる情報：自分の手札だけ。親には手札がない
    const composer = t.ids.find(id => id !== g.parentId)!;
    const v = viewFor(t.room, composer, t.ctx.now);
    expect(v.phase).toBe('compose');
    expect(v.bouquet).toMatchObject({ round: 0, rounds: 3, goal: 0, parentId: g.parentId, theme: g.theme, hand: g.hands[composer], phrases: null, myPhrase: null });
    expect(viewFor(t.room, g.parentId, t.ctx.now).bouquet!.hand).toBeNull();
    expect(v.timeLeft).toBe(DEFAULT_BOUQUET_TIME * 1000);
  });
  it('文を提出する。手札は1回だけ引き直せる。全員が出すと、時間を待たずに親が選ぶ番へ', () => {
    const t = bouquetRoom(none(3));
    t.host({ t: 'start' });
    const [a, b] = t.ids.filter(id => id !== t.g.parentId);
    const before = t.g.hands[a];
    t.act(a, { t: 'redraw', round: 0 });
    expect(t.g.hands[a]).not.toEqual(before);
    const again = t.g.hands[a];
    t.act(a, { t: 'redraw', round: 0 });           // 2回目はできない
    t.act(t.g.parentId, { t: 'redraw', round: 0 }); // 親は手札がない
    expect(t.g.hands[a]).toBe(again);
    t.act(a, { t: 'phrase', round: 0, tokens: [0, particleToken(4), 1] });
    expect(t.g.phrases[a]).toBe(`${again[0]}の${again[1]}`);
    const snap = t.room;
    t.act(a, { t: 'phrase', round: 0, tokens: [2] });                 // 出したら変えられない
    t.act(b, { t: 'phrase', round: 1, tokens: [0] });                 // 回が違う
    t.act(b, { t: 'phrase', round: 0, tokens: [0, 0] });              // 正しくない並び
    t.act(t.g.parentId, { t: 'phrase', round: 0, tokens: [0] });      // 親は作らない
    expect(t.room).toBe(snap);
    const v = viewFor(t.room, t.g.parentId, t.ctx.now);
    expect(v.bouquet!.phrases).toBeNull(); // 出そろうまで、ほかの人の文は見えない
    expect(v.players.find(p => p.id === a)!.done).toBe(true);
    expect(v.players.find(p => p.id === b)!.done).toBe(false);
    expect(v.players.find(p => p.id === t.g.parentId)!.done).toBeNull();
    t.act(b, { t: 'redraw', round: 0 });
    t.act(b, { t: 'phrase', round: 0, tokens: [3] });
    expect(t.g.phase).toBe('choose');
    // 作った人の名前と一緒に並ぶ
    const shown = viewFor(t.room, a, t.ctx.now).bouquet!.phrases!;
    expect(shown.map(p => p.id).sort()).toEqual([a, b].sort());
    expect(shown.every(p => p.name.startsWith('プレイヤー') && p.text.length > 0)).toBe(true);
  });
  it('親が1つ選ぶと、その人に1点', () => {
    const t = bouquetRoom(none(4));
    t.host({ t: 'start' });
    t.submitAll();
    const parent = t.g.parentId, [a, b] = Object.keys(t.g.phrases);
    t.act(a, { t: 'choose', round: 0, id: b });       // 親以外は選べない
    t.act(parent, { t: 'choose', round: 0, id: parent }); // 作っていない人は選べない
    expect(t.g.phase).toBe('choose');
    t.act(parent, { t: 'choose', round: 0, id: b });
    expect(t.g).toMatchObject({ phase: 'bloom', winner: b });
    expect(t.score(b)).toBe(1);
    expect(viewFor(t.room, a, t.ctx.now).bouquet!.winner).toBe(b);
    expect(nextTimer(t.room)).toBeNull(); // 次へ進めるのはホスト
  });
  it('時間切れで親が選ぶ番へ。誰も出していなければ、点なしで発表へ。ホストは「選ばずに進める」ができる', () => {
    const t = bouquetRoom(none(3));
    t.host({ t: 'start' });
    t.host({ t: 'timeUp' }); // まだ時間ではない
    expect(t.g.phase).toBe('compose');
    t.ctx.now = t.g.deadline + PICK_GRACE_MS;
    t.host(nextTimer(t.room)!.action);
    expect(t.g).toMatchObject({ phase: 'bloom', winner: null }); // 誰も出していない
    t.host({ t: 'next' });
    t.submitAll();
    expect(t.g.phase).toBe('choose');
    t.act(t.ids.find(id => id !== t.ids[0])!, { t: 'force' }); // 参加者は進められない
    expect(t.g.phase).toBe('choose');
    t.host({ t: 'force' });
    expect(t.g).toMatchObject({ phase: 'bloom', winner: null });
    expect(t.room.players.every(p => p.score === 0)).toBe(true);
  });
});

describe('親の交代と終わり方', () => {
  const playRound = (t: ReturnType<typeof bouquetRoom>, pick = 0) => {
    t.submitAll();
    if (t.g.phase === 'choose') t.act(t.g.parentId, { t: 'choose', round: t.g.round, id: Object.keys(t.g.phrases)[pick] });
    t.host({ t: 'next' });
  };
  it('全員が親を1回やったら終わり。親は順番に交代し、同じお題は出ない', () => {
    const t = bouquetRoom(none(4));
    t.host({ t: 'start' });
    const parents: string[] = [], themes: string[] = [];
    for (let r = 0; r < 4; r++) {
      expect(t.g.phase).toBe('compose');
      parents.push(t.g.parentId); themes.push(t.g.theme);
      playRound(t);
    }
    expect([...parents].sort()).toEqual([...t.ids].sort());
    expect(new Set(themes).size).toBe(4);
    expect(t.g.phase).toBe('result');
    expect(t.room.players.reduce((a, p) => a + p.score, 0)).toBe(4);
    t.host({ t: 'lobby' });
    expect(t.room.game).toBeNull();
  });
  it('先取：誰かがその点に届いたら終わり', () => {
    const t = bouquetRoom(none(3));
    t.host({ t: 'bouquetGoal', n: 3 });
    t.host({ t: 'start' });
    let rounds = 0;
    while (t.g.phase !== 'result') { if (++rounds > BOUQUET_MAX_ROUNDS + 1) throw new Error('終わらない'); playRound(t); }
    expect(Math.max(...t.room.players.map(p => p.score))).toBe(3);
    expect(rounds).toBeGreaterThan(3); // 親は選ばれないので、3ラウンドでは終わらない
    expect(viewFor(t.room, t.ids[0], t.ctx.now).bouquet!.rounds).toBe(0);
  });
  it('切断中の人は、親にならない（次の人に回す）', () => {
    const t = bouquetRoom(none(3));
    t.host({ t: 'start' });
    const next = t.g.ring[1];
    t.act(next, { t: 'leave' });
    playRound(t);
    if (next !== t.ids[0]) expect(t.g.parentId).toBe(t.g.ring[2]);
  });
});

describe('シミュレーション', () => {
  it('200ゲーム：止まらず、点の合計は「選ばれた回数」と同じ', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = seeded(seed * 7919);
      const n = 2 + Math.floor(rnd() * (MAX_PLAYERS - 1));
      const t = bouquetRoom(Array.from({ length: n }, (_, i) => rnd() < 0.3 ? [`お題${i}`] : []), { seed });
      t.host({ t: 'bouquetGoal', n: [0, 3, 5][seed % 3] });
      t.host({ t: 'start' });
      let steps = 0, chosen = 0;
      while (t.g.phase !== 'result') {
        if (++steps > 600) throw new Error(`止まった: seed=${seed} phase=${t.g.phase}`);
        const g = t.g;
        if (g.phase === 'compose') {
          for (const id of Object.keys(g.hands)) {
            const r = rnd();
            if (id !== t.ids[0] && r < 0.01) t.act(id, { t: 'leave' });
            else if (r < 0.2) t.act(id, { t: 'redraw', round: g.round });
            if (rnd() < 0.85) t.act(id, { t: 'phrase', round: g.round, tokens: [Math.floor(rnd() * HAND_SIZE), particleToken(Math.floor(rnd() * PARTICLES.length))] });
          }
          if (t.g.phase === 'compose') { const timer = nextTimer(t.room)!; t.ctx.now = timer.at; t.host(timer.action); }
        } else if (g.phase === 'choose') {
          const ids = Object.keys(g.phrases);
          if (rnd() < 0.9) { t.act(g.parentId, { t: 'choose', round: g.round, id: ids[Math.floor(rnd() * ids.length)] }); if (t.g.winner) chosen++; }
          if (t.g.phase === 'choose') t.host({ t: 'force' });
        } else t.host({ t: 'next' });
      }
      expect(t.room.players.reduce((a, p) => a + p.score, 0)).toBe(chosen);
    }
  }, 120_000);
});
