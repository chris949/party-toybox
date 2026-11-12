// アニメ調の描き方：トゥーン調の陰影・輪郭線・絵で描いた顔。
// 「アニメ調に見えるか」は、形の細かさよりも、この3つと頭身で決まる。特定の作品のキャラクターや意匠は写さない
import * as THREE from 'three';

// 陰影を、明るい面・中間・影の3段にする（なめらかに変えない）
let ramp: THREE.DataTexture | null = null;
export function toonRamp() {
  if (ramp) return ramp;
  ramp = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}

// 輪郭線：同じ形を、法線の向きに少しふくらませて、裏面だけを濃い色で描く（手前の本体からはみ出た分が線に見える）
export function outlineMaterial(thickness = 0.03) {
  const m = new THREE.MeshBasicMaterial({ color: '#2a2233', side: THREE.BackSide });
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = vec3( position ) + normalize( normal ) * ${thickness.toFixed(4)};`);
  };
  return m;
}

export type FaceMood = 'normal' | 'shock';
// 顔の描き分け
export interface FaceSpec {
  eye: string;        // 瞳の色
  animal?: boolean;   // 動物：目を少し小さく丸く。鼻と「ω」の口を描く
  muzzle?: string;    // 口まわりの明るい色（いぬ・くま など）
  nose?: string;      // 鼻の色（描かないなら省く。くちばしや立体の鼻を持つ動物）
  mouth?: boolean;    // 口を描くか（省くと描く。覆面のキャラクターは false）
  patches?: boolean;  // 目のまわりの黒い模様（パンダ）
  whiskers?: boolean; // ひげ
  stripes?: boolean;  // ほほのしま模様（とら）
  wide?: boolean;     // 大きな口（かえる）
  eyepatch?: boolean; // 片目の眼帯（かいぞく）
}

const INK = '#2a2233';

// 顔を絵で描く。目や口を立体で作らないのが、アニメ顔に見せるいちばんの決め手
function drawFace(g: CanvasRenderingContext2D, w: number, h: number, f: FaceSpec, mood: FaceMood) {
  g.clearRect(0, 0, w, h);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const ey = h * (f.animal ? 0.46 : 0.5), rx = w * (f.animal ? 0.068 : 0.085), ry = h * (f.animal ? 0.155 : 0.2);
  const xs = [w * 0.3, w * 0.7];
  if (f.muzzle) { g.fillStyle = f.muzzle; g.beginPath(); g.ellipse(w * 0.5, h * 0.76, w * 0.19, h * 0.2, 0, 0, Math.PI * 2); g.fill(); }
  if (f.patches) { g.fillStyle = INK; xs.forEach((cx, i) => { g.beginPath(); g.ellipse(cx, ey + h * 0.02, rx * 1.75, ry * 1.5, i ? -0.5 : 0.5, 0, Math.PI * 2); g.fill(); }); }
  if (f.stripes) { // ほほのしま
    g.strokeStyle = '#3a2a22'; g.lineWidth = 9;
    for (const s of [-1, 1]) for (const dy of [-0.08, 0.06]) { g.beginPath(); g.moveTo(w * (0.5 + s * 0.47), h * (0.6 + dy)); g.lineTo(w * (0.5 + s * 0.38), h * (0.62 + dy)); g.stroke(); }
  }
  xs.forEach((cx, i) => {
    if (f.eyepatch && i === 1) { // 眼帯と、そのひも
      g.strokeStyle = INK; g.lineWidth = 7;
      g.beginPath(); g.moveTo(w * 0.02, h * 0.2); g.lineTo(cx, ey - ry * 0.4); g.lineTo(w * 0.98, h * 0.36); g.stroke();
      g.fillStyle = INK; g.beginPath(); g.ellipse(cx, ey, rx * 1.25, ry * 1.05, 0, 0, Math.PI * 2); g.fill();
      return;
    }
    if (mood === 'shock') { // 驚き：白目の丸に、小さな点の瞳
      g.fillStyle = '#ffffff'; g.strokeStyle = INK; g.lineWidth = 7;
      g.beginPath(); g.ellipse(cx, ey, rx * 1.05, ry * 0.95, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = INK; g.beginPath(); g.arc(cx, ey, 6, 0, Math.PI * 2); g.fill();
      return;
    }
    if (f.patches) { g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(cx, ey, rx * 1.1, ry * 1.05, 0, 0, Math.PI * 2); g.fill(); } // 黒い模様の上では、白目を敷く
    // 瞳：上が濃く、下が明るい
    const grad = g.createLinearGradient(0, ey - ry, 0, ey + ry);
    grad.addColorStop(0, INK); grad.addColorStop(0.45, f.eye); grad.addColorStop(1, f.animal ? f.eye : '#ffffff');
    g.fillStyle = grad;
    g.beginPath(); g.ellipse(cx, ey, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = INK; g.beginPath(); g.ellipse(cx, ey - ry * 0.05, rx * 0.42, ry * 0.5, 0, 0, Math.PI * 2); g.fill(); // 黒目
    // 上まつげ（太い弧）。人には、まゆも描く
    g.strokeStyle = INK; g.lineWidth = f.animal ? 8 : 11;
    g.beginPath(); g.ellipse(cx, ey, rx * 1.08, ry * 1.04, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    if (!f.animal) { g.lineWidth = 5; g.beginPath(); g.ellipse(cx, ey - ry * 1.55, rx * 0.95, ry * 0.25, 0, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
    // 光
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(cx - rx * 0.35, ey - ry * 0.45, rx * 0.3, ry * 0.24, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(cx + rx * 0.35, ey + ry * 0.45, rx * 0.14, 0, Math.PI * 2); g.fill();
  });
  // ほっぺ
  g.fillStyle = 'rgba(255, 120, 140, .45)';
  for (const cx of [w * 0.17, w * 0.83]) { g.beginPath(); g.ellipse(cx, h * 0.74, w * 0.06, h * 0.05, 0, 0, Math.PI * 2); g.fill(); }
  if (f.whiskers) { g.strokeStyle = INK; g.lineWidth = 3; for (const s of [-1, 1]) for (const dy of [-0.03, 0.05]) { g.beginPath(); g.moveTo(w * (0.5 + s * 0.2), h * (0.76 + dy * 0.5)); g.lineTo(w * (0.5 + s * 0.36), h * (0.76 + dy)); g.stroke(); } }
  // 鼻と口
  if (f.nose) { g.fillStyle = f.nose; g.beginPath(); g.ellipse(w * 0.5, h * 0.67, w * 0.032, h * 0.035, 0, 0, Math.PI * 2); g.fill(); }
  if (f.mouth === false) return;
  g.strokeStyle = INK; g.fillStyle = '#c94a5a'; g.lineWidth = 5;
  g.beginPath();
  if (mood === 'shock') { g.ellipse(w * 0.5, h * 0.86, w * 0.035, h * 0.07, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
  else if (f.wide) { g.arc(w * 0.5, h * 0.52, w * 0.24, Math.PI * 0.22, Math.PI * 0.78); g.stroke(); }
  else if (f.animal) { // 「ω」の口
    g.arc(w * 0.47, h * 0.74, w * 0.03, 0, Math.PI); g.stroke();
    g.beginPath(); g.arc(w * 0.53, h * 0.74, w * 0.03, 0, Math.PI); g.stroke();
  } else { g.arc(w * 0.5, h * 0.78, w * 0.035, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); }
}

export interface Face { mesh: THREE.Mesh; set(mood: FaceMood): void; setGhost(on: boolean): void; dispose(): void }

// 頭の前面に貼る、顔の絵。headScale = 頭の球の大きさ（顔は、それより少しだけ外側に置く）
// 画面のない所（テスト）では作れないので null
export function makeFace(headScale: [number, number, number], spec: FaceSpec): Face | null {
  if (typeof document === 'undefined') return null;
  const W = 384, H = 256, half = 1.05;
  const textures = new Map<FaceMood, THREE.CanvasTexture>();
  const tex = (mood: FaceMood) => {
    let t = textures.get(mood);
    if (!t) {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      drawFace(c.getContext('2d')!, W, H, spec, mood);
      t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      textures.set(mood, t);
    }
    return t;
  };
  // 球の前面だけを切り出した面（正面は +z）
  const geo = new THREE.SphereGeometry(1, 20, 12, Math.PI / 2 - half, half * 2, 0.95, 1.2);
  const mat = new THREE.MeshBasicMaterial({ map: tex('normal'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(headScale[0] * 1.012, headScale[1] * 1.012, headScale[2] * 1.012);
  mesh.renderOrder = 2;
  let now: FaceMood = 'normal';
  return {
    mesh,
    set(mood) { if (mood !== now) { now = mood; mat.map = tex(mood); mat.needsUpdate = true; } },
    setGhost(on) { mat.opacity = on ? 0.45 : 1; },
    dispose() { geo.dispose(); mat.dispose(); textures.forEach(t => t.dispose()); },
  };
}
