/** 乱数は GameState.rng に保持する（mulberry32）。同じシードなら同じ試合になる */
export function random(s: { rng: number }): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(s: { rng: number }, min: number, max: number): number {
  return min + Math.floor(random(s) * (max - min + 1));
}

export function d6(s: { rng: number }): number {
  return randInt(s, 1, 6);
}

export function pick<T>(s: { rng: number }, items: readonly T[]): T {
  return items[Math.floor(random(s) * items.length)];
}

export function pickWeighted<T>(s: { rng: number }, items: readonly { item: T; weight: number }[]): T {
  const total = items.reduce((a, b) => a + b.weight, 0);
  let r = random(s) * total;
  for (const it of items) {
    r -= it.weight;
    if (r < 0) return it.item;
  }
  return items[items.length - 1].item;
}
