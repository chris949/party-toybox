// ティアリストウォーズの画面で使う部品
import { useEffect, useRef, useState } from 'react';
import { Sound } from '../../../audio/sound';
import { isHost, needsToPick, onTimeUp, send, useStore, type Pub } from '../../../app/store';
import { Badge } from '../../../ui/common';

// 締め切りまでの残り秒数。残り5秒からカチカチ鳴らし、0秒で時間切れの処理をする（画面に1つだけ置く）
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
    if (sec > 0 && sec <= 5) Sound.play('tick');
    if (sec === 0) onTimeUp();
  }, [sec]);
  return sec;
}

export function Timer({ sec }: { sec: number | null }) {
  if (sec == null) return null;
  return <span className={`timer ${sec <= 5 ? 'warn' : ''}`}>⏱ <b>{sec}</b>秒</span>;
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
