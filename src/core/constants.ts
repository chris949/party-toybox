// ゲーム全体の決まり（数字の根拠は docs/spec.md）
export const MIN_PLAYERS_DEFAULT = 4;
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

// 運命の二者択一（docs/spec.md の11章）
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
