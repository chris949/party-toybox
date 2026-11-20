// お題の「1行に1つ」の読み書き（docs/spec.md の 3.3.1）
import { describe, expect, it } from 'vitest';
import { aiPrompt, parseFate, parseFive, parseLines, parseTier, writeFate, writeFive, writeLines, writeTier } from '../src/core/topicText';
import { toTheme } from '../src/modes/haiku/themes';
import { clean } from '../src/core/text';
import { ALL_SAMPLE_TOPICS, type Topic } from '../src/modes/tier/topics';
import { SAMPLE_FIVES } from '../src/modes/five/topics';
import { SAMPLE_FATES } from '../src/modes/fate/questions';

describe('ティアリスト', () => {
  it('AI の前置き・コードの囲み・箇条書きの記号を読み飛ばす', () => {
    const r = parseTier([
      'はい、作りました！', '```', '## 1. **好きな果物は？**', '- りんご', '・みかん', '1. ぶどう', '2) もも', 'いちご', 'いちご', '```',
      '', '# 少ない', 'a', 'b',
    ].join('\n'));
    expect(r.ok).toEqual([{ title: '好きな果物は？', options: ['りんご', 'みかん', 'ぶどう', 'もも', 'いちご'], count: 5 }]);
    expect(r.bad).toEqual([{ title: '少ない', reason: '選択肢が2個です（5個以上必要）' }]);
  });
  it('見出しの頭の番号を読み飛ばす', () => {
    expect(parseFate('# Q3. 問い\n○ a\n× b\n# 第2問 問い2\n○ a\n× b').ok.map(q => q.text)).toEqual(['問い', '問い2']);
  });
  it('「42.195キロ」のような数字は削らない', () => {
    const r = parseTier('# 距離\n42.195キロ\n10キロ\n5キロ\n3キロ\n1キロ');
    expect(r.ok[0].options[0]).toBe('42.195キロ');
  });
  it('書き出したものを読むと同じお題に戻る（出題数も）', () => {
    const ts: Topic[] = ALL_SAMPLE_TOPICS.map(([title, options]) => ({ title, options, count: 5 }));
    expect(parseTier(writeTier(ts))).toEqual({ ok: ts, bad: [] });
  });
});

describe('セレクトファイブ', () => {
  it('○ が正解、× がダミー。印の揺れも読む', () => {
    const r = parseFive('# 哺乳類\n○ イルカ\n〇 クジラ\n◯ ラッコ\nO コウモリ\n⭕ アザラシ\n× ペンギン\nX サメ\n✕ ワニ');
    expect(r.ok[0]).toMatchObject({ answers: ['イルカ', 'クジラ', 'ラッコ', 'コウモリ', 'アザラシ'], dummies: ['ペンギン', 'サメ', 'ワニ'], dummy: null });
  });
  it('印がないと、理由を見せて取り込まない', () => {
    expect(parseFive('# 印なし\na\nb\nc\nd\ne\nf\ng').bad[0].reason).toContain('「○」');
  });
  it('書き出したものを読むと同じお題に戻る', () => {
    const ts = [...SAMPLE_FIVES, { ...SAMPLE_FIVES[0], size: 8, dummy: 3 }];
    expect(parseFive(writeFive(ts))).toEqual({ ok: ts, bad: [] });
  });
});

describe('運命の二者択一', () => {
  it('○ と × を1つずつ', () => {
    const r = parseFate('# 富士山の高さは？\n○ 3776メートル\n× 3667メートル\n\n# 2つある\n○ a\n○ b\n× c\n\n# 不正解なし\n○ a');
    expect(r.ok).toEqual([{ text: '富士山の高さは？', right: '3776メートル', wrong: '3667メートル' }]);
    expect(r.bad.map(b => b.title)).toEqual(['2つある', '不正解なし']);
  });
  it('書き出したものを読むと同じ問題に戻る', () => {
    expect(parseFate(writeFate(SAMPLE_FATES))).toEqual({ ok: SAMPLE_FATES, bad: [] });
  });
});

describe('AI に頼む文面', () => {
  it('テーマと数が入り、書き方の見本はそのまま読める形になっている', () => {
    const p = aiPrompt('five', '日本の地理', 7);
    expect(p).toContain('7個'); expect(p).toContain('テーマ：日本の地理');
    expect(aiPrompt('tier', '', 5)).toContain('おまかせ');
  });
});

describe('1行に1つのお題（ハイカー575・ワードブーケ）', () => {
  it('行の頭の記号・番号・「#」・かぎかっこを外して読む。重なりは1つにまとめる', () => {
    const r = parseLines('はい、作りました！\n```\n1. ふるいけや\n- 「なつやすみ」\n# ナツヤスミ\n**あさごはん**\n\nふるいけや\n```', toTheme, 'ひらがな5文字ではありません');
    expect(r.ok.map(t => t.text)).toEqual(['ふるいけや', 'なつやすみ', 'あさごはん']); // カタカナは、ひらがなに直る
    expect(r.bad).toEqual([{ title: 'はい、作りました！', reason: 'ひらがな5文字ではありません' }]);
  });
  it('ワードブーケ：長すぎる言葉は、決まった長さで切る。書き出したものを、そのまま読める', () => {
    const fix = (l: string) => clean(l, 12) || null;
    const r = parseLines('・味噌汁\n2) 愛してる\nあいうえおかきくけこさしすせそ', fix, '読み取れませんでした');
    expect(r.ok.map(t => t.text)).toEqual(['味噌汁', '愛してる', 'あいうえおかきくけこさし']);
    expect(parseLines(writeLines(r.ok), fix, '').ok).toEqual(r.ok);
  });
  it('AIに頼む文面：どのモードにも、数とテーマと、1行に1つの書き方が入る', () => {
    for (const mode of ['haiku', 'bouquet', 'bouquetWords'] as const) {
      const p = aiPrompt(mode, '学校', 10);
      expect(p).toContain('10個'); expect(p).toContain('テーマ：学校'); expect(p).toContain('1行に1つ');
    }
    expect(aiPrompt('haiku', '', 5)).toContain('ちょうど5文字');
    expect(aiPrompt('bouquetWords', '', 5)).toContain('12文字まで');
  });
});
