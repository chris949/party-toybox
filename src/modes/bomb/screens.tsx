// 爆弾まわしの画面：まわす・爆発、最終結果（このフォルダの README.md の16章）
import './styles.css';
import { useEffect, useRef, useState } from 'react';
import { Sound } from '../../audio/sound';
import { isHost, send, type Pub } from '../../app/store';
import { BOMB_WORD_MAX } from '../../core/constants';
import { Notice, Standings } from '../../ui/common';
import { normalizeWord } from './themes';

const TICK_MS = [1000, 650, 400, 220]; // 導火線が燃えるほど、カチカチが速くなる

export function BombStage({ pub }: { pub: Pub }) {
  const b = pub.bomb!;
  const boom = pub.phase === 'boom';
  const mine = !boom && b.holderId === pub.me;
  const [word, setWord] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const others = pub.players.filter(p => p.online && p.id !== pub.me);
  // 爆弾が回ってきたら、すぐ打てるようにする
  useEffect(() => { if (mine) { setWord(''); input.current?.focus(); } }, [mine, b.passes, b.round]);
  // カチカチ：燃え具合で速くなる。残りわずかの演出（BGM を速める）も使う
  useEffect(() => {
    if (boom) return;
    const id = setInterval(() => Sound.play('tick'), TICK_MS[b.heat] ?? 1000);
    return () => clearInterval(id);
  }, [boom, b.heat, b.round]);
  useEffect(() => { Sound.setHurry(!boom && b.heat >= 2); }, [boom, b.heat]);
  useEffect(() => () => Sound.setHurry(false), []);

  const text = word.trim();
  const dup = !!text && b.words.some(w => normalizeWord(w.text) === normalizeWord(text));
  const toss = (to: string) => { if (text && !dup) send({ t: 'toss', round: b.round, word: text, to }); };
  const last = b.round + 1 >= b.rounds;
  return <>
    <section className={`card bcard-bomb heat${boom ? 3 : b.heat} ${boom ? 'boom' : ''} ${mine ? 'mine' : ''}`}>
      <span className="status">ラウンド {b.round + 1} / {b.rounds}{boom ? '　爆発！' : ''}</span>
      <p className="muted small" style={{ margin: '10px 0 0' }}>お題</p>
      <div className="qtitle">「{b.theme}」</div>
      <div className="bomb" aria-hidden>{boom ? '💥' : '💣'}</div>
      {boom
        ? <p className="bomb-who"><b>{b.loserName}</b>{b.loserId === pub.me ? '（あなた）' : 'さん'}の手元で爆発！<br /><span className="muted small">ほかの全員に +1点</span></p>
        : <p className="bomb-who">{mine ? <b>あなたが持っています！</b> : <>いま持っているのは <b className="who">{b.holderName}</b>さん</>}</p>}
      {mine && <>
        <input ref={input} type="text" maxLength={BOMB_WORD_MAX} value={word} placeholder="お題に合う言葉を1つ" aria-label="お題に合う言葉"
          onChange={e => setWord(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && others.length === 1) toss(others[0].id); }} />
        <Notice>{dup ? 'その言葉は、もう出ています' : ''}</Notice>
        <div className="muted small" style={{ margin: '8px 0 4px', fontWeight: 700 }}>言葉を入れたら、渡す相手を押す</div>
        <div className="bomb-to">{others.map(p => (
          <button key={p.id} className="primary" disabled={!text || dup} onClick={() => toss(p.id)}>{p.name} に渡す</button>
        ))}</div>
      </>}
      {!boom && !mine && <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>回ってきたら、お題に合う言葉を1つ入れて、誰かに渡します</p>}
      {boom && <div style={{ marginTop: 12 }}>
        {isHost()
          ? <button className="primary wide" onClick={() => send({ t: 'next' })}>{last ? '結果発表へ' : '次のラウンドへ'}</button>
          : <p className="muted">ホストが次へ進めるのを待っています…</p>}
      </div>}
      {!boom && b.heat >= 2 && <div className="hurry-edge" aria-hidden />}
    </section>
    <section className="card">
      <h2>出た言葉 <span className="muted small">{b.words.length}個</span></h2>
      {b.words.length
        ? <div className="bomb-words">{[...b.words].reverse().map((w, i) => (
            <span key={b.words.length - i} className={w.id === pub.me ? 'me' : ''}><b>{w.text}</b> <small>{w.name}</small></span>
          ))}</div>
        : <p className="muted" style={{ margin: 0 }}>まだ出ていません</p>}
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
