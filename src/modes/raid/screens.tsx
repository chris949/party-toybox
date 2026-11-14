// ダイスレイドの画面。いまは、つなぎ込みを確かめるための仮の画面（盤面の絵は出ない。README の 18.5）
import { isHost, send, type Pub } from '../../app/store';
import { Standings } from '../../ui/common';
import { decideAction, getActorId } from './engine';

export function RaidStage({ pub }: { pub: Pub }) {
  const r = pub.raid!;
  const g = r.game;
  const actor = getActorId(g);
  const mine = actor != null && actor === r.mySeat;
  return (
    <section className="card">
      <span className="status">ラウンド {g.round} / {g.config.maxRounds}　{g.phase === 'boss' ? '決戦' : '準備'}</span>
      <p className="muted small" style={{ margin: '10px 0 0' }}>🚧 仮の画面です（盤面の絵は、これから載せます）。つなぎ込みを確かめるため、自分の番は「おまかせ」で進められます</p>
      <p style={{ fontWeight: 800 }}>チームのライフ {g.teamLife}{g.boss ? `　／　ボスのHP ${g.boss.hp}` : ''}</p>
      <div className="players">{g.players.map((p, i) => (
        <span key={p.id} className={`pl ${i === r.mySeat ? 'me' : ''}`}>{actor === i && '▶ '}{p.name}（Lv{p.level}・HP{p.hp}・💰{p.coins}）</span>
      ))}</div>
      {mine && <button className="primary wide" style={{ marginTop: 12 }} onClick={() => send({ t: 'raidAct', seq: r.seq, action: decideAction(g) })}>おまかせで一手進める</button>}
      {!mine && actor != null && <p className="muted" style={{ marginTop: 12 }}>{g.players[actor].name}の番です…</p>}
      <div className="muted small" style={{ marginTop: 12, maxHeight: 180, overflowY: 'auto' }}>{g.log.slice(-8).map((l, i) => <div key={i}>{l}</div>)}</div>
    </section>
  );
}

export function RaidResult({ pub }: { pub: Pub }) {
  const g = pub.raid!.game;
  return (
    <section className="card">
      <h2>{g.result === 'win' ? '🎉 討伐成功！' : '💀 全滅…'}</h2>
      <p className="muted small" style={{ margin: '0 0 8px' }}>勝ち負けは全員で同じです。下は、貢献度の順位です</p>
      <Standings players={pub.players} me={pub.me} />
      <div style={{ marginTop: 16 }}>
        {isHost() ? <button className="primary wide" onClick={() => send({ t: 'lobby' })}>ロビーに戻る</button> : <p className="muted">ホストがロビーに戻すのを待っています…</p>}
      </div>
    </section>
  );
}
