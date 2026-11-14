// ダイスレイドのロビーの設定：長さ（このフォルダの README.md の 18.2）
import { RAID_MODES, RAID_SEATS } from '../../core/constants';
import { send, type Pub } from '../../app/store';
import { MODES } from './engine';

export function RaidLobby({ pub, host }: { pub: Pub; host: boolean }) {
  return <>
    <h2 style={{ marginTop: 16 }}>長さ</h2>
    {host
      ? <div className="seg">{RAID_MODES.map(m => (
          <button key={m} className={pub.raidMode === m ? 'on' : ''} onClick={() => send({ t: 'raidMode', mode: m })}>{MODES[m].label}</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{MODES[pub.raidMode].label}</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>席は{RAID_SEATS}つ。人が座らない席は、CPU の仲間が埋めます。勝ち負けは全員で同じで、終わったあとに貢献度の順位が出ます</p>
  </>;
}
