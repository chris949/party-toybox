// ティアリストとセレクトファイブのロビーの設定：出題方式と制限時間（このフォルダの README.md の 4.1）
import { TIME_LIMITS } from '../../core/constants';
import { PICK_MODES, type PickMode } from '../../core/types';
import { send, type Pub } from '../../app/store';

export function PickLobby({ pub, host }: { pub: Pub; host: boolean }) {
  return <>
    <h2 style={{ marginTop: 16 }}>出題方式</h2>
    {host
      ? <div className="seg">{(Object.entries(PICK_MODES) as [PickMode, string][]).map(([k, label]) => (
          <button key={k} className={pub.mode === k ? 'on' : ''} onClick={() => send({ t: 'mode', mode: k })}>{label}</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{PICK_MODES[pub.mode] ?? PICK_MODES.random}</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>{pub.mode === 'each' ? '自作のお題を持ってきた人から1つずつ必ず出します' : '全員のお題から、自作のお題を優先してランダムに選びます'}</p>
    <h2 style={{ marginTop: 16 }}>制限時間</h2>
    {host
      ? <div className="seg">{TIME_LIMITS.map(sec => (
          <button key={sec} className={pub.timeLimit === sec ? 'on' : ''} onClick={() => send({ t: 'time', sec })}>{sec}秒</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{pub.timeLimit}秒</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>{pub.gameMode === 'five' ? '選択肢を選ぶときの持ち時間です' : '自分の順位を決めるときと、予想するときの持ち時間です'}</p>
  </>;
}
