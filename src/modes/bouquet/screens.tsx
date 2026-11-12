// ワードブーケの画面：作る・親が選ぶ・発表・最終結果（このフォルダの README.md の14章）
import './styles.css';
import { motion } from 'motion/react';
import { addToken, bouquetKey, isHost, removeToken, send, submitPhrase, useStore, type Pub } from '../../app/store';
import { Standings } from '../../ui/common';
import { Timer, useDeadline, Waiting } from '../tier/screens/parts';
import { PARTICLES, particleToken, PHRASE_MAX } from './words';

const NONE: number[] = []; // 何も並べていないとき（毎回同じ配列を返して、画面の作り直しが止まらなくなるのを防ぐ）
const pop = { initial: { scale: 0.6, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { type: 'spring' as const, stiffness: 500, damping: 18 } };

// 見出し：何ラウンド目か、親は誰か、お題
function Head({ pub, sub }: { pub: Pub; sub?: string }) {
  const b = pub.bouquet!;
  return <>
    <p className="muted small" style={{ margin: '10px 0 0' }}>親: <b className="who">{b.parentId === pub.me ? 'あなた' : b.parentName}</b>　／　お題作成: {b.themeBy}</p>
    <div className="qtitle">「{b.theme}」</div>
    {sub && <p className="muted small" style={{ margin: 0 }}>{sub}</p>}
  </>;
}
const roundLabel = (pub: Pub) => pub.bouquet!.rounds ? `ラウンド ${pub.bouquet!.round + 1} / ${pub.bouquet!.rounds}` : `ラウンド ${pub.bouquet!.round + 1}（${pub.bouquet!.goal}点先取）`;

export function BouquetCompose({ pub }: { pub: Pub }) {
  const sec = useDeadline(pub);
  const b = pub.bouquet!;
  const key = bouquetKey(pub);
  const tokens = useStore(s => s.bouquetDraft.key === key ? s.bouquetDraft.tokens : NONE);
  const pending = useStore(s => s.pending);
  const hand = b.hand;
  const composing = !!hand && b.myPhrase == null;
  const locked = !!pending || sec === 0;
  const full = tokens.length >= PHRASE_MAX;
  const word = (t: number) => t >= 0 ? hand?.[t] ?? '' : PARTICLES[-t - 1];
  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="status">{roundLabel(pub)}</span>{composing && <Timer sec={sec} limit={pub.timeLimit} />}
      </div>
      <Head pub={pub} sub={composing ? '言葉のカードを並べて、お題に合うひとことを作ってください' : undefined} />
      {composing ? <>
        {/* 並べた文：タップすると外れる */}
        <div className={`wline ${tokens.length ? '' : 'empty'}`} aria-label="並べた文">
          {tokens.length ? tokens.map((t, i) => (
            <button key={i} className={`wchip ${t >= 0 ? 'card' : 'joint'}`} disabled={locked} onClick={() => removeToken(i)} aria-label={`${word(t)} を外す`}>{word(t)}</button>
          )) : <span className="muted small">下のカードをタップして並べます（並べたものをタップすると外れます）</span>}
        </div>
        <div className="muted small wlabel">言葉のカード（1枚1回）</div>
        <div className="wpool">{hand!.map((w, i) => (
          <button key={i} className="wchip card" disabled={locked || full || tokens.includes(i)} onClick={() => addToken(i)}>{w}</button>
        ))}</div>
        <div className="muted small wlabel">つなぐ言葉（何度でも）</div>
        <div className="wpool">{PARTICLES.map((p, i) => (
          <button key={p} className="wchip joint" disabled={locked || full} onClick={() => addToken(particleToken(i))}>{p}</button>
        ))}</div>
        <div className="row" style={{ marginTop: 12 }}>
          <button disabled={locked || b.redrawn} onClick={() => send({ t: 'redraw', round: b.round })}>{b.redrawn ? '引き直し済み' : '手札を引き直す（1回）'}</button>
          <button className="primary" style={{ flex: 1 }} disabled={locked || !tokens.some(t => t >= 0)} onClick={submitPhrase}>{pending ? '送信中…' : 'これで提出'}</button>
        </div>
      </> : b.myPhrase != null ? <>
        <h2>あなたのひとこと</h2>
        <div className="wphrase mine">{b.myPhrase}</div>
        <Waiting pub={pub} label="ほかの人を待っています" />
      </> : <>
        <p className="muted">{b.parentId === pub.me ? 'あなたが親です。みんなが作り終わるのを待ちましょう。出そろったら、声に出して読み上げてください。' : '途中参加のため、次のラウンドから参加します。'}</p>
        <Waiting pub={pub} label="みんなが作っています" />
      </>}
    </section>
  );
}

// 出そろった作品（作った人の名前と一緒に）。親は、ここから1つ選ぶ
function Phrases({ pub, choose }: { pub: Pub; choose?: boolean }) {
  const b = pub.bouquet!;
  return <div className="wlist">{b.phrases!.map(p => {
    const won = b.winner === p.id;
    return (
      <div className={`wentry ${won ? 'won' : ''} ${p.id === pub.me ? 'me' : ''}`} key={p.id}>
        <div className="wby">{won && '💐 '}{p.name}{p.id === pub.me ? '（あなた）' : ''}</div>
        <div className="wphrase">{p.text}</div>
        {choose && <button className="primary small" onClick={() => send({ t: 'choose', round: b.round, id: p.id })} aria-label={`${p.name}のひとことを選ぶ`}>これに決めた！</button>}
      </div>
    );
  })}</div>;
}

export function BouquetChoose({ pub }: { pub: Pub }) {
  const b = pub.bouquet!;
  const parent = b.parentId === pub.me;
  return (
    <section className="card">
      <span className="status">{roundLabel(pub)}　えらぶ</span>
      <Head pub={pub} />
      <p className="recite-call">🎤 {parent ? 'あなたが親です。1つずつ読み上げて、いちばん刺さったものを選んでください' : `${b.parentName}さんが、読み上げて選びます`}</p>
      <Phrases pub={pub} choose={parent} />
      {isHost() && !parent && <button className="small" style={{ marginTop: 10 }} onClick={() => send({ t: 'force' })}>選ばずに進める（親が選べないとき）</button>}
    </section>
  );
}

export function BouquetBloom({ pub }: { pub: Pub }) {
  const b = pub.bouquet!;
  const won = b.phrases!.find(p => p.id === b.winner);
  return <>
    <section className="card">
      <span className="status">{roundLabel(pub)}　結果</span>
      <Head pub={pub} />
      {won ? <motion.div className="wbloom" {...pop}>
        <div className="muted small">{b.parentName}さんに、いちばん刺さったのは…</div>
        <div className="wphrase big">💐 {won.text}</div>
        <div className="wby big">{won.name}{won.id === pub.me ? '（あなた）' : ''} に1点！</div>
      </motion.div> : <p className="muted" style={{ textAlign: 'center' }}>{b.phrases!.length ? '今回は、選ばれませんでした（点なし）' : '誰も提出しませんでした（点なし）'}</p>}
      {b.phrases!.length > 1 && <><h2 style={{ marginTop: 14 }}>みんなのひとこと</h2><Phrases pub={pub} /></>}
      <div style={{ marginTop: 14 }}>
        {isHost()
          ? <button className="primary wide" onClick={() => send({ t: 'next' })}>次へ進む</button>
          : <p className="muted">ホストが次へ進めるのを待っています…</p>}
      </div>
    </section>
    <section className="card"><h2>現在の点</h2><Standings players={pub.players} me={pub.me} /></section>
  </>;
}

export function BouquetResult({ pub }: { pub: Pub }) {
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
