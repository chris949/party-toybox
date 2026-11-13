// 爆弾まわしのお題（このフォルダの README.md の 16.3）。セレクトファイブのお題を、1人に1つずつ配る
import { shuffle } from '../../core/random';
import type { Ctx, RoomState } from '../../core/types';
import { deal, fivePool } from '../five/rules';
import { SAMPLE_FIVES } from '../five/topics';

export interface Quiz {
  title: string;
  by: string;           // お題を作った人の名前（サンプルなら「サンプル」）
  options: string[];
  correct: boolean[];   // options と同じ並び（選ぶまで、参加者には送らない）
  used: boolean[];      // 当てた正解
  wrong: boolean[];     // 選んでしまったダミー
}

// 配れるお題：みんなが持ってきたもの＋同梱のサンプル
export function quizPool(room: RoomState) {
  return [...fivePool(room), ...SAMPLE_FIVES.map(t => ({ ...t, authorId: null as string | null, authorName: 'サンプル' }))];
}

// その人に配るお題を1つ選ぶ。まだ使っていないもの・自分が作っていないものを優先する
export function dealQuiz(room: RoomState, id: string, used: string[], ctx: Ctx): Quiz {
  const pool = shuffle(quizPool(room), ctx.random);
  const t = pool.find(x => !used.includes(x.title) && x.authorId !== id) ?? pool.find(x => !used.includes(x.title)) ?? pool.find(x => x.authorId !== id) ?? pool[0];
  used.push(t.title);
  const d = deal(t, ctx);
  return { title: t.title, by: t.authorName, options: d.options, correct: d.correct, used: d.options.map(() => false), wrong: d.options.map(() => false) };
}

// まだ当てていない正解が残っているか
export const hasAnswer = (q: Quiz) => q.correct.some((c, i) => c && !q.used[i]);

// 文字を比べるための形（空白を取り、カタカナをひらがなに、英字を小文字に）
export const normalizeWord = (w: string) => w.replace(/\s+/g, '').toLowerCase().replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
// 入力式：打ち込んだ文字と合う選択肢の番号（なければ -1）
export const matchOption = (options: readonly string[], text: string) => {
  const key = normalizeWord(text);
  return key ? options.findIndex(o => normalizeWord(o) === key) : -1;
};
