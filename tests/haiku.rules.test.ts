import { describe, expect, it } from 'vitest';
import { DEFAULT_HAIKU_TIME, HAIKU_RATE_SEC, MAX_PLAYERS, PICK_GRACE_MS } from '../src/core/constants';
import { SAMPLE_HAIKUS, sanitizeHaikus, toKana, toLines, toTheme } from '../src/core/haikus';
import { nextTimer } from '../src/core/room';
import { seeded } from '../src/core/random';
import { currentSheet, sheetOf, textOf, writerOf, type HaikuState } from '../src/modes/haiku/rules';
import { viewFor } from '../src/modes/tier/view';
import { samples, testRoom } from './helpers';

// ゲーム開始の手前まで。haikus[i] は i 番目の人が持ってくるお題
function haikuRoom(haikus: string[][], opts: { seed?: number; style?: 'theme' | 'free' } = {}) {
  const t = testRoom(haikus.map(() => samples()), { seed: opts.seed });
  t.ids.forEach((id, i) => t.act(id, { t: 'join', name: `プレイヤー${i}`, key: `k${i}`, topics: samples(), haikus: haikus[i], version: 'test' }));
  t.host({ t: 'game', mode: 'haiku' });
  if (opts.style) t.host({ t: 'haikuStyle', style: opts.style });
  const g = () => t.room.game as HaikuState;
  return {
    ids: t.ids, ctx: t.ctx, act: t.act, host: t.host, advance: t.advance,
    get room() { return t.room; },
    get g() { return g(); },
    // 全員が1文字ずつ書く（ch を省くと、人ごとに違う文字）
    writeAll(ch?: string) { const step = g().step; for (const id of g().ring) if (g().phase === 'write' && g().step === step) t.act(id, { t: 'kana', step, ch: ch ?? 'あいうえおかきくけこ'[t.ids.indexOf(id)] }); },
    // タイマーの時刻まで進めて、その操作をする
    tick() { const timer = nextTimer(t.room)!; t.ctx.now = timer.at; t.host(timer.action); },
    // 発表まで、全部書く
    writeToEnd() { while (g().phase === 'write') this.writeAll(); },
  };
}
const none = (n: number): string[][] => Array.from({ length: n }, () => []);

describe('文字とお題の決まり', () => {
  it('書けるのは、ひらがな1文字。カタカナはひらがなに直す', () => {
    expect(toKana('あ')).toBe('あ');
    expect(toKana('ア')).toBe('あ');
    expect(toKana('ヴ')).toBe('ゔ');
    expect(toKana('ゃ')).toBe('ゃ');
    expect(toKana('ー')).toBe('ー');
    expect(toKana(' かき ')).toBe('か'); // 2文字以上は、最初の1文字
    for (const x of ['', 'a', '漢', '1', '！', '😀', null, undefined, 3]) expect(toKana(x)).toBeNull();
  });
  it('お題は、ひらがな5文字', () => {
    expect(toTheme('ふるいけや')).toBe('ふるいけや');
    expect(toTheme('フルイケヤ')).toBe('ふるいけや');
    for (const x of ['ふるいけ', 'ふるいけやあ', '古池や', 'ふるいけa']) expect(toTheme(x)).toBeNull();
    expect(sanitizeHaikus(['ふるいけや', 'だめ', 'ふるいけや', 'なつくさや', 5])).toEqual(['ふるいけや', 'なつくさや']);
  });
  it('同梱のサンプルは20個あり、すべて正しい形で、重複がない', () => {
    expect(SAMPLE_HAIKUS).toHaveLength(20);
    expect(sanitizeHaikus(SAMPLE_HAIKUS)).toEqual(SAMPLE_HAIKUS);
  });
  it('17文字を、五・七・五に分ける', () => {
    expect(toLines('ふるいけやかわずとびこむみずのおと')).toEqual(['ふるいけや', 'かわずとびこむ', 'みずのおと']);
    expect(toLines('ふるいけやかわ')).toEqual(['ふるいけや', 'かわ', '']);
  });
});

describe('ロビー', () => {
  it('遊び方と制限時間は、ホストが選ぶ。お題だけを持ってきた人も参加できる', () => {
    const t = haikuRoom(none(2));
    expect(t.room.haikuStyle).toBe('theme');
    expect(t.room.haikuTime).toBe(DEFAULT_HAIKU_TIME);
    t.act(t.ids[1], { t: 'haikuStyle', style: 'free' });
    t.host({ t: 'haikuTime', sec: 7 });
    expect([t.room.haikuStyle, t.room.haikuTime]).toEqual(['theme', DEFAULT_HAIKU_TIME]);
    t.host({ t: 'haikuStyle', style: 'free' });
    t.host({ t: 'haikuTime', sec: 10 });
    expect([t.room.haikuStyle, t.room.haikuTime]).toEqual(['free', 10]);
    t.act('x', { t: 'join', name: 'x', key: 'kx', topics: [], haikus: ['なつくさや'], version: 'test' });
    expect(t.room.haikusBy.x).toEqual(['なつくさや']);
  });
});

