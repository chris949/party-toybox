// スタンプ伝言の画面：絵を作る・言葉で答える、発表、最終結果（このフォルダの README.md の17章）
import './styles.css';
import { isHost, relayKey, send, setRelayStamps, setRelayText, submitRelay, useStore, type Pub } from '../../app/store';
import { RELAY_TEXT_MAX } from '../../core/constants';
import { Standings } from '../../ui/common';
import { Timer, useDeadline, Waiting } from '../tier/screens/parts';
import { StampEditor, StampView } from './StampPad';
import type { Stamp } from './stamps';

const NONE: Stamp[] = []; // 何も置いていないとき（毎回同じ配列を返して、画面の作り直しが止まらなくなるのを防ぐ）

export function RelayWork({ pub }: { pub: Pub }) {
  const sec = useDeadline(pub);
  const r = pub.relay!;
  const key = relayKey(pub);
  const stamps = useStore(s => s.relayDraft.key === key ? s.relayDraft.stamps : NONE);
  const text = useStore(s => s.relayDraft.key === key ? s.relayDraft.text : '');
  const pending = useStore(s => s.pending);
  const f = r.from;
  const working = !!f && !r.submitted;
  const locked = !!pending || sec === 0;
  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="status">{r.step + 1} / {r.steps}回目　{r.kind === 'draw' ? '絵にする' : '言葉で答える'}</span>
        {working && <Timer sec={sec} limit={pub.timeLimit} />}
      </div>
      {!f ? <>
        <p className="muted">途中参加のため、このゲームは見ているだけになります。</p>
        <Waiting pub={pub} label="みんなが作っています" />
      </> : r.submitted ? <>
        <p style={{ fontWeight: 800 }}>出しました！ 紙が隣へ回るのを待っています</p>
        <Waiting pub={pub} label="ほかの人を待っています" />
      </> : r.kind === 'draw' ? <>
        <p className="muted small" style={{ margin: '10px 0 0' }}>{'word' in f ? 'お題（あなただけに見えています）' : '前の人の答え'}</p>
        <div className="qtitle">「{'word' in f ? f.word : 'text' in f ? f.text : ''}」</div>
        <p className="muted small" style={{ margin: '0 0 8px' }}>これを、スタンプだけで絵にしてください。次の人は、絵だけを見て答えます</p>
        <StampEditor stamps={stamps} onChange={setRelayStamps} disabled={locked} />
        <button className="primary wide" style={{ marginTop: 12 }} disabled={locked || !stamps.length} onClick={submitRelay}>{pending ? '送信中…' : 'この絵で出す'}</button>
      </> : <>
        <p className="muted small" style={{ margin: '10px 0 6px' }}>前の人が作った絵です。何を表しているでしょう？</p>
        <StampView stamps={'stamps' in f ? f.stamps : NONE} />
        <div className="row" style={{ marginTop: 12 }}>
          <input type="text" maxLength={RELAY_TEXT_MAX} value={text} placeholder="これは何？" aria-label="絵の答え" disabled={locked}
            onChange={e => setRelayText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitRelay(); }} />
          <button className="primary" disabled={locked || !text.trim()} onClick={submitRelay}>{pending ? '送信中…' : '答える'}</button>
        </div>
      </>}
    </section>
  );
}

export function RelayUnfold({ pub }: { pub: Pub }) {
  const s = pub.relay!.show!;
  const done = s.items.length >= s.total;
  const lastBook = s.idx + 1 >= s.count;
  return <>
    <section className="card">
      <span className="status">発表　{s.idx + 1} / {s.count}枚目</span>
      <p className="recite-call">🎤 {s.ownerId === pub.me ? 'あなたの紙です。声に出して、実況してください' : `${s.ownerName}さんの紙です`}</p>
      <p className="muted small" style={{ margin: '0' }}>最初のお題</p>
      <div className="qtitle">「{s.word}」</div>
      <div className="rchain">{s.items.map((it, i) => (
        <div className={`rstep ${it.byId === pub.me ? 'me' : ''}`} key={i}>
          <div className="rby">↓ {it.by}{it.byId === pub.me ? '（あなた）' : ''}{it.kind === 'draw' ? ' の絵' : ' の答え'}{it.auto ? '（時間切れ）' : ''}</div>
          {it.kind === 'draw' ? <StampView stamps={it.stamps} small /> : <div className="rtext">「{it.text}」</div>}
        </div>
      ))}</div>
      {done && <p className={`rhit ${s.hit ? 'ok' : ''}`}>{s.hit ? '🎉 伝わった！ この紙に関わった全員に +1点' : `😂 「${s.word}」は、伝わりませんでした`}</p>}
      <div style={{ marginTop: 12 }}>
        {isHost()
          ? <button className="primary wide" onClick={() => send({ t: 'next' })}>{!done ? `つぎをめくる（${s.items.length} / ${s.total}）` : lastBook ? '結果発表へ' : '次の紙へ'}</button>
          : <p className="muted">ホストがめくるのを待っています…（{s.items.length} / {s.total}）</p>}
      </div>
    </section>
    {done && <section className="card"><h2>現在の点</h2><Standings players={pub.players} me={pub.me} /></section>}
  </>;
}

export function RelayResult({ pub }: { pub: Pub }) {
  return (
    <section className="card">
      <h2>最終結果</h2>
      <p className="muted small" style={{ margin: '0 0 8px' }}>最後までお題が伝わった紙に関わった人に、点が入っています</p>
      <Standings players={pub.players} me={pub.me} />
      <div style={{ marginTop: 16 }}>
        {isHost() ? <button className="primary wide" onClick={() => send({ t: 'lobby' })}>ロビーに戻る</button> : <p className="muted">ホストがロビーに戻すのを待っています…</p>}
      </div>
    </section>
  );
}
