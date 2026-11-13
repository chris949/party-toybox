// まぎれろ！の画面：かくれる・さがす（3Dの舞台）、発表、最終結果（このフォルダの README.md の15章）
import './styles.css';
import { lazy, Suspense, useState } from 'react';
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
  const on = {
    onFloor: (x: number, z: number) => send({ t: 'go', round: b.round, x, z }),
    onPick: (i: number) => { if (i !== b.myGuess) send({ t: 'suspect', round: b.round, i }); },
  };
  const state = {
    key: `${pub.gameNo}-${b.round}`, chara: b.chara, pos: b.pos, tick: b.tick, star: b.star, stars: b.stars,
    mark: b.me, pick: found || hider ? (found ? b.myGuess : null) : b.myGuess, found, name: b.hiderName,
    canMove: hider && !found && !b.ready, canPick: seeking,
  };
  const ok = b.guesses?.filter(g => g.ok) ?? [];
  return <>
    <section className="card mcard">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="status">ラウンド {b.round + 1} / {b.rounds}{found ? '　発表' : ''}</span>
        {!found && <Timer sec={sec} limit={pub.timeLimit} />}
      </div>
      <p className="mrole">{found
        ? b.void ? `${b.hiderName}さんがいなくなったので、この回は流れました` : `かくれていたのは ${b.hiderName}${hider ? '（あなた）' : 'さん'}！`
        : hider ? <>🕵️ <b>あなたがかくれる番</b>。▼ があなたです。床をタップして歩き、ほしを集めましょう</>
        : <>🔎 <b className="who">{b.hiderName}</b>さんが、どれかを動かしています。あやしい1体をタップ（選び直せます。ほしを3つ集められたら、そこで終わり！）</>}</p>
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
      {seeking && <p className="mpick">{b.myGuess == null ? 'まだ選んでいません' : '🔴 の1体を選んでいます'}<span className="muted small">　選んだ人 {b.guessed}人</span></p>}
      {!found && isHost() && <button className="small" style={{ marginTop: 8 }} onClick={() => send({ t: 'force' })}>時間を待たずに発表する</button>}
      {found && !b.void && <>
        <p className="mresult">{b.stars >= b.goal
          ? `ほしを3つ集めきって、逃げ切り！ だませた ${b.guesses!.length - ok.length}人ぶん、${b.hiderName}さんに +${b.gained?.[b.hiderId] ?? 0}点`
          : `ほしは ${b.stars} / ${b.goal}。集めきれなかったので、${b.hiderName}さんは点なし`}</p>
        <div className="mguess">{b.guesses!.map(g => (
          <span key={g.id} className={g.ok ? 'ok' : ''}>{g.ok ? '⭕' : g.i == null ? '➖' : '❌'} {g.name}{g.id === pub.me ? '（あなた）' : ''}{g.ok ? ` +${BLEND_FIND}` : ''}</span>
        ))}</div>
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
