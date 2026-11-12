import { describe, expect, it } from 'vitest';
import { DEFAULT_FATE_LIVES, DEFAULT_FATE_QUOTA, DEFAULT_FATE_TIME, FATE_GRACE_MS, FATE_VERDICT_MS, MAX_PLAYERS } from '../src/core/constants';
import { fateKey, SAMPLE_FATES, sanitizeFates, type FateQuestion } from '../src/modes/fate/questions';
import { SAMPLE_FIVES, type FiveTopic } from '../src/modes/five/topics';
import { nextTimer } from '../src/core/room';
import { seeded } from '../src/core/random';
import { cardOf, fateRanks, survivors, type FateState, type Side } from '../src/modes/fate/rules';
import { viewFor } from '../src/core/view';
import { samples, testRoom } from './helpers';

const q = (text: string): FateQuestion => ({ text, right: `${text}の正解`, wrong: `${text}の不正解` });
// ゲーム開始の手前まで。fates[i] は i 番目の人が持ってくる問題
const SAMPLES = SAMPLE_FATES.length + SAMPLE_FIVES.length; // 同梱の問題の数（セレクトファイブのサンプルからも1問ずつ出る）
function fateRoom(fates: FateQuestion[][], opts: { seed?: number; fives?: FiveTopic[][]; lives?: number } = {}) {
  const t = testRoom(fates.map(() => samples()), { seed: opts.seed });
  t.ids.forEach((id, i) => t.act(id, { t: 'join', name: `プレイヤー${i}`, key: `k${i}`, topics: samples(), fates: fates[i], fives: opts.fives?.[i], version: 'test' }));
  t.host({ t: 'game', mode: 'fate' });
  t.host({ t: 'fateLives', n: opts.lives ?? 1 }); // 1問の流れを確かめやすいよう、ふだんはライフ1（1回のミスで脱落）にする
  return {
    ids: t.ids, ctx: t.ctx, act: t.act, host: t.host, advance: t.advance,
    get room() { return t.room; },
    get fate() { return t.room.game as FateState; },
    // ゲームを始める。plain なら、お立ち台の割り当てを外して、全員が答える問題だけにする（1問の流れを確かめるテスト用）
    start(plain = true) {
      t.host({ t: 'start' });
      if (plain) this.authors([], true);
    },
    // 今の問題（all なら全部の問題）で、お立ち台に立つ人を決め直す
    authors(ids: string[], all = false) {
      const r = structuredClone(t.room), g = r.game as FateState;
      (all ? g.deck : [g.deck[g.round]]).forEach(c => { c.authorIds = [...ids]; });
      t.room = r;
    },
    // 締め切り（猶予のあと）まで時間を進めて、発表する
    close() { const timer = nextTimer(t.room)!; t.ctx.now = timer.at; t.host(timer.action); },
    // 正解・不正解の側
    right(): Side { return cardOf(t.room.game as FateState).rightSide; },
    wrong(): Side { return cardOf(t.room.game as FateState).rightSide === 'L' ? 'R' : 'L'; },
  };
}
const none = (n: number): FateQuestion[][] => Array.from({ length: n }, () => []);

describe('問題の検査', () => {
  it('問題文・正解・不正解がそろっていて、正解と不正解が違うものだけ通す', () => {
    expect(sanitizeFates([q('a')])).toEqual([q('a')]);
    expect(sanitizeFates([{ text: '', right: 'x', wrong: 'y' }, { text: 'a', right: 'x', wrong: 'x' }, { text: 'a', right: 'x' }, null])).toEqual([]);
    expect(sanitizeFates([{ text: 'あ'.repeat(99), right: 'い'.repeat(99), wrong: 'う' }])[0]).toEqual({ text: 'あ'.repeat(60), right: 'い'.repeat(40), wrong: 'う' });
    expect(sanitizeFates('x')).toEqual([]);
  });
  it('同梱のサンプルは30問以上あり、すべて正しい形で、重複がない', () => {
    expect(SAMPLE_FATES.length).toBeGreaterThanOrEqual(30);
    expect(sanitizeFates(SAMPLE_FATES)).toEqual(SAMPLE_FATES);
    expect(new Set(SAMPLE_FATES.map(fateKey)).size).toBe(SAMPLE_FATES.length);
    expect(new Set(SAMPLE_FATES.map(x => x.text)).size).toBe(SAMPLE_FATES.length);
  });
});

