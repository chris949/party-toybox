// ダイスレイドのロビーの設定：長さと、各自の職業（このフォルダの README.md の 18.2）
import './styles.css';
import { RAID_MODES, RAID_SEATS } from '../../core/constants';
import { send, type Pub } from '../../app/store';
import { CLASS_IDS, CLASSES, MODES } from './engine';

export function RaidLobby({ pub, host }: { pub: Pub; host: boolean }) {
  const mine = pub.players.find(p => p.id === pub.me)?.raidClass ?? null;
  return <>
    <h2 style={{ marginTop: 16 }}>長さ</h2>
    {host
      ? <div className="seg">{RAID_MODES.map(m => (
          <button key={m} className={pub.raidMode === m ? 'on' : ''} onClick={() => send({ t: 'raidMode', mode: m })}>{MODES[m].label}</button>
        ))}</div>
      : <p style={{ margin: 0, fontWeight: 800 }}>{MODES[pub.raidMode].label}</p>}
    <p className="muted small" style={{ margin: '6px 0 0' }}>席は{RAID_SEATS}つ。人が座らない席は、CPU の仲間が埋めます。勝ち負けは全員で同じで、終わったあとに貢献度の順位が出ます</p>
    <h2 style={{ marginTop: 16 }}>あなたの職業</h2>
    <div className="raid-classes">{CLASS_IDS.map(id => {
      const c = CLASSES[id];
      const who = pub.players.filter(p => p.raidClass === id).map(p => p.name);
      return (
        <button key={id} className={`raid-class ${mine === id ? 'on' : ''}`} aria-pressed={mine === id} onClick={() => send({ t: 'raidClass', classId: id })}>
          <img src={`${import.meta.env.BASE_URL}raid/chars/${id}_bust.png`} alt="" loading="lazy" />
          <b>{c.icon} {c.name}</b>
          <small>HP{c.hp}・攻{c.atk}・防{c.def}・射程{c.range}</small>
          <small>✨ {c.skillName}：{c.skillDesc}</small>
          {who.length > 0 && <span className="raid-who">{who.join('、')}</span>}
        </button>
      );
    })}</div>
    <p className="muted small" style={{ margin: '6px 0 0' }}>選ばなかった人と CPU の席は、まだ誰も使っていない職業になります。同じ職業を選ぶ人がいても、遊べます</p>
  </>;
}
