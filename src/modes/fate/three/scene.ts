// 運命の二者択一の3Dの舞台（docs/spec.md の11.12）。ルールは知らず、渡された状態を描くだけ
import * as THREE from 'three';
import type { Pos, Side } from '../rules';
import { makeAnimal, type Animal } from './animals';

export type FloorState = '' | 'ok' | 'open' | 'blink'; // ふつう／正解で光る／開く／開いてすぐ閉じる（救済）
export type StagePos = Pos | 'P'; // P = お立ち台（その問題を作った人）
export interface Piece3D {
  id: string; name: string; chara: number; color: string; pos: StagePos;
  lives: number;   // 残りのライフ（名前の札に ♥ で出す）
  variant: number; // 同じキャラクターを選んだ人のうち何人目か（0 = 1人目。2人目からは色合いを変える）
  me: boolean; ghost: boolean; author: boolean;
  fate: 'fall' | 'shock' | 'safe' | null; // 発表のとき：落ちる／床は開いたが助かった／正解
}
export interface StageState { pieces: Piece3D[]; floors: Record<Pos, FloorState>; mySide: Pos }

// 舞台の寸法（メートルのつもり）。左右の床と、手前のスタート台
const FLOOR_W = 4.6, FLOOR_D = 4.2, FLOOR_X = 3.3, FLOOR_Z = -0.9; // 左右の床のあいだに、お立ち台を置く
const PODIUM_W = 1.5, PODIUM_D = 3.6, PODIUM_H = 0.75;
const PAD_W = 7.6, PAD_D = 2.7, PAD_Z = 3.75;
const BLOCK_H = 2.6;  // 台の厚み（開いた扉が下に突き抜けない深さ）
const OPEN = 1.4;     // 扉が開く角度
const HANG = 0.55;    // 床が開いてから落ちるまで、空中でじたばたする時間（秒）
const COLORS = { L: '#bfe3fb', R: '#ffe39a', C: '#e3ebf2', ok: '#aeeccf', ink: '#1f2d3d', rim: '#9fc3dc', pit: '#0a1018' };
const SIDE: Record<Pos, { x: number; z: number; w: number; d: number }> = {
  L: { x: -FLOOR_X, z: FLOOR_Z, w: FLOOR_W, d: FLOOR_D },
  R: { x: FLOOR_X, z: FLOOR_Z, w: FLOOR_W, d: FLOOR_D },
  C: { x: 0, z: PAD_Z, w: PAD_W, d: PAD_D },
};

// 立ち位置。床は1列3人（10人以上集まったら4人）、スタート台は1列5人
function slot(pos: StagePos, i: number, count: number): [number, number] {
  if (pos === 'P') return [0, FLOOR_Z + (i - (count - 1) / 2) * Math.min(1.15, (PODIUM_D - 0.9) / Math.max(1, count - 1))];
  const s = SIDE[pos];
  if (pos === 'C') return [s.x + (i % 5 - 2) * 1.4, s.z - 0.55 + Math.floor(i / 5) * 1.15];
  const cols = count > 9 ? 4 : 3, gap = cols === 4 ? 1.08 : 1.4;
  return [s.x + (i % cols - (cols - 1) / 2) * gap, s.z - 1.35 + Math.floor(i / cols) * 1.3];
}

interface Floor { state: FloorState; since: number; angle: number; doors: [THREE.Group, THREE.Group]; mat: THREE.MeshStandardMaterial; rim: THREE.MeshStandardMaterial; base: THREE.Color }
interface Actor {
  animal: Animal; label: THREE.Sprite; arrow: THREE.Mesh | null; data: Piece3D;
  x: number; z: number; fromX: number; fromZ: number; toX: number; toZ: number; moveT: number; // 移動（0→1）
  fateSince: number; pop: number; phase: number; baseY: number;
}

const ease = (t: number) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

