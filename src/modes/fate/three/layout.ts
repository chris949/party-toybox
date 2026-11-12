// 3Dの舞台の寸法と、キャラクターの立ち位置
import type { Pos } from '../rules';
import type { StagePos } from '../stage';

// 舞台の寸法（メートルのつもり）。左右の床と、手前のスタート台
export const FLOOR_W = 4.6, FLOOR_D = 4.2, FLOOR_X = 3.3, FLOOR_Z = -0.9; // 左右の床のあいだに、お立ち台を置く
export const PODIUM_W = 1.5, PODIUM_D = 3.6, PODIUM_H = 0.75;
export const PAD_W = 7.6, PAD_D = 2.7, PAD_Z = 3.75;
export const BLOCK_H = 2.6;  // 台の厚み（開いた扉が下に突き抜けない深さ）
export const OPEN = 1.4;     // 扉が開く角度
export const HANG = 0.55;    // 床が開いてから落ちるまで、空中でじたばたする時間（秒）
export const COLORS = { L: '#bfe3fb', R: '#ffe39a', C: '#e3ebf2', ok: '#aeeccf', ink: '#1f2d3d', rim: '#9fc3dc', pit: '#0a1018' };
export const SIDE: Record<Pos, { x: number; z: number; w: number; d: number }> = {
  L: { x: -FLOOR_X, z: FLOOR_Z, w: FLOOR_W, d: FLOOR_D },
  R: { x: FLOOR_X, z: FLOOR_Z, w: FLOOR_W, d: FLOOR_D },
  C: { x: 0, z: PAD_Z, w: PAD_W, d: PAD_D },
};

// 立ち位置。床は1列3人（10人以上集まったら4人）、スタート台は1列5人
export function slot(pos: StagePos, i: number, count: number): [number, number] {
  if (pos === 'P') return [0, FLOOR_Z + (i - (count - 1) / 2) * Math.min(1.15, (PODIUM_D - 0.9) / Math.max(1, count - 1))];
  const s = SIDE[pos];
  if (pos === 'C') return [s.x + (i % 5 - 2) * 1.4, s.z - 0.55 + Math.floor(i / 5) * 1.15];
  const cols = count > 9 ? 4 : 3, gap = cols === 4 ? 1.08 : 1.4;
  return [s.x + (i % cols - (cols - 1) / 2) * gap, s.z - 1.35 + Math.floor(i / cols) * 1.3];
}
