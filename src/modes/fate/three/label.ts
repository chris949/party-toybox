// キャラクターの頭の上に出す名前の札（文字をキャンバスに描いて、板として立てる）
import * as THREE from 'three';
import { COLORS } from './layout';

// 名前の札（自分は黄色、作った人には「出題」を付ける）。下に、残りのライフを ♥ で出す
export function makeLabel(text: string, me: boolean, lives: number): THREE.Sprite {
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
