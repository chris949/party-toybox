// 状態が変わったときの効果音
import { Sound } from '../audio/sound';
import type { PlayerView } from '../core/view';

export function playStateSounds(prev: PlayerView | null, next: PlayerView) {
  const turn = (x: PlayerView | null) => x && `${x.phase}-${x.gameNo}-${x.round}`;
  // 運命の二者択一：出題でポロン、発表で「落ちる／助かった／全員正解」、結果でファンファーレ
  if (next.fate) {
    if (turn(prev) === turn(next)) return;
    const v = next.fate.verdict;
    if (next.phase === 'question') Sound.play('start');
    else if (next.phase === 'verdict' && v) Sound.play(v.fallen.length ? 'fall' : v.saved ? 'saved' : 'perfect');
    else if (next.phase === 'result') Sound.play('fanfare');
    return;
  }
  // スタンプ伝言：紙が回ってきたらポロン、発表でめくるたびにポン、伝わっていたらファンファーレ
  if (next.relay) {
    const shown = (x: PlayerView | null) => x?.relay?.show ? x.relay.show.items.length : -1;
    if (turn(prev) === turn(next)) {
      if (next.phase === 'unfold' && shown(next) > shown(prev)) Sound.play(next.relay.show?.hit ? 'perfect' : 'pop');
      return;
    }
    if (next.phase === 'work') Sound.play('start');
    else if (next.phase === 'unfold') Sound.play('drumroll');
    else if (next.phase === 'result') Sound.play('fanfare');
    return;
  }
  // 爆弾まわし：火がついたらポロン、正解・渡ったらポン、爆発でドカン（落ちる音を使う）。カチカチは画面の側で鳴らす
  if (next.bomb) {
    if (turn(prev) === turn(next)) {
      if (prev?.bomb && (next.bomb.passes > prev.bomb.passes || next.bomb.log.length > prev.bomb.log.length)) Sound.play(next.bomb.log.length > prev.bomb.log.length && !next.bomb.log[next.bomb.log.length - 1].ok ? 'click' : 'pop');
      return;
    }
    if (next.phase === 'hot') Sound.play('start');
    else if (next.phase === 'boom') Sound.play('fall');
    else if (next.phase === 'result') Sound.play('fanfare');
    return;
  }
  // まぎれろ！：始まりでポロン、ほしが取られたらポン、発表でファンファーレ（位置は1秒に何度も届くので、変わり目だけ鳴らす）
  if (next.blend) {
    if (turn(prev) === turn(next)) {
      if (prev?.blend && next.blend.stars > prev.blend.stars) Sound.play('pop');
      return;
    }
    if (next.phase === 'hide') Sound.play('start');
    else if (next.phase === 'found') Sound.play(next.blend.void ? 'pop' : 'fanfare');
    else if (next.phase === 'result') Sound.play('fanfare');
    return;
  }
  // ワードブーケ：手札が配られたらポロン、作品が出そろったらドラムロール、親が選んだらファンファーレ
  if (next.bouquet) {
    if (turn(prev) === turn(next)) return;
    if (next.phase === 'compose') Sound.play('start');
    else if (next.phase === 'choose') Sound.play('drumroll');
    else if (next.phase === 'bloom') Sound.play(next.bouquet.winner ? 'fanfare' : 'pop');
    else if (next.phase === 'result') Sound.play('fanfare');
    return;
  }
  // ブラインドブラフ：カードが配られたらポロン、発表でドラムロールのあとファンファーレ
  if (next.bluff) {
    if (turn(prev) === turn(next)) return;
    if (next.phase === 'talk') Sound.play('start');
    else if (next.phase === 'show') { Sound.play('pop'); Sound.play(next.bluff.show?.strongFold ? 'saved' : 'fanfare', 0.35); }
    else if (next.phase === 'result') Sound.play('fanfare');
    return;
  }
  // ハイカー575：短冊が回ってきたらポロン、1行めくるたびにポン、採点を締め切ったらファンファーレ
  if (next.haiku) {
    const w = next.haiku.work, pw = prev?.phase === 'recite' && prev.round === next.round ? prev.haiku?.work : null;
    if (next.phase === 'write' && turn(prev) !== turn(next)) Sound.play('start');
    if (w && w.shown > (pw?.shown ?? 0)) Sound.play(w.shown >= 3 ? 'drumroll' : 'pop');
    if (w?.done && !pw?.done) Sound.play((w.pts ?? 0) >= 40 ? 'perfect' : 'fanfare');
    return;
  }
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
