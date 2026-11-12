// 爆弾まわしのロビーの設定：爆発の回数と、導火線の長さ（このフォルダの README.md の 16.2）
import { BOMB_FUSE_LABELS, BOMB_FUSES, BOMB_ROUNDS } from '../../core/constants';
import { send, type Pub } from '../../app/store';

export function BombLobby({ pub, host }: { pub: Pub; host: boolean }) {
  const [min, max] = BOMB_FUSES[pub.bombFuse] ?? BOMB_FUSES[1];
  return <>
    <h2 style={{ marginTop: 16 }}>爆発の回数</h2>
    {host
      ? <div className="seg">{BOMB_ROUNDS.map(n => (
          <button key={n} className={pub.bombRounds === n ? 'on' : ''} onClick={() => send({ t: 'bombRounds', n })}>{n}回</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{pub.bombRounds}回</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>爆発するたびに、持っていた人以外の全員に1点。この回数だけ爆発したら終わりです</p>
    <h2 style={{ marginTop: 16 }}>導火線</h2>
    {host
      ? <div className="seg">{BOMB_FUSE_LABELS.map((label, n) => (
          <button key={label} className={pub.bombFuse === n ? 'on' : ''} onClick={() => send({ t: 'bombFuse', n })}>{label}</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{BOMB_FUSE_LABELS[pub.bombFuse]}</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>{min}〜{max}秒のどこかで爆発します。いつ爆発するかは、誰にも分かりません</p>
  </>;
}
