// ハイカー575 の画面：書く・発表と採点・最終結果（src/modes/haiku/README.md の12章）
import './styles.css';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { isHost, send, submitKana, useStore, type Pub } from '../../app/store';
import { HAIKU_LEN, HAIKU_LINES, toKana, toLines } from './themes';
import { Standings } from '../../ui/common';
import { PLAYER_COLORS } from '../fate/charas';
import { Timer, useDeadline, Waiting } from '../tier/screens/parts';
import type { HaikuCell } from './view';

const pop = { initial: { scale: 0.6, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { type: 'spring' as const, stiffness: 500, damping: 18 } };

// 縦書きの短冊。cells[i] が無いマスは空。now = いま書くマス、themeLen = お題の文字数
function Tanzaku({ cells, now, themeLen = 0, colorOf, big }: {
  cells: (HaikuCell | { ch: string } | null)[]; now?: number; themeLen?: number; colorOf?(c: HaikuCell): string | undefined; big?: boolean;
}) {
  let at = 0;
  return (
    <div className={`tanzaku ${big ? 'big' : ''}`}>{HAIKU_LINES.map((n, li) => {
      const start = at; at += n;
      return <div className="col" key={li}>{Array.from({ length: n }, (_, k) => {
        const i = start + k, c = cells[i] ?? null;
        const full = c && 'byName' in c ? c as HaikuCell : null;
        return (
          <span key={i} className={`cell ${c ? 'on' : ''} ${i === now ? 'now' : ''} ${i < themeLen ? 'theme' : ''} ${full?.auto ? 'auto' : ''}`}
            style={full && colorOf ? { background: colorOf(full) } : undefined} title={full?.byName}>{c?.ch ?? ''}</span>
        );
      })}</div>;
    })}</div>
  );
}

export function HaikuWrite({ pub }: { pub: Pub }) {
  const sec = useDeadline(pub);
  const h = pub.haiku!;
  const pending = useStore(s => s.pending);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const chars = [...h.text];
  const ch = toKana(text);
  const writing = h.writing && h.myDraft == null;
  const cells = Array.from({ length: HAIKU_LEN }, (_, i) => i < chars.length ? { ch: chars[i] } : i === chars.length && h.myDraft ? { ch: h.myDraft } : null);
  const submit = () => { if (ch && !pending) submitKana(ch); };
  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="status">{h.step + 1}文字目 / {h.steps}</span>{writing && <Timer sec={sec} limit={pub.timeLimit} />}
      </div>
      <p className="muted small" style={{ margin: '10px 0 0' }}>{h.writing ? '回ってきた短冊に、続きの1文字を書いてください' : '途中参加のため、発表から参加します'}</p>
      {h.writing && <Tanzaku cells={cells} now={h.myDraft ? undefined : chars.length} themeLen={h.themeLen} />}
      {writing ? <>
        <div className="row kana-row">
          <input ref={input} type="text" className="kana-input" value={text} maxLength={4} placeholder="あ" aria-label="続きの1文字（ひらがな）" disabled={!!pending || sec === 0}
            autoComplete="off" autoCapitalize="off" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); }} />
          <button className="primary" style={{ flex: 1 }} disabled={!ch || !!pending || sec === 0} onClick={submit}>
            {pending ? '送信中…' : ch ? `「${ch}」で決定` : 'ひらがな1文字を入力'}
          </button>
        </div>
        {text && !ch && <p className="muted small" style={{ margin: '6px 0 0' }}>ひらがな1文字だけ書けます（カタカナは、ひらがなになります）</p>}
      </> : h.writing && <Waiting pub={pub} label={`「${h.myDraft}」を書きました。ほかの人を待っています`} />}
      {!h.writing && <Waiting pub={pub} label="みんなが書いています" />}
    </section>
  );
}

