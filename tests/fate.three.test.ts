// 3Dのキャラクター（運命の二者択一）が組み立てられるか、描画が重くなっていないか。
// 画面は出さずに、形だけを作って数える（three.js の形づくりは、ブラウザがなくても動く）
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CHARA_COUNT } from '../src/core/constants';
import { CHARA_3D_COUNT, makeChara3D } from '../src/modes/fate/three/chara3d';

// 1体を描くのに要る「描画の回数」と「三角形の数」
function cost(root: THREE.Object3D) {
  let calls = 0, tris = 0;
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    calls++;
    tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  });
  return { calls, tris };
}
const colorsOf = (root: THREE.Object3D) => {
  const out: number[] = [];
  root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) out.push(...(m.geometry.getAttribute('color').array as Float32Array)); });
  return out;
};

describe('3Dのキャラクター', () => {
  it('2D のキャラクターと同じ数だけある', () => {
    expect(CHARA_3D_COUNT).toBe(CHARA_COUNT);
  });
  it('全17体を組み立てられる。1体は「体1つ＋目2つ」の3回で描け、三角形は6000以下', () => {
    for (let n = 0; n < CHARA_3D_COUNT; n++) {
      const c = makeChara3D(n, '#ff6f6f');
      const { calls, tris } = cost(c.root);
      expect(calls, `キャラクター${n} の描画の回数`).toBe(3);
      expect(tris, `キャラクター${n} の三角形の数`).toBeLessThanOrEqual(6000);
      expect(c.eyes).toHaveLength(2);
      const box = new THREE.Box3().setFromObject(c.root);
      expect(box.min.y).toBeGreaterThan(-0.05);     // 足元が原点
      expect(box.max.y).toBeGreaterThan(1.3);       // 頭まである
      expect(box.max.y).toBeLessThan(2.6);
      c.dispose();
    }
  });
  it('10人そろっても、キャラクターの分は30回・6万三角形以下（スマホの目安：全部で150回・30万）', () => {
    let calls = 0, tris = 0;
    for (let i = 0; i < 10; i++) { const k = cost(makeChara3D(15, '#4aa6f0', i).root); calls += k.calls; tris += k.tris; } // いちばん部品が多いアイドルで数える
    expect(calls).toBeLessThanOrEqual(30);
    expect(tris).toBeLessThanOrEqual(60_000);
  });
  it('同じキャラクターの2人目は、色合いが変わる。番号が範囲の外でも、どれかのキャラクターになる', () => {
    expect(colorsOf(makeChara3D(0, '#ff6f6f', 1).root)).not.toEqual(colorsOf(makeChara3D(0, '#ff6f6f', 0).root));
    expect(colorsOf(makeChara3D(CHARA_3D_COUNT, '#ff6f6f').root)).toEqual(colorsOf(makeChara3D(0, '#ff6f6f').root));
    expect(colorsOf(makeChara3D(-1, '#ff6f6f').root)).toEqual(colorsOf(makeChara3D(CHARA_3D_COUNT - 1, '#ff6f6f').root));
  });
  it('ゴーストにすると白っぽく半透明になり、戻すと元の色に戻る', () => {
    const c = makeChara3D(3, '#36c99a');
    const before = colorsOf(c.root);
    c.setGhost(true);
    const ghost = colorsOf(c.root);
    expect(ghost).not.toEqual(before);
    expect(ghost.reduce((a, b) => a + b, 0)).toBeGreaterThan(before.reduce((a, b) => a + b, 0)); // 白っぽくなる
    c.setGhost(false);
    expect(colorsOf(c.root)).toEqual(before);
  });
});
