// まぎれろ！の画面：かくれる・さがす（3Dの舞台）、発表、最終結果（このフォルダの README.md の15章）
import './styles.css';
import { lazy, Suspense, useEffect, useState } from 'react';
import { isHost, send, type Pub } from '../../app/store';
import { BLEND_FIND } from '../../core/constants';
import { Standings } from '../../ui/common';
import { Timer, useDeadline } from '../tier/screens/parts';

const Stage3D = lazy(() => import('./three/Stage3D'));

export function BlendStage({ pub }: { pub: Pub }) {
  const sec = useDeadline(pub);
  const [failed, setFailed] = useState(false);
  const b = pub.blend!;
  const found = pub.phase === 'found';
  const hider = b.hiderId === pub.me;
  const seeking = !found && !hider;
  const last = b.round + 1 >= b.rounds;
  // 狙い：自分の画面の中だけのもの（送らない）。「撃つ」を押して、はじめて送る
  const roundKey = `${pub.gameNo}-${b.round}`;
  const [aimed, setAimed] = useState<{ key: string; i: number } | null>(null);
  const aim = aimed && aimed.key === roundKey && !b.down.includes(aimed.i) ? aimed.i : null;
  const canShoot = seeking && !b.ready && b.ammo > 0;
  useEffect(() => { if (!canShoot) setAimed(null); }, [canShoot]);
  const on = {
    onFloor: (x: number, z: number) => send({ t: 'go', round: b.round, x, z }),
    onPick: (i: number) => setAimed({ key: roundKey, i }),
  };
  const shoot = () => { if (aim != null) { send({ t: 'shoot', round: b.round, i: aim }); setAimed(null); } };
  const hitBy = b.shots.find(s => s.hit);
  const hiderGain = b.gained?.[b.hiderId] ?? 0;
  const state = {
    key: roundKey, chara: b.chara, pos: b.pos, tick: b.tick, star: b.star, stars: b.stars,
    mark: found || hider ? b.me : aim, pick: found ? null : aim, found, name: b.hiderName,
    down: b.down, shots: b.shots.length, lastShot: b.shots.length ? b.shots[b.shots.length - 1].i : null,
    canMove: hider && !found && !b.ready, canPick: canShoot,
  };
  return <>
    <section className="card mcard">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="status">ラウンド {b.round + 1} / {b.rounds}{found ? '　発表' : ''}</span>
        {!found && <Timer sec={sec} limit={pub.timeLimit} />}
      </div>
      <p className="mrole">{found
        ? b.void ? `${b.hiderName}さんがいなくなったので、この回は流れました` : `かくれていたのは ${b.hiderName}${hider ? '（あなた）' : 'さん'}！`
        : hider ? <>🕵️ <b>あなたがかくれる番</b>。▼ があなたです。床をタップして歩き、ほしを集めましょう</>
        : <>🔎 <b className="who">{b.hiderName}</b>さんが、どれかを動かしています。あやしい1体をタップして狙い、「撃つ」！（ほしを3つ集められたら、逃げ切られます）</>}</p>
      <div className="mstars" aria-label={`ほし ${b.stars} / ${b.goal}`}>
        {Array.from({ length: b.goal }, (_, i) => <span key={i} className={i < b.stars ? 'on' : ''}>★</span>)}
        <span className="muted small">{!found && b.ready ? 'よーい…' : b.stars >= b.goal ? '集めきった！' : `ほし ${b.stars} / ${b.goal}`}</span>
      </div>
      {failed
        ? <p className="muted" style={{ padding: 20, textAlign: 'center' }}>この端末では、3Dの舞台を表示できませんでした</p>
        : <Suspense fallback={<div className="mstage3d" />}><Stage3D state={state} on={on} onFail={() => setFailed(true)} /></Suspense>}
      {!found && hider && <button className="primary wide mgrab" disabled={!b.canGrab} onClick={() => send({ t: 'grab', round: b.round })}>
        {b.canGrab ? '★ ほしを取る' : 'ほしの上に乗ると、取れます'}
      </button>}
      {seeking && <>
        <button className="primary wide mshoot" disabled={!canShoot || aim == null} onClick={shoot}>
          {b.ammo <= 0 ? '弾切れ（見守りましょう）' : b.ready ? 'よーい…' : aim == null ? 'あやしい1体をタップして、狙う' : '🔫 ▼ の1体を撃つ'}
        </button>
        <p className="mpick">のこりの弾 <span className="mammo" aria-label={`のこり ${b.ammo}発`}>{Array.from({ length: b.ammoMax }, (_, i) => <i key={i} className={i < b.ammo ? 'on' : ''} />)}</span>
          <span className="muted small">　弾が残っている人 {b.loaded}人</span></p>
      </>}
      {!found && b.shots.length > 0 && <div className="mguess" style={{ marginTop: 8 }}>{b.shots.map((s, i) => (
        <span key={i}>💥 {s.name}{s.id === pub.me ? '（あなた）' : ''}：外れ</span>
      ))}</div>}
      {!found && isHost() && <button className="small" style={{ marginTop: 8 }} onClick={() => send({ t: 'force' })}>時間を待たずに発表する</button>}
      {found && !b.void && <>
        <p className="mresult">{b.end === 'hit' ? `🎯 ${hitBy?.name ?? '???'}さんが見破った！ +${BLEND_FIND}点`
          : b.end === 'stars' ? `ほしを3つ集めきって、逃げ切り！ ${b.hiderName}さんに +${hiderGain}点`
          : b.end === 'empty' ? `全員が弾を使いきって、逃げ切り！ ${b.hiderName}さんに +${hiderGain}点`
          : `時間切れで引き分け（ほしは ${b.stars} / ${b.goal}）。どちらにも点は入りません`}</p>
        <div className="mguess">{b.seekers.map(s => {
          const mine = b.shots.filter(x => x.id === s.id), hit = mine.some(x => x.hit);
          return <span key={s.id} className={hit ? 'ok' : ''}>{hit ? '🎯' : mine.length ? '❌' : '➖'} {s.name}{s.id === pub.me ? '（あなた）' : ''}{hit ? ` +${BLEND_FIND}` : mine.length ? ' 外れ' : ' 撃たず'}</span>;
        })}</div>
      </>}
      {found && <div style={{ marginTop: 12 }}>
        {isHost()
          ? <button className="primary wide" onClick={() => send({ t: 'next' })}>{last ? '結果発表へ' : '次のラウンドへ'}</button>
          : <p className="muted">ホストが次へ進めるのを待っています…</p>}
      </div>}
    </section>
    {found && <section className="card"><h2>現在の点</h2><Standings players={pub.players} me={pub.me} /></section>}
  </>;
}

export function BlendResult({ pub }: { pub: Pub }) {
  return (
    <section className="card">
      <h2>最終結果</h2>
      <Standings players={pub.players} me={pub.me} />
      <div style={{ marginTop: 16 }}>
        {isHost() ? <button className="primary wide" onClick={() => send({ t: 'lobby' })}>ロビーに戻る</button> : <p className="muted">ホストがロビーに戻すのを待っています…</p>}
      </div>
    </section>
  );
}