describe('ロビー', () => {
  it('問題を持ってこなくても始められる。制限時間は 5／10／15 秒から選ぶ', () => {
    const t = fateRoom(none(2));
    expect(t.room.fateTime).toBe(DEFAULT_FATE_TIME);
    t.host({ t: 'fateTime', sec: 7 });
    expect(t.room.fateTime).toBe(DEFAULT_FATE_TIME);
    t.act(t.ids[1], { t: 'fateTime', sec: 5 }); // ホスト以外は変えられない
    expect(t.room.fateTime).toBe(DEFAULT_FATE_TIME);
    t.host({ t: 'fateTime', sec: 5 });
    t.start();
    expect(t.fate.phase).toBe('question');
    expect(t.fate.deadline).toBe(t.ctx.now + 5000);
  });
  it('キャラクターは、ロビーで自分の分だけ変えられる', () => {
    const t = fateRoom(none(2));
    t.act(t.ids[1], { t: 'chara', n: 7 });
    expect(t.room.players.map(p => p.chara)).toEqual([0, 7]);
    t.act(t.ids[1], { t: 'chara', n: -1 });
    t.act(t.ids[1], { t: 'chara', n: 1.5 });
    expect(t.room.players[1].chara).toBe(7);
    t.start();
    t.act(t.ids[1], { t: 'chara', n: 2 }); // ゲーム中は変えられない
    expect(t.room.players[1].chara).toBe(7);
  });
  it('問題だけを持ってきた人も参加できる', () => {
    const t = testRoom([samples()]);
    t.act('x', { t: 'join', name: 'x', key: 'kx', topics: [], fates: [q('a')], version: 'test' });
    expect(t.room.players).toHaveLength(2);
    expect(t.room.fatesBy.x).toEqual([q('a')]);
  });
});

describe('問題の束', () => {
  it('同じ問題は1つにまとめ、持ってきた人を全員、作った人として扱う', () => {
    const t = fateRoom([[q('a'), q('b')], [q('b'), q('c')], []]);
    t.start(false);
    const deck = t.fate.deck;
    expect(deck).toHaveLength(3 + SAMPLES);
    expect(deck.filter(c => ['a', 'b', 'c'].includes(c.text)).map(c => c.text).sort()).toEqual(['a', 'b', 'c']);
    expect(deck.find(c => c.text === 'b')!.authorIds).toEqual([t.ids[0], t.ids[1]]);
  });
  it('同梱のサンプルと同じ問題を持ってきても、増えない', () => {
    const t = fateRoom([[SAMPLE_FATES[0]], []]);
    t.start();
    expect(t.fate.deck).toHaveLength(SAMPLES);
  });
  it('セレクトファイブのお題も、正解とダミーを1つずつ抜いた2択として出す（1つのお題から1問）', () => {
    const five: FiveTopic = { title: '哺乳類は？', answers: ['a1', 'a2', 'a3', 'a4', 'a5'], dummies: ['d1', 'd2'], size: 7, dummy: 2 };
    const t = fateRoom([[q('a')], [], []], { fives: [[five], [five], [SAMPLE_FIVES[0]]] });
    t.start(false);
    const deck = t.fate.deck;
    expect(deck).toHaveLength(2 + SAMPLES); // 持ってきた分は、二者択一の1問＋セレクトファイブの1お題。同梱と同じお題は増えない
    const card = deck.find(c => c.text === '哺乳類は？')!;
    expect(five.answers).toContain(card.right);
    expect(five.dummies).toContain(card.wrong);
    expect(card.authorIds).toEqual([t.ids[0], t.ids[1]]); // 持ってきた人は、作った人として扱う
    // 同梱のセレクトファイブのサンプルも、1つずつ出る
    for (const s of SAMPLE_FIVES) {
      const c = deck.filter(x => x.text === s.title);
      expect(c).toHaveLength(1);
      expect(s.answers).toContain(c[0].right);
      expect(s.dummies).toContain(c[0].wrong);
    }
  });
  it('同じお題でも、ゲームのたびに違う組み合わせになる', () => {
    const pairs = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const t = fateRoom(none(2), { seed: seed * 104729 }); // 小さい種は最初の乱数が偏るので、ばらけさせる
      t.start();
      const c = t.fate.deck.find(x => x.text === SAMPLE_FIVES[0].title)!;
      pairs.add(`${c.right}/${c.wrong}`);
    }
    expect(pairs.size).toBeGreaterThan(8);
  });
  it('正解の側は左右にばらける', () => {
    const t = fateRoom(none(2), { seed: 5 });
    t.start();
    const lefts = t.fate.deck.filter(c => c.rightSide === 'L').length;
    expect(lefts).toBeGreaterThan(5);
    expect(lefts).toBeLessThan(SAMPLES - 5);
  });
});