describe('短冊を配る', () => {
  it('お題持ち寄り：1人1枚。担当者が持ってきたお題を使い、なければサンプル。残り12文字を書く', () => {
    const t = haikuRoom([['あいうえお', 'かきくけこ'], [], ['あいうえお']]);
    t.host({ t: 'start' });
    expect(t.g.steps).toBe(12);
    expect(t.g.sheets.map(s => s.ownerId).sort()).toEqual([...t.ids].sort());
    const of = (id: string) => t.g.sheets.find(s => s.ownerId === id)!;
    expect(['あいうえお', 'かきくけこ']).toContain(of(t.ids[0]).theme);
    expect(of(t.ids[0]).themeBy).toBe('プレイヤー0');
    expect(SAMPLE_HAIKUS).toContain(of(t.ids[1]).theme);
    expect(of(t.ids[1]).themeBy).toBe('サンプル');
    expect(new Set(t.g.sheets.map(s => s.theme)).size).toBe(3); // 同じお題は、1ゲームに1回まで
  });
  it('17文字ぜんぶ：お題なしで、17文字を書く', () => {
    const t = haikuRoom([['あいうえお'], []], { style: 'free' });
    t.host({ t: 'start' });
    expect(t.g.steps).toBe(17);
    expect(t.g.sheets.every(s => s.theme === null)).toBe(true);
  });
});

describe('書く', () => {
  it('全員が1文字書くと、短冊が隣へ回る。手元の短冊は、それまでの文字が全部見える', () => {
    const t = haikuRoom(none(3));
    t.host({ t: 'start' });
    const first = Object.fromEntries(t.ids.map(id => [id, sheetOf(t.g, id)]));
    expect(new Set(Object.values(first)).size).toBe(3);
    expect(t.ids.every(id => t.g.sheets[first[id]].ownerId === id)).toBe(true); // 最初は、自分が担当の短冊
    const v0 = viewFor(t.room, t.ids[0], t.ctx.now);
    expect(v0.phase).toBe('write');
    expect(v0.haiku).toMatchObject({ step: 0, steps: 12, writing: true, themeLen: 5, myDraft: null });
    expect(v0.haiku!.text).toBe(t.g.sheets[first[t.ids[0]]].theme);
    expect(v0.timeLeft).toBe(DEFAULT_HAIKU_TIME * 1000);

    t.act(t.ids[0], { t: 'kana', step: 0, ch: 'ネ' });
    expect(t.g.drafts[t.ids[0]]).toBe('ね'); // カタカナは、ひらがなに
    const before = t.room;
    t.act(t.ids[0], { t: 'kana', step: 0, ch: 'こ' }); // 書いたら、その回は変えられない
    t.act(t.ids[1], { t: 'kana', step: 1, ch: 'こ' }); // 回が違う
    t.act(t.ids[1], { t: 'kana', step: 0, ch: 'x' });  // ひらがなでない
    t.act('nobody', { t: 'kana', step: 0, ch: 'あ' });
    expect(t.room).toBe(before);
    expect(viewFor(t.room, t.ids[1], t.ctx.now).players.map(p => p.done)).toEqual([true, false, false]);

    t.act(t.ids[1], { t: 'kana', step: 0, ch: 'こ' });
    t.act(t.ids[2], { t: 'kana', step: 0, ch: 'だ' });
    expect(t.g.step).toBe(1); // 全員そろったら、時間を待たずに次へ
    expect(t.g.sheets[first[t.ids[0]]].cells).toEqual([{ ch: 'ね', by: t.ids[0], auto: false }]);
    for (const id of t.ids) expect(sheetOf(t.g, id)).not.toBe(first[id]); // 別の短冊が回ってくる
    const mine = t.g.sheets[sheetOf(t.g, t.ids[0])];
    expect(viewFor(t.room, t.ids[0], t.ctx.now).haiku!.text).toBe(textOf(mine)); // 前の人が書いた文字も見える
    expect([...textOf(mine)]).toHaveLength(6);
    expect(writerOf(t.g, sheetOf(t.g, t.ids[0]))).toBe(t.ids[0]);
  });
  it('1枚の短冊を、全員が順番に書く', () => {
    const t = haikuRoom(none(4));
    t.host({ t: 'start' });
    t.writeToEnd();
    for (const s of t.g.sheets) {
      expect(s.cells).toHaveLength(12);
      expect(s.cells[0].by).toBe(s.ownerId); // 1文字目は担当者
      expect(new Set(s.cells.slice(0, 4).map(c => c.by)).size).toBe(4);
      expect(s.cells.filter(c => c.by === s.ownerId)).toHaveLength(3);
      expect([...textOf(s)]).toHaveLength(17);
    }
  });
  it('時間切れ・切断中の人の分は、ランダムなひらがなで埋める', () => {
    const t = haikuRoom(none(3));
    t.host({ t: 'start' });
    t.act(t.ids[1], { t: 'kana', step: 0, ch: 'あ' });
    t.host({ t: 'timeUp' }); // まだ時間ではない
    expect(t.g.step).toBe(0);
    t.ctx.now = t.g.deadline + PICK_GRACE_MS;
    t.act(t.ids[1], { t: 'timeUp' }); // 参加者は締められない
    expect(t.g.step).toBe(0);
    t.tick();
    expect(t.g.step).toBe(1);
    const cells = t.g.sheets.map(s => s.cells[0]);
    expect(cells.filter(c => c.auto).map(c => c.by).sort()).toEqual([t.ids[0], t.ids[2]].sort());
    expect(cells.every(c => toKana(c.ch) === c.ch)).toBe(true);
    // 切断した人は待たない
    t.act(t.ids[2], { t: 'leave' });
    t.act(t.ids[0], { t: 'kana', step: 1, ch: 'い' });
    t.act(t.ids[1], { t: 'kana', step: 1, ch: 'う' });
    expect(t.g.step).toBe(2);
    // ホストは、待たずに進められる
    t.host({ t: 'force' });
    expect(t.g.step).toBe(3);
  });
});

