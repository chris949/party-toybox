// ハイカー575 のお題（上の五文字）と、文字の決まり。数字の根拠は src/modes/haiku/README.md の12章
import { MAX_TOPICS_PER_PLAYER } from '../../core/constants';

export const HAIKU_LINES = [5, 7, 5] as const; // 五・七・五
export const HAIKU_LEN = 17;
export const THEME_LEN = 5;                     // お題（上の五文字）の長さ

export const HAIKU_STYLES = { theme: 'お題持ち寄り', free: '17文字ぜんぶ' } as const;
export type HaikuStyle = keyof typeof HAIKU_STYLES;

const KANA = /^[ぁ-ゖー]$/; // ひらがな（小さい文字を含む）と「ー」

// 1文字のひらがなにする。カタカナは、ひらがなに直す。書けない文字は null
export function toKana(s: unknown): string | null {
  const first = [...String(s ?? '').trim()][0];
  if (!first) return null;
  const code = first.codePointAt(0)!;
  const ch = code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : first;
  return KANA.test(ch) ? ch : null;
}

// お題：ひらがな5文字。それ以外は null
export function toTheme(s: unknown): string | null {
  const chars = [...String(s ?? '').trim()].map(toKana);
  return chars.length === THEME_LEN && chars.every(Boolean) ? chars.join('') : null;
}

// 参加者から届いたお題を検査して整える
export function sanitizeHaikus(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.slice(0, MAX_TOPICS_PER_PLAYER).map(toTheme).filter((t): t is string => !!t))];
}

// 時間切れの人の分を埋める文字
export const RANDOM_KANA = [...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん'];

// 同梱のサンプル。誰もお題を作っていなくても10人まで遊べるよう20個用意する
export const SAMPLE_HAIKUS = [
  'ふるいけや', 'なつくさや', 'しずけさや', 'あさごはん', 'かえりみち', 'げつようび', 'ねむいのに', 'おこづかい', 'ふゆのあさ', 'なつやすみ',
  'はらへった', 'しごとばで', 'ともだちと', 'よるおそく', 'すきなひと', 'おかあさん', 'にちようび', 'あめのひは', 'ゆめのなか', 'さいふには',
];

// 17文字を、五・七・五の3行に分ける（足りない分は、そこまで）
export const toLines = (text: string): string[] => {
  const chars = [...text];
  let at = 0;
  return HAIKU_LINES.map(n => chars.slice(at, at += n).join(''));
};
