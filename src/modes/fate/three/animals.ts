// おもちゃ風の動物（src/modes/fate/README.md の11.12）。球と円すいを組み合わせて作る。並びは 2D のキャラクター（charas.tsx）と同じ
import * as THREE from 'three';
import { CHIBIS, makeChibi } from './chibis';
import { tinted } from './tint';

const BALL = new THREE.SphereGeometry(1, 24, 16);
const CONE = new THREE.ConeGeometry(1, 1, 16);
const RING = new THREE.CylinderGeometry(1, 1, 1, 32);

type Ears = 'floppy' | 'point' | 'long' | 'round' | 'none';
interface Look {
  body: string; belly: string; ears: Ears; ear: string; earIn?: string; snout?: string; nose: string;
  feet?: string; beak?: boolean; patches?: boolean; frog?: boolean; pigNose?: boolean; bigNose?: boolean; stripes?: boolean; bigEars?: boolean;
}

const LOOKS: Look[] = [
  { body: '#e2a868', belly: '#fff2dc', ears: 'floppy', ear: '#8a5630', snout: '#fff2dc', nose: '#2b2b33' },                 // いぬ
  { body: '#f6b54e', belly: '#fff5e0', ears: 'point', ear: '#f6b54e', earIn: '#ffb3c1', snout: '#fff5e0', nose: '#ff8fa3' }, // ねこ
  { body: '#f6f2ee', belly: '#ffffff', ears: 'long', ear: '#f6f2ee', earIn: '#ffb3c1', nose: '#ff8fa3' },                    // うさぎ
  { body: '#a06a3c', belly: '#d9b085', ears: 'round', ear: '#a06a3c', earIn: '#d9b085', snout: '#e6c69c', nose: '#2b2b33' }, // くま
  { body: '#f7f7f5', belly: '#ffffff', ears: 'round', ear: '#2b2b33', nose: '#2b2b33', feet: '#2b2b33', patches: true },     // パンダ
  { body: '#6cc24a', belly: '#dff5b0', ears: 'none', ear: '#6cc24a', nose: '#6cc24a', frog: true },                          // かえる
  { body: '#34425a', belly: '#ffffff', ears: 'none', ear: '#34425a', nose: '#ff9f1c', feet: '#ff9f1c', beak: true },         // ペンギン
  { body: '#ffd84a', belly: '#fff0a8', ears: 'none', ear: '#ffd84a', nose: '#ff9f1c', feet: '#ff9f1c', beak: true },         // ひよこ
  { body: '#f0863a', belly: '#fff5e8', ears: 'point', ear: '#f0863a', earIn: '#3a2a22', snout: '#fff5e8', nose: '#2b2b33' }, // きつね
  { body: '#f8a9bb', belly: '#fcd0da', ears: 'point', ear: '#f08aa2', nose: '#e56f8a', pigNose: true },                      // ぶた
  { body: '#a7afb9', belly: '#e9edf1', ears: 'round', ear: '#a7afb9', earIn: '#f4f6f8', nose: '#2b2b33', bigNose: true, bigEars: true }, // コアラ
  { body: '#f5a12a', belly: '#fff5e0', ears: 'round', ear: '#f5a12a', earIn: '#fff5e0', snout: '#fff5e0', nose: '#2b2b33', stripes: true }, // とら
];

export interface Animal {
  root: THREE.Group;      // 足元が原点。正面は +z
  eyes: THREE.Object3D[]; // 驚いたときに大きくする
  ring: THREE.Mesh;       // 足元の輪（参加者の色）
  setGhost(on: boolean): void;
  dispose(): void;
}