describe('お立ち台のローテーション', () => {
  it('全員が同じ回数ずつ、順番にお立ち台に立つ。自分の問題がある人はそれを、ない人・足りない人はサンプルを受け持つ', () => {
    const t = fateRoom([[q('a1'), q('a2'), q('a3'), q('a4'), q('a5')], [q('b1')], []]);
    t.start(false);
    const deck = t.fate.deck, n = t.ids.length, rot = deck.slice(0, n * DEFAULT_FATE_QUOTA);
    // 1巡ごとに、全員が1回ずつ
    for (let k = 0; k < DEFAULT_FATE_QUOTA; k++) expect(rot.slice(k * n, k * n + n).map(c => c.authorIds[0]).sort()).toEqual([...t.ids].sort());
    const of = (id: string) => rot.filter(c => c.authorIds[0] === id);
    // たくさん持ってきた人：回数の分だけ自分の問題。超えた分は、このゲームでは出さない
    expect(of(t.ids[0]).every(c => c.text.startsWith('a') && c.authorName === 'プレイヤー0')).toBe(true);
    expect(deck.filter(c => c.text.startsWith('a'))).toHaveLength(DEFAULT_FATE_QUOTA);
    // 足りない人：自分の問題＋サンプル。持ってきていない人：全部サンプル
    expect(of(t.ids[1]).map(c => c.authorName).sort()).toEqual(['サンプル', 'サンプル', 'プレイヤー1']);
    expect(of(t.ids[2]).every(c => c.authorName === 'サンプル')).toBe(true);
    // 全員の回数が終わったら、誰もお立ち台に立たない
    expect(deck.slice(rot.length).every(c => c.authorIds.length === 0 && c.authorName === 'サンプル')).toBe(true);
    expect(deck).toHaveLength(DEFAULT_FATE_QUOTA + 1 + SAMPLES);
  });
  it('回数は、ホストがロビーで 1／3／5 から選ぶ', () => {
    const t = fateRoom(none(4));
    t.host({ t: 'fateQuota', n: 2 });
    t.act(t.ids[1], { t: 'fateQuota', n: 5 });
    expect(t.room.fateQuota).toBe(DEFAULT_FATE_QUOTA);
    t.host({ t: 'fateQuota', n: 1 });
    t.start(false);
    expect(t.fate.deck.filter(c => c.authorIds.length).map(c => c.authorIds[0]).sort()).toEqual([...t.ids].sort());
    expect(t.fate.deck.slice(4).every(c => c.authorIds.length === 0)).toBe(true);
  });
  it('サンプルを使い切ったら、割り当てはそこまで', () => {
    const t = fateRoom(none(10));
    t.host({ t: 'fateQuota', n: 5 });
    t.start(false);
    expect(t.fate.deck).toHaveLength(SAMPLES);
    expect(t.fate.deck.every(c => c.authorIds.length === 1)).toBe(true);
  });
});

