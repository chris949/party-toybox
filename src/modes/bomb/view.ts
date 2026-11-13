// 爆弾まわしで各参加者に見せてよい情報。爆発の時刻は送らない（導火線の燃え具合を、4段階で送るだけ）。
// どの選択肢が正解かは、選ぶまで送らない（爆発したら、持っていた人のお題の正解を見せる）
import type { BombState, BombStyle } from './rules';

export interface BombView {
  round: number;
  rounds: number;
  style: BombStyle;
  holderId: string;
  holderName: string;
  heat: number;                  // 0〜3
  // 持っている人のお題（全員に見える）。mark = 選択肢ごとの印：'' まだ／'ok' 当てた正解／'ng' 選んだダミー／'ans' 爆発のあとに見せる、残りの正解
  quiz: { title: string; by: string; options: string[]; mark: ('' | 'ok' | 'ng' | 'ans')[] } | null;
  armed: boolean;                // 正解を当てて、渡せる状態か
  lockMs: number;                // はずれのあと、選べるようになるまでの残り（ミリ秒）
  log: { id: string; name: string; text: string; ok: boolean }[];
  passes: number;
  loserId: string | null;        // 爆発したとき
  loserName: string | null;
}

export function bombView(g: BombState, now: number): BombView {
  const name = (id: string) => g.names[id] ?? '???';
  const q = g.quizzes[g.holderId];
  const boom = g.phase !== 'hot';
  return {
    round: g.round, rounds: g.rounds, style: g.style,
    holderId: g.holderId, holderName: name(g.holderId), heat: g.heat,
    quiz: q ? { title: q.title, by: q.by, options: q.options, mark: q.options.map((_, i) => q.used[i] ? 'ok' : q.wrong[i] ? 'ng' : boom && q.correct[i] ? 'ans' : '') } : null,
    armed: g.armed,
    lockMs: g.phase === 'hot' ? Math.max(0, g.lockUntil - now) : 0,
    log: g.log.map(w => ({ id: w.id, name: name(w.id), text: w.text, ok: w.ok })),
    passes: g.passes,
    loserId: g.loserId, loserName: g.loserId ? name(g.loserId) : null,
  };
}
