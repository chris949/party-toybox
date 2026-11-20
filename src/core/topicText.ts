// お題を「1行に1つ」の文字で読み書きする（docs/spec.md の 3.3.1）。AI の返事の貼り付け、書き出し、別の端末への持ち運びに使う。
// JSON にしないのは、AI が書き間違えにくく、人が手で直しやすいため。画面・通信・ブラウザの機能は使わない
import { MAX_OPT, MIN_OPT, OPTION_MAX, TITLE_MAX } from './constants';
import { clean } from './text';
import { pickCount, topicKey, type Topic } from '../modes/tier/topics';
import { FIVE_DEFAULT_SIZE, fiveError, fiveKey, fitCounts, type FiveTopic } from '../modes/five/topics';
import { fateError, fateKey, type FateQuestion } from '../modes/fate/questions';

// bouquet = ワードブーケのお題、bouquetWords = ワードブーケの言葉
export type TextMode = 'tier' | 'five' | 'fate' | 'haiku' | 'bouquet' | 'bouquetWords';
// 1行に1つのお題（ハイカー575・ワードブーケ）
export interface LineItem { text: string }
export interface Parsed<T> { ok: T[]; bad: { title: string; reason: string }[] }

interface Block { title: string; lines: string[]; setting: { count?: number; dummy?: number | null } }

// ○ と × の書き方の揺れ。ラテン文字の O・X は、選択肢の頭文字（「Oasis」など）と区別するため、後ろに空白があるときだけ印とみなす
const RIGHT = /^(?:[○〇◯⭕]|[OＯ](?=\s))\s*/;
const WRONG = /^(?:[×✕✖❌]|[XＸ](?=\s))\s*/;
// 行の頭の箇条書きの記号と番号。「42.195キロ」を削らないよう、「1.」の後ろには空白を求める
const BULLET = /^(?:[-*+・•●▪︎]|\d+[)）]|[0-9０-９]+[.．、]\s)\s*/;
const HEAD_NO = /^(?:[QＱ]?[0-9０-９]+[.．、:：)）]|第[0-9０-９]+問[.．、:：]?)\s*/;
const SETTING = /^出題数[\s:：]*(\d+)(?:[\s、,，]*ダミー[\s:：]*(\d+|おまかせ))?\s*$/;