describe('1問の流れ', () => {
  it('真ん中から始まり、締め切りまで何度でも動ける', () => {
    const t = fateRoom(none(3));
    t.start();
    expect(Object.values(t.fate.pos)).toEqual(['C', 'C', 'C']);
    t.act(t.ids[1], { t: 'move', side: 'L' });
    t.act(t.ids[1], { t: 'move', side: 'R' });
    t.act(t.ids[1], { t: 'move', side: 'L' });
    expect(t.fate.pos[t.ids[1]]).toBe('L');
    const before = t.room;
    t.act(t.ids[1], { t: 'move', side: 'L' });       // 同じ側への移動は、状態を変えない（全員に送り直さない）
    t.act(t.ids[1], { t: 'move', side: 'X' as Side }); // おかしな値は受け付けない
    t.act('nobody', { t: 'move', side: 'L' });
    expect(t.room).toBe(before);
  });
  it('締め切りは、通信の遅れを見込んで少しあとに締める', () => {
    const t = fateRoom(none(2));
    t.start();
    const deadline = t.fate.deadline;
    t.ctx.now = deadline + FATE_GRACE_MS - 1;
    t.host({ t: 'timeUp' });
    expect(t.fate.phase).toBe('question');
    t.act(t.ids[1], { t: 'move', side: 'L' }); // 猶予の間に届いた移動は受け付ける
    expect(t.fate.pos[t.ids[1]]).toBe('L');
    t.ctx.now = deadline + FATE_GRACE_MS + 1;
    t.act(t.ids[1], { t: 'move', side: 'R' }); // 猶予を過ぎたら受け付けない
    expect(t.fate.pos[t.ids[1]]).toBe('L');
    t.act(t.ids[1], { t: 'timeUp' });          // 参加者は締められない
    expect(t.fate.phase).toBe('question');
    t.host({ t: 'timeUp' });
    expect(t.fate.phase).toBe('verdict');
  });
  it('不正解の側にいた人と、真ん中のままの人が落ちる', () => {
    const t = fateRoom(none(4));
    t.start();
    t.act(t.ids[0], { t: 'move', side: t.right() });
    t.act(t.ids[1], { t: 'move', side: t.right() });
    t.act(t.ids[2], { t: 'move', side: t.wrong() });
    t.close();
    expect(t.fate.verdict).toEqual({ fallen: [t.ids[2], t.ids[3]], out: [t.ids[2], t.ids[3]], saved: false });
    expect(t.fate.out).toEqual({ [t.ids[2]]: 0, [t.ids[3]]: 0 });
    // 数秒おいて、自動で次の問題へ。全員が真ん中に戻る
    expect(nextTimer(t.room)).toEqual({ at: t.ctx.now + FATE_VERDICT_MS, action: { t: 'revealStep' } });
    t.close();
    expect(t.fate.phase).toBe('question');
    expect(t.fate.round).toBe(1);
    expect(Object.values(t.fate.pos)).toEqual(['C', 'C', 'C', 'C']);
  });
  it('全員が不正解なら、全員セーフで次の問題へ', () => {
    const t = fateRoom(none(3));
    t.start();
    t.act(t.ids[0], { t: 'move', side: t.wrong() });
    t.act(t.ids[1], { t: 'move', side: t.wrong() });
    t.close();
    expect(t.fate.verdict).toEqual({ fallen: [], out: [], saved: true });
    expect(t.fate.out).toEqual({});
    t.close();
    expect(t.fate.phase).toBe('question');
  });
  it('全員が正解なら、そのまま次の問題へ', () => {
    const t = fateRoom(none(3));
    t.start();
    t.ids.forEach(id => t.act(id, { t: 'move', side: t.right() }));
    t.close();
    expect(t.fate.verdict).toEqual({ fallen: [], out: [], saved: false });
    t.close();
    expect(t.fate.round).toBe(1);
  });
});