// 名前の札（自分は黄色、作った人には「出題」を付ける）。下に、残りのライフを ♥ で出す
function makeLabel(text: string, me: boolean, lives: number): THREE.Sprite {
  const c = document.createElement('canvas'), g = c.getContext('2d')!;
  const font = '800 44px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
  g.font = font;
  let shown = text;
  while (g.measureText(shown).width > 300 && shown.length > 2) shown = shown.slice(0, -2) + '…';
  const w = Math.ceil(g.measureText(shown).width) + 44, pill = 68, h = pill + (lives > 0 ? 40 : 0);
  c.width = w; c.height = h;
  g.font = font;
  g.fillStyle = me ? '#ffc83d' : 'rgba(255,255,255,.92)';
  g.strokeStyle = COLORS.ink; g.lineWidth = me ? 6 : 0;
  g.beginPath(); g.roundRect(4, 4, w - 8, pill - 8, 26); g.fill();
  if (me) g.stroke();
  g.fillStyle = COLORS.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(shown, w / 2, pill / 2 + 3);
  if (lives > 0) {
    g.font = '900 34px sans-serif';
    g.lineWidth = 7; g.strokeStyle = '#ffffff'; g.lineJoin = 'round';
    g.strokeText('♥'.repeat(lives), w / 2, pill + 18);
    g.fillStyle = '#ff6f6f';
    g.fillText('♥'.repeat(lives), w / 2, pill + 18);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(w / pill * 0.4, h / pill * 0.4, 1);
  sp.center.set(0.5, 1 - pill / 2 / h); // 名前の行の真ん中を基準にする（ライフの行は、その下にぶら下がる）
  sp.renderOrder = 10;
  return sp;
}

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
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#bcd9ee', 1.5));
    const sun = new THREE.DirectionalLight('#fff6e6', 2.1);
    sun.position.set(-5, 12, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
    this.scene.add(sun);

    (['L', 'R', 'C'] as Pos[]).forEach(p => { this.floors[p] = this.buildFloor(p); });
    this.buildPodium();
    canvas.addEventListener('pointerdown', this.onPointer);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.loop();
  }

  // お立ち台：その問題を作った人が立つ（左右の床のあいだ。少し高い）
  private buildPodium() {
    const g = new THREE.Group();
    g.position.set(0, 0, FLOOR_Z);
    const gold = new THREE.MeshStandardMaterial({ color: '#ffc83d', roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(PODIUM_W, BLOCK_H + PODIUM_H, PODIUM_D), gold);
    body.position.y = (PODIUM_H - BLOCK_H) / 2 - 0.02;
    body.castShadow = true; body.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.BoxGeometry(PODIUM_W - 0.3, 0.04, PODIUM_D - 0.3), new THREE.MeshStandardMaterial({ color: '#e8483f', roughness: 0.8 }));
    top.position.y = PODIUM_H;
    top.receiveShadow = true;
    g.add(body, top);
    this.scene.add(g);
  }

  // 厚みのある台。上は2枚の扉、中は暗い穴
  private buildFloor(pos: Pos): Floor {
    const s = SIDE[pos], g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    this.scene.add(g);
    const base = new THREE.Color(COLORS[pos]);
    const side = new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.78), roughness: 0.8 });
    const none = new THREE.MeshBasicMaterial({ visible: false });
    // 外側（上の面は扉に任せるので描かない）と、内側（暗い穴）
    const shell = new THREE.Mesh(new THREE.BoxGeometry(s.w, BLOCK_H, s.d), [side, side, none, side, side, side]);
    shell.position.y = -BLOCK_H / 2 - 0.02;
    shell.receiveShadow = true;
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
      panel.receiveShadow = true;
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
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    });
    return { state: '', since: 0, angle: 0, doors, mat, rim, base };
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
        const animal = makeAnimal(p.chara, p.color, p.variant);
        animal.root.scale.setScalar(0.92);
        this.scene.add(animal.root);
        let arrow: THREE.Mesh | null = null;
        if (p.me) {
          arrow = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.3, 4), new THREE.MeshBasicMaterial({ color: '#ff6f6f', depthTest: false }));
          arrow.rotation.x = Math.PI; arrow.renderOrder = 11;
          this.scene.add(arrow);
        }
        a = { animal, label: makeLabel(text, p.me, hearts), arrow, data: p, x: tx, z: tz, fromX: tx, fromZ: tz, toX: tx, toZ: tz, moveT: 1, fateSince: 0, pop: 1, phase: Math.random() * 6, baseY: p.pos === 'P' ? PODIUM_H : 0 };
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
      for (const e of a.animal.eyes) e.scale.setScalar(eye);
      a.animal.ring.visible = !p.ghost || visible;
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
    this.scene.remove(a.animal.root);
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
