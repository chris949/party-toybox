// 運命の二者択一のロビーの設定：キャラクター・制限時間・ライフ・お立ち台の回数（このフォルダの README.md の 11.2・11.4・11.5）
import { FATE_LIVES, FATE_QUOTAS, FATE_TIMES } from '../../core/constants';
import { CharaPicker } from './charas';
import { send, setChara, type Pub } from '../../app/store';

export function FateLobby({ pub, host }: { pub: Pub; host: boolean }) {
  return <>
    <h2 style={{ marginTop: 16 }}>あなたのキャラクター</h2>
    <CharaPicker value={pub.players.find(p => p.id === pub.me)?.chara ?? 0} onPick={setChara} />
    <h2 style={{ marginTop: 16 }}>制限時間</h2>
    {host
      ? <div className="seg">{FATE_TIMES.map(sec => (
          <button key={sec} className={pub.fateTime === sec ? 'on' : ''} onClick={() => send({ t: 'fateTime', sec })}>{sec}秒</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{pub.fateTime}秒</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>1問ごとの持ち時間です。締め切りの瞬間にいた側が、あなたの答えになります</p>
    <h2 style={{ marginTop: 16 }}>ライフ</h2>
    {host
      ? <div className="seg">{FATE_LIVES.map(n => (
          <button key={n} className={pub.fateLives === n ? 'on' : ''} aria-label={`ライフ${n}`} onClick={() => send({ t: 'fateLives', n })}>{'♥'.repeat(n)}</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{'♥'.repeat(pub.fateLives)}</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>不正解で落ちるたびに1つ減り、なくなったら脱落です{pub.fateLives > 1 ? `（${pub.fateLives - 1}回のミスまで大丈夫）` : '（1回のミスで脱落）'}</p>
    <h2 style={{ marginTop: 16 }}>お立ち台の回数</h2>
    {host
      ? <div className="seg">{FATE_QUOTAS.map(n => (
          <button key={n} className={pub.fateQuota === n ? 'on' : ''} onClick={() => send({ t: 'fateQuota', n })}>{n}回</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{pub.fateQuota}回</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>全員が順番に、この回数だけ出題者としてお立ち台に立ちます（その問題では自動でセーフ）。自分の問題がない人には、サンプルの問題を割り当てます</p>
  </>;
}
