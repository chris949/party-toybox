// アニメ調の動物（src/modes/fate/README.md の11.12）。大きな頭に、絵で描いた顔。耳としっぽでシルエットを描き分ける。
// 並びは 2D のキャラクター（charas.tsx）と同じ
import * as THREE from 'three';
import { BALL, both, CONE, RING, type Builder } from './kit';

type Ears = 'floppy' | 'point' | 'long' | 'round' | 'none';
type Tail = 'curl' | 'long' | 'puff' | 'bushy' | 'none';
export interface Look {
  body: string; belly: string; ears: Ears; ear: string; earIn?: string; tail: Tail; tailTip?: string;
  eye: string; muzzle?: string; nose?: string; limbs?: string;
  beak?: boolean; pigNose?: boolean; frog?: boolean; patches?: boolean; stripes?: boolean; bigEars?: boolean; whiskers?: boolean; crest?: boolean;
}

const INK = '#2b2b33', DARKBROWN = '#3a2a22';
export const ANIMALS: Look[] = [
  { body: '#e2a868', belly: '#fff2dc', ears: 'floppy', ear: '#8a5630', tail: 'curl', eye: '#6b4226', muzzle: '#fff2dc', nose: INK },                                        // いぬ
  { body: '#f6b54e', belly: '#fff5e0', ears: 'point', ear: '#f6b54e', earIn: '#ffb3c1', tail: 'long', eye: '#3f9b4b', nose: '#ff8fa3', whiskers: true },                     // ねこ
  { body: '#f6f2ee', belly: '#ffffff', ears: 'long', ear: '#f6f2ee', earIn: '#ffb3c1', tail: 'puff', eye: '#c0392b', nose: '#ff8fa3' },                                      // うさぎ
  { body: '#a06a3c', belly: '#d9b085', ears: 'round', ear: '#a06a3c', earIn: '#d9b085', tail: 'puff', eye: DARKBROWN, muzzle: '#e6c69c', nose: INK },                        // くま
  { body: '#f7f7f5', belly: '#ffffff', ears: 'round', ear: INK, tail: 'puff', eye: DARKBROWN, nose: INK, limbs: INK, patches: true },                                        // パンダ
  { body: '#6cc24a', belly: '#dff5b0', ears: 'none', ear: '#6cc24a', tail: 'none', eye: '#e0a020', frog: true },                                                             // かえる
  { body: '#34425a', belly: '#ffffff', ears: 'none', ear: '#34425a', tail: 'none', eye: '#2f7fd6', limbs: '#ff9f1c', beak: true },                                           // ペンギン
  { body: '#ffd84a', belly: '#fff0a8', ears: 'none', ear: '#ffd84a', tail: 'none', eye: DARKBROWN, limbs: '#ff9f1c', beak: true, crest: true },                              // ひよこ
  { body: '#f0863a', belly: '#fff5e8', ears: 'point', ear: '#f0863a', earIn: DARKBROWN, tail: 'bushy', tailTip: '#fff5e8', eye: '#b8741a', muzzle: '#fff5e8', nose: INK },   // きつね
  { body: '#f8a9bb', belly: '#fcd0da', ears: 'point', ear: '#f08aa2', tail: 'curl', eye: DARKBROWN, pigNose: true },                                                         // ぶた
  { body: '#a7afb9', belly: '#e9edf1', ears: 'round', ear: '#a7afb9', earIn: '#f4f6f8', tail: 'none', eye: DARKBROWN, nose: INK, bigEars: true },                            // コアラ
  { body: '#f5a12a', belly: '#fff5e0', ears: 'round', ear: '#f5a12a', earIn: '#fff5e0', tail: 'long', tailTip: DARKBROWN, eye: '#b8741a', muzzle: '#fff5e0', nose: INK, stripes: true }, // とら
];
const HEAD: [number, number, number] = [0.6, 0.54, 0.54];

