// キャラクターを組み立てる道具（動物も人も共通）。
// 球・円すい・円柱の部品を置いていき、最後に1つの形にまとめる（1体を、体1つ＋目2つの3回で描けるようにするため。
// 部品を1つずつ描くと、10人で数百回の描画になり、スマホには重い）。色は、頂点ごとの色として持たせる
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tinted } from './tint';

export type V3 = [number, number, number];
export type Shape = 'ball' | 'cone' | 'ring';
export const BALL: Shape = 'ball', CONE: Shape = 'cone', RING: Shape = 'ring';

// 形の元。小さい部品（目の光・ほっぺなど）は、粗くても見分けが付かないので、分割を減らす
const SMALL = 0.1; // いちばん長い辺がこれより小さい部品は「小さい部品」
const GEO: Record<Shape, [THREE.BufferGeometry, THREE.BufferGeometry]> = {
  ball: [new THREE.SphereGeometry(1, 16, 10), new THREE.SphereGeometry(1, 8, 6)],
  cone: [new THREE.ConeGeometry(1, 1, 12), new THREE.ConeGeometry(1, 1, 8)],
  ring: [new THREE.CylinderGeometry(1, 1, 1, 24), new THREE.CylinderGeometry(1, 1, 1, 10)],
};
const GHOST_GREY = new THREE.Color('#e4ebf2');

export interface Chara3D {
  root: THREE.Group;      // 足元が原点。正面は +z
  eyes: THREE.Object3D[]; // 驚いたときに大きくする
  setGhost(on: boolean): void;
  dispose(): void;
}

interface Part { shape: Shape; color: string; p: V3; s: V3; r?: V3; parent: THREE.Object3D; asIs?: boolean } // asIs = 色合いを変えない

export class Builder {
  readonly root = new THREE.Group();
  readonly eyes: THREE.Group[] = []; // 目の入れ物（大きさを変えるので、体とは別の形にする）
  private parts: Part[] = [];

  // variant = 同じキャラクターの何人目か（2人目からは色合いを変える）。keep = 色合いを変えない色（肌など）
  constructor(private ringColor: string, private variant = 0, private keep: readonly string[] = []) {}

  // 部品を1つ置く。parent を省くと体に、頭や目の入れ物を渡すとその中に置く
  add = (shape: Shape, color: string, p: V3, s: V3, r?: V3, parent: THREE.Object3D = this.root) => {
    this.parts.push({ shape, color, p, s, r, parent });
  };

  // 部品をまとめて、描ける形にする
  finish(): Chara3D {
    const { root, eyes } = this;
    // 足元の輪（同じキャラクターを選んだ人を、色で見分ける）
    this.parts.push({ shape: RING, color: this.ringColor, p: [0, 0.025, 0], s: [0.56, 0.05, 0.56], parent: root, asIs: true });
    root.updateMatrixWorld(true);
    const buckets = new Map<THREE.Object3D, THREE.BufferGeometry[]>();
    const local = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (const part of this.parts) {
      const inEye = eyes.includes(part.parent as THREE.Group);
      const owner = inEye ? part.parent : root; // 目の部品は目の入れ物の中の座標のまま、ほかは体の座標に直す
      local.compose(new THREE.Vector3(...part.p), q.setFromEuler(e.set(...(part.r ?? [0, 0, 0]))), new THREE.Vector3(...part.s));
      if (!inEye) local.premultiply(part.parent.matrixWorld);
      const g = GEO[part.shape][Math.max(...part.s) < SMALL ? 1 : 0].clone().applyMatrix4(local);
      g.deleteAttribute('uv');
      const n = g.attributes.position.count;
      const col = part.asIs || this.keep.includes(part.color) ? new THREE.Color(part.color) : tinted(part.color, this.variant, this.ringColor);
      const ghost = col.clone().lerp(GHOST_GREY, 0.72); // ゴーストのときの色（白っぽくする）
      const fill = (c: THREE.Color) => { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); return new THREE.BufferAttribute(a, 3); };
      g.setAttribute('color', fill(col));
      g.setAttribute('ghost', fill(ghost));
      (buckets.get(owner) ?? buckets.set(owner, []).get(owner)!).push(g);
    }
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
    const meshes: THREE.Mesh[] = [];
    for (const [owner, list] of buckets) {
      const merged = mergeGeometries(list)!;
      list.forEach(g => g.dispose());
      merged.userData = { normal: merged.getAttribute('color'), ghost: merged.getAttribute('ghost') };
      merged.deleteAttribute('ghost');
      const mesh = new THREE.Mesh(merged, material);
      owner.add(mesh);
      meshes.push(mesh);
    }
    return {
      root, eyes,
      // ゴースト：半透明で白っぽくする
      setGhost(on) {
        for (const m of meshes) m.geometry.setAttribute('color', on ? m.geometry.userData.ghost : m.geometry.userData.normal);
        material.transparent = on; material.opacity = on ? 0.5 : 1; material.depthWrite = !on;
        material.needsUpdate = true;
      },
      dispose() { meshes.forEach(m => m.geometry.dispose()); material.dispose(); },
    };
  }
}

export const both = (f: (side: 1 | -1) => void) => { f(1); f(-1); };
