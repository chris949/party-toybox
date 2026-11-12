// ハイカー575 のロビーの設定：遊び方と、1文字の制限時間（このフォルダの README.md の 12.2）
import { HAIKU_TIMES } from '../../core/constants';
import { HAIKU_STYLES, type HaikuStyle } from './themes';
import { send, type Pub } from '../../app/store';

export function HaikuLobby({ pub, host }: { pub: Pub; host: boolean }) {
  return <>
    <h2 style={{ marginTop: 16 }}>遊び方</h2>
    {host
      ? <div className="seg">{(Object.entries(HAIKU_STYLES) as [HaikuStyle, string][]).map(([k, label]) => (
          <button key={k} className={pub.haikuStyle === k ? 'on' : ''} onClick={() => send({ t: 'haikuStyle', style: k })}>{label}</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{HAIKU_STYLES[pub.haikuStyle]}</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>{pub.haikuStyle === 'theme'
      ? '上の五文字はお題（持ち寄り。足りない分はサンプル）。残りの12文字をみんなで書きます'
      : '何もないところから、17文字すべてをみんなで書きます'}</p>
    <h2 style={{ marginTop: 16 }}>制限時間</h2>
    {host
      ? <div className="seg">{HAIKU_TIMES.map(sec => (
          <button key={sec} className={pub.haikuTime === sec ? 'on' : ''} onClick={() => send({ t: 'haikuTime', sec })}>{sec}秒</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{pub.haikuTime}秒</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>1文字を書く持ち時間です。時間切れの分は、ランダムなひらがなで埋まります</p>
  </>;
}
