// 状態が変わったときの効果音
import { Sound } from '../audio/sound';
import type { PlayerView } from '../modes/tier/view';

export function playStateSounds(prev: PlayerView | null, next: PlayerView) {
  const turn = (x: PlayerView | null) => x && `${x.phase}-${x.gameNo}-${x.round}`;
  if ((next.phase === 'ranking' || next.phase === 'guess' || next.phase === 'answer') && turn(prev) !== turn(next)) Sound.play('start');
  // セレクトファイブ：正解をめくるたびにポン、最後の正解（ダミーも同時に明かす）でファンファーレ
  const fr = next.five?.reveal;
  if (fr) {
    const pf = prev?.phase === 'reveal' && prev.round === next.round ? prev.five?.reveal : null;
    if (fr.shown.length > (pf?.shown.length ?? 0)) Sound.play(fr.done ? 'fanfare' : 'pop');
    if (fr.done && !pf?.done && fr.rows.some(row => row.hits === 5)) Sound.play('perfect', 0.8);
    return;
  }
  const r = next.reveal;
  if (!r) return;
  const pr = prev?.phase === 'reveal' && prev.round === next.round ? prev.reveal : null;
  if (r.suspense && !pr?.suspense) Sound.play('drumroll');
  if (r.shown > (pr?.shown ?? 0)) Sound.play(r.shown >= r.answer.length ? 'fanfare' : 'pop');
  if (r.done && !pr?.done && r.rows.some(row => row.hits === r.answer.length)) Sound.play('perfect', 0.8);
}
