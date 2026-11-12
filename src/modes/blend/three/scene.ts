// まぎれろ！の3Dの舞台（src/modes/blend/README.md の 15.6）。ルールは知らず、届いた位置を描くだけ。
// キャラクター・名前の札は、運命の二者択一のもの（src/modes/fate/three/）を使う
import * as THREE from 'three';
import { BLEND_D, BLEND_STAR_R, BLEND_TICK_MS, BLEND_W } from '../../../core/constants';
import { makeChara3D, type Chara3D } from '../../fate/three/chara3d';
import { makeLabel } from '../../fate/three/label';

// 舞台に渡す情報（BlendView から、描くのに要るものだけ）
export interface BlendStageState {
  key: string;            // ラウンドごとに変わる（変わったら、全員を作り直す）
  chara: number;
  pos: number[];          // x, z の順（100倍の整数）
  tick: number;
  star: [number, number] | null;
  stars: number;
  mark: number | null;    // 矢印を出す番号（かくれている本人には自分、発表では全員に答え）
  pick: number | null;    // 自分が選んでいる番号
  found: boolean;         // 発表
  name: string;           // 発表で出す、かくれた人の名前
  canMove: boolean;       // 床をタップして動かせる（かくれている本人）
  canPick: boolean;       // キャラクターをタップして選べる（さがす人）
}
export interface BlendHandlers { onFloor(x: number, z: number): void; onPick(i: number): void }

interface Actor { chara: Chara3D; shadow: THREE.Mesh; x: number; z: number; fromX: number; fromZ: number; toX: number; toZ: number; t: number; face: number; phase: number; walk: number }

const BLOB = new THREE.CircleGeometry(0.5, 20);
const BLOB_MAT = new THREE.MeshBasicMaterial({ color: '#1f2d3d', transparent: true, opacity: 0.2, depthWrite: false });
const INK = '#1f2d3d';
const flat = <T extends THREE.Object3D>(o: T, y: number) => { o.rotation.x = -Math.PI / 2; o.position.y = y; return o; };

function starShape() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.2 : 0.46, a = i / 10 * Math.PI * 2 + Math.PI / 2;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ShapeGeometry(s);
}

