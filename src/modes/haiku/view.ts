// ハイカー575 で各参加者に見せてよい情報。書いている間は、自分の手元の短冊だけを送る（ほかの短冊は発表まで見せない）
import { HAIKU_LINES, type HaikuStyle } from './themes';
import { currentSheet, sheetOf, textOf, type HaikuState, type Sheet } from './rules';

export interface HaikuCell { ch: string; by: string | null; byName: string; auto: boolean } // by = null はお題の文字
export interface HaikuWork { ownerId: string; ownerName: string; themeBy: string; text: string; pts: number | null }

export interface HaikuView {
  style: HaikuStyle;
  step: number;
  steps: number;
  // 書いている間
  writing: boolean;        // 自分に書く番があるか（途中から見ている人などは false）
  text: string;            // 手元の短冊に、ここまで書かれた文字（お題を含む）
  themeLen: number;        // そのうち、お題の文字数
  myDraft: string | null;  // この回に自分が書いた文字
  // 発表
  work: (HaikuWork & {
    idx: number; total: number;
    shown: number;          // めくった行の数（0〜3）
    lines: string[];        // めくった行だけ
    cells: HaikuCell[] | null; // 全部めくってから：1文字ごとに、誰が書いたか
    rating: boolean; done: boolean;
    myRating: number | null;
    ratings: { id: string; name: string; n: number }[] | null; // 締め切ってから：誰が何点を付けたか
  }) | null;
  gallery: HaikuWork[] | null; // 最終結果：できた作品
}

const workOf = (s: Sheet, withText: boolean): HaikuWork =>
  ({ ownerId: s.ownerId, ownerName: s.ownerName, themeBy: s.themeBy, text: withText ? textOf(s) : '', pts: s.pts });

export function haikuView(g: HaikuState, id: string): HaikuView {
  const mine = g.phase === 'write' ? g.sheets[sheetOf(g, id)] : undefined;
  const sh = g.phase === 'recite' ? g.show : null, sheet = sh ? currentSheet(g) : null;
  let work: HaikuView['work'] = null;
  if (sh && sheet) {
    const all = sh.shown >= 3;
    const chars = [...textOf(sheet)], shownLen = HAIKU_LINES.slice(0, sh.shown).reduce((a, b) => a + b, 0);
    const themeLen = sheet.theme ? [...sheet.theme].length : 0;
    let at = 0;
    work = {
      ...workOf(sheet, all), pts: sh.done ? sheet.pts : null,
      idx: sh.idx, total: sh.order.length, shown: sh.shown,
      lines: HAIKU_LINES.slice(0, sh.shown).map(n => chars.slice(at, at += n).join('')),
      cells: all ? chars.slice(0, shownLen).map((ch, i) => {
        const c = i < themeLen ? null : sheet.cells[i - themeLen];
        return { ch, by: c?.by ?? null, byName: c ? g.names[c.by] ?? '???' : `お題（${sheet.themeBy}）`, auto: !!c?.auto };
      }) : null,
      rating: sh.rating, done: sh.done,
      myRating: sheet.ratings[id] ?? null,
      ratings: sh.done ? Object.entries(sheet.ratings).map(([pid, n]) => ({ id: pid, name: g.names[pid] ?? '???', n })) : null,
    };
  }
  return {
    style: g.style, step: g.step, steps: g.steps,
    writing: !!mine,
    text: mine ? textOf(mine) : '',
    themeLen: mine?.theme ? [...mine.theme].length : 0,
    myDraft: g.phase === 'write' ? g.drafts[id] ?? null : null,
    work,
    gallery: g.phase === 'result' ? g.sheets.map(s => workOf(s, true)) : null,
  };
}
