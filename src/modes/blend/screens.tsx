// まぎれろ！の画面：かくれる・さがす（3Dの舞台）、発表、最終結果（このフォルダの README.md の15章）
import './styles.css';
import { lazy, Suspense, useState } from 'react';
import { isHost, send, type Pub } from '../../app/store';
import { BLEND_FIND } from '../../core/constants';
import { Standings, TIER_COLORS } from '../../ui/common';
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
  // 弾の残っている、さがす人は、照準を動かして撃てる
  const roundKey = `${pub.gameNo}-${b.round}`;
  const canAim = seeking && !b.ready && b.ammo > 0;
  const on = {
    onFloor: (x: number, z: number) => send({ t: 'go', round: b.round, x, z }),
    onAim: (x: number, z: number, aiming: boolean) => send({ t: 'aim', round: b.round, x, z, on: aiming }),
    onShoot: (i: number) => send({ t: 'shoot', round: b.round, i }),
  };
  // さがす人の銃（舞台の手前に並べる。色は、並び順で決める）
  const guns = b.seekers.map((s, i) => ({ id: s.id, name: s.name, color: TIER_COLORS[(i * 2) % TIER_COLORS.length], aim: s.aim, out: s.ammo <= 0, me: s.id === pub.me }));
  const hitBy = b.shots.find(s => s.hit);
  const hiderGain = b.gained?.[b.hiderId] ?? 0;
  const lastShot = b.shots.length ? b.shots[b.shots.length - 1] : null;
  const state = {
    key: roundKey, chara: b.chara, pos: b.pos, tick: b.tick, star: b.star, stars: b.stars,
    mark: found || hider ? b.me : null, found, name: b.hiderName,
    down: b.down, shots: b.shots.length, lastShot: lastShot?.i ?? null, lastShooter: lastShot?.id ?? null, lastHit: !!lastShot?.hit,
    canMove: hider && !found && !b.ready, canAim, guns,
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
        : <>🔎 <b className="who">{b.hiderName}</b>さんが、どれかを動かしています。レーザーをあやしい1体に合わせて、撃ちましょう（ほしを3つ集められたら、逃げ切られます）</>}</p>
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
        <p className="mhint">{b.ammo <= 0 ? '弾切れです。見守りましょう' : b.ready ? 'よーい…' : <><span className="pc-only">🔫 マウスで狙って、クリックで撃つ</span><span className="sp-only">🔫 押したまま動かして狙い、指を離すと撃つ</span></>}</p>
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
