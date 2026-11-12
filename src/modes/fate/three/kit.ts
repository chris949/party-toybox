// キャラクターを組み立てる道具（動物も人も共通）。
// 球・円すい・円柱の部品を置いていき、最後に1つの形にまとめる（1体を「体・輪郭線・顔の絵」の3回で描けるようにするため。
// 部品を1つずつ描くと、10人で数百回の描画になり、スマホには重い）。色は、頂点ごとの色として持たせる
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFace, outlineMaterial, toonRamp, type FaceMood, type FaceSpec } from './anime';
import { tinted } from './tint';

export type V3 = [number, number, number];
export type Shape = 'ball' | 'cone' | 'ring';
export const BALL: Shape = 'ball', CONE: Shape = 'cone', RING: Shape = 'ring';

// 形の元。小さい部品（飾りなど）は、粗くても見分けが付かないので、分割を減らす
const SMALL = 0.1; // いちばん長い辺がこれより小さい部品は「小さい部品」
const GEO: Record<Shape, [THREE.BufferGeometry, THREE.BufferGeometry]> = {
  ball: [new THREE.SphereGeometry(1, 16, 10), new THREE.SphereGeometry(1, 8, 6)],
  cone: [new THREE.ConeGeometry(1, 1, 12), new THREE.ConeGeometry(1, 1, 8)],
  ring: [new THREE.CylinderGeometry(1, 1, 1, 24), new THREE.CylinderGeometry(1, 1, 1, 10)],
};
const GHOST_GREY = new THREE.Color('#e4ebf2');

export interface Chara3D {
  root: THREE.Group;              // 足元が原点。正面は +z
  setFace(mood: FaceMood): void;  // 顔の絵を切り替える（ふつう／驚き）
  setGhost(on: boolean): void;
  dispose(): void;
}

interface Part { shape: Shape; color: string; p: V3; s: V3; r?: V3; parent: THREE.Object3D; asIs?: boolean } // asIs = 色合いを変えない

export class Builder {
  readonly root = new THREE.Group();
  private parts: Part[] = [];
  // 顔の絵を貼る頭、その大きさ、顔の描き分け（組み立てる側が、最後に決める）
  face: { head: THREE.Group; headScale: V3; spec: FaceSpec } | null = null;

  // variant = 同じキャラクターの何人目か（2人目からは色合いを変える）。keep = 色合いを変えない色（肌など）
  constructor(private ringColor: string, private variant = 0, private keep: readonly string[] = []) {}

  // 部品を1つ置く。parent を省くと体に、頭の入れ物を渡すとその中に置く
  add = (shape: Shape, color: string, p: V3, s: V3, r?: V3, parent: THREE.Object3D = this.root) => {
    this.parts.push({ shape, color, p, s, r, parent });
  };

  // 部品をまとめて、描ける形にする
  finish(): Chara3D {
    const { root } = this;
    // 足元の輪（同じキャラクターを選んだ人を、色で見分ける）
    this.parts.push({ shape: RING, color: this.ringColor, p: [0, 0.025, 0], s: [0.56, 0.05, 0.56], parent: root, asIs: true });
    root.updateMatrixWorld(true);
    const list: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (const part of this.parts) {
      m.compose(new THREE.Vector3(...part.p), q.setFromEuler(e.set(...(part.r ?? [0, 0, 0]))), new THREE.Vector3(...part.s)).premultiply(part.parent.matrixWorld);
      const g = GEO[part.shape][Math.max(...part.s) < SMALL ? 1 : 0].clone().applyMatrix4(m);
      g.deleteAttribute('uv');
      const n = g.attributes.position.count;
      const col = part.asIs || this.keep.includes(part.color) ? new THREE.Color(part.color) : tinted(part.color, this.variant, this.ringColor);
      const ghost = col.clone().lerp(GHOST_GREY, 0.72); // ゴーストのときの色（白っぽくする）
      const fill = (c: THREE.Color) => { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); return new THREE.BufferAttribute(a, 3); };
      g.setAttribute('color', fill(col));
      g.setAttribute('ghost', fill(ghost));
      list.push(g);
    }
    const geo = mergeGeometries(list)!;
    list.forEach(g => g.dispose());
    const colors = { normal: geo.getAttribute('color'), ghost: geo.getAttribute('ghost') };
    geo.deleteAttribute('ghost');
    const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
    const lineMat = outlineMaterial();
    const body = new THREE.Mesh(geo, material), line = new THREE.Mesh(geo, lineMat);
    root.add(body, line);
    const face = this.face ? makeFace(this.face.headScale, this.face.spec) : null;
    if (face && this.face) this.face.head.add(face.mesh);
    return {
      root,
      setFace(mood) { face?.set(mood); },
      // ゴースト：半透明で白っぽくする（輪郭線は消す）
      setGhost(on) {
        geo.setAttribute('color', on ? colors.ghost : colors.normal);
        material.transparent = on; material.opacity = on ? 0.5 : 1; material.depthWrite = !on;
        material.needsUpdate = true;
        line.visible = !on;
        face?.setGhost(on);
      },
      dispose() { geo.dispose(); material.dispose(); lineMat.dispose(); face?.dispose(); },
    };
  }
}

export const both = (f: (side: 1 | -1) => void) => { f(1); f(-1); };
