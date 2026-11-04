// 状態が変わったときの効果音
import { Sound } from '../audio/sound';
import type { PlayerView } from '../modes/tier/view';

export function playStateSounds(prev: PlayerView | null, next: PlayerView) {
  const turn = (x: PlayerView | null) => x && `${x.phase}-${x.gameNo}-${x.round}`;
  if ((next.phase === 'ranking' || next.phase === 'guess') && turn(prev) !== turn(next)) Sound.play('start');
  const r = next.reveal;
  if (!r) return;
  const pr = prev?.phase === 'reveal' && prev.round === next.round ? prev.reveal : null;
  if (r.suspense && !pr?.suspense) Sound.play('drumroll');
  if (r.shown > (pr?.shown ?? 0)) Sound.play(r.shown >= r.answer.length ? 'fanfare' : 'pop');
  if (r.done && !pr?.done && r.rows.some(row => row.hits === r.answer.length)) Sound.play('perfect', 0.8);
}
