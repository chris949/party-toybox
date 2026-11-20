// まぎれろ！の3Dの舞台（src/modes/blend/README.md の 15.6）。ルールは知らず、届いた位置を描くだけ。
// キャラクター・名前の札は、運命の二者択一のもの（src/modes/fate/three/）を使う
import * as THREE from 'three';
import { BLEND_AIM_MS, BLEND_D, BLEND_STAR_R, BLEND_TICK_MS, BLEND_W } from '../../../core/constants';
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
  mark: number | null;    // 矢印を出す番号（かくれている本人には自分、発表では全員に答え。さがす人の照準の下の1体は、舞台の中で決める）
  down: number[];         // 撃たれて倒れた番号
  shots: number;          // これまでに撃たれた数（増えたら、撃たれた演出を出す）
  lastShot: number | null; // 最後に撃たれた番号
  lastShooter: string | null; // 最後に撃った人（その人の銃から、光の線を出す）
  lastHit: boolean;       // 最後の1発が、当たりだった（爆発させる）
  found: boolean;         // 発表
  name: string;           // 発表で出す、かくれた人の名前
  canMove: boolean;       // 床をタップして動かせる（かくれている本人）
  canAim: boolean;        // 照準を動かして撃てる（弾の残っている、さがす人）
  guns: Gun[];            // さがす人の銃（舞台の手前に並べる）
}
// さがす人の銃：aim = 狙っている場所（100倍の整数）。out = 弾を使いきった。me = 自分の銃
export interface Gun { id: string; name: string; color: string; aim: [number, number] | null; out: boolean; me: boolean }
// onAim = 狙っている場所が変わった（on = false で、狙うのをやめた）。onShoot = 照準の下の1体を撃つ
export interface BlendHandlers { onFloor(x: number, z: number): void; onAim(x: number, z: number, on: boolean): void; onShoot(i: number): void }

const AIM_Y = 0.75;                                                      // 狙う高さ（体の真ん中あたり）
const AIM_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -AIM_Y);
interface GunObj { id: string; root: THREE.Group; body: THREE.MeshStandardMaterial; beam: THREE.Mesh; dot: THREE.Mesh; label: THREE.Sprite; x: number; z: number; on: boolean; color: string }

