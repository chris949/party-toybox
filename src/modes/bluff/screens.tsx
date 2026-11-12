// ブラインドブラフの画面：しゃべって決める・発表・最終結果（このフォルダの README.md の13章）
import './styles.css';
import { motion } from 'motion/react';
import { isHost, send, submitBet, useStore, type Pub } from '../../app/store';
import { BLUFF_FOLD, BLUFF_LOSE, BLUFF_STRONG_FOLD } from '../../core/constants';
import { Standings } from '../../ui/common';
import { Chara, PLAYER_COLORS, variantOf } from '../fate/charas';
import { Timer, useDeadline, Waiting } from '../tier/screens/parts';

const flip = { initial: { rotateY: -100, opacity: 0.3 }, animate: { rotateY: 0, opacity: 1 }, transition: { type: 'spring' as const, stiffness: 260, damping: 16 } };

// 全員が、頭の上にカードを掲げて並ぶ。自分のカードは、発表まで「？」
function Table({ pub }: { pub: Pub }) {
  const b = pub.bluff!, sh = b.show;
  const best = Math.max(0, ...Object.values(b.cards).map(n => n ?? 0)); // その回でいちばん強いカード（発表のときに印を付ける）
  return (
    <div className="btable flip-area">{pub.players.filter(p => p.id in b.cards).map(p => {
      const i = pub.players.indexOf(p), n = b.cards[p.id], me = p.id === pub.me;
      const go = b.bets?.[p.id], delta = sh?.delta[p.id] ?? 0;
      const tag = !sh ? null : sh.winner === p.id ? 'win' : sh.strongFold === p.id ? 'oops' : go ? 'lose' : 'fold';
      return (
        <div className={`bseat ${me ? 'me' : ''} ${tag ?? ''}`} key={p.id}>
          {n == null
            ? <div className="bcard back" aria-label="あなたのカード（まだ見えません）">？</div>
            : <motion.div className={`bcard ${sh && n === best ? 'best' : ''}`} key={`${b.round}-${sh && me ? 'open' : 'c'}`} {...(sh && me ? flip : {})} aria-label={`${p.name}のカード ${n}`}>{n}</motion.div>}
          <Chara n={p.chara} size={40} color={PLAYER_COLORS[i % PLAYER_COLORS.length]} variant={variantOf(pub.players, i)} pose={tag === 'oops' ? 'fall' : 'stand'} />
          <div className="bname">{me ? 'あなた' : p.name}</div>
          {sh
            ? <div className="bres"><span className="what">{tag === 'win' ? '勝ち！' : tag === 'oops' ? '降りた…' : go ? '勝負' : '降りた'}</span>
              <span className={`delta ${delta > 0 ? 'plus' : delta < 0 ? 'minus' : ''}`}>{delta > 0 ? `+${delta}` : delta}</span></div>
            : <div className="bres muted">{p.done ? '決めた' : '考え中…'}</div>}
        </div>
      );
    })}</div>
  );
}

export function BluffTalk({ pub }: { pub: Pub }) {
  const sec = useDeadline(pub);
  const b = pub.bluff!;
  const pending = useStore(s => s.pending);
  const choosing = b.dealt && b.myBet == null;
  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="status">ラウンド {b.round + 1} / {b.rounds}</span>{choosing && <Timer sec={sec} limit={pub.timeLimit} />}
      </div>
      <p className="muted small" style={{ margin: '10px 0 0' }}>自分のカードだけ見えません。通話でしゃべって（嘘もOK）、勝負するか降りるかを決めましょう</p>
      <Table pub={pub} />
      {choosing ? <>
        <div className="row bbtns">
          <button className="wide" disabled={!!pending || sec === 0} onClick={() => submitBet(false)}>降りる<span className="small muted">　−{BLUFF_FOLD}点</span></button>
          <button className="primary wide" disabled={!!pending || sec === 0} onClick={() => submitBet(true)}>勝負！</button>
        </div>
        <p className="muted small" style={{ margin: '8px 0 0' }}>
          勝負して負けると −{BLUFF_LOSE}点。いちばん強いカードで降りると、さらに −{BLUFF_STRONG_FOLD}点。勝った人が、みんなの払った点をもらいます
        </p>
      </> : <Waiting pub={pub} label={!b.dealt ? '途中参加のため、次のラウンドから参加します' : b.myBet ? '「勝負」を選びました' : '「降りる」を選びました'} />}
    </section>
  );
}

export function BluffShow({ pub }: { pub: Pub }) {
  const b = pub.bluff!, sh = b.show!;
  const nameOf = (id: string) => pub.players.find(p => p.id === id)?.name ?? '???';
  const last = b.round + 1 >= b.rounds;
  return <>
    <section className="card">
      <span className="status">ラウンド {b.round + 1} / {b.rounds}　発表</span>
      <div className="focus">
        <div className="focus-rank">{sh.winner ? `🏆 ${nameOf(sh.winner)} の勝ち！` : '全員が降りました（点は動きません）'}</div>
        {sh.strongFold && <p className="who" style={{ margin: '6px 0 0', fontWeight: 900 }}>😱 {nameOf(sh.strongFold)} は、いちばん強いカードで降りた！（さらに −{BLUFF_STRONG_FOLD}点）</p>}
      </div>
      <Table pub={pub} />
      <div style={{ marginTop: 14 }}>
        {isHost()
          ? <button className="primary wide" onClick={() => send({ t: 'next' })}>{last ? '結果発表へ' : '次のラウンドへ'}</button>
          : <p className="muted">ホストが次へ進めるのを待っています…</p>}
      </div>
    </section>
    {!last && <section className="card"><h2>現在の点</h2><Standings players={pub.players} me={pub.me} /></section>}
  </>;
}

export function BluffResult({ pub }: { pub: Pub }) {
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
