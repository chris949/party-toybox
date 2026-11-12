// 3Dのキャラクターを作る入口。並びは 2D のキャラクター（charas.tsx）と同じ：動物12種 → アニメ風の人5種
import { ANIMALS, buildAnimal } from './animals';
import { buildChibi, CHIBIS, CHIBI_KEEP } from './chibis';
import { Builder, type Chara3D } from './kit';

export type { Chara3D } from './kit';
export const CHARA_3D_COUNT = ANIMALS.length + CHIBIS.length;

// n = キャラクターの番号、ringColor = 足元の輪の色（参加者の色）、variant = 同じキャラクターの何人目か
export function makeChara3D(n: number, ringColor: string, variant = 0): Chara3D {
  const idx = ((Math.trunc(n) || 0) % CHARA_3D_COUNT + CHARA_3D_COUNT) % CHARA_3D_COUNT;
  const isAnimal = idx < ANIMALS.length;
  const b = new Builder(ringColor, variant, isAnimal ? [] : CHIBI_KEEP);
  if (isAnimal) buildAnimal(b, ANIMALS[idx]); else buildChibi(b, CHIBIS[idx - ANIMALS.length]);
  return b.finish();
}