// 文字を「#」で始まる見出しごとに分ける。最初の見出しより前（AI の前置き）と、コードの囲み・太字の記号は読み飛ばす
function blocks(text: string): Block[] {
  const out: Block[] = [];
  let cur: Block | null = null;
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/\*\*|__|`/g, '').trim();
    if (!line) continue;
    const head = line.match(/^#+\s*(.*)$/);
    // 見出しの頭の番号（「1.」「Q1.」「第1問」）も読み飛ばす。AI が付けがちなため
    if (head) { cur = { title: head[1].replace(HEAD_NO, '').trim(), lines: [], setting: {} }; out.push(cur); continue; }
    if (!cur) continue;
    line = line.replace(BULLET, '').trim();
    const set = line.match(SETTING);
    if (set) { cur.setting = { count: Number(set[1]), dummy: set[2] == null ? undefined : set[2] === 'おまかせ' ? null : Number(set[2]) }; continue; }
    if (line) cur.lines.push(line);
  }
  return out;
}

// 正解（○）・不正解（×）・印なしに分ける
function marks(lines: string[]) {
  const right: string[] = [], wrong: string[] = [], plain: string[] = [];
  for (const l of lines) {
    if (RIGHT.test(l)) right.push(clean(l.replace(RIGHT, ''), OPTION_MAX));
    else if (WRONG.test(l)) wrong.push(clean(l.replace(WRONG, ''), OPTION_MAX));
    else plain.push(clean(l, OPTION_MAX));
  }
  const tidy = (a: string[]) => [...new Set(a.filter(Boolean))];
  return { right: tidy(right), wrong: tidy(wrong), plain: tidy(plain) };
}

const titleOf = (b: Block) => clean(b.title, TITLE_MAX);

export function parseTier(text: string): Parsed<Topic> {
  const res: Parsed<Topic> = { ok: [], bad: [] };
  for (const b of blocks(text)) {
    const title = titleOf(b);
    // ○ や × を付けて書かれていても、ティアリストでは意味がないので、印を外して選択肢にする
    const m = marks(b.lines);
    const options = [...new Set([...m.plain, ...m.right, ...m.wrong])].slice(0, MAX_OPT);
    if (!title) res.bad.push({ title: '（お題なし）', reason: 'お題が空です' });
    else if (options.length < MIN_OPT) res.bad.push({ title, reason: `選択肢が${options.length}個です（${MIN_OPT}個以上必要）` });
    else res.ok.push({ title, options, count: pickCount({ options, count: b.setting.count }) });
  }
  return res;
}

export function parseFive(text: string): Parsed<FiveTopic> {
  const res: Parsed<FiveTopic> = { ok: [], bad: [] };
  for (const b of blocks(text)) {
    const title = titleOf(b);
    const m = marks(b.lines);
    const answers = m.right;
    const dummies = m.wrong.filter(d => !answers.includes(d));
    const err = fiveError({ title, answers, dummies });
    if (err) res.bad.push({ title: title || '（お題なし）', reason: m.plain.length && !answers.length ? '正解に「○」、ダミーに「×」を付けてください' : err });
    else res.ok.push({ title, answers, dummies, ...fitCounts(answers.length, dummies.length, b.setting.count ?? FIVE_DEFAULT_SIZE, b.setting.dummy ?? null) });
  }
  return res;
}

export function parseFate(text: string): Parsed<FateQuestion> {
  const res: Parsed<FateQuestion> = { ok: [], bad: [] };
  for (const b of blocks(text)) {
    const q = { text: titleOf(b), right: '', wrong: '' };
    const m = marks(b.lines);
    if (m.right.length > 1 || m.wrong.length > 1) { res.bad.push({ title: q.text || '（問題なし）', reason: '「○」と「×」は1つずつにしてください' }); continue; }
    q.right = m.right[0] ?? ''; q.wrong = m.wrong[0] ?? '';
    const err = fateError(q);
    if (err) res.bad.push({ title: q.text || '（問題なし）', reason: err });
    else res.ok.push(q);
  }
  return res;
}

// 書き出し。読み込むと同じお題に戻る（出題数の設定も含める）
// 1行に1つのお題を読む（ハイカー575・ワードブーケ）。行の頭の記号・番号・「#」、かぎかっこ、コードの囲み、太字の記号は外す。
// fix = 1行を、使える形に整える（使えなければ null）。reason = 使えなかったときに見せる理由
export function parseLines(text: string, fix: (line: string) => string | null, reason: string): Parsed<LineItem> {
  const ok: LineItem[] = [], bad: Parsed<LineItem>['bad'] = [], seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim().replace(/\*\*/g, '');
    if (!line || line.startsWith('```')) continue;
    line = line.replace(/^#+\s*/, '').replace(BULLET, '').replace(HEAD_NO, '').trim().replace(/^[「『"“]+|[」』"”]+$/g, '').trim();
    if (!line) continue;
    const fixed = fix(line);
    if (!fixed) { bad.push({ title: line.slice(0, 30), reason }); continue; }
    if (seen.has(fixed)) continue;
    seen.add(fixed);
    ok.push({ text: fixed });
  }
  return { ok, bad };
}
export const writeLines = (list: LineItem[]) => list.map(t => t.text).join('\n');

export const writeTier = (ts: Topic[]) =>
  ts.map(t => [`# ${t.title}`, ...t.options, `出題数 ${pickCount(t)}`].join('\n')).join('\n\n') + '\n';
export const writeFive = (ts: FiveTopic[]) =>
  ts.map(t => [`# ${t.title}`, ...t.answers.map(a => `○ ${a}`), ...t.dummies.map(d => `× ${d}`), `出題数 ${t.size} ダミー ${t.dummy ?? 'おまかせ'}`].join('\n')).join('\n\n') + '\n';
export const writeFate = (qs: FateQuestion[]) =>
  qs.map(q => [`# ${q.text}`, `○ ${q.right}`, `× ${q.wrong}`].join('\n')).join('\n\n') + '\n';

export const keyOf = {
  tier: (t: Topic) => topicKey(t.title, t.options),
  five: fiveKey,
  fate: fateKey,
};