describe('お立ち台に立つ人', () => {
  it('自分の問題では、どこにいても落ちない', () => {
    const t = fateRoom(none(3));
    t.start();
    t.authors([t.ids[0]]);
    t.act(t.ids[0], { t: 'move', side: t.wrong() }); // 作った人は、お立ち台に立っていて動けない
    expect(t.fate.pos[t.ids[0]]).toBe('C');
    t.act(t.ids[1], { t: 'move', side: t.right() });
    t.act(t.ids[2], { t: 'move', side: t.wrong() });
    t.close();
    expect(t.fate.verdict!.fallen).toEqual([t.ids[2]]);
  });
  it('作った人のほかが全員不正解なら、全員セーフ（自分の問題で勝ち残れない）', () => {
    const t = fateRoom(none(2));
    t.start();
    t.authors([t.ids[0]]);
    t.act(t.ids[1], { t: 'move', side: t.wrong() });
    t.close();
    expect(t.fate.verdict).toEqual({ fallen: [], out: [], saved: true });
  });
});

describe('ライフ', () => {
  it('落ちるたびに1つ減り、0になったら脱落する。残っている人は、次の問題でも答える', () => {
    const t = fateRoom(none(3), { lives: DEFAULT_FATE_LIVES });
    expect(DEFAULT_FATE_LIVES).toBe(3); // 2回のミスまで許される
    t.start();
    expect(t.fate.lives).toEqual({ [t.ids[0]]: 3, [t.ids[1]]: 3, [t.ids[2]]: 3 });
    for (let miss = 1; miss <= 3; miss++) {
      t.act(t.ids[0], { t: 'move', side: t.right() });
      t.act(t.ids[1], { t: 'move', side: t.right() });
      t.act(t.ids[2], { t: 'move', side: t.wrong() });
      t.close();
      expect(t.fate.verdict).toEqual({ fallen: [t.ids[2]], out: miss === 3 ? [t.ids[2]] : [], saved: false });
      expect(t.fate.lives[t.ids[2]]).toBe(3 - miss);
      expect(t.ids[2] in t.fate.out).toBe(miss === 3);
      expect(viewFor(t.room, t.ids[0], t.ctx.now).fate!.lives[t.ids[2]]).toBe(3 - miss); // ほかの人のライフも見える
      t.close();
    }
    expect(t.fate.out).toEqual({ [t.ids[2]]: 2 });
    expect(t.fate.lives[t.ids[0]]).toBe(3);
  });
  it('全員不正解で救済されたときは、ライフも減らない', () => {
    const t = fateRoom(none(2), { lives: 2 });
    t.start();
    t.close();
    expect(t.fate.verdict).toEqual({ fallen: [], out: [], saved: true });
    expect(Object.values(t.fate.lives)).toEqual([2, 2]);
  });
  it('ライフの数は、ホストがロビーで 1／2／3 から選ぶ', () => {
    const t = fateRoom(none(2), { lives: 2 });
    t.host({ t: 'fateLives', n: 4 });
    t.act(t.ids[1], { t: 'fateLives', n: 1 });
    expect(t.room.fateLives).toBe(2);
  });
});

describe('生き残りが2人以下のとき', () => {
  it('生き残りはお立ち台に立たない。ゴーストの番か、サンプルだけを出す', () => {
    const t = fateRoom([[q('a1'), q('a2'), q('a3')], [], [q('c1'), q('c2'), q('c3')]]);
    t.start(false);
    t.authors([]); // 1問目は全員が答えて、3人目だけが落ちる
    t.act(t.ids[0], { t: 'move', side: t.right() });
    t.act(t.ids[1], { t: 'move', side: t.right() });
    t.close();
    expect(t.fate.out).toEqual({ [t.ids[2]]: 0 });
    t.close();
    const asked: string[] = [];
    while (t.fate.phase === 'question') {
      const c = cardOf(t.fate);
      asked.push(c.text);
      expect(c.authorIds.every(id => id === t.ids[2])).toBe(true); // お立ち台に立つのは、ゴーストだけ
      t.act(t.ids[0], { t: 'move', side: t.right() });
      t.act(t.ids[1], { t: 'move', side: t.right() });
      t.close();
      t.close();
    }
    expect(asked.some(x => x.startsWith('a'))).toBe(false); // 生き残りが持ってきた問題は出さない
    expect(asked.filter(x => x.startsWith('c')).length).toBeGreaterThan(0); // ゴーストの問題は出る
    expect(asked.length).toBeGreaterThanOrEqual(SAMPLES);
    expect(t.fate.phase).toBe('result'); // 出せる問題がなくなったら、残った全員の勝ち
  });
  it('2人で始めたゲームでは、最初から誰もお立ち台に立たない', () => {
    const t = fateRoom([[q('a')], []]);
    t.start(false);
    expect(cardOf(t.fate).authorIds).toEqual([]);
    expect(cardOf(t.fate).sample).toBe(true);
  });
});

