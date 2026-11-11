// ティアリストウォーズの画面で使う部品
import { useEffect, useRef, useState } from 'react';
import { Sound } from '../../../audio/sound';
import { isHost, needsToPick, onTimeUp, send, useStore, type Pub } from '../../../app/store';
import { Badge } from '../../../ui/common';
import { warnSec } from '../../../core/constants';

// 締め切りまでの残り秒数。残りわずか（5秒、90秒のときは10秒）からカチカチ鳴らして BGM を速め、0秒で時間切れの処理をする（画面に1つだけ置く）
export function useDeadline(pub: Pub): number | null {
  const calc = () => pub.localDeadline ? Math.max(0, Math.ceil((pub.localDeadline - Date.now()) / 1000)) : null;
  const [sec, setSec] = useState(calc);
  const last = useRef(sec);
  useEffect(() => {
    const id = setInterval(() => setSec(calc()), 200);
    setSec(calc());
    return () => clearInterval(id);
  }, [pub.localDeadline]);
  useEffect(() => {
    if (sec === last.current) return;
    last.current = sec;
    const now = useStore.getState();
    if (sec == null || !now.pub || now.pending || !needsToPick(now.pub)) return;
    if (sec > 0 && sec <= warnSec(pub.timeLimit)) Sound.play('tick');
    if (sec === 0) onTimeUp();
  }, [sec]);
  // BGM を速めるのは、まだ提出していない間だけ
  const hurry = sec != null && sec > 0 && sec <= warnSec(pub.timeLimit) && needsToPick(pub);
  useEffect(() => { Sound.setHurry(hurry); }, [hurry]);
  useEffect(() => () => Sound.setHurry(false), []);
  return sec;
}

// 残り秒数。残りわずかになったら赤く脈打ち、画面のふちも赤く点滅させる（提出済みの人には出さない）
export function Timer({ sec, limit }: { sec: number | null; limit: number }) {
  if (sec == null) return null;
  const warn = sec > 0 && sec <= warnSec(limit);
  return <>
    <span className={`timer ${warn ? 'warn' : ''}`}>⏱ <b>{sec}</b>秒</span>
    {warn && <div className="hurry-edge" aria-hidden />}
  </>;
}

export function OrderList({ options, order }: { options: string[]; order: number[] }) {
  return <>{order.map((idx, r) => (
    <div className="ans" key={r}><Badge r={r} n={order.length} /><span className="txt">{options[idx]}</span></div>
  ))}</>;
}

// 「〇〇さんを待っています」とホストの「待たずに進める」
export function Waiting({ pub, label }: { pub: Pub; label: string }) {
  const ps = pub.players.filter(p => p.done != null && p.online);
  const done = ps.filter(p => p.done).length;
  const left = ps.filter(p => !p.done);
  return (
    <>
      <p className="waiting">{label}（{done}/{ps.length}）
        {left.length > 0 && <><br />{left.map((p, i) => <span key={p.id}>{i > 0 && '、'}<b>{p.name}</b>さん</span>)}を待っています</>}
      </p>
      {isHost() && <button className="small" onClick={() => send({ t: 'force' })}>未提出の人を待たずに進める</button>}
    </>
  );
}
