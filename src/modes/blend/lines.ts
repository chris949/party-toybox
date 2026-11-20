// まぎれろ！のセリフ（キャラクターの上に出る、ひとこと。このフォルダの README.md の 15.10）
import { BLEND_LINE_MAX, BLEND_LINES_PER_PLAYER } from '../../core/constants';
import { clean } from '../../core/text';

// 参加者から届いた、持ち寄りのセリフを検査して整える（空・重複を除き、長さと数を上限に収める）
export function sanitizeBlendLines(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(w => clean(w, BLEND_LINE_MAX)).filter(Boolean) as string[])].slice(0, BLEND_LINES_PER_PLAYER);
}

// 同梱のセリフ：ふつうのひとり言と、あやしいひとこと（「人が動かしているのでは」と思わせる）を混ぜる
export const SAMPLE_LINES = [
  'ねむい…', 'おなかすいた', 'いい天気だなあ', 'ひまだなあ', 'どっこいしょ', 'ふう…', 'あ、ちょうちょ', 'おさんぽ中', 'るんるん♪', 'どこ行こう',
  'ほし、きれい', 'ほしだ！', 'あっちかな', 'こっちかな', 'まよった', 'ここどこ？', 'ただの通りすがり', 'ぼくはCPUです', '人じゃないよ', 'あやしくないよ',
  '撃たないで', 'みてないで', 'こっち見ないで', 'ばれてない？', 'ドキドキ', 'ひやひや', 'セーフ？', 'あぶない', 'しーっ', 'なんでもないよ',
  'あの子あやしい', 'となりが人だよ', '犯人はあいつ', 'さっきから見られてる', 'レーザーまぶしい', 'ねらわれてる？', 'にげよ', 'まぎれろ〜', 'ふつうに歩こう', '気のせいだよ',
] as const;
