// ブラインドブラフのロビーの設定：しゃべる時間（このフォルダの README.md の 13.2）
import { BLUFF_ROUNDS, BLUFF_TIMES } from '../../core/constants';
import { send, type Pub } from '../../app/store';

export function BluffLobby({ pub, host }: { pub: Pub; host: boolean }) {
  return <>
    <h2 style={{ marginTop: 16 }}>しゃべる時間</h2>
    {host
      ? <div className="seg">{BLUFF_TIMES.map(sec => (
          <button key={sec} className={pub.bluffTime === sec ? 'on' : ''} onClick={() => send({ t: 'bluffTime', sec })}>{sec}秒</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{pub.bluffTime}秒</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>1ラウンドごとの、だまし合いの持ち時間です。全{BLUFF_ROUNDS}ラウンド。時間切れの人は「降りる」になります</p>
  </>;
}