describe('発表と採点', () => {
  const toRecite = (n = 3) => { const t = haikuRoom(none(n)); t.host({ t: 'start' }); t.writeToEnd(); return t; };
  it('五・七・五を1行ずつ出す。全部出るまで、続きの文字は送らない', () => {
    const t = toRecite();
    expect(t.g.phase).toBe('recite');
    expect([...t.g.show!.order].sort()).toEqual([0, 1, 2]);
    const sheet = currentSheet(t.g)!, full = textOf(sheet);
    let v = viewFor(t.room, t.ids[0], t.ctx.now);
    expect(v.phase).toBe('recite');
    expect(v.haiku!.work).toMatchObject({ idx: 0, total: 3, shown: 0, lines: [], cells: null, rating: false, text: '', ownerId: sheet.ownerId });
    expect(JSON.stringify(v)).not.toContain(full.slice(5));
    t.tick();
    v = viewFor(t.room, t.ids[0], t.ctx.now);
    expect(v.haiku!.work!.lines).toEqual([full.slice(0, 5)]);
    expect(JSON.stringify(v)).not.toContain(full.slice(5, 12));
    t.tick(); t.tick();
    v = viewFor(t.room, t.ids[0], t.ctx.now);
    expect(v.haiku!.work!.lines).toEqual(toLines(full));
    expect(v.haiku!.work!.rating).toBe(true);
    // 誰がどの文字を書いたか
    const cells = v.haiku!.work!.cells!;
    expect(cells.map(c => c.ch).join('')).toBe(full);
    expect(cells.slice(0, 5).every(c => c.by === null && c.byName === 'お題（サンプル）')).toBe(true);
    expect(cells[5]).toMatchObject({ by: sheet.ownerId, byName: sheet.ownerName, auto: false });
    expect(v.timeLeft).toBe(HAIKU_RATE_SEC * 1000);
  });
  it('担当者以外が★1〜5を付ける。点は平均×10で、担当者に入る', () => {
    const t = toRecite(4);
    t.host({ t: 'reveal-all' });
    const sheet = () => currentSheet(t.g)!;
    const owner = sheet().ownerId, others = t.ids.filter(id => id !== owner);
    t.act(owner, { t: 'rate', round: 0, n: 5 });        // 担当者は採点しない
    t.act(others[0], { t: 'rate', round: 0, n: 6 });    // 範囲外
    t.act(others[0], { t: 'rate', round: 1, n: 3 });    // 別の作品
    expect(sheet().ratings).toEqual({});
    t.act(others[0], { t: 'rate', round: 0, n: 2 });
    t.act(others[0], { t: 'rate', round: 0, n: 5 });    // 締め切りまでは付け直せる
    t.act(others[1], { t: 'rate', round: 0, n: 4 });
    let v = viewFor(t.room, others[2], t.ctx.now);
    expect(v.haiku!.work).toMatchObject({ rating: true, done: false, ratings: null, pts: null, myRating: null }); // 締め切るまで、ほかの人の点は見えない
    expect(v.players.find(p => p.id === owner)!.done).toBeNull();
    expect(v.players.find(p => p.id === others[0])!.done).toBe(true);
    expect(v.players.find(p => p.id === others[2])!.done).toBe(false);
    t.act(others[2], { t: 'rate', round: 0, n: 4 });    // 全員そろったら締め切る
    expect(t.g.show).toMatchObject({ rating: false, done: true });
    expect(sheet().pts).toBe(43); // (5+4+4)/3 = 4.33… → 43点
    expect(t.room.players.find(p => p.id === owner)!.score).toBe(43);
    v = viewFor(t.room, owner, t.ctx.now);
    expect(v.haiku!.work!.pts).toBe(43);
    expect(v.haiku!.work!.ratings!.map(r => r.n).sort()).toEqual([4, 4, 5]);
    expect(nextTimer(t.room)).toBeNull(); // 次へ進めるのはホスト
  });
  it('30秒で採点を締め切る。誰も付けなければ0点。ホストは待たずに締められる', () => {
    const t = toRecite(3);
    t.host({ t: 'reveal-all' });
    t.tick();
    expect(t.g.show!.done).toBe(true);
    expect(currentSheet(t.g)!.pts).toBe(0);
    t.act(t.ids[1], { t: 'next' }); // 参加者は進められない
    expect(t.g.show!.idx).toBe(0);
    t.host({ t: 'next' });
    expect(t.g.show).toMatchObject({ idx: 1, shown: 0, rating: false, done: false });
    t.host({ t: 'reveal-all' });
    const rater = t.ids.find(id => id !== currentSheet(t.g)!.ownerId)!;
    t.act(rater, { t: 'rate', round: 1, n: 3 });
    t.host({ t: 'force' });
    expect(currentSheet(t.g)!.pts).toBe(30);
  });
  it('「一気に出す」は、ホストと担当者だけ', () => {
    const t = toRecite(3);
    const owner = currentSheet(t.g)!.ownerId;
    const other = t.ids.find(id => id !== owner && id !== t.ids[0]);
    if (other) { t.act(other, { t: 'reveal-all' }); expect(t.g.show!.shown).toBe(0); }
    t.act(owner, { t: 'reveal-all' });
    expect(t.g.show).toMatchObject({ shown: 3, rating: true });
  });
  it('全部の作品を発表したら結果へ。できた作品を全部見せて、ロビーに戻れる', () => {
    const t = toRecite(3);
    for (let i = 0; i < 3; i++) {
      t.host({ t: 'reveal-all' });
      for (const id of t.ids) t.act(id, { t: 'rate', round: i, n: i + 3 });
      t.host({ t: 'next' });
    }
    expect(t.g.phase).toBe('result');
    const v = viewFor(t.room, t.ids[0], t.ctx.now);
    expect(v.haiku!.gallery!.map(w => w.pts).sort()).toEqual([30, 40, 50]);
    expect(v.haiku!.gallery!.every(w => [...w.text].length === 17)).toBe(true);
    expect(t.room.players.map(p => p.score).sort()).toEqual([30, 40, 50]);
    t.host({ t: 'lobby' });
    expect(t.room.game).toBeNull();
    expect(t.room.gameMode).toBe('haiku');
  });
});

