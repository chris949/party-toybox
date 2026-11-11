// ルーム：ロビーと、ゲーム中の画面の切り替え
import { useState } from 'react';
import { MAX_PLAYERS, TIME_LIMITS } from '../core/constants';
import { PICK_MODES, type PickMode } from '../core/types';
import { Guess, Ranking, Result, Reveal } from '../modes/tier/screens/Phases';
import { Notice, TitleBar } from '../ui/common';
import { isHost, leaveByUser, send, useStore, type Pub } from './store';

export function Room() {
  const pub = useStore(s => s.pub)!;
  const reconnecting = useStore(s => s.reconnecting);
  return <>
    {reconnecting && <div className="banner">ホストとの接続を確認しています… 再接続中</div>}
    <TitleBar right={<button className="small" onClick={leaveByUser}>退出</button>} />
    {pub.phase !== 'lobby' && <section className="card"><Players pub={pub} /></section>}
    {pub.phase === 'lobby' ? <Lobby pub={pub} />
      : pub.phase === 'ranking' ? <Ranking pub={pub} />
      : pub.phase === 'guess' ? <Guess pub={pub} />
      : pub.phase === 'reveal' ? <Reveal pub={pub} />
      : <Result pub={pub} />}
  </>;
}

function Players({ pub }: { pub: Pub }) {
  return (
    <div className="players">{pub.players.map(p => (
      <span key={p.id} className={`pl ${p.online ? '' : 'off'} ${p.id === pub.me ? 'me' : ''}`}>
        {p.id === pub.hostId && '👑'}{p.name}
        {pub.phase !== 'lobby' ? <span className="sc">{p.score}</span> : <span className="muted small">お題{p.topics}</span>}
        {p.done === true ? '✅' : p.done === false ? '⏳' : ''}
        {pub.phase === 'lobby' && isHost() && p.id !== pub.me && <button className="mini" style={{ padding: '0 6px' }} onClick={() => send({ t: 'kick', id: p.id })}>✕</button>}
      </span>
    ))}</div>
  );
}

function Lobby({ pub }: { pub: Pub }) {
  const [copied, setCopied] = useState(false);
  const link = location.protocol.startsWith('http') ? `${location.origin}${location.pathname}?room=${encodeURIComponent(pub.code)}` : '';
  const hostVer = pub.players.find(p => p.id === pub.hostId)?.version;
  const old = pub.players.filter(p => p.version !== hostVer);
  const host = isHost();
  return <>
    <section className="card" style={{ textAlign: 'center' }}>
      <div className="muted small">部屋コード</div>
      <div className="code">{pub.code}</div>
      {link && <>
        <div className="small muted" style={{ wordBreak: 'break-all' }}>{link}</div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
          {'share' in navigator && <button className="small" onClick={() => navigator.share({ title: 'ティアリストウォーズ', text: `ティアリストウォーズで遊ぼう！ 部屋コード: ${pub.code}`, url: link }).catch(() => {})}>LINEなどで共有</button>}
          <button className="small" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true), () => {})}>{copied ? 'コピーしました' : '招待リンクをコピー'}</button>
        </div>
      </>}
    </section>
    <section className="card">
      <h2>参加者 {pub.players.length}/{MAX_PLAYERS}</h2>
      <Players pub={pub} />
      {old.length > 0 && <Notice>⚠ ホスト（{hostVer}）と違う版の人がいます：{old.map(p => `${p.name}さん（${p.version}）`).join('、')}。ページを再読み込みしてもらってください</Notice>}
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
      <p className="muted small" style={{ margin: '6px 0 0' }}>自分の順位を決めるときと、予想するときの持ち時間です</p>
      <div style={{ marginTop: 16 }}>
        {host ? <>
          <button className="primary wide" disabled={!!pub.startError} onClick={() => send({ t: 'start' })}>ゲーム開始</button>
          {pub.startError && <p className="muted small">{pub.startError}</p>}
        </> : <p className="muted">ホストの開始を待っています…{pub.startError && <><br /><span className="small">{pub.startError}</span></>}</p>}
      </div>
    </section>
  </>;
}
