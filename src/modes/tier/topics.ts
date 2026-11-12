import { MAX_OPT, MAX_PICK, MAX_TOPICS_PER_PLAYER, MIN_OPT, MIN_PICK, OPTION_MAX, TITLE_MAX } from '../../core/constants';

// 部屋に持ち込むお題（端末の保存データからはID・持っていくフラグを除いたもの）
export interface Topic {
  title: string;
  options: string[];
  count: number; // 出題数
}

import { clean } from '../../core/text';

// 出題数の既定値：v0.5 以前のお題とサンプルは、選択肢の数（最大10）をそのまま出す
export const pickCount = (t: { options: readonly unknown[]; count?: unknown }) =>
  Math.max(MIN_PICK, Math.min(MAX_PICK, t.options.length, Math.trunc(Number(t.count)) || t.options.length));

// 参加者から届いたお題を検査して整える
export function sanitizeTopics(list: unknown): Topic[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_TOPICS_PER_PLAYER).map((t: any) => {
    const options = Array.isArray(t?.options)
      ? [...new Set(t.options.map((o: unknown) => clean(o, OPTION_MAX)).filter(Boolean) as string[])].slice(0, MAX_OPT)
      : [];
    return { title: clean(t?.title, TITLE_MAX), options, count: pickCount({ options, count: t?.count }) };
  }).filter(t => t.title && t.options.length >= MIN_OPT);
}

// 初回のサンプル。全員がサンプルのままでも10人まで遊べるよう10個用意する（同じお題は1つにまとめて配るため）
export const SAMPLE_TOPICS: [string, string[]][] = [
  ['好きな野菜は？', ['じゃがいも', 'にんじん', 'たまねぎ', 'キャベツ', 'トマト']],
  ['行ってみたい国は？', ['イタリア', 'アメリカ', '韓国', 'タイ', 'フランス', 'オーストラリア']],
  ['好きなおにぎりの具は？', ['鮭', '梅', 'ツナマヨ', '昆布', 'おかか', '明太子']],
  ['無人島に持っていくなら？', ['ナイフ', 'ライター', 'スマホ', '本', 'テント', '釣り竿', '水']],
  ['好きな季節のイベントは？', ['お花見', '夏祭り', '花火大会', 'ハロウィン', 'クリスマス', '年越し']],
  ['休日の過ごし方、好きな順は？', ['寝る', '外食', 'ゲーム', '買い物', '映画', '旅行']],
  ['好きなコンビニスイーツは？', ['プリン', 'シュークリーム', 'ロールケーキ', 'エクレア', 'チーズケーキ']],
  ['もらって嬉しいプレゼントは？', ['現金', '手紙', 'お花', 'ギフト券', '手作りのもの', '高級なお菓子']],
  ['好きな麺類は？', ['ラーメン', 'うどん', 'そば', 'パスタ', '焼きそば', '冷やし中華']],
  ['住むならどこがいい？', ['都会のど真ん中', '海の近く', '山の中', '雪国', '南の島']],
];

// お題名と選択肢（順不同）が同じなら同じお題とみなす
export const topicKey = (title: string, options: readonly string[]) => JSON.stringify([title, [...options].sort()]);
export const SAMPLE_KEYS = new Set(SAMPLE_TOPICS.map(([title, options]) => topicKey(title, options)));