// 動物を1体、組み立てる（部品を置くだけ。まとめて描ける形にするのは kit.ts）
export function buildAnimal(b: Builder, look: Look) {
  const { root, add } = b;
  const limbs = look.limbs ?? look.body;

  // ===== 体：小さく =====
  add(BALL, look.body, [0, 0.36, 0], [0.28, 0.3, 0.25]);
  add(BALL, look.belly, [0, 0.33, 0.1], [0.2, 0.22, 0.18]);
  both(s => add(BALL, limbs, [s * 0.13, 0.065, 0.07], [0.11, 0.07, 0.16]));                         // 足
  both(s => add(BALL, look.beak ? look.body : limbs, [s * 0.28, 0.42, 0.03], [0.075, 0.14, 0.09], [0, 0, s * 0.5])); // 手（鳥は、つばさ）

  // しっぽ：後ろ姿とシルエットの目印
  if (look.tail === 'curl') { add(BALL, look.body, [0, 0.44, -0.27], [0.065, 0.15, 0.065], [-0.7, 0, 0]); add(BALL, look.body, [0, 0.58, -0.36], [0.08, 0.08, 0.08]); }
  if (look.tail === 'long') {
    add(BALL, look.body, [0.1, 0.34, -0.3], [0.055, 0.055, 0.18], [0.5, 0.4, 0]);
    add(BALL, look.body, [0.2, 0.52, -0.42], [0.055, 0.16, 0.055], [0.2, 0, -0.2]);
    add(BALL, look.tailTip ?? look.body, [0.24, 0.68, -0.44], [0.065, 0.065, 0.065]);
  }
  if (look.tail === 'puff') add(BALL, look.belly, [0, 0.3, -0.26], [0.1, 0.1, 0.1]);
  if (look.tail === 'bushy') { add(BALL, look.body, [0.08, 0.44, -0.38], [0.15, 0.28, 0.15], [-0.6, 0, -0.2]); add(BALL, look.tailTip ?? look.belly, [0.12, 0.66, -0.52], [0.1, 0.12, 0.1]); }

  // ===== 頭：大きく。少し見上げさせる =====
  const head = new THREE.Group();
  head.position.set(0, 1.04, 0.03);
  head.rotation.x = -0.5;
  root.add(head);
  const h = (...a: [typeof BALL, string, [number, number, number], [number, number, number], [number, number, number]?]) => add(a[0], a[1], a[2], a[3], a[4], head);
  h(BALL, look.body, [0, 0, 0], HEAD);

  // 耳
  const earIn = look.earIn;
  if (look.ears === 'floppy') both(s => h(BALL, look.ear, [s * 0.58, 0.02, 0], [0.15, 0.36, 0.22], [0, 0, s * 0.22]));
  if (look.ears === 'point') both(s => {
    h(CONE, look.ear, [s * 0.38, 0.52, -0.02], [0.22, 0.4, 0.15], [0, 0, -s * 0.32]);
    if (earIn) h(CONE, earIn, [s * 0.38, 0.5, 0.05], [0.13, 0.26, 0.09], [0, 0, -s * 0.32]);
  });
  if (look.ears === 'long') both(s => {
    h(BALL, look.ear, [s * 0.24, 0.88, -0.05], [0.13, 0.46, 0.1], [0, 0, -s * 0.14]);
    if (earIn) h(BALL, earIn, [s * 0.24, 0.88, 0.03], [0.065, 0.34, 0.05], [0, 0, -s * 0.14]);
  });
  if (look.ears === 'round') both(s => {
    const r = look.bigEars ? 0.3 : 0.2;
    h(BALL, look.ear, [s * (look.bigEars ? 0.56 : 0.46), look.bigEars ? 0.3 : 0.42, -0.02], [r, r, r * 0.55]);
    if (earIn) h(BALL, earIn, [s * (look.bigEars ? 0.56 : 0.46), look.bigEars ? 0.3 : 0.42, 0.08], [r * 0.6, r * 0.6, r * 0.35]);
  });

  // 顔まわりの立体の部品（絵では足りないもの）
  if (look.beak) h(CONE, limbs, [0, -0.16, 0.58], [0.11, 0.2, 0.08], [Math.PI / 2, 0, 0]);          // くちばし
  if (look.pigNose) {
    h(RING, '#e56f8a', [0, -0.16, 0.54], [0.15, 0.07, 0.11], [Math.PI / 2, 0, 0]);
    both(s => h(BALL, '#b84e68', [s * 0.055, -0.16, 0.58], [0.025, 0.035, 0.012]));
  }
  if (look.bigEars) h(BALL, INK, [0, -0.13, 0.52], [0.09, 0.13, 0.07]);                            // コアラの大きな鼻
  if (look.frog) both(s => h(BALL, look.body, [s * 0.3, 0.46, 0.14], [0.2, 0.2, 0.2]));            // かえるの、頭の上のふくらみ
  if (look.crest) [-0.08, 0.02, 0.12].forEach((x, i) => h(CONE, look.body, [x, 0.6, 0], [0.06, 0.2 + i * 0.03, 0.06], [0, 0, -x * 2]));  // ひよこの、頭の毛
  if (look.stripes) [-0.16, 0, 0.16].forEach(x => h(BALL, DARKBROWN, [x, 0.46, 0.12 - Math.abs(x) * 0.3], [0.035, 0.07, 0.15], [-0.5, 0, 0])); // とらのしま

  b.face = {
    head, headScale: HEAD,
    spec: {
      eye: look.eye, animal: true, muzzle: look.muzzle, patches: look.patches, whiskers: look.whiskers, stripes: look.stripes, wide: look.frog,
      nose: look.beak || look.pigNose || look.bigEars || look.frog ? undefined : look.nose,
      mouth: !(look.beak || look.pigNose),
    },
  };
}
