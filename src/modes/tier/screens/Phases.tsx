// フェーズごとの画面：準備・予想・答え合わせ・最終結果
import { motion } from 'motion/react';
import { isHost, send, type Pub } from '../../../app/store';
import { Badge, Standings, tierColor } from '../../../ui/common';
import { OrderList, Timer, useDeadline, Waiting } from './parts';
import { Picker } from './Picker';

const pop = { initial: { scale: 0.6, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { type: 'spring' as const, stiffness: 500, damping: 18 } };
// めくった枠：カードを裏返すようにくるっと回って表になる
const flip = { initial: { rotateX: -100, opacity: 0.3 }, animate: { rotateX: 0, opacity: 1 }, transition: { type: 'spring' as const, stiffness: 260, damping: 16 } };
// 外した人は左右に揺れ、当てた人はぴょんと跳ねる（めくるたびに鳴らし直す）
const shake = { initial: { x: 0 }, animate: { x: [0, -10, 10, -7, 7, -3, 0] }, transition: { duration: 0.5, delay: 0.25 } };
const hop = { initial: { y: 0 }, animate: { y: [0, -10, 0, -4, 0] }, transition: { duration: 0.5, delay: 0.25 } };

export function Ranking({ pub }: { pub: Pub }) {
  const sec = useDeadline(pub);
  const t = pub.myTopic;
  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="status">準備フェーズ</span>{!pub.myRank && <Timer sec={sec} />}
      </div>
      {t ? <>
        <div className="qtitle">{t.title}</div>
        <p className="muted small">作成: {t.authorName}　／　<b>あなた自身の好み</b>で並べてください。みんながこれを当てにきます。</p>
        {pub.myRank
          ? <><h2>あなたの回答</h2><OrderList options={t.options} order={pub.myRank} /><Waiting pub={pub} label="他の人の並び替えを待っています" /></>
          : <Picker options={t.options} pickKey={`rank-${pub.gameNo}`} timeUp={sec === 0} />}
      </> : <><p>途中参加のため、今回は予想のみの参加です。</p><Waiting pub={pub} label="並び替え中" /></>}
    </section>
  );
}

export function Guess({ pub }: { pub: Pub }) {
  const sec = useDeadline(pub);
  const tg = pub.target!, t = tg.topic;
  const isMe = tg.id === pub.me;
  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="status">ラウンド {pub.round + 1} / {pub.rounds}</span>{!pub.myGuess && <Timer sec={sec} />}
      </div>
      <p style={{ margin: '10px 0 0' }}><span className="who">{tg.name}</span> さんの</p>
      <div className="qtitle">「{t.title}」の順位は？</div>
      <p className="muted small">お題作成: {t.authorName}</p>
      {isMe ? <><p className="muted">あなたのお題です。みんなの予想を待ちましょう。</p><OrderList options={t.options} order={pub.myRank ?? []} /><Waiting pub={pub} label="予想中" /></>
        : pub.myGuess ? <><h2>あなたの予想</h2><OrderList options={t.options} order={pub.myGuess} /><Waiting pub={pub} label="他の人の予想を待っています" /></>
        : <Picker options={t.options} pickKey={`guess-${pub.gameNo}-${pub.round}`} timeUp={sec === 0} />}
    </section>
  );
}

export function Reveal({ pub }: { pub: Pub }) {
  const tg = pub.target!, t = tg.topic, r = pub.reveal!, n = r.answer.length;
  const from = n - r.shown; // この位置より下（数字が大きい側）はめくり済み
  const canSkip = !r.done && (isHost() || tg.id === pub.me);
  let focus;
  if (r.suspense) focus = (
    <motion.div className="focus" key="suspense" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: [1, 1.18, 1.05, 1.22], opacity: 1 }} transition={{ duration: 2, ease: 'easeInOut' }}>
      <div className="focus-rank">1位は…</div>
    </motion.div>
  );
  else if (r.shown > 0) {
    const ans = r.answer[from];
    focus = (
      <motion.div className="focus" key={`f${from}`} {...pop}>
        <div className="focus-rank"><span className="badge" style={{ background: tierColor(from, n) }}>{from + 1}</span>第{from + 1}位　{t.options[ans]}</div>
        {r.rows.length > 0 && <div className="picks">{r.rows.map(row => {
          const hit = row.order[from] === ans, me = row.id === pub.me;
          return (
            <motion.div key={row.id} className={`pick ${hit ? 'hit' : 'miss'} ${me ? 'me' : ''}`} {...(hit ? hop : shake)}>
              <span className="mark">{hit ? '✓' : '✗'}</span><span>{row.name}</span>{me && <span className="you">あなた</span>}
              <span className="opt">{t.options[row.order[from]]}</span>
            </motion.div>
          );
        })}</div>}
      </motion.div>
    );
  } else focus = <div className="focus"><div className="focus-rank muted">まもなく発表…</div></div>;

  return <>
    <section className="card">
      <span className="status">ラウンド {pub.round + 1} / {pub.rounds}　答え合わせ</span>
      <p style={{ margin: '10px 0 0' }}><span className="who">{tg.name}</span> さんの</p>
      <div className="qtitle">「{t.title}」</div>
      <p className="muted small">お題作成: {t.authorName}</p>
      {r.timeouts.length > 0 && <p className="small" style={{ margin: 0 }}><b className="who">時間切れ：</b>{r.timeouts.map(nm => `${nm}さん`).join('、')}</p>}
      {focus}
      {canSkip && <button className="wide small" onClick={() => send({ t: 'reveal-all' })}>残りを一気にめくる</button>}
    </section>
    <section className="card flip-area">
      <h2>正解</h2>
      {r.answer.map((idx, pos) => pos >= from
        ? <motion.div className="ans" key={`a${pos}`} {...(pos === from && !r.suspense ? flip : {})}><Badge r={pos} n={n} /><span className="txt">{t.options[idx]}</span></motion.div>
        : <div className="ans" key={`h${pos}`}><Badge r={pos} n={n} hidden /><span className="txt muted">？？？</span></div>)}
    </section>
    {r.done && <>
      <section className="card">
        <h2>みんなの予想</h2>
        {r.rows.length ? [...r.rows].sort((a, b) => b.pts - a.pts).map(row => (
          <div className={`guess-row ${row.id === pub.me ? 'me' : ''}`} key={row.id}>
            <div className="head">
              <b>{row.name}{row.id === pub.me ? '（あなた）' : ''}</b>
              <span><span className="muted small">{row.hits}/{n}一致{row.hits === n ? ' 🎯パーフェクト！' : ''}</span> <span className="pts">+{row.pts}</span></span>
            </div>
            <div className="seq">{row.order.map((idx, i) => <span key={i} className={idx === r.answer[i] ? 'hit' : 'miss'}>{i + 1}. {t.options[idx]}</span>)}</div>
          </div>
        )) : <p className="muted">予想した人がいませんでした</p>}
        <div style={{ marginTop: 14 }}>
          {isHost()
            ? <button className="primary wide" onClick={() => send({ t: 'next' })}>{pub.round + 1 < pub.rounds ? '次のラウンドへ' : '結果発表へ'}</button>
            : <p className="muted">ホストが次へ進めるのを待っています…</p>}
        </div>
      </section>
      {pub.round + 1 < pub.rounds && <section className="card"><h2>現在のランキング</h2><Standings players={pub.players} me={pub.me} /></section>}
    </>}
  </>;
}

export function Result({ pub }: { pub: Pub }) {
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