interface Actor { chara: Chara3D; shadow: THREE.Mesh; x: number; z: number; fromX: number; fromZ: number; toX: number; toZ: number; t: number; face: number; phase: number; walk: number; fall: number }

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
  private bang: THREE.Mesh;        // 撃たれた瞬間の輪
  private guns: GunObj[] = [];
  // 撃ったときの演出：太い光の線・銃口の光・火の玉・飛び散るかけら・画面の揺れ
  private flash: THREE.Mesh;
  private flashAt = -10;
  private muzzle: THREE.Mesh;
  private fire3: THREE.Mesh[] = [];
  private boomAt = -10;
  private boomPos = new THREE.Vector3();
  private bits: THREE.InstancedMesh;
  private bitSeed: { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number; s: number }[] = [];
  private shake = 0;               // 揺れの強さ（時間とともに、0へ戻る）
  private camBase = new THREE.Vector3();
  private dummy = new THREE.Object3D();
  private gunKey = '';
  private myAim: { x: number; z: number } | null = null; // 自分の狙い（届くのを待たずに、すぐ動かす）
  private hover = -1;              // 自分の照準の下の1体
  private aimDirty = false;        // 狙いが変わって、まだ送っていない
  private aimSent = -10;
  private dragging = false;        // 指で、押したまま狙っている
  private bangAt = -10;
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
    this.bang = flat(new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 32), new THREE.MeshBasicMaterial({ color: '#ff5252', transparent: true, depthWrite: false })), 0.05);
    // 撃ったときの演出の部品（光るものは、重ねるほど明るくなる描き方にする）
    const glow = (color: string) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.flash = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), glow('#ffffff'));
    this.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), glow('#fff2b0'));
    for (const c of ['#ffffff', '#ffc83d', '#ff6f3d']) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), glow(c)); m.visible = false; this.fire3.push(m); this.scene.add(m); }
    this.bits = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial(), 70);
    this.bits.frustumCulled = false; this.bits.count = 0;
    this.flash.visible = this.muzzle.visible = false;
    this.scene.add(this.flash, this.muzzle, this.bits);
    for (const o of [this.burst, this.bang, this.pickRing, this.tap, this.arrow]) o.visible = false;
    this.scene.add(this.star, this.burst, this.bang, this.pickRing, this.tap, this.arrow);

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('pointercancel', this.onLeave);
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
        this.actors.push({ chara, shadow, x, z, fromX: x, fromZ: z, toX: x, toZ: z, t: 1, face: 0, phase: i * 1.7, walk: 0, fall: st.down.includes(i) ? 1 : 0 });
      }
      this.burstAt = this.bangAt = this.tapAt = -10;
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
    // 撃たれた：その1体の場所から、赤い輪が広がる
    const shot = st.lastShot != null ? this.actors[st.lastShot] : undefined;
    if (prev?.key === st.key && st.shots > prev.shots && shot) {
      this.bang.position.x = shot.x; this.bang.position.z = shot.z;
      this.bangAt = this.now;
      this.shoot(st, shot);
    }
    if (st.star) { this.star.position.x = st.star[0] / 100; this.star.position.z = st.star[1] / 100; }
    this.star.visible = !!st.star;
    if (st.found && !(prev?.found && prev.key === st.key)) {
      this.foundAt = this.now;
      this.dropLabel();
      if (st.mark != null) { this.label = makeLabel(st.name, true, 0); this.scene.add(this.label); }
    }
    if (!st.found) this.dropLabel();
    this.canvas.style.cursor = st.canAim ? 'crosshair' : st.canMove ? 'pointer' : 'default';
    this.canvas.style.touchAction = st.canAim ? 'none' : 'manipulation'; // 狙っている間は、指で動かしても、ページを動かさない
    if (!st.canAim) { this.myAim = null; this.hover = -1; this.dragging = false; this.aimDirty = false; }
    this.syncGuns(st);
    this.st = st;
  }

  // 画面の位置から、舞台の中へ伸びる線を作る
  private rayAt(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    return ray.ray;
  }

  // さがす人：照準を動かす。照準の下の1体（線にいちばん近い1体。体の真ん中あたりを、広めに取る）を覚える
  private aimAt(e: PointerEvent) {
    const st = this.st!;
    const ray = this.rayAt(e);
    const hit = ray.intersectPlane(AIM_PLANE, new THREE.Vector3());
    if (!hit) return;
    this.myAim = { x: THREE.MathUtils.clamp(hit.x, -BLEND_W / 2 - 1, BLEND_W / 2 + 1), z: THREE.MathUtils.clamp(hit.z, -BLEND_D / 2 - 1, BLEND_D / 2 + 1) };
    this.aimDirty = true;
    let best = -1, bestD = 0.8;
    const c = new THREE.Vector3();
    this.actors.forEach((a, i) => {
      if (st.down.includes(i)) return; // 倒れた1体は、狙えない
      const dist = ray.distanceToPoint(c.set(a.x, AIM_Y, a.z));
      if (dist < bestD) { bestD = dist; best = i; }
    });
    this.hover = best;
  }
  // 撃つ：照準の下に誰もいなければ、撃たない（弾は減らない）
  private fire() { if (this.hover >= 0) this.on.onShoot(this.hover); }

  private onDown = (e: PointerEvent) => {
    const st = this.st;
    if (!st) return;
    if (st.canMove) {
      const hit = this.rayAt(e).intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      if (!hit || Math.abs(hit.x) > BLEND_W / 2 + 0.6 || Math.abs(hit.z) > BLEND_D / 2 + 0.6) return;
      this.tap.position.x = hit.x; this.tap.position.z = hit.z;
      this.tapAt = this.now;
      this.on.onFloor(hit.x, hit.z);
      return;
    }
    if (!st.canAim) return;
    this.aimAt(e);
    // マウスは、クリックで撃つ。指は、押したまま動かして狙い、離したときに撃つ（指では、押さずに動かせないため）
    if (e.pointerType === 'mouse') this.fire();
    else { this.dragging = true; try { this.canvas.setPointerCapture(e.pointerId); } catch { /* 取れなくても、そのまま続ける */ } }
  };
  private onMove = (e: PointerEvent) => {
    if (!this.st?.canAim || (e.pointerType !== 'mouse' && !this.dragging)) return;
    this.aimAt(e);
  };
  private onUp = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.st?.canAim) { this.aimAt(e); this.fire(); }
  };
  // マウスが舞台の外へ出た・指の操作が取り消された：狙うのをやめる（レーザーを消す）
  private onLeave = (e: PointerEvent) => {
    if (e.type === 'pointerleave' && e.pointerType !== 'mouse') return;
    this.dragging = false;
    if (!this.myAim) return;
    this.myAim = null; this.hover = -1; this.aimDirty = true;
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
    this.camBase.copy(this.camera.position);
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
      const down = st.down.includes(i);
      a.fall += ((down ? 1 : 0) - a.fall) * (still ? 1 : 1 - Math.exp(-dt * 9));
      if (down) a.walk = 0;
      let y = still ? 0 : Math.abs(Math.sin(now * 9 + a.phase)) * 0.16 * a.walk; // 歩いている間は、小さく跳ねる
      const blown = human && st.lastHit && !still && since < 1.5; // 撃たれて当たった：爆発で、高く吹き飛ぶ
      if (blown) y = Math.sin(Math.min(1, since / 1.5) * Math.PI) * 3.4;
      else if (human && !still && since < 1.6) y = Math.abs(Math.sin(since * Math.PI * 2.5)) * 0.7;  // 見つかった：大きく跳ねる
      const squash = still ? 0 : Math.sin(now * 3 + a.phase) * 0.02;
      const root = a.chara.root;
      root.position.set(a.x, y, a.z);
      root.rotation.y = blown ? since * 14 : human ? 0 : a.face;
      // 倒れる：画面の横へ、ころんと寝る（向いている方に関係なく、同じ向きに倒す）
      root.rotation.order = 'ZYX';
      root.rotation.z = a.fall * Math.PI / 2;
      if (a.fall > 0.01) root.position.y += a.fall * 0.45;
      root.scale.set(0.8 * (1 - squash), 0.8 * (1 + squash * 2), 0.8 * (1 - squash));
      a.chara.setFace((human && since < 1.6) || down ? 'shock' : 'normal');
      a.shadow.position.x = a.x; a.shadow.position.z = a.z;
      a.shadow.scale.setScalar(Math.max(0.5, 1 - y * 0.5) * 0.85);
    });

    const pulse = still ? 1 : 1 + Math.sin(now * 5) * 0.06;
    this.star.scale.set(pulse, 1, pulse);
    const b = now - this.burstAt;
    this.burst.visible = b < 0.7;
    if (this.burst.visible) { const k = 1 + b * 5; this.burst.scale.set(k, k, 1); (this.burst.material as THREE.MeshBasicMaterial).opacity = 1 - b / 0.7; }
    const bg = now - this.bangAt;
    this.bang.visible = bg < 0.5;
    if (this.bang.visible) { const k = 1 + bg * 4; this.bang.scale.set(k, k, 1); (this.bang.material as THREE.MeshBasicMaterial).opacity = 1 - bg / 0.5; }
    const tp = now - this.tapAt;
    this.tap.visible = tp < 0.5;
    if (this.tap.visible) { const k = 1 + tp * 2; this.tap.scale.set(k, k, 1); (this.tap.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - tp / 0.5); }

    this.stepGuns(dt);
    this.stepFx(dt);
    // 自分の照準の下の1体に、赤い輪と ▼（さがす人）
    const aimed = st.canAim && this.hover >= 0 && !st.down.includes(this.hover) ? this.hover : null;
    const picked = aimed != null ? this.actors[aimed] : undefined;
    this.pickRing.visible = !!picked;
    if (picked) { this.pickRing.position.x = picked.x; this.pickRing.position.z = picked.z; }
    const mark = st.mark ?? aimed;
    const marked = mark != null ? this.actors[mark] : undefined;
    this.arrow.visible = !!marked;
    if (marked) {
      const top = marked.chara.root.position.y + 1.95;
      this.arrow.position.set(marked.x, top + (st.found ? 0.65 : 0.25) + (still ? 0 : Math.sin(now * 6) * 0.07), marked.z);
      this.arrow.rotation.y = now * 2;
      if (this.label) this.label.position.set(marked.x, top + 0.15, marked.z - 0.2);
    }
  }

  // 撃った：銃から相手へ、太い光の線が走る。外れは、星のかけらが散る。当たりは、爆発して、画面が揺れる
  private shoot(st: BlendStageState, target: Actor) {
    const to = new THREE.Vector3(target.x, AIM_Y, target.z);
    const gun = this.guns.find(g => g.id === st.lastShooter);
    if (gun) {
      const from = gun.root.position.clone();
      this.flash.position.copy(from).lerp(to, 0.5);
      this.flash.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      this.flash.scale.set(0.12, from.distanceTo(to), 0.12);
      (this.flash.material as THREE.MeshBasicMaterial).color.set(gun.color).lerp(new THREE.Color('#ffffff'), 0.6);
      this.muzzle.position.copy(from);
      this.flashAt = this.now;
    }
    if (this.reduced) return; // 「動きを減らす」設定では、光の線だけにする
    const rnd = Math.random;
    const burst = (n: number, speed: number, colors: string[], life: number) => {
      const c = new THREE.Color();
      for (let k = 0; k < n && this.bitSeed.length < 70; k++) {
        const a = rnd() * Math.PI * 2, up = 0.3 + rnd() * 0.9, v = speed * (0.4 + rnd() * 0.8);
        this.bits.setColorAt(this.bitSeed.length, c.set(colors[k % colors.length]));
        this.bitSeed.push({ p: to.clone(), v: new THREE.Vector3(Math.cos(a) * v, up * v, Math.sin(a) * v), life: 0, max: life * (0.6 + rnd() * 0.6), s: 0.6 + rnd() * 1.2 });
      }
      if (this.bits.instanceColor) this.bits.instanceColor.needsUpdate = true;
    };
    if (st.lastHit) {
      this.boomAt = this.now; this.boomPos.copy(to);
      this.shake = 1;
      burst(56, 9, ['#ffffff', '#ffc83d', '#ff9f43', '#ff6f6f'], 1.3);
    } else {
      this.shake = 0.25;
      burst(14, 4, ['#ffffff', '#ffe9a8', '#cfe7f6'], 0.6);
    }
  }
  // 撃ったときの演出を、1コマぶん進める
  private stepFx(dt: number) {
    const now = this.now;
    const f = now - this.flashAt;
    this.flash.visible = this.muzzle.visible = f < 0.22;
    if (this.flash.visible) {
      const k = 1 - f / 0.22;
      (this.flash.material as THREE.MeshBasicMaterial).opacity = k;
      this.flash.scale.x = this.flash.scale.z = 0.04 + 0.14 * k;
      (this.muzzle.material as THREE.MeshBasicMaterial).opacity = k;
      this.muzzle.scale.setScalar(0.6 + (1 - k) * 1.2);
    }
    // 爆発：白 → 黄 → だいだいの火の玉が、ずれて広がって消える
    const b = now - this.boomAt;
    this.fire3.forEach((m, i) => {
      const t = (b - i * 0.06) / (0.5 + i * 0.18);
      m.visible = t >= 0 && t < 1;
      if (!m.visible) return;
      m.position.copy(this.boomPos);
      m.scale.setScalar((0.4 + i * 0.5) + t * (2.2 + i * 1.3));
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - t) * (1 - t);
    });
    // 飛び散るかけら：重さで落ちて、床で止まり、小さくなって消える
    this.bitSeed = this.bitSeed.filter(p => (p.life += dt) < p.max);
    this.bitSeed.forEach((p, i) => {
      p.v.y -= 16 * dt;
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.08) { p.p.y = 0.08; p.v.multiplyScalar(0.4); p.v.y = Math.abs(p.v.y); }
      this.dummy.position.copy(p.p);
      this.dummy.rotation.set(p.life * 9 * p.s, p.life * 7, 0);
      this.dummy.scale.setScalar(p.s * (1 - p.life / p.max));
      this.dummy.updateMatrix();
      this.bits.setMatrixAt(i, this.dummy.matrix);
    });
    this.bits.count = this.bitSeed.length;
    this.bits.instanceMatrix.needsUpdate = true;
    // 画面の揺れ
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 0.45;
    this.camera.position.set(this.camBase.x + Math.sin(now * 71) * s, this.camBase.y + Math.sin(now * 93 + 1) * s, this.camBase.z);
  }

  // さがす人の銃を、舞台の手前のふちに並べる。顔ぶれが変わったときだけ、作り直す
  private syncGuns(st: BlendStageState) {
    const key = st.key + '|' + st.guns.map(g => g.id + g.name).join(',');
    if (key !== this.gunKey) {
      this.clearGuns();
      this.gunKey = key;
      const n = st.guns.length;
      st.guns.forEach((g, i) => {
        const root = new THREE.Group();
        const body = new THREE.MeshStandardMaterial({ color: g.color, roughness: 0.5 });
        const dark = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.4 });
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.26), body);
        grip.position.set(0, -0.2, -0.22); grip.rotation.x = -0.25;
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.8), body);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 12), dark);
        barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.6;
        root.add(grip, frame, barrel);
        // 手前のふちに、等しい間をあけて並べる（+z が手前）
        root.position.set(n === 1 ? 0 : (i / (n - 1) - 0.5) * (BLEND_W - 2), 0.55, BLEND_D / 2 + 0.75);
        const lineMat = new THREE.MeshBasicMaterial({ color: g.color, transparent: true, opacity: 0.8, depthWrite: false });
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), lineMat);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshBasicMaterial({ color: g.color }));
        beam.visible = dot.visible = false;
        const label = makeLabel(g.name, g.me, 0);
        label.scale.multiplyScalar(0.62);
        label.position.set(root.position.x, 1.25, root.position.z);
        this.scene.add(root, beam, dot, label);
        this.guns.push({ id: g.id, root, body, beam, dot, label, x: root.position.x, z: 0, on: false, color: g.color });
      });
    }
  }
  private stepGuns(dt: number) {
    const st = this.st!;
    // 自分の狙いを、決まった間隔で送る（動かすたびには送らない）
    if (this.aimDirty && this.now - this.aimSent >= BLEND_AIM_MS / 1000) {
      this.aimDirty = false; this.aimSent = this.now;
      this.on.onAim(this.myAim?.x ?? 0, this.myAim?.z ?? 0, !!this.myAim);
    }
    const thin = this.canvas.clientWidth < 520 ? 0.018 : 0.028; // 小さい画面では、線を細くする
    const from = new THREE.Vector3(), to = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.guns.forEach((o, i) => {
      const g = st.guns[i];
      if (!g) return;
      // 自分の銃は、自分の画面の狙いをそのまま使う。ほかの人の銃は、届いた場所へ、なめらかに寄せる
      const t = g.me && st.canAim ? this.myAim : g.aim ? { x: g.aim[0] / 100, z: g.aim[1] / 100 } : null;
      const show = !!t && !g.out && !st.found;
      if (t) {
        if (!o.on) { o.x = t.x; o.z = t.z; }
        const k = g.me ? 1 : 1 - Math.exp(-dt * 12);
        o.x += (t.x - o.x) * k; o.z += (t.z - o.z) * k;
      }
      o.on = show;
      o.body.color.set(g.out ? '#b8c4d0' : o.color); // 弾を使いきった銃は、灰色
      to.set(o.x, AIM_Y, o.z);
      if (show) o.root.lookAt(to); else o.root.rotation.set(-0.5, Math.PI, 0); // 狙っていない銃は、奥を向いて、少し上を向く
      o.beam.visible = o.dot.visible = show;
      if (!show) return;
      from.copy(o.root.position).addScaledVector(to.clone().sub(o.root.position).normalize(), 0.85);
      const len = from.distanceTo(to);
      o.beam.position.copy(from).lerp(to, 0.5);
      o.beam.quaternion.setFromUnitVectors(up, to.clone().sub(from).normalize());
      o.beam.scale.set(thin, len, thin);
      o.dot.position.copy(to);
      o.dot.scale.setScalar(this.reduced ? 1 : 1 + Math.sin(this.now * 10 + i) * 0.18);
    });
  }
  private clearGuns() {
    for (const o of this.guns) {
      this.scene.remove(o.root, o.beam, o.dot, o.label);
      o.root.traverse(m => { const x = m as THREE.Mesh; if (x.isMesh) x.geometry.dispose(); });
      o.body.dispose();
      for (const m of [o.beam, o.dot]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
      (o.label.material as THREE.SpriteMaterial).map?.dispose();
      o.label.material.dispose();
    }
    this.guns = [];
    this.gunKey = '';
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
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.canvas.removeEventListener('pointercancel', this.onLeave);
    this.clearGuns();
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
