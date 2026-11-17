// PC 幅のタイトル・ホームの後ろに出す、3Dの背景（docs/spec.md の 3.0a）。「おもちゃ箱の部屋」。
// 絵や模型のファイルは使わず、形・模様・光をすべてコードで作る。ゲームのルールや状態は知らない
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeChara3D, CHARA_3D_COUNT, type Chara3D } from '../../modes/fate/three/chara3d';

export type Quality = 'high' | 'mid' | 'low';
const TIER = ['#ff6f6f', '#ff9f43', '#ffc83d', '#bde05a', '#36c99a', '#4ac3d6', '#4aa6f0'];
const INK = '#1f2d3d';

// 画質ごとの設定：画素の細かさ・影・光のにじみ・歩くキャラクターの数・紙ふぶきの数
const TIERS: Record<Quality, { dpr: number; shadow: number; bloom: boolean; walkers: number; confetti: number }> = {
  high: { dpr: 2, shadow: 2048, bloom: true, walkers: 7, confetti: 220 },
  mid: { dpr: 1.5, shadow: 1024, bloom: false, walkers: 5, confetti: 120 },
  low: { dpr: 1, shadow: 0, bloom: false, walkers: 3, confetti: 0 },
};

// 種から同じ並びを返す乱数（毎回、同じ部屋になるように）
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const mat = (color: string, rough = 0.55) => new THREE.MeshStandardMaterial({ color, roughness: rough });

interface Walker { chara: Chara3D; r: number; a: number; speed: number; phase: number }
interface Bob { o: THREE.Object3D; y: number; amp: number; speed: number; spin: number; phase: number }

