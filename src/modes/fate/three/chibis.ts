// アニメ調の人のキャラクター（頭が身長の半分近い、デフォルメの体。髪型と衣装で描き分ける）。
// どれもオリジナルで、実在の作品のキャラクターは使わない。顔は絵で描く（anime.ts）
import * as THREE from 'three';
import { BALL, both, CONE, RING, type Builder } from './kit';

type Kind = 'hero' | 'witch' | 'ninja' | 'idol' | 'pirate';
export const CHIBIS: { kind: Kind; hair: string; hairLight: string; eye: string; outfit: string; accent: string }[] = [
  { kind: 'hero', hair: '#8a5a2b', hairLight: '#c08a4e', eye: '#2f7fd6', outfit: '#3f7fe0', accent: '#e8483f' },   // ゆうしゃ
  { kind: 'witch', hair: '#9b6fe0', hairLight: '#c9aef5', eye: '#7a3fd0', outfit: '#3b2a5e', accent: '#ffc83d' },  // まほうつかい
  { kind: 'ninja', hair: '#27324a', hairLight: '#4a5a7a', eye: '#c0392b', outfit: '#27324a', accent: '#e8483f' },  // にんじゃ
  { kind: 'idol', hair: '#ff8fc0', hairLight: '#ffc4de', eye: '#ff4f9a', outfit: '#ff7fb5', accent: '#fff07a' },   // アイドル
  { kind: 'pirate', hair: '#3a2a22', hairLight: '#6a5040', eye: '#2e8b57', outfit: '#f4efe6', accent: '#c0392b' }, // かいぞく
];
const SKIN = '#ffe0c4', DARK = '#2b2b33', BROWN = '#7a4a2a', WHITE = '#f8f6f0', GOLD = '#ffc83d';
export const CHIBI_KEEP = [SKIN]; // 同じキャラクターの2人目からは色合いを変えるが、肌の色は変えない
const HEAD: [number, number, number] = [0.58, 0.54, 0.54];

