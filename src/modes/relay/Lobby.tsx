// スタンプ伝言のロビーの設定：絵を作る時間（このフォルダの README.md の 17.2）
import { RELAY_GUESS_SEC, RELAY_MAX_STEPS, RELAY_TIMES } from '../../core/constants';
import { send, type Pub } from '../../app/store';

export function RelayLobby({ pub, host }: { pub: Pub; host: boolean }) {
  const steps = Math.min(pub.players.filter(p => p.online).length, RELAY_MAX_STEPS);
  return <>
    <h2 style={{ marginTop: 16 }}>絵を作る時間</h2>
    {host
      ? <div className="seg">{RELAY_TIMES.map(sec => (
          <button key={sec} className={pub.relayTime === sec ? 'on' : ''} onClick={() => send({ t: 'relayTime', sec })}>{sec}秒</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{pub.relayTime}秒</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>スタンプを置いて絵にする時間です。絵を見て言葉で答える時間は{RELAY_GUESS_SEC}秒。いまの人数だと、1枚の紙が{steps}回まわります</p>
  </>;
}
