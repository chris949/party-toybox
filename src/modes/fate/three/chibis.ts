// アニメ風の人のキャラクター（2頭身。大きな目と髪型・衣装で描き分ける）。どれもオリジナルで、実在の作品のキャラクターは使わない
import * as THREE from 'three';
import { BALL, both, CONE, RING, type Builder } from './kit';

type Kind = 'hero' | 'witch' | 'ninja' | 'idol' | 'pirate';
export const CHIBIS: { kind: Kind; hair: string; eye: string; outfit: string; accent: string }[] = [
  { kind: 'hero', hair: '#8a5a2b', eye: '#2f7fd6', outfit: '#3f7fe0', accent: '#e8483f' },   // ゆうしゃ
  { kind: 'witch', hair: '#9b6fe0', eye: '#7a3fd0', outfit: '#3b2a5e', accent: '#ffc83d' },  // まほうつかい
  { kind: 'ninja', hair: '#27324a', eye: '#c0392b', outfit: '#27324a', accent: '#e8483f' },  // にんじゃ
  { kind: 'idol', hair: '#ff8fc0', eye: '#ff4f9a', outfit: '#ff7fb5', accent: '#fff07a' },   // アイドル
  { kind: 'pirate', hair: '#3a2a22', eye: '#2e8b57', outfit: '#f4efe6', accent: '#c0392b' }, // かいぞく
];
const SKIN = '#ffe0c4', DARK = '#2b2b33';
export const CHIBI_KEEP = [SKIN]; // 同じキャラクターの2人目からは色合いを変えるが、肌の色は変えない