export function HaikuRecite({ pub }: { pub: Pub }) {
  const sec = useDeadline(pub);
  const w = pub.haiku!.work!;
  const mine = w.ownerId === pub.me;
  const colors = new Map(pub.players.map((p, i) => [p.id, PLAYER_COLORS[i % PLAYER_COLORS.length]]));
  const colorOf = (c: HaikuCell) => c.by ? `color-mix(in srgb, ${colors.get(c.by) ?? '#999'} 45%, #fff)` : undefined;
  // めくった行だけを短冊に出す。全部めくったら、1文字ごとに書いた人の色を付ける
  const shownChars = [...w.lines.join('')];
  const cells = w.cells ?? shownChars.map(ch => ({ ch }));
  const writers = w.cells ? [...new Map(w.cells.filter(c => c.by).map(c => [c.by!, c.byName])).entries()] : [];
  const last = w.idx + 1 >= w.total;
  return <>
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="status">作品 {w.idx + 1} / {w.total}</span>{w.rating && !mine && <Timer sec={sec} limit={pub.timeLimit} />}
      </div>
      <p className="muted small" style={{ margin: '10px 0 0' }}>担当: <b className="who">{w.ownerName}</b>{w.themeBy && `　／　お題: ${w.themeBy}`}</p>
      <motion.div key={`${w.idx}-${w.shown}`} {...(w.shown > 0 ? pop : {})}><Tanzaku cells={cells} colorOf={w.cells ? colorOf : undefined} big /></motion.div>
      {w.shown < 3 ? <>
        <p className="waiting" style={{ textAlign: 'center' }}>{w.shown === 0 ? 'まもなく発表…' : '…'}</p>
        {(isHost() || mine) && <button className="wide small" onClick={() => send({ t: 'reveal-all' })}>一気に出す</button>}
      </> : <>
        <p className="recite-call">🎤 {mine ? 'あなたの番です。声に出して読み上げてください！' : `${w.ownerName}さん、読み上げてください！`}</p>
        <div className="writers">{writers.map(([id, name]) => <span key={id} style={{ background: `color-mix(in srgb, ${colors.get(id) ?? '#999'} 45%, #fff)` }}>{name}</span>)}
          {w.cells?.some(c => c.auto) && <span className="auto">点線 = 時間切れ</span>}</div>
      </>}
    </section>
    {w.shown >= 3 && <section className="card">
      {w.done ? <>
        <h2>この作品の点 <span className="pts" style={{ fontSize: 26 }}>{w.pts}点</span></h2>
        {w.ratings!.length ? w.ratings!.map(r => (
          <div className={`rate-row ${r.id === pub.me ? 'me' : ''}`} key={r.id}><b>{r.name}{r.id === pub.me ? '（あなた）' : ''}</b><span className="stars">{'★'.repeat(r.n)}<span className="off">{'★'.repeat(5 - r.n)}</span></span></div>
        )) : <p className="muted">採点した人がいませんでした</p>}
        <p className="muted small" style={{ margin: '8px 0 0' }}>点は、★の平均×10です。担当の{w.ownerName}さんに入ります</p>
        <div style={{ marginTop: 14 }}>
          {isHost()
            ? <button className="primary wide" onClick={() => send({ t: 'next' })}>{last ? '結果発表へ' : '次の作品へ'}</button>
            : <p className="muted">ホストが次へ進めるのを待っています…</p>}
        </div>
      </> : mine ? <>
        <h2>採点</h2>
        <p className="muted">あなたが担当の作品です。みんなの採点を待ちましょう。</p>
        <Waiting pub={pub} label="採点中" />
      </> : <>
        <h2>採点 <span className="muted small">★をタップ（締め切りまでは付け直せます）</span></h2>
        <div className="star-pick" role="radiogroup" aria-label="この作品の点">{[1, 2, 3, 4, 5].map(n => (
          <button key={n} className={w.myRating != null && n <= w.myRating ? 'on' : ''} role="radio" aria-checked={w.myRating === n} aria-label={`★${n}`}
            disabled={sec === 0} onClick={() => send({ t: 'rate', round: w.idx, n })}>★</button>
        ))}</div>
        <Waiting pub={pub} label={w.myRating ? `★${w.myRating} を付けました` : '採点中'} />
      </>}
    </section>}
  </>;
}

export function HaikuResult({ pub }: { pub: Pub }) {
  const works = [...pub.haiku!.gallery ?? []].sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0));
  return <>
    <section className="card">
      <h2>最終結果</h2>
      <Standings players={pub.players} me={pub.me} />
      <div style={{ marginTop: 16 }}>
        {isHost() ? <button className="primary wide" onClick={() => send({ t: 'lobby' })}>ロビーに戻る</button> : <p className="muted">ホストがロビーに戻すのを待っています…</p>}
      </div>
    </section>
    <section className="card">
      <h2>できた作品</h2>
      {works.map((w, i) => (
        <div className="work" key={i}>
          <div className="lines">{toLines(w.text).map((line, k) => <div key={k}>{line}</div>)}</div>
          <div className="meta"><span className="pts">{w.pts}点</span><span className="muted small">担当: {w.ownerName}{w.ownerId === pub.me ? '（あなた）' : ''}</span></div>
        </div>
      ))}
    </section>
  </>;
}
