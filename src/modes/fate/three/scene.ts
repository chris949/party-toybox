// 運命の二者択一の3Dの舞台（src/modes/fate/README.md の11.12）。ルールは知らず、渡された状態を描くだけ。
// 寸法と立ち位置は layout.ts、床とお立ち台は floors.ts、名前の札は label.ts、キャラクターは chara3d.ts
import * as THREE from 'three';
import type { Pos, Side } from '../rules';
import type { StagePiece, StagePos, StageState } from '../stage';
import { makeChara3D, type Chara3D } from './chara3d';
import { buildFloor, buildPodium, type Floor } from './floors';
import { makeLabel } from './label';
import { BLOCK_H, FLOOR_D, FLOOR_W, FLOOR_X, FLOOR_Z, HANG, OPEN, PODIUM_H, COLORS, slot } from './layout';

interface Actor {
  animal: Chara3D; label: THREE.Sprite; arrow: THREE.Mesh | null; shadow: THREE.Mesh; data: StagePiece;
  x: number; z: number; fromX: number; fromZ: number; toX: number; toZ: number; moveT: number; // 移動（0→1）
  fateSince: number; pop: number; phase: number; baseY: number;
}

// 足元の丸い影（全員で同じ形と材質を使う）
const BLOB = new THREE.CircleGeometry(0.5, 20);
const BLOB_MAT = new THREE.MeshBasicMaterial({ color: '#1f2d3d', transparent: true, opacity: 0.2, depthWrite: false });

const ease = (t: number) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

