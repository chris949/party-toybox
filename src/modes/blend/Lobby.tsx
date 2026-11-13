// まぎれろ！のロビーの設定：かくれる時間と、舞台にいるキャラクターの数（このフォルダの README.md の 15.2）
import { BLEND_CROWDS, BLEND_STARS, BLEND_TIMES } from '../../core/constants';
import { send, type Pub } from '../../app/store';

export function BlendLobby({ pub, host }: { pub: Pub; host: boolean }) {
  return <>
    <h2 style={{ marginTop: 16 }}>かくれる時間</h2>
    {host
      ? <div className="seg">{BLEND_TIMES.map(sec => (
          <button key={sec} className={pub.blendTime === sec ? 'on' : ''} onClick={() => send({ t: 'blendTime', sec })}>{sec}秒</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{pub.blendTime}秒</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>かくれる人は、この時間のうちに、ほしを{BLEND_STARS}つ集めます。集めきったら、その場で発表です。全員が1回ずつかくれたら終わりです</p>
    <h2 style={{ marginTop: 16 }}>キャラクターの数</h2>
    {host
      ? <div className="seg">{BLEND_CROWDS.map(n => (
          <button key={n} className={pub.blendCrowd === n ? 'on' : ''} onClick={() => send({ t: 'blendCrowd', n })}>{n}体</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{pub.blendCrowd}体</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>多いほど、かくれやすくなります。スマホでは少なめが見やすいです</p>
  </>;
}
