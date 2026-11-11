// セレクトファイブの画面：答える・答え合わせ（docs/spec.md の10.6・10.7）
import { useEffect } from 'react';
import { motion } from 'motion/react';
import { ensureFivePick, isHost, send, submitFive, toggleFive, useStore, type Pub } from '../../app/store';
import { FIVE_PICK } from '../../core/fives';
import { Standings } from '../../ui/common';
import { Timer, useDeadline, Waiting } from '../tier/screens/parts';

const NONE: number[] = []; // 選んでいないとき（毎回同じ配列を返して、画面の作り直しが止まらなくなるのを防ぐ）
const pop = { initial: { scale: 0.6, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { type: 'spring' as const, stiffness: 500, damping: 18 } };
const flip = { initial: { rotateY: -100, opacity: 0.3 }, animate: { rotateY: 0, opacity: 1 }, transition: { type: 'spring' as const, stiffness: 260, damping: 16 } };
const shake = { initial: { x: 0 }, animate: { x: [0, -10, 10, -7, 7, -3, 0] }, transition: { duration: 0.5, delay: 0.25 } };
const hop = { initial: { y: 0 }, animate: { y: [0, -10, 0, -4, 0] }, transition: { duration: 0.5, delay: 0.25 } };

function Head({ pub, sub }: { pub: Pub; sub: string }) {
  const f = pub.five!;
  return <>
    <p style={{ margin: '10px 0 0' }} className="muted small">{sub}</p>
    <div className="qtitle">「{f.title}」</div>
    <p className="muted small">お題作成: {f.authorName}</p>
  </>;
}

export function Answer({ pub }: { pub: Pub }) {
  const sec = useDeadline(pub);
  const f = pub.five!;
  const key = `five-${pub.gameNo}-${f.round}`;
  const sel = useStore(s => s.fivePick.key === key ? s.fivePick.sel : NONE);
  const pending = useStore(s => s.pending);
  useEffect(() => { ensureFivePick(key); }, [key]);
  const isAuthor = f.authorId === pub.me;
  const picking = f.answering && !f.myPicks;
  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="status">ラウンド {pub.round + 1} / {pub.rounds}</span>{picking && <Timer sec={sec} limit={pub.timeLimit} />}
      </div>
      <Head pub={pub} sub={isAuthor ? 'あなたが作ったお題' : `正解だと思うものを${FIVE_PICK}つ選んでください`} />
      {isAuthor ? <>
        <p className="muted">あなたのお題です。みんながダミーに引っかかるのを見守りましょう。</p>
        <div className="fgrid">{f.options.map((o, i) => (
          <div key={i} className={`fcard ${f.correct?.[i] ? 'ok' : 'dummy'}`}><span className="tag">{f.correct?.[i] ? '正解' : 'ダミー'}</span>{o}</div>
        ))}</div>
        <Waiting pub={pub} label="回答中" />
      </> : f.myPicks ? <>
        <h2>あなたの回答</h2>
        <div className="fgrid">{f.myPicks.map(i => <div key={i} className="fcard on">{f.options[i]}</div>)}</div>
        <Waiting pub={pub} label="他の人の回答を待っています" />
      </> : <>
        <div className="fgrid">{f.options.map((o, i) => (
          <button key={i} className={`fcard ${sel.includes(i) ? 'on' : ''}`} disabled={!!pending || sec === 0 || (!sel.includes(i) && sel.length >= FIVE_PICK)}
            aria-pressed={sel.includes(i)} onClick={() => toggleFive(i)}>{o}</button>
        ))}</div>
        <button className="primary wide" style={{ marginTop: 12 }} disabled={sel.length !== FIVE_PICK || !!pending} onClick={() => submitFive()}>
          {pending ? '送信中…' : sel.length === FIVE_PICK ? 'この5つで決定' : `${sel.length} / ${FIVE_PICK}　あと${FIVE_PICK - sel.length}つ選ぶと決定できます`}
        </button>
      </>}
    </section>
  );
}

