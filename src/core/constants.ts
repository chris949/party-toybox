// ゲーム全体の決まり（数字の根拠は docs/spec.md）
export const MIN_PLAYERS_DEFAULT = 4;
export const MIN_PLAYERS_DEV = 2; // URL に ?dev を付けたとき（動作確認用）
export const MAX_PLAYERS = 10;

export const MIN_OPT = 5, MAX_OPT = 50;   // お題1つの選択肢の数
export const MIN_PICK = 5, MAX_PICK = 10; // 出題数（選択肢の中からランダムに出す数）
export const MAX_TOPICS_PER_PLAYER = 50;
export const NAME_MAX = 16, TITLE_MAX = 60, OPTION_MAX = 40;

export const PERFECT_BONUS = 3;
export const PICK_TIME_MS = 60000, PICK_GRACE_MS = 1500; // 並び替えの制限時間（暫定値）と、通信の遅れを見込んだ猶予
export const REVEAL_FIRST_MS = 2000, REVEAL_STEP_MS = 3000, REVEAL_SUSPENSE_MS = 2000; // めくりの間隔（暫定値）