describe('ゴースト', () => {
  it('脱落しても動き回れるが、結果には関わらない', () => {
    const t = fateRoom(none(3));
    t.start();
    t.act(t.ids[0], { t: 'move', side: t.right() });
    t.act(t.ids[1], { t: 'move', side: t.right() });
    t.close(); // ids[2] が脱落
    t.close();
    t.act(t.ids[2], { t: 'move', side: t.right() });
    expect(t.fate.pos[t.ids[2]]).toBe(t.right());
    // 生き残りの2人が不正解 → ゴーストが正解の側にいても「全員不正解」でセーフ
    t.act(t.ids[0], { t: 'move', side: t.wrong() });
    t.act(t.ids[1], { t: 'move', side: t.wrong() });
    t.close();
    expect(t.fate.verdict).toEqual({ fallen: [], out: [], saved: true });
    expect(t.fate.out).toEqual({ [t.ids[2]]: 0 });
  });
});

describe('終わり方と順位', () => {
  it('生き残りが1人になったら、発表のあとに結果へ', () => {
    const t = fateRoom(none(3));
    t.start();
    t.act(t.ids[1], { t: 'move', side: t.right() });
    t.close();
    expect(t.fate.phase).toBe('verdict');
    expect(survivors(t.room, t.fate).map(p => p.id)).toEqual([t.ids[1]]);
    t.close();
    expect(t.fate.phase).toBe('result');
    expect(nextTimer(t.room)).toBeNull();
    t.host({ t: 'lobby' });
    expect(t.room.game).toBeNull();
    expect(t.room.gameMode).toBe('fate');
  });
  it('問題がなくなっても2人以上残っていたら、残った全員の勝ち', () => {
    const t = fateRoom(none(3));
    t.start();
    const n = t.fate.deck.length;
    for (let i = 0; i < n; i++) {
      expect(t.fate.phase).toBe('question');
      // 1問目で1人だけ落ち、あとは全員正解
      t.ids.slice(0, i === 0 ? 2 : 3).forEach(id => t.act(id, { t: 'move', side: t.right() }));
      t.close();
      t.close();
    }
    expect(t.fate.phase).toBe('result');
    expect(fateRanks(t.ids, t.fate.out)).toEqual({ [t.ids[0]]: 1, [t.ids[1]]: 1, [t.ids[2]]: 3 });
  });
  it('順位は、落ちるのが遅かった順。同じ問題で落ちた人は同じ順位', () => {
    expect(fateRanks(['a', 'b', 'c', 'd', 'e'], { b: 3, c: 3, d: 0, e: 5 })).toEqual({ a: 1, e: 2, b: 3, c: 3, d: 5 });
  });
  it('切断中の人は真ん中のままなので、次の締め切りで落ちる', () => {
    const t = fateRoom(none(3));
    t.start();
    t.act(t.ids[2], { t: 'leave' });
    t.act(t.ids[0], { t: 'move', side: t.right() });
    t.act(t.ids[1], { t: 'move', side: t.right() });
    t.close();
    expect(t.fate.verdict!.fallen).toEqual([t.ids[2]]);
  });
});