export class BlendScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1.5, 0.1, 100);
  private actors: Actor[] = [];
  private st: BlendStageState | null = null;
  private star = new THREE.Group();
  private burst: THREE.Mesh;       // ほしが取られた瞬間の輪
  private burstAt = -10;
  private pickRing: THREE.Mesh;    // 自分が選んでいる1体の足元
  private tap: THREE.Mesh;         // かくれる人がタップした場所（本人にしか出ない）
  private tapAt = -10;
  private arrow: THREE.Mesh;
  private label: THREE.Sprite | null = null;
  private foundAt = 0;
  private last = performance.now();
  private raf = 0;
  private now = 0;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private ro: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement, private on: BlendHandlers) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    if (new URLSearchParams(location.search).has('dev')) (window as unknown as Record<string, unknown>).__THREE_GAME_DIAGNOSTICS__ = { renderer: this.renderer.info };

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#bcd9ee', 1.5));
    const sun = new THREE.DirectionalLight('#fff6e6', 2.1);
    sun.position.set(-5, 12, 7);
    this.scene.add(sun);

    // 床：厚みのある台と、ふちの線。歩ける範囲より少し広い
    const w = BLEND_W + 0.8, d = BLEND_D + 0.8;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), new THREE.MeshStandardMaterial({ color: '#d7f0df', roughness: 0.9 }));
    base.position.y = -0.6;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 1.1, d + 0.3), new THREE.MeshStandardMaterial({ color: '#8ccfa6', roughness: 0.9 }));
    rim.position.y = -0.66;
    this.scene.add(base, rim);
    // 床の水玉（歩いているのが分かりやすいように、床に模様を付ける）
    const dot = new THREE.CircleGeometry(0.16, 12), dotMat = new THREE.MeshBasicMaterial({ color: '#c3e6cf' });
    for (let x = -5; x <= 5; x += 2) for (let z = -3; z <= 3; z += 2) {
      const m = flat(new THREE.Mesh(dot, dotMat), 0.005);
      m.position.x = x; m.position.z = z;
      this.scene.add(m);
    }

    const gold = new THREE.MeshBasicMaterial({ color: '#ffc83d' });
    const zone = flat(new THREE.Mesh(new THREE.RingGeometry(BLEND_STAR_R - 0.07, BLEND_STAR_R, 32), new THREE.MeshBasicMaterial({ color: '#ffb020' })), 0.02);
    const fill = flat(new THREE.Mesh(new THREE.CircleGeometry(BLEND_STAR_R - 0.07, 32), new THREE.MeshBasicMaterial({ color: '#fff3c4' })), 0.015);
    this.star.add(fill, zone, flat(new THREE.Mesh(starShape(), gold), 0.03));
    this.star.visible = false;
    this.burst = flat(new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, depthWrite: false })), 0.04);
    this.pickRing = flat(new THREE.Mesh(new THREE.RingGeometry(0.56, 0.72, 32), new THREE.MeshBasicMaterial({ color: '#ff6f6f' })), 0.035);
    this.tap = flat(new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 24), new THREE.MeshBasicMaterial({ color: INK, transparent: true, depthWrite: false })), 0.045);
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.36, 4), new THREE.MeshBasicMaterial({ color: '#ff6f6f', depthTest: false }));
    this.arrow.rotation.x = Math.PI; this.arrow.renderOrder = 11;
    for (const o of [this.burst, this.pickRing, this.tap, this.arrow]) o.visible = false;
    this.scene.add(this.star, this.burst, this.pickRing, this.tap, this.arrow);

    canvas.addEventListener('pointerdown', this.onPointer);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.loop();
  }

  // 新しい状態を受け取る。位置は、次の位置が届くまでの間をなめらかにつなぐ
  update(st: BlendStageState) {
    const prev = this.st;
    const n = st.pos.length >> 1;
    if (!prev || prev.key !== st.key || this.actors.length !== n) {
      this.clearActors();
      for (let i = 0; i < n; i++) {
        const chara = makeChara3D(st.chara, '#9fc3dc', 0);
        chara.root.scale.setScalar(0.8);
        const shadow = flat(new THREE.Mesh(BLOB, BLOB_MAT), 0.012);
        this.scene.add(chara.root, shadow);
        const x = st.pos[i * 2] / 100, z = st.pos[i * 2 + 1] / 100;
        this.actors.push({ chara, shadow, x, z, fromX: x, fromZ: z, toX: x, toZ: z, t: 1, face: 0, phase: i * 1.7, walk: 0 });
      }
      this.burstAt = this.tapAt = -10;
    } else if (prev.tick !== st.tick) {
      this.actors.forEach((a, i) => {
        a.fromX = a.x; a.fromZ = a.z; a.toX = st.pos[i * 2] / 100; a.toZ = st.pos[i * 2 + 1] / 100; a.t = 0;
      });
    }
    // ほしが取られた：その場所から輪が広がる
    if (prev?.key === st.key && prev.star && st.stars > prev.stars) {
      this.burst.position.x = prev.star[0] / 100; this.burst.position.z = prev.star[1] / 100;
      this.burstAt = this.now;
    }
    if (st.star) { this.star.position.x = st.star[0] / 100; this.star.position.z = st.star[1] / 100; }
    this.star.visible = !!st.star;
    if (st.found && !(prev?.found && prev.key === st.key)) {
      this.foundAt = this.now;
      this.dropLabel();
      if (st.mark != null) { this.label = makeLabel(st.name, true, 0); this.scene.add(this.label); }
    }
    if (!st.found) this.dropLabel();
    this.canvas.style.cursor = st.canMove || st.canPick ? 'pointer' : 'default';
    this.st = st;
  }

  private onPointer = (e: PointerEvent) => {
    const st = this.st;
    if (!st || (!st.canMove && !st.canPick)) return;
    const r = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    if (st.canMove) {
      const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      if (!hit || Math.abs(hit.x) > BLEND_W / 2 + 0.6 || Math.abs(hit.z) > BLEND_D / 2 + 0.6) return;
      this.tap.position.x = hit.x; this.tap.position.z = hit.z;
      this.tapAt = this.now;
      this.on.onFloor(hit.x, hit.z);
      return;
    }
    // さがす人：タップした線にいちばん近い1体（体の真ん中あたり）を選ぶ
    let best = -1, bestD = 0.8;
    const c = new THREE.Vector3();
    this.actors.forEach((a, i) => {
      const dist = ray.ray.distanceToPoint(c.set(a.x, 0.75, a.z));
      if (dist < bestD) { bestD = dist; best = i; }
    });
    if (best >= 0) this.on.onPick(best);
  };

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 舞台の幅が収まる距離まで引く
    const halfW = BLEND_W / 2 + 1.5; // 手前のふちは広く見えるので、その分も入れる
    const hfov = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect);
    const dist = Math.max(13.5, halfW / Math.tan(hfov));
    this.camera.position.copy(new THREE.Vector3(0, 0.82, 0.57).normalize().multiplyScalar(dist)).add(new THREE.Vector3(0, 0, -0.1));
    this.camera.lookAt(0, 0, -0.1);
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const t = performance.now();
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.now += dt;
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private step(dt: number) {
    const st = this.st, now = this.now, still = this.reduced;
    if (!st) return;
    const since = now - this.foundAt;
    this.actors.forEach((a, i) => {
      // 届いた位置まで、次の位置が届くまでの時間をかけて、まっすぐ進む
      a.t = Math.min(1, a.t + dt / (BLEND_TICK_MS / 1000));
      a.x = a.fromX + (a.toX - a.fromX) * a.t; a.z = a.fromZ + (a.toZ - a.fromZ) * a.t;
      const dx = a.toX - a.fromX, dz = a.toZ - a.fromZ, moving = a.t < 1 && Math.hypot(dx, dz) > 0.01;
      a.walk += ((moving ? 1 : 0) - a.walk) * (1 - Math.exp(-dt * 10));
      if (moving) {
        // 進む方を向く（角度は、近い方へ回す）
        let turn = Math.atan2(dx, dz) - a.face;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        a.face += turn * (1 - Math.exp(-dt * 12));
      }
      const human = st.found && st.mark === i;
      let y = still ? 0 : Math.abs(Math.sin(now * 9 + a.phase)) * 0.16 * a.walk; // 歩いている間は、小さく跳ねる
      if (human && !still && since < 1.6) y = Math.abs(Math.sin(since * Math.PI * 2.5)) * 0.7;  // 見つかった：大きく跳ねる
      const squash = still ? 0 : Math.sin(now * 3 + a.phase) * 0.02;
      const root = a.chara.root;
      root.position.set(a.x, y, a.z);
      root.rotation.y = human ? 0 : a.face;
      root.scale.set(0.8 * (1 - squash), 0.8 * (1 + squash * 2), 0.8 * (1 - squash));
      a.chara.setFace(human && since < 1.6 ? 'shock' : 'normal');
      a.shadow.position.x = a.x; a.shadow.position.z = a.z;
      a.shadow.scale.setScalar(Math.max(0.5, 1 - y * 0.5) * 0.85);
    });

    const pulse = still ? 1 : 1 + Math.sin(now * 5) * 0.06;
    this.star.scale.set(pulse, 1, pulse);
    const b = now - this.burstAt;
    this.burst.visible = b < 0.7;
    if (this.burst.visible) { const k = 1 + b * 5; this.burst.scale.set(k, k, 1); (this.burst.material as THREE.MeshBasicMaterial).opacity = 1 - b / 0.7; }
    const tp = now - this.tapAt;
    this.tap.visible = tp < 0.5;
    if (this.tap.visible) { const k = 1 + tp * 2; this.tap.scale.set(k, k, 1); (this.tap.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - tp / 0.5); }

    const picked = st.pick != null ? this.actors[st.pick] : undefined;
    this.pickRing.visible = !!picked;
    if (picked) { this.pickRing.position.x = picked.x; this.pickRing.position.z = picked.z; }
    const marked = st.mark != null ? this.actors[st.mark] : undefined;
    this.arrow.visible = !!marked;
    if (marked) {
      const top = marked.chara.root.position.y + 1.95;
      this.arrow.position.set(marked.x, top + (st.found ? 0.65 : 0.25) + (still ? 0 : Math.sin(now * 6) * 0.07), marked.z);
      this.arrow.rotation.y = now * 2;
      if (this.label) this.label.position.set(marked.x, top + 0.15, marked.z - 0.2);
    }
  }

  private dropLabel() {
    if (!this.label) return;
    this.scene.remove(this.label);
    (this.label.material as THREE.SpriteMaterial).map?.dispose();
    this.label.material.dispose();
    this.label = null;
  }
  private clearActors() {
    for (const a of this.actors) { this.scene.remove(a.chara.root, a.shadow); a.chara.dispose(); }
    this.actors = [];
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    this.clearActors();
    this.dropLabel();
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose());
    });
    this.renderer.dispose();
  }
}