// 人を1体、組み立てる（部品を置くだけ。まとめて描ける形にするのは kit.ts）
export function buildChibi(b: Builder, c: (typeof CHIBIS)[number]) {
  const { root, add } = b, k = c.kind;
  const robe = k === 'witch' || k === 'idol'; // すその広い服

  // ===== 体：小さく =====
  both(s => add(BALL, k === 'idol' ? WHITE : k === 'ninja' ? DARK : BROWN, [s * 0.11, 0.07, 0.04], [0.11, 0.07, 0.15])); // くつ
  both(s => add(BALL, k === 'ninja' ? c.outfit : k === 'pirate' ? '#4a5a7a' : WHITE, [s * 0.1, 0.19, 0], [0.085, 0.14, 0.09])); // 足
  add(CONE, k === 'pirate' ? BROWN : c.outfit, [0, robe ? 0.36 : 0.4, 0], robe ? [0.38, 0.44, 0.33] : [0.31, 0.36, 0.26]);      // 上着（すそが広がる）
  add(BALL, c.outfit, [0, 0.48, 0], [0.22, 0.2, 0.18]);
  both(s => add(BALL, k === 'pirate' ? WHITE : c.outfit, [s * 0.25, 0.47, 0.02], [0.065, 0.14, 0.075], [0, 0, s * 0.5]));        // うで
  both(s => add(BALL, k === 'ninja' ? DARK : SKIN, [s * 0.32, 0.36, 0.03], [0.055, 0.055, 0.055]));                              // 手
  if (k === 'hero') {
    add(RING, BROWN, [0, 0.36, 0], [0.235, 0.045, 0.2]);                                           // ベルトと留め金
    add(BALL, GOLD, [0, 0.36, 0.2], [0.045, 0.045, 0.02]);
    add(BALL, c.accent, [0, 0.42, -0.16], [0.27, 0.32, 0.06], [0.22, 0, 0]);                       // マント
    add(RING, c.accent, [0, 0.64, 0], [0.19, 0.07, 0.17]);                                         // えりまき
  }
  if (k === 'witch') {
    add(RING, c.accent, [0, 0.4, 0], [0.24, 0.04, 0.21]);                                          // 腰ひも
    add(BALL, c.accent, [0, 0.6, 0.17], [0.05, 0.05, 0.03]);                                       // ブローチ
    add(RING, '#5a4585', [0, 0.64, 0], [0.2, 0.06, 0.18]);                                         // えり
  }
  if (k === 'ninja') {
    add(RING, c.accent, [0, 0.36, 0], [0.235, 0.05, 0.2]);                                         // 帯
    add(BALL, c.accent, [0, 0.66, 0.02], [0.24, 0.1, 0.22]);                                       // えりまき
    add(BALL, c.accent, [0.14, 0.52, -0.2], [0.06, 0.2, 0.05], [0.4, 0, -0.3]);                    // えりまきのはし
  }
  if (k === 'idol') {
    add(RING, WHITE, [0, 0.16, 0], [0.37, 0.03, 0.32]);                                            // スカートのふち
    add(RING, WHITE, [0, 0.64, 0], [0.19, 0.06, 0.17]);                                            // えり
    add(BALL, c.accent, [0, 0.58, 0.17], [0.06, 0.06, 0.03]);                                      // 胸のかざり
    both(s => add(CONE, c.accent, [s * 0.09, 0.42, -0.2], [0.1, 0.16, 0.05], [0, 0, s * 1.2]));    // 背中のリボン
  }
  if (k === 'pirate') {
    add(RING, c.accent, [0, 0.36, 0], [0.235, 0.055, 0.2]);                                        // 腰の布
    add(BALL, GOLD, [0, 0.36, 0.2], [0.045, 0.045, 0.02]);
    add(BALL, WHITE, [0, 0.52, 0.12], [0.13, 0.14, 0.08]);                                         // シャツの胸元
  }

  // ===== 頭：大きく。少し見上げさせる（見下ろす視点でも顔が見えるように） =====
  const head = new THREE.Group();
  head.position.set(0, 1.13, 0.03);
  head.rotation.x = -0.5;
  root.add(head);
  const h = (...a: [typeof BALL, string, [number, number, number], [number, number, number], [number, number, number]?]) => add(a[0], a[1], a[2], a[3], a[4], head);
  h(BALL, SKIN, [0, 0, 0], HEAD);
  if (k !== 'ninja') both(s => h(BALL, SKIN, [s * 0.57, -0.06, 0], [0.07, 0.1, 0.07]));              // 耳

  // 髪：後ろ頭をおおうかたまり（にんじゃは、ずきん）
  h(BALL, c.hair, [0, 0.12, -0.12], [0.64, 0.56, 0.58]);
  // 前髪：ギザギザの房（房の数と長さで描き分ける）
  const bangs = (xs: number[], len: number, wide = 0.15) => xs.forEach((x, i) =>
    h(CONE, c.hair, [x, 0.24 - Math.abs(x) * 0.12, 0.47 - Math.abs(x) * 0.4], [wide, len + (i % 2) * 0.06, 0.09], [Math.PI - 0.32, 0, -x * 0.7]));
  const sideLocks = (len: number) => both(s => h(BALL, c.hair, [s * 0.52, -0.02 - len / 2, 0.1], [0.1, len, 0.15], [0, 0, s * 0.12]));
  const shine = () => h(BALL, c.hairLight, [0, 0.44, 0.2], [0.3, 0.045, 0.11], [-0.6, 0, 0]);      // 髪のつや

  if (k === 'hero') {
    h(BALL, c.hair, [0, -0.2, -0.3], [0.5, 0.38, 0.3]);
    bangs([-0.38, -0.2, 0, 0.2, 0.38], 0.34);
    sideLocks(0.3);
    ([[0, 0.62, -0.05, 0, -0.1], [-0.3, 0.52, -0.08, 0.65, -0.1], [0.3, 0.52, -0.08, -0.65, -0.1], [0, 0.42, -0.5, 0, -1.0], [-0.34, 0.3, -0.42, 0.7, -0.8], [0.34, 0.3, -0.42, -0.7, -0.8]] as const)
      .forEach(([x, y, z, rz, rx]) => h(CONE, c.hair, [x, y, z], [0.17, 0.36, 0.17], [rx, 0, rz])); // つんつんの毛先
    h(CONE, c.hair, [0.06, 0.74, 0.08], [0.04, 0.24, 0.04], [0.5, 0, -0.5]);                        // アホ毛
    both(s => h(BALL, c.accent, [0.12 + s * 0.07, 0.02 - s * 0.06, -0.66], [0.05, 0.05, 0.2], [0.5, s * 0.3, 0])); // はちまきの結び目
    shine();
  }
  if (k === 'witch') {
    add(BALL, c.hair, [0, 0.62, -0.25], [0.4, 0.5, 0.13], [0.12, 0, 0]);                           // 腰までの長い髪（頭を見上げさせても体の前に回り込まないよう、体の後ろに置く）
    bangs([-0.34, -0.17, 0, 0.17, 0.34], 0.26, 0.17);                                              // そろえた前髪
    sideLocks(0.38);
    // とんがり帽子：つば・本体（先が後ろに折れる）・帯と星
    h(RING, c.outfit, [0, 0.4, -0.08], [0.82, 0.04, 0.8], [-0.12, 0, 0]);
    h(CONE, c.outfit, [0, 0.72, -0.16], [0.44, 0.62, 0.44], [-0.2, 0, 0]);
    h(CONE, c.outfit, [0.06, 1.04, -0.36], [0.18, 0.4, 0.18], [-1.1, 0, -0.3]);
    h(RING, c.accent, [0, 0.47, -0.1], [0.44, 0.07, 0.44], [-0.14, 0, 0]);
    h(BALL, '#fff07a', [0, 0.5, 0.33], [0.07, 0.07, 0.03]);
  }
  if (k === 'ninja') {
    h(BALL, c.outfit, [0, 0.06, -0.04], [0.63, 0.59, 0.57]);                                       // ずきん（髪をすっぽりおおう）
    h(BALL, c.outfit, [0, -0.2, 0.16], [0.52, 0.3, 0.44]);                                         // 口もとの覆面
    bangs([-0.2, 0, 0.2], 0.2, 0.13);                                                              // ずきんからのぞく前髪
    h(RING, c.accent, [0, 0.3, -0.03], [0.64, 0.07, 0.6], [0.06, 0, 0]);                           // はちまき
    both(s => h(BALL, c.accent, [0.16 + s * 0.07, 0.08 - s * 0.07, -0.7], [0.05, 0.05, 0.24], [0.5, s * 0.3, 0]));
  }
  if (k === 'idol') {
    bangs([-0.36, -0.18, 0, 0.18, 0.36], 0.28, 0.17);
    sideLocks(0.34);
    both(s => {                                                                                    // ツインテール：根もとの飾りと、ふくらんだ房
      h(BALL, c.accent, [s * 0.6, 0.3, -0.1], [0.1, 0.1, 0.1]);
      h(BALL, c.hair, [s * 0.78, -0.06, -0.12], [0.2, 0.44, 0.2], [0, 0, s * 0.38]);
      h(CONE, c.hair, [s * 0.92, -0.52, -0.12], [0.13, 0.26, 0.13], [Math.PI, 0, s * 0.2]);
      h(CONE, WHITE, [s * 0.13, 0.62, 0.04], [0.14, 0.24, 0.07], [0, 0, s * 1.2]);                  // 頭のリボン
    });
    h(BALL, c.accent, [0, 0.61, 0.04], [0.065, 0.065, 0.065]);
    shine();
  }
  if (k === 'pirate') {
    h(BALL, c.hair, [0, -0.22, -0.28], [0.52, 0.4, 0.3]);                                          // えりあしまでの髪
    bangs([-0.36, -0.14, 0.1, 0.34], 0.3, 0.16);
    sideLocks(0.36);
    h(RING, c.accent, [0, 0.3, -0.04], [0.645, 0.08, 0.6], [0.06, 0, 0]);                          // バンダナ
    // 三角帽子：つばと本体、しるしの丸
    h(RING, DARK, [0, 0.43, -0.1], [0.78, 0.045, 0.62], [-0.14, 0, 0]);
    h(BALL, DARK, [0, 0.56, -0.14], [0.5, 0.22, 0.4], [-0.14, 0, 0]);
    both(s => h(CONE, DARK, [s * 0.62, 0.5, -0.1], [0.14, 0.26, 0.2], [0, 0, -s * 1.1]));
    h(BALL, WHITE, [0, 0.58, 0.25], [0.08, 0.08, 0.03]);
    h(RING, GOLD, [0, 0.46, -0.1], [0.5, 0.03, 0.4], [-0.14, 0, 0]);
  }
  b.face = { head, headScale: HEAD, spec: { eye: c.eye, mouth: k !== 'ninja', eyepatch: k === 'pirate' } };
}
