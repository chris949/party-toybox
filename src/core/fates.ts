// 運命の二者択一の問題（問題文・正解・不正解）。数字の根拠は docs/spec.md の11章
import { MAX_TOPICS_PER_PLAYER, OPTION_MAX, TITLE_MAX } from './constants';
import { clean } from './topics';

export interface FateQuestion {
  text: string;   // 問題文
  right: string;  // 正解
  wrong: string;  // 不正解
}

export const fateError = (q: FateQuestion): string | null => {
  if (!q.text) return '問題文を入力してください';
  if (!q.right) return '正解を入力してください';
  if (!q.wrong) return '不正解を入力してください';
  if (q.right === q.wrong) return '正解と不正解が同じになっています';
  return null;
};

// 参加者から届いた問題を検査して整える
export function sanitizeFates(list: unknown): FateQuestion[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_TOPICS_PER_PLAYER).flatMap((q: any) => {
    const ok = { text: clean(q?.text, TITLE_MAX), right: clean(q?.right, OPTION_MAX), wrong: clean(q?.wrong, OPTION_MAX) };
    return fateError(ok) ? [] : [ok];
  });
}

// 問題文と2つの答えが同じなら同じ問題とみなす
export const fateKey = (q: FateQuestion) => JSON.stringify([q.text, q.right, q.wrong]);

// 同梱のサンプル。誰も問題を作っていなくても1ゲーム遊べるよう30問用意する
const s = (text: string, right: string, wrong: string): FateQuestion => ({ text, right, wrong });
export const SAMPLE_FATES: FateQuestion[] = [
  s('日本でいちばん面積が小さい都道府県は？', '香川県', '大阪府'),
  s('日本でいちばん長い川は？', '信濃川', '利根川'),
  s('日本でいちばん大きい湖は？', '琵琶湖', '霞ヶ浦'),
  s('富士山の高さは？', '3776メートル', '3667メートル'),
  s('東京タワーの高さは？', '333メートル', '364メートル'),
  s('東京スカイツリーの高さは？', '634メートル', '643メートル'),
  s('世界でいちばん面積が大きい国は？', 'ロシア', 'カナダ'),
  s('世界でいちばん高い山は？', 'エベレスト', 'K2'),
  s('オーストラリアの首都は？', 'キャンベラ', 'シドニー'),
  s('カナダの首都は？', 'オタワ', 'トロント'),
  s('トルコの首都は？', 'アンカラ', 'イスタンブール'),
  s('アメリカの州の数は？', '50', '52'),
  s('太陽系でいちばん大きい惑星は？', '木星', '土星'),
  s('虹のいちばん外側の色は？', '赤', '紫'),
  s('1年でいちばん昼が短い日は？', '冬至', '夏至'),
  s('金の元素記号は？', 'Au', 'Ag'),
  s('1円玉の重さは？', '1グラム', '2グラム'),
  s('1時間は何秒？', '3600秒', '6000秒'),
  s('1ダースは何個？', '12個', '10個'),
  s('大人の歯は、親知らずを含めて全部で何本？', '32本', '28本'),
  s('日本人にいちばん多い血液型は？', 'A型', 'O型'),
  s('タコの足は何本？', '8本', '10本'),
  s('キリンの首の骨は何個？', '7個', '14個'),
  s('ホッキョクグマの地肌の色は？', '黒', '白'),
  s('トマトの原産地は？', '南アメリカ', 'ヨーロッパ'),
  s('将棋で、最初に並べる駒は1人何枚？', '20枚', '18枚'),
  s('オセロの盤のマスの数は？', '64マス', '81マス'),
  s('マラソンの距離は？', '42.195キロ', '41.295キロ'),
  s('バスケットボールのゴールの高さは？', '3メートル5センチ', '3メートル50センチ'),
  s('江戸幕府を開いたのは？', '徳川家康', '徳川家光'),
  s('鎌倉幕府を開いたのは？', '源頼朝', '源義経'),
  s('「吾輩は猫である」の作者は？', '夏目漱石', '森鷗外'),
];
export const SAMPLE_FATE_KEYS = new Set(SAMPLE_FATES.map(fateKey));