describe('シミュレーション', () => {
  it('200ゲーム：止まらず、全部の短冊が17文字になり、全員に点が付く', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = seeded(seed * 7919);
      const n = 2 + Math.floor(rnd() * (MAX_PLAYERS - 1));
      const t = haikuRoom(Array.from({ length: n }, () => rnd() < 0.3 ? ['あいうえお', 'かきくけこ'] : []), { seed, style: rnd() < 0.5 ? 'free' : 'theme' });
      t.host({ t: 'start' });
      let steps = 0;
      while (t.g.phase !== 'result') {
        if (++steps > 2000) throw new Error(`止まった: seed=${seed} phase=${t.g.phase}`);
        const g = t.g, now = g.phase;
        for (const p of t.room.players.filter(x => x.online)) {
          const r = rnd();
          if (p.id !== t.ids[0] && r < 0.01) { t.act(p.id, { t: 'leave' }); continue; }
          if (now === 'write' && r < 0.85) t.act(p.id, { t: 'kana', step: g.step, ch: 'あ' });
          if (now === 'recite' && r < 0.85) t.act(p.id, { t: 'rate', round: t.g.show!.idx, n: 1 + Math.floor(rnd() * 5) });
        }
        const timer = nextTimer(t.room);
        if (timer) t.tick(); else t.host({ t: 'next' });
      }
      expect(t.g.sheets.every(s => [...textOf(s)].length === 17 && s.pts != null && s.pts >= 0 && s.pts <= 50)).toBe(true);
      expect(t.g.sheets).toHaveLength(n);
    }
  }, 120_000);
});