export function FiveReveal({ pub }: { pub: Pub }) {
  const f = pub.five!, r = f.reveal!;
  const canSkip = !r.done && (isHost() || f.authorId === pub.me);
  const last = r.shown.filter(i => f.correct?.[i]).at(-1); // 最後にめくった正解
  const dummies = r.done ? f.options.map((_, i) => i).filter(i => f.correct?.[i] === false) : [];
  const pickedBy = (i: number) => r.rows.filter(row => row.picks.includes(i));
  const names = (i: number, ok: boolean) => pickedBy(i).map(row => (
    <motion.div key={`${i}-${row.id}`} className={`pick ${ok ? 'hit' : 'miss'} ${row.id === pub.me ? 'me' : ''}`} {...(ok ? hop : shake)}>
      <span className="mark">{ok ? '✓' : '✗'}</span><span>{row.name}</span>{row.id === pub.me && <span className="you">あなた</span>}
      {!ok && <span className="opt">{f.options[i]} に引っかかった！</span>}
    </motion.div>
  ));
  let focus;
  if (last != null) {
    focus = (
      <motion.div className="focus" key={`f${last}`} {...pop}>
        <div className="focus-rank">⭕ 正解　{f.options[last]}</div>
        {pickedBy(last).length > 0 ? <div className="picks">{names(last, true)}</div> : <p className="muted">誰も選びませんでした</p>}
        {/* 最後の正解と同時に、ダミーをまとめて明かす */}
        {dummies.length > 0 && <div className="dummy-box">
          <div className="focus-rank dummy-hit">💣 ダミーは {dummies.map(i => f.options[i]).join('・')}</div>
          {dummies.some(i => pickedBy(i).length)
            ? <div className="picks">{dummies.flatMap(i => names(i, false))}</div>
            : <p className="muted">誰も引っかからなかった…</p>}
        </div>}
      </motion.div>
    );
  } else focus = <div className="focus"><div className="focus-rank muted">まもなく発表…</div></div>;

  return <>
    <section className="card">
      <span className="status">ラウンド {pub.round + 1} / {pub.rounds}　答え合わせ</span>
      <Head pub={pub} sub="セレクトファイブ" />
      {r.timeouts.length > 0 && <p className="small" style={{ margin: 0 }}><b className="who">時間切れ：</b>{r.timeouts.map(nm => `${nm}さん`).join('、')}</p>}
      {focus}
      {canSkip && <button className="wide small" onClick={() => send({ t: 'reveal-all' })}>残りを一気にめくる</button>}
    </section>
    <section className="card flip-area">
      <h2>選択肢</h2>
      <div className="fgrid">{f.options.map((o, i) => {
        const c = f.correct?.[i];
        const mine = r.rows.find(x => x.id === pub.me)?.picks.includes(i);
        return c == null
          ? <div key={`h${i}`} className={`fcard ${mine ? 'on' : ''}`}>{o}</div>
          : <motion.div key={`s${i}`} className={`fcard ${c ? 'ok' : 'dummy'} ${mine ? 'mine' : ''}`} {...(i === last || dummies.includes(i) ? flip : {})}>
            <span className="tag">{c ? '正解' : 'ダミー'}</span>{o}<span className="cnt">{pickedBy(i).length}人</span>
          </motion.div>;
      })}</div>
    </section>
    {r.done && <>
      <section className="card">
        <h2>みんなの回答</h2>
        {r.rows.length ? [...r.rows].sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0)).map(row => (
          <div className={`guess-row ${row.id === pub.me ? 'me' : ''}`} key={row.id}>
            <div className="head">
              <b>{row.name}{row.id === pub.me ? '（あなた）' : ''}</b>
              <span><span className="muted small">{row.hits}/{FIVE_PICK}正解{row.hits === FIVE_PICK ? ' 🎯パーフェクト！' : ''}</span> <span className="pts">+{row.pts}</span></span>
            </div>
            <div className="seq">{row.picks.map(i => <span key={i} className={f.correct?.[i] ? 'hit' : 'miss'}>{f.options[i]}</span>)}</div>
          </div>
        )) : <p className="muted">答えた人がいませんでした</p>}
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