export class FateScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1.25, 0.1, 100);
  private floors = {} as Record<Pos, Floor>;
  private actors = new Map<string, Actor>();
  private last = performance.now();
  private raf = 0;
  private now = 0;
  private shakeAt = -10;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private camBase = new THREE.Vector3();
  private ro: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement, private onMove: (side: Side) => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    // 影は、光から計算せず、足元に丸い影を置く（影の計算は、全部の部品をもう一度描くので重い）
    // 開発中は、描画の回数や三角形の数を開発者ツールから見られるようにする（window.__THREE_GAME_DIAGNOSTICS__.renderer.render）
    if (new URLSearchParams(location.search).has('dev')) (window as unknown as Record<string, unknown>).__THREE_GAME_DIAGNOSTICS__ = { renderer: this.renderer.info };

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#bcd9ee', 1.5));
    const sun = new THREE.DirectionalLight('#fff6e6', 2.1);
    sun.position.set(-5, 12, 7);
    this.scene.add(sun);

    (['L', 'R', 'C'] as Pos[]).forEach(p => { this.floors[p] = buildFloor(this.scene, p); });
    buildPodium(this.scene);
    canvas.addEventListener('pointerdown', this.onPointer);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.loop();
  }

  // 新しい状態を受け取る（位置・発表・ゴーストなどの変わり目を覚えて、動きを始める）
  update(st: StageState) {
    const seen = new Set<string>();
    const counts: Record<StagePos, number> = { L: 0, R: 0, C: 0, P: 0 };
    for (const p of st.pieces) counts[p.pos]++;
    const index: Record<StagePos, number> = { L: 0, R: 0, C: 0, P: 0 };
    for (const p of st.pieces) {
      seen.add(p.id);
      const [tx, tz] = slot(p.pos, index[p.pos]++, counts[p.pos]);
      let a = this.actors.get(p.id);
      const text = `${p.author ? '出題 ' : ''}${p.name}`, hearts = p.ghost ? 0 : p.lives;
      const relabel = !!a && (a.data.name !== p.name || a.data.author !== p.author || a.data.me !== p.me || a.data.lives !== p.lives || a.data.ghost !== p.ghost);
      if (a && (a.data.chara !== p.chara || a.data.color !== p.color || a.data.variant !== p.variant)) { this.removeActor(a); this.actors.delete(p.id); a = undefined; }
      if (!a) {
        const animal = makeChara3D(p.chara, p.color, p.variant);
        animal.root.scale.setScalar(0.92);
        this.scene.add(animal.root);
        let arrow: THREE.Mesh | null = null;
        if (p.me) {
          arrow = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.3, 4), new THREE.MeshBasicMaterial({ color: '#ff6f6f', depthTest: false }));
          arrow.rotation.x = Math.PI; arrow.renderOrder = 11;
          this.scene.add(arrow);
        }
        const shadow = new THREE.Mesh(BLOB, BLOB_MAT);
        shadow.rotation.x = -Math.PI / 2;
        this.scene.add(shadow);
        a = { animal, shadow, label: makeLabel(text, p.me, hearts), arrow, data: p, x: tx, z: tz, fromX: tx, fromZ: tz, toX: tx, toZ: tz, moveT: 1, fateSince: 0, pop: 1, phase: Math.random() * 6, baseY: p.pos === 'P' ? PODIUM_H : 0 };
        this.scene.add(a.label);
        this.actors.set(p.id, a);
        a.animal.setGhost(p.ghost);
      } else if (relabel) {
        this.disposeLabel(a.label);
        a.label = makeLabel(text, p.me, hearts);
        this.scene.add(a.label);
      }
      if (a.toX !== tx || a.toZ !== tz) { a.fromX = a.x; a.fromZ = a.z; a.toX = tx; a.toZ = tz; a.moveT = 0; }
      if (p.fate !== a.data.fate) {
        a.fateSince = this.now;
        if (p.fate === 'fall' && !this.reduced) this.shakeAt = this.now + HANG;
        // 落ちたあと、ゴーストとして戻ってくるとき：スタート台に、ぽんと現れる
        if (a.data.fate === 'fall') { a.x = a.fromX = tx; a.z = a.fromZ = tz; a.moveT = 1; a.pop = 0; }
      }
      if (p.ghost !== a.data.ghost) a.animal.setGhost(p.ghost);
      a.data = p;
    }
    for (const [id, a] of this.actors) if (!seen.has(id)) { this.removeActor(a); this.actors.delete(id); }

    (['L', 'R', 'C'] as Pos[]).forEach(p => {
      const f = this.floors[p];
      if (f.state !== st.floors[p]) { f.state = st.floors[p]; f.since = this.now; }
      f.rim.color.set(st.mySide === p && p !== 'C' ? COLORS.ink : COLORS.rim);
    });
  }

  private onPointer = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (!hit || hit.z > FLOOR_Z + FLOOR_D / 2 + 0.3 || Math.abs(hit.x) < FLOOR_X - FLOOR_W / 2) return; // 床の上をタップしたときだけ
    this.onMove(hit.x < 0 ? 'L' : 'R');
  };

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 舞台の幅が収まる距離まで引く（縦長の画面ほど遠くなる）
    const halfW = FLOOR_X + FLOOR_W / 2 + 1.1;
    const hfov = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect);
    const dist = Math.max(17.5, halfW / Math.tan(hfov));
    const dir = new THREE.Vector3(0, 0.8, 0.6).normalize();
    this.camBase.copy(dir).multiplyScalar(dist).add(new THREE.Vector3(0, 0, 1.6));
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(0, 0, 1.6);
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const t = performance.now();
    const dt = Math.min(0.05, (t - this.last) / 1000); // タブが裏に回っていたあとでも、動きが飛ばないようにする
    this.last = t;
    this.now += dt;
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private isOpen(f: Floor) {
    const t = this.now - f.since;
    return f.state === 'open' || (f.state === 'blink' && t < 1.1);
  }

  private step(dt: number) {
    const now = this.now, still = this.reduced;
    // 扉：開くときは勢いよく、閉じるときはゆっくり
    for (const f of Object.values(this.floors)) {
      const target = this.isOpen(f) ? OPEN : 0;
      f.angle += (target - f.angle) * (1 - Math.exp(-dt * (target > f.angle ? 16 : 7)));
      for (const d of f.doors) {
        const { sign, alongX } = d.userData as { sign: number; alongX: boolean };
        if (alongX) d.rotation.z = sign * f.angle; else d.rotation.x = -sign * f.angle;
      }
      const glow = f.state === 'ok' ? 0.35 + (still ? 0 : Math.sin((now - f.since) * 7) * 0.25) : 0;
      f.mat.emissiveIntensity += (glow - f.mat.emissiveIntensity) * (1 - Math.exp(-dt * 10));
      f.mat.color.lerp(f.state === 'ok' ? new THREE.Color(COLORS.ok) : f.base, 1 - Math.exp(-dt * 8));
    }

    for (const a of this.actors.values()) {
      const p = a.data, root = a.animal.root, t = now - a.fateSince;
      // 移動：跳ねながら、行き先の方を少し向く
      let hop = 0, turn = 0;
      if (a.moveT < 1) {
        a.moveT = Math.min(1, a.moveT + dt / 0.4);
        const e = ease(a.moveT);
        a.x = a.fromX + (a.toX - a.fromX) * e; a.z = a.fromZ + (a.toZ - a.fromZ) * e;
        if (!still && !p.ghost) hop = Math.abs(Math.sin(a.moveT * Math.PI * 2)) * 0.45;
        turn = Math.max(-1, Math.min(1, (a.toX - a.fromX) / 2)) * Math.sin(a.moveT * Math.PI) * 0.9;
      }
      a.pop = Math.min(1, a.pop + dt / 0.3);
      let y = hop, scale = 0.92 * (0.3 + 0.7 * ease(a.pop)), rz = 0, rx = 0, eye = 1, visible = true;
      const squash = still ? 0 : Math.sin(now * 3 + a.phase) * 0.025; // 立っている間は、ゆっくり弾む
      const floor = p.pos === 'P' ? null : this.floors[p.pos];
      const floorOpen = !!floor && this.isOpen(floor);
      a.baseY += ((p.pos === 'P' ? PODIUM_H : 0) - a.baseY) * (1 - Math.exp(-dt * 9)); // お立ち台の上は少し高い

      if (p.fate === 'fall') {
        eye = 1.7;
        if (still) { scale *= Math.max(0, 1 - t / 0.6); visible = t < 0.6; }
        else if (t < HANG) { y = 0.35 * Math.min(1, t / 0.12); rz = Math.sin(t * 40) * 0.3; }   // 空中でじたばた
        else {
          const tt = t - HANG;
          y = 0.35 - 6.5 * tt * tt; rx = tt * 9; rz = tt * 5; scale *= Math.max(0.25, 1 - tt * 1.1);
          visible = y > -BLOCK_H + 0.6; // 穴の底に着く前に消す
        }
      } else if (p.fate === 'shock') {
        // 床は開いたが助かった（救済・作った人）：じたばたしたあと、床が閉じるまで浮いている
        eye = t < 1.6 ? 1.7 : 1;
        if (!still && t < HANG) rz = Math.sin(t * 40) * 0.3;
        if (floorOpen || (floor?.angle ?? 0) > 0.15) y = 0.4 + (still ? 0 : Math.sin(now * 5) * 0.06);
      } else if (p.fate === 'safe' && !p.ghost) {
        if (!still && t > 0.3 && t < 1.3) y = Math.abs(Math.sin((t - 0.3) * Math.PI * 2)) * 0.55;       // ぴょんぴょん
      }
      if (p.ghost) y = 0.45 + (still ? 0 : Math.sin(now * 2.2 + a.phase) * 0.12);

      y += a.baseY;
      root.visible = visible;
      root.position.set(a.x, y, a.z);
      root.rotation.set(rx, turn, rz);
      root.scale.set(scale * (1 - squash), scale * (1 + squash * 2), scale * (1 - squash));
      a.animal.setFace(eye > 1 ? 'shock' : 'normal');
      // 丸い影：高く跳ぶほど小さく。床が開いている間・落ちたあと・ゴーストには出さない
      const lift = Math.max(0, y - a.baseY);
      a.shadow.visible = visible && !p.ghost && !floorOpen && p.fate !== 'fall';
      a.shadow.position.set(a.x, a.baseY + 0.03, a.z);
      a.shadow.scale.setScalar(Math.max(0.4, 1 - lift * 0.5) * scale / 0.92);
      a.label.visible = visible && !(p.fate === 'fall' && t > HANG); // 落ち始めたら、名前の札は消す
      a.label.position.set(a.x, Math.max(0, y) + 2.25, a.z - 0.25); // 顔に重ならないよう、頭の少し奥に出す
      (a.label.material as THREE.SpriteMaterial).opacity = p.ghost ? 0.6 : 1;
      if (a.arrow) {
        a.arrow.visible = a.label.visible;
        a.arrow.position.set(a.x, Math.max(0, y) + 2.8 + (still ? 0 : Math.sin(now * 6) * 0.07), a.z);
        a.arrow.rotation.y = now * 2;
      }
    }

    // 落ちた瞬間に、画面を少し揺らす
    const s = now - this.shakeAt;
    this.camera.position.copy(this.camBase);
    if (s > 0 && s < 0.5) {
      const k = (1 - s / 0.5) * 0.22;
      this.camera.position.x += Math.sin(s * 70) * k; this.camera.position.y += Math.cos(s * 55) * k;
    }
  }

  private disposeLabel(sp: THREE.Sprite) {
    this.scene.remove(sp);
    (sp.material as THREE.SpriteMaterial).map?.dispose();
    sp.material.dispose();
  }
  private removeActor(a: Actor) {
    this.scene.remove(a.animal.root, a.shadow);
    a.animal.dispose();
    this.disposeLabel(a.label);
    if (a.arrow) { this.scene.remove(a.arrow); a.arrow.geometry.dispose(); (a.arrow.material as THREE.Material).dispose(); }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    for (const a of this.actors.values()) this.removeActor(a);
    this.actors.clear();
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose());
    });
    this.renderer.dispose();
  }
}