// AI に渡す文面。このアプリから AI には通信しない（各自がふだん使っている AI に貼ってもらう）
export function aiPrompt(mode: TextMode, theme: string, n: number): string {
  const about = theme.trim() ? `テーマ：${theme.trim()}\n` : 'テーマ：おまかせ（いろいろなジャンルから）\n';
  const tail = '\n説明や前置きは書かず、上の書き方の文字だけを返してください。お題とお題の間は1行あけてください。';
  const lines = '\n説明や前置きは書かず、1行に1つずつ、それだけを返してください。番号や記号は付けないでください。';
  if (mode === 'haiku') return `五・七・五の「最初の5文字」を${n}個作ってください。
${about}
遊び方：最初の5文字だけが決まっていて、続きの「七・五」を、みんなで1文字ずつ書きつないで、一句を作ります。

決まり：
- ひらがなで、ちょうど5文字（小さい「っ」「ゃ」や「ー」も1文字に数える）
- 続きを考えたくなる言葉にする（季節・場面・気持ち・食べもの など）
- 「〜や」「〜の」「〜に」のように、後ろへ続けやすい形だと作りやすい

書き方（例）：
ふるいけや
なつやすみ
${lines}`;
  if (mode === 'bouquet') return `大喜利の「お題」を${n}個作ってください。
${about}
遊び方：配られた言葉のカードを並べて、お題に合う「ひとこと」を作ります。親が、いちばん面白いものを選びます。

決まり：
- 「〜の言葉」「〜のひとこと」「〜のキャッチコピー」のように、短いひとことで答えられるお題にする
- 場面がすぐ思い浮かぶもの。答えが1つに決まらないもの
- 1つ30文字くらいまで

書き方（例）：
プロポーズの言葉
遅刻の言い訳
${lines}`;
  if (mode === 'bouquetWords') return `言葉のカードに書く「言葉」を${n}個作ってください。
${about}
遊び方：配られた言葉のカードを並べて、ひとことを作ります。欲しい言葉がそろわないので、無理やりな文になって笑えます。

決まり：
- 名詞（例：味噌汁）、言い回し（例：愛してる）、修飾する言葉（例：世界一）を混ぜる
- ふつうの言葉と、場違いな言葉を混ぜる（組み合わせで笑いが出るように）
- 1つ12文字まで。「は」「が」などの助詞だけの言葉は要らない（別に用意してある）
- 実在の人や作品の名前は使わない

書き方（例）：
味噌汁
愛してる
世界一
${lines}`;
  if (mode === 'tier') return `パーティーゲームの「お題」を${n}個作ってください。
${about}
遊び方：お題に対する選択肢を、各自が自分の好きな順に並べます。ほかの人がどう並べたかを当てて遊びます。

決まり：
- 1つのお題に、選択肢を6〜10個
- 人によって好みや順番が分かれる選択肢にする（答えが1つに決まるものは避ける）
- お題は30文字まで、選択肢は1つ15文字くらいまで

書き方：
# お題
選択肢
選択肢
${tail}`;
  if (mode === 'five') return `クイズの「お題」を${n}個作ってください。
${about}
遊び方：お題に当てはまる「正解」と、当てはまらない「ダミー」を混ぜて見せます。プレイヤーは正解だと思うものを5つ選びます。

決まり：
- 1つのお題に、正解を6〜10個、ダミーを4〜6個
- ダミーは、本当っぽくて間違えやすいものにする
- 事実に基づき、誰が答えても正解が変わらないものにする。自信のない事実は使わない
- 時間がたつと答えが変わるもの（「最新の〜」「現在の〜」など）は避ける
- お題は30文字まで、選択肢は1つ15文字くらいまで

書き方（正解の行の頭に「○」、ダミーの行の頭に「×」）：
# お題
○ 正解
× ダミー
${tail}`;
  return `2択クイズを${n}問作ってください。
${about}
遊び方：問題に対して、正解と不正解の2つを見せ、どちらが正しいかを選びます。

決まり：
- 1つの問題に、正解を1つ、間違えやすい不正解を1つ
- 事実に基づき、誰が答えても正解が変わらないものにする。自信のない事実は使わない
- 時間がたつと答えが変わるもの（「最新の〜」「現在の〜」など）は避ける
- 問題は40文字まで、答えは1つ15文字くらいまで

書き方（正解の行の頭に「○」、不正解の行の頭に「×」）：
# 問題文
○ 正解
× 不正解
${tail}`;
}
