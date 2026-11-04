// 乱数。ルールは Math.random を直接使わず、外から差し込まれた乱数を使う（テストで結果を固定するため）
export type Random = () => number;

export const shuffle = <T>(list: readonly T[], random: Random): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// 種から同じ並びを返す乱数（テスト・シミュレーション用）
export const seeded = (seed: number): Random => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
};
