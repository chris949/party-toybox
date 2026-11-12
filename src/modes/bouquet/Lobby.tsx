// ワードブーケのロビーの設定：作る時間と、終わり方（このフォルダの README.md の 14.2）
import { BOUQUET_GOALS, BOUQUET_TIMES } from '../../core/constants';
import { send, type Pub } from '../../app/store';

const goalLabel = (n: number) => n === 0 ? '全員が親を1回' : `${n}点先取`;

export function BouquetLobby({ pub, host }: { pub: Pub; host: boolean }) {
  return <>
    <h2 style={{ marginTop: 16 }}>作る時間</h2>
    {host
      ? <div className="seg">{BOUQUET_TIMES.map(sec => (
          <button key={sec} className={pub.bouquetTime === sec ? 'on' : ''} onClick={() => send({ t: 'bouquetTime', sec })}>{sec}秒</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{pub.bouquetTime}秒</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>言葉のカードを並べて、ひとことを作る持ち時間です</p>
    <h2 style={{ marginTop: 16 }}>終わり方</h2>
    {host
      ? <div className="seg">{BOUQUET_GOALS.map(n => (
          <button key={n} className={pub.bouquetGoal === n ? 'on' : ''} onClick={() => send({ t: 'bouquetGoal', n })}>{goalLabel(n)}</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{goalLabel(pub.bouquetGoal)}</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>{pub.bouquetGoal === 0
      ? '親は順番に交代します。全員が1回ずつ親をやったら終わりです'
      : `親に選ばれると1点。先に${pub.bouquetGoal}点を取った人が出たら終わりです`}。少人数のときは、CPU を足すと選ぶ候補が増えます</p>
  </>;
}