describe('一時停止', () => {
  it('ホストが止めると時間が止まり、再開すると残りから続く', () => {
    const t = fateRoom(none(2));
    t.start();
    t.advance(4000);
    t.act(t.ids[1], { t: 'pause' }); // 参加者は止められない
    expect(t.fate.paused).toBeNull();
    t.host({ t: 'pause' });
    expect(t.fate.paused).toBe(DEFAULT_FATE_TIME * 1000 - 4000);
    expect(nextTimer(t.room)).toBeNull();
    t.advance(60_000);
    t.host({ t: 'timeUp' });
    expect(t.fate.phase).toBe('question');
    t.host({ t: 'pause' });
    expect(t.fate.deadline).toBe(t.ctx.now + DEFAULT_FATE_TIME * 1000 - 4000);
    // 発表のあとの待ち時間も止められる
    t.close();
    t.advance(1000);
    t.host({ t: 'pause' });
    expect(nextTimer(t.room)).toBeNull();
    t.host({ t: 'pause' });
    expect(nextTimer(t.room)).toEqual({ at: t.ctx.now + FATE_VERDICT_MS - 1000, action: { t: 'revealStep' } });
  });
});

describe('見せる情報', () => {
  it('正解の側は、発表までは、お立ち台に立っている人にだけ送る', () => {
    const t = fateRoom(none(2));
    t.start();
    t.authors([t.ids[0]]);
    const side = t.right();
    const mine = viewFor(t.room, t.ids[0], t.ctx.now), other = viewFor(t.room, t.ids[1], t.ctx.now);
    expect(mine.fate!.answer).toBe(side);       // お立ち台の人には、正解の側が見える
    expect(other.fate!.answer).toBeNull();
    expect(JSON.stringify(other)).not.toContain('rightSide');
    for (const v of [mine, other]) {
      expect(v.phase).toBe('question');
      expect(v.fate!.verdict).toBeNull();
      expect(v.timeLeft).toBe(DEFAULT_FATE_TIME * 1000);
      expect(v.fate!.authorIds).toEqual([t.ids[0]]);
    }
    t.act(t.ids[1], { t: 'move', side: 'L' });
    expect(viewFor(t.room, t.ids[0], t.ctx.now).fate!.pos).toEqual({ [t.ids[0]]: 'C', [t.ids[1]]: 'L' }); // 他人の位置は見える
    t.close();
    const v = viewFor(t.room, t.ids[1], t.ctx.now).fate!;
    expect(v.verdict!.rightSide).toBe(side);
    expect(v.answer).toBeNull();
  });
});

describe('シミュレーション', () => {
  it('300ゲーム：止まらず、必ず誰かが勝って終わる', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rnd = seeded(seed * 104729);
      const n = 2 + Math.floor(rnd() * (MAX_PLAYERS - 1));
      const t = fateRoom(Array.from({ length: n }, (_, i) => rnd() < 0.4 ? [q(`P${i}`), q('共通')] : []), { seed, lives: 1 + seed % 3 });
      t.start(false);
      let steps = 0;
      while (t.fate.phase !== 'result') {
        if (++steps > 500) throw new Error(`止まった: seed=${seed}`);
        if (t.fate.phase === 'question') {
          for (const p of t.room.players.filter(x => x.online)) {
            const r = rnd();
            if (p.id !== t.ids[0] && r < 0.02) t.act(p.id, { t: 'leave' });
            else if (r < 0.9) t.act(p.id, { t: 'move', side: rnd() < 0.6 ? t.right() : t.wrong() });
          }
          if (rnd() < 0.05) { t.host({ t: 'pause' }); t.advance(3000); t.host({ t: 'pause' }); }
        }
        t.close();
      }
      const alive = survivors(t.room, t.fate);
      expect(alive.length).toBeGreaterThanOrEqual(1);
      if (alive.length > 1) expect(t.fate.round).toBe(t.fate.deck.length - 1); // 2人以上残るのは、問題を使い切ったときだけ
      expect(Object.values(fateRanks(t.room.players.map(p => p.id), t.fate.out)).filter(r => r === 1)).toHaveLength(alive.length);
    }
    }, 120_000);
});
