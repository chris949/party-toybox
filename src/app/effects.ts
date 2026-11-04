// 状態が変わったときの紙吹雪。端末で「動きを減らす」設定をしている人には出さない
import confetti from 'canvas-confetti';
import type { PlayerView } from '../modes/tier/view';

const COLORS = ['#ff6f6f', '#ffc83d', '#36c99a', '#4aa6f0', '#ff9f43'];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const center = () => confetti({ particleCount: 120, spread: 80, startVelocity: 45, origin: { y: 0.55 }, colors: COLORS });
const sides = () => {
  confetti({ particleCount: 70, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: COLORS });
  confetti({ particleCount: 70, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: COLORS });
};

export function playStateEffects(prev: PlayerView | null, next: PlayerView) {
  if (reduced()) return;
  const r = next.reveal;
  const pr = prev?.phase === 'reveal' && prev.round === next.round ? prev.reveal : null;
  if (r) {
    // 1位をめくった瞬間
    if (r.shown >= r.answer.length && (pr?.shown ?? 0) < r.answer.length) center();
    // パーフェクトの人がいたら、めくり終わったあとに両端から
    if (r.done && !pr?.done && r.rows.some(row => row.hits === r.answer.length)) setTimeout(sides, 800);
  }
  // 最終結果：1位（同点を含む）の人の画面に
  if (next.phase === 'result' && prev?.phase !== 'result') {
    const top = Math.max(...next.players.map(p => p.score));
    if (next.players.find(p => p.id === next.me)?.score === top) { center(); setTimeout(sides, 500); }
  }
}
