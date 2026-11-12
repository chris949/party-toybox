// 人が入力した文字を整える（前後の空白を取り、長さを切る）。参加者から届いた値は、必ずこれを通す
export const clean = (s: unknown, max: number) => String(s ?? '').trim().slice(0, max);