export class BackdropScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1.6, 0.1, 200);
  private composer: EffectComposer | null = null;
  private walkers: Walker[] = [];
  private bobs: Bob[] = [];
  private confetti: THREE.InstancedMesh | null = null;
  private confettiSeed: { x: number; z: number; y: number; v: number; rx: number; rz: number; s: number }[] = [];
  private spark: THREE.Mesh | null = null;
  private sun: THREE.DirectionalLight;
  private raf = 0;
  private last = performance.now();
  private now = 0;
  private slow = 0;
  private frames = 0;
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private ro: ResizeObserver;
  private dummy = new THREE.Object3D();
  private disposed = false;

  // onFirstFrame = 最初の1枚を描き終えた（読み込み画面を消す合図）／onSlow = 重いので、画質を1段下げてほしい
  constructor(private canvas: HTMLCanvasElement, quality: Quality, private on: { onFirstFrame(): void; onSlow(): void }) {
    const q = TIERS[quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !q.bloom, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, q.dpr));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = q.shadow > 0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 空：上が水色、下が白っぽい。遠くは、空の色に溶ける
    this.scene.background = canvasTex(8, 256, g => {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#8fd0f7'); grad.addColorStop(0.55, '#d6efff'); grad.addColorStop(1, '#fff6e0');
      g.fillStyle = grad; g.fillRect(0, 0, 8, 256);
    });
    this.scene.fog = new THREE.Fog('#e4f4ff', 26, 70);

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#ffd9b8', 1.25));
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.6);
    this.sun.position.set(-9, 16, 8);
    if (q.shadow) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(q.shadow, q.shadow);
      const c = this.sun.shadow.camera;
      c.left = -16; c.right = 16; c.top = 16; c.bottom = -16; c.near = 1; c.far = 50;
      this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.03;
    }
    this.scene.add(this.sun);

    this.buildRoom(q);
    this.buildToys();
    this.buildWalkers(q.walkers);
    this.buildSky();
    if (q.confetti) this.buildConfetti(q.confetti);
    if (q.shadow) this.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.flat) { m.castShadow = true; m.receiveShadow = true; } });

    if (q.bloom) {
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.16, 0.7, 0.92));
      this.composer.addPass(new OutputPass());
    }

    window.addEventListener('pointermove', this.onPointer);
    document.addEventListener('visibilitychange', this.onVisible);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.loop();
  }

  // 床：丸い台（水玉もよう）と、まわりの積み木のふち
  private buildRoom(q: { shadow: number }) {
    const top = canvasTex(1024, 1024, g => {
      g.fillStyle = '#fff3d6'; g.fillRect(0, 0, 1024, 1024);
      g.fillStyle = '#ffe3ac';
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.beginPath(); g.arc(32 + x * 64 + (y % 2) * 32, 32 + y * 64, 11, 0, Math.PI * 2); g.fill(); }
      // 真ん中の輪（すごろくの盤のような、色の帯）
      g.lineWidth = 34;
      TIER.forEach((c, i) => { g.strokeStyle = c; g.beginPath(); g.arc(512, 512, 250, i / TIER.length * Math.PI * 2, (i + 0.92) / TIER.length * Math.PI * 2); g.stroke(); });
    });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 1, 72), [mat('#f6c98b'), new THREE.MeshStandardMaterial({ map: top, roughness: 0.75 }), mat('#f6c98b')]);
    floor.position.y = -0.5;
    floor.userData.floor = true;
    this.scene.add(floor);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(13.6, 12.4, 1.4, 72), mat('#ff9f43'));
    base.position.y = -1.6;
    this.scene.add(base);
    if (!q.shadow) {
      // 影を描かない画質では、台の下にだけ、うすい影の円を置く
      const blob = new THREE.Mesh(new THREE.CircleGeometry(15, 48), new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.08, depthWrite: false }));
      blob.rotation.x = -Math.PI / 2; blob.position.y = -2.3; blob.userData.flat = true;
      this.scene.add(blob);
    }
    // ふちの積み木
    const rnd = seeded(7);
    const box = new RoundedBoxGeometry(1, 1, 1, 3, 0.12);
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2 + rnd() * 0.08, s = 0.7 + rnd() * 0.5;
      const m = new THREE.Mesh(box, mat(TIER[i % TIER.length]));
      m.scale.set(s, s * (0.8 + rnd() * 0.6), s);
      m.position.set(Math.cos(a) * 11.9, m.scale.y / 2, Math.sin(a) * 11.9);
      m.rotation.y = -a + (rnd() - 0.5) * 0.5;
      this.scene.add(m);
    }
  }

  // おもちゃ：それぞれのゲームの印を、台の上に並べる
  private buildToys() {
    const place = (o: THREE.Object3D, a: number, r: number, y = 0, turn = 0) => {
      o.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      o.rotation.y = -a + Math.PI / 2 + turn;
      this.scene.add(o);
      return o;
    };
    const box = new RoundedBoxGeometry(1, 1, 1, 4, 0.14);
    const ball = new THREE.SphereGeometry(1, 32, 20);

    // ティアリスト：色の段を、階段のように積む
    const tier = new THREE.Group();
    TIER.slice(0, 5).forEach((c, i) => {
      const m = new THREE.Mesh(box, mat(c));
      m.scale.set(3.2 - i * 0.5, 0.62, 1.5);
      m.position.set(-i * 0.25, 0.31 + i * 0.62, 0);
      tier.add(m);
    });
    place(tier, Math.PI * 1.22, 7.2, 0, 0.3);

    // 爆弾まわし：黒い玉と、導火線の火花
    const bomb = new THREE.Group();
    const body = new THREE.Mesh(ball, new THREE.MeshStandardMaterial({ color: '#2b3a4d', roughness: 0.25, metalness: 0.2 }));
    body.scale.setScalar(1.05); body.position.y = 1.05;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.34, 20), mat('#55657a'));
    cap.position.y = 2.15;
    const fuse = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 8, 20, Math.PI * 0.6), mat('#c9a27a'));
    fuse.position.set(0.42, 2.3, 0); fuse.rotation.z = 0.3;
    this.spark = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffb020' }));
    this.spark.position.set(0.86, 2.56, 0); this.spark.userData.flat = true;
    bomb.add(body, cap, fuse, this.spark);
    place(bomb, Math.PI * 1.72, 6.6);

    // ダイスレイド：転がるサイコロ（目は、模様で描く）
    const pips = (n: number, bg: string) => canvasTex(128, 128, g => {
      g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
      g.fillStyle = INK;
      const at: [number, number][][] = [[], [[64, 64]], [[36, 36], [92, 92]], [[36, 36], [64, 64], [92, 92]], [[36, 36], [92, 36], [36, 92], [92, 92]], [[36, 36], [92, 36], [64, 64], [36, 92], [92, 92]], [[36, 32], [92, 32], [36, 64], [92, 64], [36, 96], [92, 96]]];
      for (const [x, y] of at[n]) { g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill(); }
    });
    const dice = (bg: string, s: number) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 4, 0.16), [1, 6, 2, 5, 3, 4].map(n => new THREE.MeshStandardMaterial({ map: pips(n, bg), roughness: 0.4 })));
      m.scale.setScalar(s);
      return m;
    };
    const d1 = place(dice('#ffffff', 1.5), Math.PI * 0.2, 6.9, 1.9);
    const d2 = place(dice('#ff6f6f', 1.1), Math.PI * 0.29, 8.2, 1.3);
    this.bobs.push({ o: d1, y: 1.9, amp: 0.35, speed: 1.1, spin: 0.5, phase: 0 }, { o: d2, y: 1.3, amp: 0.3, speed: 1.4, spin: -0.7, phase: 2 });

    // ワードブーケ：花束（花は、丸い玉の集まり）
    const bouquet = new THREE.Group();
    const wrap = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.1, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide }));
    wrap.rotation.x = Math.PI; wrap.position.y = 1.05;
    bouquet.add(wrap);
    const rnd = seeded(11);
    for (let i = 0; i < 11; i++) {
      const f = new THREE.Mesh(ball, mat(['#ff6f6f', '#ffc83d', '#ff9fc2', '#ffffff'][i % 4]));
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.75;
      f.scale.setScalar(0.3 + rnd() * 0.14);
      f.position.set(Math.cos(a) * r, 2.15 + rnd() * 0.3 - r * 0.25, Math.sin(a) * r);
      bouquet.add(f);
    }
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.09, 8, 20), mat('#4aa6f0'));
    bow.position.set(0, 0.95, 0.42);
    bouquet.add(bow);
    bouquet.rotation.z = 0.12;
    place(bouquet, Math.PI * 0.72, 7.0);

    // ブラインドブラフ：立てたカード
    const card = (color: string, mark: string) => new THREE.Mesh(new RoundedBoxGeometry(1.5, 2.1, 0.08, 3, 0.04), [mat('#fff'), mat('#fff'), mat('#fff'), mat('#fff'),
      new THREE.MeshStandardMaterial({ roughness: 0.5, map: canvasTex(150, 210, g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 150, 210); g.fillStyle = color; g.font = '900 120px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(mark, 75, 110); }) }),
      mat(color)]);
    const cards = new THREE.Group();
    [['#ff6f6f', '♥', -0.9, -0.35], ['#1f2d3d', '♠', 0, 0], ['#4aa6f0', '?', 0.9, 0.35]].forEach(([c, m, x, r]) => {
      const k = card(c as string, m as string);
      k.position.set(x as number, 1.1, Math.abs(x as number) * -0.25); k.rotation.set(-0.12, r as number * -1, 0);
      cards.add(k);
    });
    place(cards, Math.PI * 0.46, 8.4, 0, Math.PI);

    // まぎれろ！のほし
    const starShape = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.46 : 1, a = i / 10 * Math.PI * 2 + Math.PI / 2; if (i) starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape, { depth: 0.34, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 3 }), new THREE.MeshStandardMaterial({ color: '#ffc83d', roughness: 0.3, emissive: '#ff9a00', emissiveIntensity: 0.35 }));
    star.geometry.center();
    place(star, Math.PI * 1.02, 3.2, 3.4);
    this.bobs.push({ o: star, y: 3.4, amp: 0.35, speed: 0.9, spin: 0.8, phase: 1 });

    // ハイカー575：短冊を3枚
    const strips = new THREE.Group();
    ['#ffd9e6', '#d9f2ff', '#e3f8d0'].forEach((c, i) => {
      const s = new THREE.Mesh(new RoundedBoxGeometry(0.62, i === 1 ? 2.6 : 2.0, 0.06, 2, 0.03), mat(c, 0.9));
      s.position.set((i - 1) * 0.8, 1.5 + (i === 1 ? 0.2 : 0), 0); s.rotation.z = (i - 1) * -0.06;
      strips.add(s);
    });
    place(strips, Math.PI * 1.48, 8.6);

    // 風船（運命の二者択一の ◯ と ✕ の色）
    for (const [c, a, r, y, p] of [['#ff6f6f', 0.05, 9.6, 6.2, 0], ['#4aa6f0', 0.95, 9.9, 7.0, 1.7], ['#36c99a', 1.6, 10.2, 5.6, 3.1], ['#ffc83d', 1.32, 4.6, 8.2, 4.4]] as [string, number, number, number, number][]) {
      const b = new THREE.Group();
      const head = new THREE.Mesh(ball, new THREE.MeshStandardMaterial({ color: c, roughness: 0.2 }));
      head.scale.set(0.8, 0.95, 0.8);
      const knot = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.2, 10), mat(c));
      knot.position.y = -1.0;
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.6, 5), new THREE.MeshBasicMaterial({ color: '#9fb3c8' }));
      line.position.y = -2.4; line.userData.flat = true;
      b.add(head, knot, line);
      place(b, Math.PI * a, r, y);
      this.bobs.push({ o: b, y, amp: 0.45, speed: 0.6, spin: 0.15, phase: p });
    }
  }

  // 台の上を歩き回るキャラクター（ゲームに出てくるのと同じもの）
  private buildWalkers(n: number) {
    const rnd = seeded(23);
    for (let i = 0; i < n; i++) {
      const chara = makeChara3D(Math.floor(rnd() * CHARA_3D_COUNT), TIER[i % TIER.length], 0);
      chara.root.scale.setScalar(1.05);
      this.scene.add(chara.root);
      this.walkers.push({ chara, r: 3.6 + (i % 3) * 1.25, a: i / n * Math.PI * 2, speed: (0.16 + rnd() * 0.1) * (i % 2 ? 1 : -1), phase: rnd() * 6 });
    }
  }

  // 空に浮かぶ雲（丸い玉の集まり）
  private buildSky() {
    const rnd = seeded(41);
    const puff = new THREE.SphereGeometry(1, 14, 10), white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
    for (let i = 0; i < 7; i++) {
      const cloud = new THREE.Group();
      for (let k = 0; k < 5; k++) { const m = new THREE.Mesh(puff, white); m.scale.set(1.6 + rnd(), 1 + rnd() * 0.5, 1.2 + rnd() * 0.6); m.position.set((k - 2) * 1.5, rnd() * 0.6, rnd() - 0.5); m.userData.flat = true; cloud.add(m); }
      const a = i / 7 * Math.PI * 2 + rnd();
      cloud.position.set(Math.cos(a) * (26 + rnd() * 10), 5 + rnd() * 9, Math.sin(a) * (26 + rnd() * 10));
      cloud.rotation.y = -a;
      this.scene.add(cloud);
      this.bobs.push({ o: cloud, y: cloud.position.y, amp: 0.5, speed: 0.2 + rnd() * 0.15, spin: 0, phase: rnd() * 6 });
    }
  }

  // 紙ふぶき：小さな色紙が、ゆっくり落ち続ける（1回の描画でまとめて描く）
  private buildConfetti(n: number) {
    const rnd = seeded(77);
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 15;
      this.confettiSeed.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: rnd() * 14, v: 0.5 + rnd() * 0.7, rx: rnd() * 6, rz: rnd() * 6, s: 1 + rnd() * 2 });
      m.setColorAt(i, c.set(TIER[i % TIER.length]));
    }
    m.userData.flat = true;
    m.frustumCulled = false;
    this.confetti = m;
    this.scene.add(m);
  }

  private onPointer = (e: PointerEvent) => { this.pointer.tx = e.clientX / innerWidth * 2 - 1; this.pointer.ty = e.clientY / innerHeight * 2 - 1; };
  // 画面が見えていない間は、描かない
  private onVisible = () => { if (document.hidden) cancelAnimationFrame(this.raf); else if (!this.disposed) { this.last = performance.now(); this.loop(); } };

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const t = performance.now();
    const ms = t - this.last;
    const dt = Math.min(0.05, ms / 1000);
    this.last = t;
    this.now += dt;
    this.step(dt);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (this.frames === 2) this.on.onFirstFrame();
    // 遅いコマが3秒ぶん続いたら、画質を下げてもらう（最初の数コマは、準備で遅いので数えない）
    if (this.frames > 30) { this.slow = ms > 30 ? this.slow + ms : Math.max(0, this.slow - ms * 2); if (this.slow > 3000) { this.slow = 0; this.on.onSlow(); } }
  };

  private step(dt: number) {
    const now = this.now, still = this.reduced;
    // カメラ：台のまわりを、ゆっくり回る。マウスの位置で、少しだけ向きが変わる
    this.pointer.x += (this.pointer.tx - this.pointer.x) * (1 - Math.exp(-dt * 3));
    this.pointer.y += (this.pointer.ty - this.pointer.y) * (1 - Math.exp(-dt * 3));
    const a = (still ? 0.6 : 0.6 + now * 0.035) + this.pointer.x * 0.18;
    const wide = Math.max(1, 1.9 / this.camera.aspect); // 細長い画面では、少し引く
    this.camera.position.set(Math.sin(a) * 27 * wide, 12.5 - this.pointer.y * 1.6, Math.cos(a) * 27 * wide);
    this.camera.lookAt(0, 4.6, 0); // 少し上を見る（おもちゃが画面の下半分に来て、上のロゴと重ならない）
    if (still) return;

    for (const w of this.walkers) {
      w.a += w.speed * dt;
      const x = Math.cos(w.a) * w.r, z = Math.sin(w.a) * w.r;
      w.chara.root.position.set(x, Math.abs(Math.sin(now * 7 + w.phase)) * 0.22, z);
      w.chara.root.rotation.y = -w.a + (w.speed > 0 ? Math.PI : 0);
    }
    for (const b of this.bobs) {
      b.o.position.y = b.y + Math.sin(now * b.speed + b.phase) * b.amp;
      if (b.spin) b.o.rotation.y += b.spin * dt;
    }
    if (this.spark) this.spark.scale.setScalar(0.8 + Math.abs(Math.sin(now * 14)) * 0.9);
    if (this.confetti) {
      this.confettiSeed.forEach((p, i) => {
        const y = 14 - ((now * p.v + p.y) % 14);
        this.dummy.position.set(p.x + Math.sin(now * 0.8 + p.rx) * 0.5, y, p.z);
        this.dummy.rotation.set(now * p.s + p.rx, now * 0.7 + p.rz, p.rz);
        this.dummy.updateMatrix();
        this.confetti!.setMatrixAt(i, this.dummy.matrix);
      });
      this.confetti.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('pointermove', this.onPointer);
    document.removeEventListener('visibilitychange', this.onVisible);
    for (const w of this.walkers) { this.scene.remove(w.chara.root); w.chara.dispose(); }
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); });
    });
    (this.scene.background as THREE.Texture | null)?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
