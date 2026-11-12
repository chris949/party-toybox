// ゲーム全体の決まり（数字の根拠は docs/spec.md）
export const MIN_PLAYERS_DEFAULT = 2; // v0.19 で4人から下げた
export const MIN_PLAYERS_DEV = 2; // URL に ?dev を付けたとき（動作確認用）
export const MAX_PLAYERS = 10;

export const MIN_OPT = 5, MAX_OPT = 50;   // お題1つの選択肢の数
export const MIN_PICK = 5, MAX_PICK = 10; // 出題数（選択肢の中からランダムに出す数）
export const MAX_TOPICS_PER_PLAYER = 50;
export const NAME_MAX = 16, TITLE_MAX = 60, OPTION_MAX = 40;

export const PERFECT_BONUS = 3;
export const TIME_LIMITS = [30, 60, 90] as const;  // 並び替えの制限時間（秒）。ホストがロビーで選ぶ
export const DEFAULT_TIME_LIMIT = 60;
export const PICK_GRACE_MS = 1500;                  // 通信の遅れを見込んだ猶予
// 残りわずかの演出を始める秒数（長い制限時間ほど早めに知らせる）
export const warnSec = (limit: number) => limit >= 90 ? 10 : 5;
export const REVEAL_FIRST_MS = 2000, REVEAL_STEP_MS = 3000, REVEAL_SUSPENSE_MS = 2000; // めくりの間隔（暫定値）

// 運命の二者択一（src/modes/fate/README.md の11章）
export const FATE_TIMES = [5, 10, 15] as const;     // 1問の制限時間（秒）。ホストがロビーで選ぶ
export const DEFAULT_FATE_TIME = 10;
export const FATE_WARN_SEC = 3;                     // 残りわずかの演出を始める秒数
export const FATE_GRACE_MS = 500;                   // 締め切り直前の移動が届くのを待つ猶予
export const FATE_VERDICT_MS = 5000;                // 発表を見せてから、次の問題へ進むまで
export const FATE_QUOTAS = [1, 3, 5] as const;       // お立ち台の回数（1人が出題者になる回数）。ホストがロビーで選ぶ
export const DEFAULT_FATE_QUOTA = 3;
export const FATE_LIVES = [1, 2, 3] as const;        // ライフ（残機）。不正解のたびに1つ減り、0で脱落
export const DEFAULT_FATE_LIVES = 3;
export const CHARA_COUNT = 17;                       // 用意しているキャラクターの数（動物12＋アニメ風の人5）
export const CHARA_MAX = 64;                        // キャラクターの番号の上限（絵の数は画面側で決める）

// ハイカー575（src/modes/haiku/README.md の12章）
export const HAIKU_TIMES = [10, 15, 20] as const;   // 1文字の制限時間（秒）。ホストがロビーで選ぶ
export const DEFAULT_HAIKU_TIME = 15;
export const HAIKU_RATE_SEC = 30;                   // 採点の制限時間（秒）
export const HAIKU_REVEAL_FIRST_MS = 1500, HAIKU_REVEAL_STEP_MS = 2500; // 発表で、1行ずつめくる間隔

// ブラインドブラフ（src/modes/bluff/README.md の13章）
export const BLUFF_TIMES = [20, 30, 45] as const;   // しゃべる時間（秒）。ホストがロビーで選ぶ
export const DEFAULT_BLUFF_TIME = 30;
export const BLUFF_ROUNDS = 8;
export const BLUFF_CARD_MAX = 13;                   // カードは 1〜13。同じ数字は配らない
export const BLUFF_START = 10;                      // 最初の持ち点
export const BLUFF_FOLD = 1, BLUFF_LOSE = 2, BLUFF_STRONG_FOLD = 2; // 降りる／勝負して負け／いちばん強いのに降りた（追加）

// ワードブーケ（src/modes/bouquet/README.md の14章）
export const BOUQUET_TIMES = [45, 60, 90] as const;  // 文を作る時間（秒）。ホストがロビーで選ぶ
export const DEFAULT_BOUQUET_TIME = 60;
export const BOUQUET_GOALS = [0, 3, 5] as const;     // 終わり方：0 = 全員が親を1回、3・5 = その点を先取
export const BOUQUET_MAX_ROUNDS = 40;                // 先取のとき、長くなりすぎないよう打ち切るラウンド数

// まぎれろ！（src/modes/blend/README.md の15章）
export const BLEND_TIMES = [30, 45, 60] as const;   // かくれる時間（秒）。ホストがロビーで選ぶ
export const DEFAULT_BLEND_TIME = 45;
export const BLEND_CROWDS = [8, 12, 16] as const;   // 舞台にいるキャラクターの数（かくれる人の1体を含む）
export const DEFAULT_BLEND_CROWD = 12;
export const BLEND_STARS = 3;                       // かくれる人が集める「ほし」の数。集めきれないと、かくれた人の点は0
export const BLEND_FIND = 2;                        // 当てた人がもらう点
export const BLEND_READY_MS = 3000;                 // 始まる前に、全員が止まっている時間（かくれる人が、自分のキャラクターを見つける時間）
export const BLEND_TICK_MS = 200;                   // 位置を進めて、全員に送る間隔
export const BLEND_W = 12, BLEND_D = 7;             // 舞台の広さ（横・奥行き）。真ん中が 0
export const BLEND_SPEED = 2.4;                     // 歩く速さ（1秒に進む長さ）。人もCPUも同じ
export const BLEND_STAR_R = 0.6;                    // ほしに「乗っている」とみなす近さ