// 人を1体、組み立てる（部品を置くだけ。まとめて描ける形にするのは kit.ts）
export function buildChibi(b: Builder, c: (typeof CHIBIS)[number]) {
  const { root, add } = b, k = c.kind;

  // 体・手足
  add(BALL, c.outfit, [0, 0.42, 0], [0.33, 0.4, 0.29]);
  if (k === 'idol' || k === 'witch') add(CONE, c.outfit, [0, 0.3, 0], [0.45, 0.42, 0.4]);            // すそが広がる服
  if (k === 'pirate') add(BALL, '#7a4a2a', [0, 0.44, -0.02], [0.345, 0.36, 0.3]);                    // ベスト
  if (k === 'hero') add(BALL, c.accent, [0, 0.5, -0.2], [0.36, 0.44, 0.1], [0.25, 0, 0]);            // マント
  if (k === 'ninja' || k === 'hero') add(RING, k === 'hero' ? '#8a5a2b' : c.accent, [0, 0.36, 0], [0.335, 0.07, 0.3]); // 帯
  if (k === 'idol') add(BALL, c.accent, [0, 0.62, 0.27], [0.07, 0.07, 0.04]);                        // 胸のかざり
  both(s => add(BALL, k === 'ninja' ? c.outfit : SKIN, [s * 0.37, 0.5, 0.04], [0.09, 0.15, 0.1], [0, 0, s * 0.5]));
  both(s => add(BALL, k === 'ninja' || k === 'pirate' ? DARK : k === 'witch' ? '#3b2a5e' : '#8a5a2b', [s * 0.14, 0.07, 0.08], [0.12, 0.08, 0.17]));

  // 頭・髪（前髪は、頭より少し大きい球を後ろ上にずらしてかぶせる）
  const head = new THREE.Group();
  head.position.set(0, 1.15, 0.02);
  head.rotation.x = -0.6; // 上から見下ろす視点でも顔が見えるよう、少し見上げさせる
  root.add(head);
  add(BALL, SKIN, [0, 0, 0], [0.48, 0.46, 0.45], undefined, head);
  add(BALL, c.hair, [0, 0.12, -0.13], [0.52, 0.46, 0.47], undefined, head);
  both(s => add(BALL, c.hair, [s * 0.43, -0.08, -0.02], [0.1, 0.28, 0.2], undefined, head)); // もみあげ

  if (k === 'hero') {
    ([[0, 0.5, -0.05, 0], [-0.25, 0.42, -0.05, 0.6], [0.25, 0.42, -0.05, -0.6], [0, 0.4, -0.35, 0]] as const)
      .forEach(([x, y, z, r]) => add(CONE, c.hair, [x, y, z], [0.15, 0.32, 0.15], [z < -0.2 ? -0.8 : -0.15, 0, r], head)); // つんつん頭
    add(RING, '#ffc83d', [0, 0.2, 0], [0.515, 0.06, 0.485], [0.12, 0, 0], head);                    // はちまき
  }
  if (k === 'witch') {
    add(BALL, c.hair, [0, -0.25, -0.28], [0.4, 0.5, 0.2], undefined, head);                          // 長い髪
    add(RING, c.outfit, [0, 0.36, -0.04], [0.66, 0.04, 0.66], [-0.35, 0, 0], head);                   // 帽子のつば
    add(CONE, c.outfit, [0, 0.72, -0.26], [0.38, 0.75, 0.38], [-0.45, 0, 0], head);
    add(RING, c.accent, [0, 0.42, -0.1], [0.39, 0.08, 0.39], [-0.35, 0, 0], head);
  }
  if (k === 'ninja') {
    add(BALL, c.outfit, [0, 0.04, -0.03], [0.5, 0.48, 0.46], undefined, head);                       // ずきん
    add(BALL, SKIN, [0, 0.0, 0.1], [0.41, 0.2, 0.385], undefined, head);                             // 目のまわりだけ出す
    add(RING, c.accent, [0, 0.23, 0], [0.515, 0.07, 0.485], undefined, head);                        // はちまき
    both(s => add(BALL, c.accent, [0.2 + s * 0.06, 0.12 - s * 0.05, -0.5], [0.05, 0.05, 0.22], [0.5, 0.3, 0], head));
    add(BALL, c.accent, [0, -0.42, 0.05], [0.36, 0.12, 0.34], undefined, head);                      // えりまき
  }
  if (k === 'idol') {
    both(s => {                                                                                      // ツインテール
      add(BALL, c.hair, [s * 0.6, 0.02, -0.08], [0.17, 0.4, 0.17], [0, 0, s * 0.35], head);
      add(BALL, c.accent, [s * 0.47, 0.3, -0.05], [0.09, 0.09, 0.09], undefined, head);
      add(CONE, '#ffffff', [s * 0.12, 0.56, 0.05], [0.13, 0.22, 0.07], [0, 0, s * 1.2], head);       // リボン
    });
    add(BALL, c.accent, [0, 0.55, 0.05], [0.06, 0.06, 0.06], undefined, head);
  }
  if (k === 'pirate') {
    add(BALL, DARK, [0, 0.4, -0.14], [0.5, 0.2, 0.44], [-0.3, 0, 0], head);                           // 帽子
    add(RING, DARK, [0, 0.33, -0.12], [0.62, 0.04, 0.56], [-0.3, 0, 0], head);
    add(BALL, '#ffffff', [0, 0.5, 0.27], [0.07, 0.07, 0.03], [-0.3, 0, 0], head);
    add(RING, c.accent, [0, 0.27, -0.06], [0.505, 0.05, 0.47], [-0.3, 0, 0], head);                   // バンダナ
  }

  // 目（アニメ風の大きな目：黒いふち・色のついた瞳・白い光）
  both(s => {
    const eye = new THREE.Group();
    eye.position.set(s * 0.18, -0.02, 0.4);
    if (k === 'pirate' && s === 1) {
      add(BALL, DARK, [0, 0, 0.02], [0.1, 0.11, 0.04], undefined, eye);                              // 眼帯
      add(RING, DARK, [0.0, 0.12, 0.38], [0.5, 0.025, 0.1], [0, 0, 0.35], head);
    } else {
      add(BALL, DARK, [0, 0, 0], [0.085, 0.12, 0.05], undefined, eye);
      add(BALL, c.eye, [0, -0.015, 0.02], [0.065, 0.09, 0.04], undefined, eye);
      add(BALL, '#ffffff', [s * -0.025, 0.045, 0.045], [0.03, 0.035, 0.02], undefined, eye);
    }
    head.add(eye);
    b.eyes.push(eye);
  });
  if (k !== 'ninja') {
    both(s => add(BALL, '#ff9aa8', [s * 0.3, -0.14, 0.33], [0.07, 0.04, 0.03], undefined, head));     // ほっぺ
    add(BALL, '#d9534f', [0, -0.2, 0.42], [0.035, 0.02, 0.02], undefined, head);                      // 口
  }
}
