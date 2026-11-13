// ワードブーケのロビーの設定：作る時間と、終わり方（このフォルダの README.md の 14.2）
import { BOUQUET_GOALS, BOUQUET_HANDS, BOUQUET_TIMES } from '../../core/constants';
import { send, type Pub } from '../../app/store';

const goalLabel = (n: number) => n === 0 ? '全員が親を1回' : `${n}点先取`;

export function BouquetLobby({ pub, host }: { pub: Pub; host: boolean }) {
  const brought = pub.players.reduce((n, p) => n + p.bouquetWords, 0);
  return <>
    <h2 style={{ marginTop: 16 }}>作る時間</h2>
    {host
      ? <div className="seg">{BOUQUET_TIMES.map(sec => (
          <button key={sec} className={pub.bouquetTime === sec ? 'on' : ''} onClick={() => send({ t: 'bouquetTime', sec })}>{sec}秒</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{pub.bouquetTime}秒</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>言葉のカードを並べて、ひとことを作る持ち時間です</p>
    <h2 style={{ marginTop: 16 }}>手札の枚数</h2>
    {host
      ? <div className="seg">{BOUQUET_HANDS.map(n => (
          <button key={n} className={pub.bouquetHand === n ? 'on' : ''} onClick={() => send({ t: 'bouquetHand', n })}>{n}枚</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{pub.bouquetHand}枚</p>}
    <h2 style={{ marginTop: 16 }}>言葉</h2>
    {host
      ? <div className="seg">
          <button className={pub.bouquetMix ? 'on' : ''} onClick={() => send({ t: 'bouquetMix', on: true })}>プリセットと混ぜる</button>
          <button className={pub.bouquetMix ? '' : 'on'} onClick={() => send({ t: 'bouquetMix', on: false })}>持ち寄りだけ</button>
        </div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{pub.bouquetMix ? 'プリセットと混ぜる' : '持ち寄りだけ'}</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>みんなが持ってきた言葉：{brought}語。{pub.bouquetMix
      ? '手札の半分までを持ってきた言葉から、残りをプリセットから配ります'
      : '手札を、持ってきた言葉だけで配ります（足りない分は、プリセットで埋めます）'}。言葉は「お題を選ぶ・編集する」のワードブーケで足せます</p>
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
