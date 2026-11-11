// 同じキャラクターを選んだ2人目からの「色違い」。色合いをずらし、白や灰色には参加者の色を混ぜる
import * as THREE from 'three';

export function tinted(color: string, variant: number, ringColor: string): THREE.Color {
  const col = new THREE.Color(color);
  if (!variant) return col;
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  if (hsl.l < 0.22 || hsl.l > 0.985) return col;                           // 黒い目・白い光はそのまま
  if (hsl.s < 0.18) return col.lerp(new THREE.Color(ringColor), 0.32);     // 白・灰色は色合いをずらしても変わらないので、参加者の色を混ぜる
  return col.offsetHSL(variant * 0.21, 0, 0);
}
