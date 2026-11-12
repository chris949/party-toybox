// 3Dの舞台の「物」：左右の床・スタート台（2枚の扉と、中の暗い穴）と、お立ち台
import * as THREE from 'three';
import type { Pos } from '../rules';
import type { FloorState } from '../stage';
import { BLOCK_H, COLORS, FLOOR_Z, PODIUM_D, PODIUM_H, PODIUM_W, SIDE } from './layout';

export interface Floor { state: FloorState; since: number; angle: number; doors: [THREE.Group, THREE.Group]; mat: THREE.MeshStandardMaterial; rim: THREE.MeshStandardMaterial; base: THREE.Color }

// お立ち台：その問題を作った人が立つ（左右の床のあいだ。少し高い）
export function buildPodium(scene: THREE.Scene) {
  const g = new THREE.Group();
  g.position.set(0, 0, FLOOR_Z);
  const gold = new THREE.MeshStandardMaterial({ color: '#ffc83d', roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(PODIUM_W, BLOCK_H + PODIUM_H, PODIUM_D), gold);
  body.position.y = (PODIUM_H - BLOCK_H) / 2 - 0.02;
  const top = new THREE.Mesh(new THREE.BoxGeometry(PODIUM_W - 0.3, 0.04, PODIUM_D - 0.3), new THREE.MeshStandardMaterial({ color: '#e8483f', roughness: 0.8 }));
  top.position.y = PODIUM_H;
  g.add(body, top);
  scene.add(g);
}

// 厚みのある台。上は2枚の扉、中は暗い穴
export function buildFloor(scene: THREE.Scene, pos: Pos): Floor {
  const s = SIDE[pos], g = new THREE.Group();
  g.position.set(s.x, 0, s.z);
  scene.add(g);
  const base = new THREE.Color(COLORS[pos]);
  const side = new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.78), roughness: 0.8 });
  const none = new THREE.MeshBasicMaterial({ visible: false });
  // 外側（上の面は扉に任せるので描かない）と、内側（暗い穴）
  const shell = new THREE.Mesh(new THREE.BoxGeometry(s.w, BLOCK_H, s.d), [side, side, none, side, side, side]);
  shell.position.y = -BLOCK_H / 2 - 0.02;
  const pit = new THREE.Mesh(new THREE.BoxGeometry(s.w - 0.1, BLOCK_H - 0.1, s.d - 0.1), new THREE.MeshBasicMaterial({ color: COLORS.pit, side: THREE.BackSide }));
  pit.position.y = -BLOCK_H / 2 - 0.02;
  g.add(shell, pit);

  // 扉：左右の床は外側の辺、スタート台は奥と手前の辺をちょうつがいにして、下へ開く
  const mat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.7, emissive: COLORS.ok, emissiveIntensity: 0 });
  const alongX = pos !== 'C';
  const half = (alongX ? s.w : s.d) / 2;
  const doors = [-1, 1].map(sign => {
    const hinge = new THREE.Group();
    const panel = new THREE.Mesh(alongX ? new THREE.BoxGeometry(half - 0.03, 0.14, s.d - 0.06) : new THREE.BoxGeometry(s.w - 0.06, 0.14, half - 0.03), mat);
    if (alongX) { hinge.position.x = sign * half; panel.position.set(-sign * half / 2, -0.07, 0); }
    else { hinge.position.z = sign * half; panel.position.set(0, -0.07, -sign * half / 2); }
    hinge.add(panel);
    hinge.userData = { sign, alongX };
    g.add(hinge);
    return hinge;
  }) as [THREE.Group, THREE.Group];

  // ふち（自分がいる側は濃い色にする）
  const rim = new THREE.MeshStandardMaterial({ color: COLORS.rim, roughness: 0.6 });
  const t = 0.16;
  [[s.w + t * 2, t, 0, -s.d / 2 - t / 2], [s.w + t * 2, t, 0, s.d / 2 + t / 2], [t, s.d, -s.w / 2 - t / 2, 0], [t, s.d, s.w / 2 + t / 2, 0]].forEach(([w, d, x, z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), rim);
    m.position.set(x, -0.09, z);
    g.add(m);
  });
  return { state: '', since: 0, angle: 0, doors, mat, rim, base };
}