export function makeAnimal(n: number, ringColor: string, variant = 0): Animal {
  // 並びは charas.tsx と同じ：動物12種 → アニメ風の人5種
  const total = LOOKS.length + CHIBIS.length, idx = ((Math.trunc(n) || 0) % total + total) % total;
  if (idx >= LOOKS.length) return makeChibi(idx - LOOKS.length, ringColor, variant);
  const look = LOOKS[idx];
  const root = new THREE.Group();
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (c: string) => {
    let m = mats.get(c);
    if (!m) { const col = tinted(c, variant, ringColor); m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0 }); m.userData.base = col.clone(); mats.set(c, m); }
    return m;
  };
  const add = (geo: THREE.BufferGeometry, c: string, p: [number, number, number], s: [number, number, number], r?: [number, number, number], parent: THREE.Object3D = root) => {
    const m = new THREE.Mesh(geo, mat(c));
    m.position.set(...p); m.scale.set(...s);
    if (r) m.rotation.set(...r);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const both = (f: (side: 1 | -1) => void) => { f(1); f(-1); };

  // 体・おなか・足
  add(BALL, look.body, [0, 0.5, 0], [0.46, 0.5, 0.42]);
  add(BALL, look.belly, [0, 0.46, 0.14], [0.33, 0.37, 0.32]);
  both(s => add(BALL, look.feet ?? look.body, [s * 0.2, 0.08, 0.14], [0.16, 0.09, 0.2]));
  both(s => add(BALL, look.patches ? '#2b2b33' : look.body, [s * 0.44, 0.58, 0.04], [0.12, 0.2, 0.13], [0, 0, s * 0.5])); // 手

  // 頭
  const head = new THREE.Group();
  head.position.set(0, 1.18, 0.02);
  head.rotation.x = -0.35; // 上から見下ろす視点でも顔が見えるよう、少し見上げさせる
  root.add(head);
  add(BALL, look.body, [0, 0, 0], [0.5, 0.45, 0.46], undefined, head);

  // 耳
  const earIn = look.earIn;
  if (look.ears === 'floppy') both(s => add(BALL, look.ear, [s * 0.46, 0.02, 0], [0.13, 0.3, 0.2], [0, 0, s * 0.25], head));
  if (look.ears === 'point') both(s => {
    add(CONE, look.ear, [s * 0.3, 0.42, 0], [0.19, 0.34, 0.14], [0, 0, -s * 0.28], head);
    if (earIn) add(CONE, earIn, [s * 0.3, 0.4, 0.05], [0.11, 0.22, 0.09], [0, 0, -s * 0.28], head);
  });
  if (look.ears === 'long') both(s => {
    add(BALL, look.ear, [s * 0.2, 0.72, -0.02], [0.12, 0.4, 0.1], [0, 0, -s * 0.12], head);
    if (earIn) add(BALL, earIn, [s * 0.2, 0.72, 0.05], [0.06, 0.3, 0.05], [0, 0, -s * 0.12], head);
  });
  if (look.ears === 'round') both(s => {
    const r = look.bigEars ? 0.24 : 0.17;
    add(BALL, look.ear, [s * 0.4, 0.34, 0], [r, r, r * 0.6], undefined, head);
    if (earIn) add(BALL, earIn, [s * 0.4, 0.34, 0.07], [r * 0.6, r * 0.6, r * 0.4], undefined, head);
  });

  // 目（かえるは頭の上に飛び出す）
  const eyes: THREE.Object3D[] = [];
  both(s => {
    const eye = new THREE.Group();
    if (look.frog) {
      eye.position.set(s * 0.26, 0.4, 0.12);
      add(BALL, look.body, [0, 0, 0], [0.19, 0.19, 0.19], undefined, eye);
      add(BALL, '#ffffff', [0, 0.02, 0.07], [0.14, 0.14, 0.14], undefined, eye);
      add(BALL, '#2b2b33', [0, 0.02, 0.17], [0.07, 0.08, 0.05], undefined, eye);
    } else {
      eye.position.set(s * 0.19, 0.06, 0.4);
      if (look.patches) add(BALL, '#2b2b33', [s * 0.02, -0.02, -0.03], [0.13, 0.16, 0.06], [0, 0, s * 0.4], eye);
      add(BALL, '#2b2b33', [0, 0, 0], [0.065, 0.085, 0.05], undefined, eye);
      add(BALL, '#ffffff', [s * -0.02, 0.03, 0.035], [0.022, 0.022, 0.02], undefined, eye); // 光
    }
    head.add(eye);
    eyes.push(eye);
  });
  both(s => add(BALL, '#ff9aa8', [s * 0.33, -0.1, 0.33], [0.075, 0.05, 0.03], undefined, head)); // ほっぺ

  // 鼻・口まわり
  if (look.beak) add(CONE, look.nose, [0, -0.06, 0.48], [0.1, 0.2, 0.08], [Math.PI / 2, 0, 0], head);
  else if (look.pigNose) {
    add(RING, look.nose, [0, -0.08, 0.44], [0.15, 0.08, 0.11], [Math.PI / 2, 0, 0], head);
    both(s => add(BALL, '#b84e68', [s * 0.055, -0.08, 0.485], [0.025, 0.035, 0.01], undefined, head));
  } else if (look.bigNose) add(BALL, look.nose, [0, -0.06, 0.44], [0.1, 0.15, 0.08], undefined, head);
  else if (look.frog) both(s => add(BALL, '#3f8f2c', [s * 0.07, 0.02, 0.44], [0.02, 0.02, 0.01], undefined, head));
  else {
    if (look.snout) add(BALL, look.snout, [0, -0.11, 0.36], [0.2, 0.15, 0.14], undefined, head);
    add(BALL, look.nose, [0, -0.06, 0.49], [0.06, 0.045, 0.04], undefined, head);
  }
  if (look.stripes) [-0.14, 0, 0.14].forEach(x => add(BALL, '#3a2a22', [x, 0.4, 0.14 - Math.abs(x) * 0.3], [0.03, 0.06, 0.13], [-0.5, 0, 0], head));

  // 足元の輪（同じ動物を選んだ人を、色で見分ける）
  const ring = new THREE.Mesh(RING, new THREE.MeshStandardMaterial({ color: ringColor, roughness: 0.6 }));
  ring.scale.set(0.56, 0.05, 0.56);
  ring.position.y = 0.025;
  ring.receiveShadow = true;
  root.add(ring);

  const grey = new THREE.Color('#e4ebf2');
  return {
    root, eyes, ring,
    // ゴースト：半透明で白っぽくして、影を落とさない
    setGhost(on) {
      for (const m of mats.values()) {
        m.color.copy(m.userData.base as THREE.Color);
        if (on) m.color.lerp(grey, 0.72);
        m.transparent = on; m.opacity = on ? 0.5 : 1; m.depthWrite = !on;
      }
      const rm = ring.material as THREE.MeshStandardMaterial;
      rm.transparent = on; rm.opacity = on ? 0.35 : 1;
      root.traverse(o => { if ((o as THREE.Mesh).isMesh && o !== ring) o.castShadow = !on; });
    },
    dispose() { for (const m of mats.values()) m.dispose(); (ring.material as THREE.Material).dispose(); },
  };
}
