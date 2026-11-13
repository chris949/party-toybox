// 爆弾まわしの画面：まわす・爆発、最終結果（このフォルダの README.md の16章）
import './styles.css';
import { useEffect, useRef, useState } from 'react';
import { Sound } from '../../audio/sound';
import { isHost, send, type Pub } from '../../app/store';
import { Notice, Standings } from '../../ui/common';
import { matchOption } from './quiz';

const TICK_MS = [1000, 650, 400, 220]; // 導火線が燃えるほど、カチカチが速くなる
const MARK = { '': '', ok: '⭕', ng: '❌', ans: '✔' } as const;

export function BombStage({ pub }: { pub: Pub }) {
  const b = pub.bomb!;
  const q = b.quiz;
  const boom = pub.phase === 'boom';
  const mine = !boom && b.holderId === pub.me;
  const [word, setWord] = useState('');
  const [miss, setMiss] = useState(false);
  const [locked, setLocked] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const others = pub.players.filter(p => p.online && p.id !== pub.me);
  const typing = b.style === 'type';
  // はずれのあとは、少しのあいだ操作できない（残り時間はホストから届く。こちらの時計で数え直す）
  useEffect(() => {
    if (!mine || b.lockMs <= 0) { setLocked(false); return; }
    setLocked(true);
    const id = setTimeout(() => setLocked(false), b.lockMs);
    return () => clearTimeout(id);
  }, [mine, b.lockMs, b.log.length]);
  // 爆弾が回ってきたら、すぐ打てるようにする
  useEffect(() => { if (mine) { setWord(''); setMiss(false); input.current?.focus(); } }, [mine, b.passes, b.round, b.log.length]);
  useEffect(() => { if (mine && typing && !locked && !b.armed) input.current?.focus(); }, [locked]);
  // カチカチ：燃え具合で速くなる。残りわずかの演出（BGM を速める）も使う
  useEffect(() => {
    if (boom) return;
    const id = setInterval(() => Sound.play('tick'), TICK_MS[b.heat] ?? 1000);
    return () => clearInterval(id);
  }, [boom, b.heat, b.round]);
  useEffect(() => { Sound.setHurry(!boom && b.heat >= 2); }, [boom, b.heat]);
  useEffect(() => () => Sound.setHurry(false), []);

  const canPick = mine && !b.armed && !locked;
  const pick = (i: number) => { if (canPick && q && q.mark[i] === '') send({ t: 'bombPick', round: b.round, i }); };
  // 入力式：打ち込んだ文字と合う選択肢を選ぶ。どれとも合わなければ、何も送らない
  const submit = () => {
    if (!q || !canPick || !word.trim()) return;
    const i = matchOption(q.options, word);
    if (i < 0 || q.mark[i] !== '') { setMiss(true); return; }
    pick(i);
  };
  const last = b.round + 1 >= b.rounds;
  return <>
    <section className={`card bcard-bomb heat${boom ? 3 : b.heat} ${boom ? 'boom' : ''} ${mine ? 'mine' : ''}`}>
      <div className="bomb-head">
        <span className="status">ラウンド {b.round + 1} / {b.rounds}{boom ? '　爆発！' : ''}</span>
        <span className="bomb" aria-hidden>{boom ? '💥' : '💣'}</span>
      </div>
      {boom
        ? <p className="bomb-who"><b>{b.loserName}</b>{b.loserId === pub.me ? '（あなた）' : 'さん'}の手元で爆発！<br /><span className="muted small">ほかの全員に +1点</span></p>
        : <p className="bomb-who">{mine ? <b>あなたが持っています！</b> : <>いま持っているのは <b className="who">{b.holderName}</b>さん</>}</p>}
      {q && <>
        <p className="muted small" style={{ margin: 0 }}>{boom ? `${b.loserName}さんのお題` : mine ? 'あなたのお題' : `${b.holderName}さんのお題`}（作成: {q.by}）</p>
        <div className="qtitle">「{q.title}」</div>
        <div className={`bomb-opts ${typing ? 'typing' : ''}`}>{q.options.map((o, i) => (
          typing || !mine
            ? <span key={i} className={`bopt ${q.mark[i]}`}>{MARK[q.mark[i]]} {o}</span>
            : <button key={i} className={`bopt ${q.mark[i]}`} disabled={!canPick || q.mark[i] !== ''} onClick={() => pick(i)}>{MARK[q.mark[i]]} {o}</button>
        ))}</div>
      </>}
      {mine && !b.armed && <>
        {typing && <div className="row" style={{ marginTop: 10 }}>
          <input ref={input} type="text" maxLength={40} value={word} placeholder="正解だと思うものを打ち込む" aria-label="正解だと思う選択肢" disabled={locked}
            onChange={e => { setWord(e.target.value); setMiss(false); }} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); }} />
          <button className="primary" disabled={!canPick || !word.trim()} onClick={submit}>答える</button>
        </div>}
        <Notice>{locked ? '❌ はずれ！ 少し待って…' : miss ? '選択肢の中に、その言葉がありません（もう選んだものは使えません）' : ''}</Notice>
        {!locked && !miss && <p className="muted small bomb-hint">{typing ? '正解を1つ打ち込むと、渡せるようになります' : '正解を1つタップすると、渡せるようになります'}</p>}
      </>}
      {mine && b.armed && <>
        <p className="bomb-armed">⭕ 正解！ 渡す相手を選んで</p>
        <div className="bomb-to">{others.map(p => (
          <button key={p.id} className="primary" onClick={() => send({ t: 'toss', round: b.round, to: p.id })}>{p.name} に渡す</button>
        ))}</div>
      </>}
      {!boom && !mine && <p className="muted small bomb-hint">{b.armed ? `${b.holderName}さんが、渡す相手を選んでいます…` : '回ってきたら、自分のお題の正解を1つ当てて、誰かに渡します'}</p>}
      {boom && <div style={{ marginTop: 12 }}>
        {isHost()
          ? <button className="primary wide" onClick={() => send({ t: 'next' })}>{last ? '結果発表へ' : '次のラウンドへ'}</button>
          : <p className="muted">ホストが次へ進めるのを待っています…</p>}
      </div>}
      {!boom && b.heat >= 2 && <div className="hurry-edge" aria-hidden />}
    </section>
    <section className="card">
      <h2>この回の答え <span className="muted small">{b.passes}回まわった</span></h2>
      {b.log.length
        ? <div className="bomb-words">{[...b.log].reverse().map((w, i) => (
            <span key={b.log.length - i} className={`${w.id === pub.me ? 'me' : ''} ${w.ok ? '' : 'ng'}`}>{w.ok ? '⭕' : '❌'} <b>{w.text}</b> <small>{w.name}</small></span>
          ))}</div>
        : <p className="muted" style={{ margin: 0 }}>まだありません</p>}
    </section>
    {boom && <section className="card"><h2>現在の点</h2><Standings players={pub.players} me={pub.me} /></section>}
  </>;
}

export function BombResult({ pub }: { pub: Pub }) {
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
