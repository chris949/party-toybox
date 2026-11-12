// ルーム：ロビーと、ゲーム中の画面の切り替え
import { useState } from 'react';
import { MAX_PLAYERS } from '../core/constants';
import { GAME_MODES, type GameMode } from '../core/types';
import { Guess, Ranking, Result, Reveal } from '../modes/tier/screens/Phases';
import { Answer, FiveReveal } from '../modes/five/screens';
import { charaOf } from '../modes/fate/charas';
import { FateLobby } from '../modes/fate/Lobby';
import { HaikuLobby } from '../modes/haiku/Lobby';
import { BluffLobby } from '../modes/bluff/Lobby';
import { BouquetLobby } from '../modes/bouquet/Lobby';
import { BlendLobby } from '../modes/blend/Lobby';
import { BombLobby } from '../modes/bomb/Lobby';
import { RelayLobby } from '../modes/relay/Lobby';
import { RelayResult, RelayUnfold, RelayWork } from '../modes/relay/screens';
import { BombResult, BombStage } from '../modes/bomb/screens';
import { BlendResult, BlendStage } from '../modes/blend/screens';
import { BouquetBloom, BouquetChoose, BouquetCompose, BouquetResult } from '../modes/bouquet/screens';
import { BluffResult, BluffShow, BluffTalk } from '../modes/bluff/screens';
import { PickLobby } from '../modes/tier/Lobby';
import { FateResult, FateStage } from '../modes/fate/screens';
import { HaikuRecite, HaikuResult, HaikuWrite } from '../modes/haiku/screens';
import { Notice, TitleBar } from '../ui/common';
import { addBot, isHost, leaveByUser, openRoomTopics, send, useStore, type Pub } from './store';

export function Room() {
  const pub = useStore(s => s.pub)!;
  const reconnecting = useStore(s => s.reconnecting);
  const notice = useStore(s => s.notice);
  return <>
    {reconnecting && <div className="banner">ホストとの接続を確認しています… 再接続中</div>}
    <TitleBar right={<button className="small" onClick={leaveByUser}>退出</button>} />
    {notice && <Notice>{notice}</Notice>}
    {/* 運命の二者択一は、舞台の上に全員が出ているので、参加者の一覧は出さない */}
    {pub.phase !== 'lobby' && pub.game !== 'fate' && <section className="card"><Players pub={pub} /></section>}
    {pub.phase === 'lobby' ? <Lobby pub={pub} />
      : pub.phase === 'ranking' ? <Ranking pub={pub} />
      : pub.phase === 'guess' ? <Guess pub={pub} />
      : pub.phase === 'answer' ? <Answer pub={pub} />
      : pub.phase === 'question' || pub.phase === 'verdict' ? <FateStage pub={pub} />
      : pub.fate ? <FateResult pub={pub} />
      : pub.phase === 'work' ? <RelayWork pub={pub} />
      : pub.phase === 'unfold' ? <RelayUnfold pub={pub} />
      : pub.relay ? <RelayResult pub={pub} />
      : pub.phase === 'hot' || pub.phase === 'boom' ? <BombStage pub={pub} />
      : pub.bomb ? <BombResult pub={pub} />
      : pub.phase === 'hide' || pub.phase === 'found' ? <BlendStage pub={pub} />
      : pub.blend ? <BlendResult pub={pub} />
      : pub.phase === 'compose' ? <BouquetCompose pub={pub} />
      : pub.phase === 'choose' ? <BouquetChoose pub={pub} />
      : pub.phase === 'bloom' ? <BouquetBloom pub={pub} />
      : pub.bouquet ? <BouquetResult pub={pub} />
      : pub.phase === 'talk' ? <BluffTalk pub={pub} />
      : pub.phase === 'show' ? <BluffShow pub={pub} />
      : pub.bluff ? <BluffResult pub={pub} />
      : pub.phase === 'write' ? <HaikuWrite pub={pub} />
      : pub.phase === 'recite' ? <HaikuRecite pub={pub} />
      : pub.haiku ? <HaikuResult pub={pub} />
      : pub.phase === 'reveal' ? (pub.five ? <FiveReveal pub={pub} /> : <Reveal pub={pub} />)
      : <Result pub={pub} />}
  </>;
}

function Players({ pub }: { pub: Pub }) {
  return (
    <div className="players">{pub.players.map(p => (
      <span key={p.id} className={`pl ${p.online ? '' : 'off'} ${p.id === pub.me ? 'me' : ''}`}>
        {p.id === pub.hostId && '👑'}{p.bot && '🤖'}{pub.phase === 'lobby' && pub.gameMode === 'fate' && charaOf(p.chara).face}{p.name}
        {pub.phase !== 'lobby' ? <span className="sc">{p.score}</span>
          : <span className="muted small">{pub.gameMode === 'fate' ? `問題${p.fates + p.fives}` : pub.gameMode === 'haiku' ? `お題${p.haikus}` : pub.gameMode === 'bluff' || pub.gameMode === 'blend' || pub.gameMode === 'bomb' || pub.gameMode === 'relay' ? '' : pub.gameMode === 'bouquet' ? `お題${p.bouquets}` : `お題${pub.gameMode === 'five' ? p.fives : p.topics}`}</span>}
        {p.done === true ? '✅' : p.done === false ? '⏳' : ''}
        {pub.phase === 'lobby' && p.editing && <span className="small">✏️ 編集中</span>}
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
  const fate = pub.gameMode === 'fate';
  const haiku = pub.gameMode === 'haiku';
  const bluff = pub.gameMode === 'bluff';
  const bouquet = pub.gameMode === 'bouquet';
  const blend = pub.gameMode === 'blend';
  const bomb = pub.gameMode === 'bomb';
  const relay = pub.gameMode === 'relay';
  return <>
    <section className="card" style={{ textAlign: 'center' }}>
      <div className="muted small">部屋コード</div>
      <div className="code">{pub.code}</div>
      {link && <>
        <div className="small muted" style={{ wordBreak: 'break-all' }}>{link}</div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
          {'share' in navigator && <button className="small" onClick={() => navigator.share({ title: 'パーティトイボックス', text: `パーティトイボックスで遊ぼう！ 部屋コード: ${pub.code}`, url: link }).catch(() => {})}>LINEなどで共有</button>}
          <button className="small" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true), () => {})}>{copied ? 'コピーしました' : '招待リンクをコピー'}</button>
        </div>
      </>}
    </section>
    <section className="card">
      <h2>参加者 {pub.players.length}/{MAX_PLAYERS}</h2>
      <Players pub={pub} />
      {/* 部屋に入ったまま、持っていくお題を選び直したり編集したりできる */}
      <button className="wide small" style={{ marginTop: 10 }} onClick={openRoomTopics}>お題を選ぶ・編集する</button>
      {/* 人数が足りないとき用：CPU が動くモードを選んでいる間だけ、ホストが足せる */}
      {host && (fate || haiku || bluff || bouquet || blend || bomb || relay) && <button className="wide small" style={{ marginTop: 8 }} disabled={pub.players.length >= MAX_PLAYERS} onClick={addBot}>＋ CPUを追加</button>}
      {host && pub.players.some(p => p.editing && p.id !== pub.me) && <p className="muted small" style={{ margin: '6px 0 0' }}>✏️ {pub.players.filter(p => p.editing && p.id !== pub.me).map(p => `${p.name}さん`).join('、')}がお題を編集中です</p>}
      {old.length > 0 && <Notice>⚠ ホスト（{hostVer}）と違う版の人がいます：{old.map(p => `${p.name}さん（${p.version}）`).join('、')}。ページを再読み込みしてもらってください</Notice>}
      <h2 style={{ marginTop: 16 }}>モード</h2>
      {host
        ? <div className="seg wrap">{(Object.entries(GAME_MODES) as [GameMode, string][]).map(([k, label]) => (
            <button key={k} className={pub.gameMode === k ? 'on' : ''} onClick={() => send({ t: 'game', mode: k })}>{label}</button>
          ))}</div>
        : <p style={{ margin: 0, fontWeight: 800 }}>{GAME_MODES[pub.gameMode]}</p>}
      <p className="muted small" style={{ margin: '6px 0 0' }}>{pub.gameMode === 'five'
        ? '正解とダミーを混ぜた選択肢から、正解だと思うものを5つ選びます。お題が足りない分はサンプルで補います'
        : relay ? '絵と言葉の伝言ゲーム。お題をスタンプで絵にして隣へ回し、次の人は絵を見て言葉で答え、その次の人はその言葉をまた絵にします。最後に、どう伝わったかをみんなで見ます。お題は同梱のものを使います'
        : bomb ? 'いつ爆発するか分からない爆弾を回します。回ってきたら、お題に合う言葉を1つ入れて、誰かに渡します。爆発したときに持っていた人の負け。お題は同梱のものを使います'
        : blend ? '同じ見た目のキャラクターが、舞台を大勢うろうろします。1体だけ、人が動かしています。ほかの全員で、どれが人かを当てます。お題は使いません'
        : bouquet ? '配られた言葉のカードを並べて、お題に合うひとことを作ります。親が読み上げて、いちばん刺さったものを選びます。お題が足りない分はサンプルで補います'
        : bluff ? '自分のカードだけ見えないトランプ遊び。ほかの人のカードは見えるので、通話でだまし合い、勝負するか降りるかを決めます。お題は使いません'
        : haiku ? 'みんなで1文字ずつ書いて回し、五・七・五の句を作ります。できた句は担当者が読み上げて、全員で★を付けます'
        : fate ? '2択クイズのサバイバル。左右に動いて答え、不正解の側は床が抜けて脱落。最後の1人になるまで続きます。問題が足りない分はサンプルで補います'
        : 'お題を自分の好みで並べ、ほかの人の順位を当てます'}</p>
      {relay ? <RelayLobby pub={pub} host={host} /> : bomb ? <BombLobby pub={pub} host={host} /> : blend ? <BlendLobby pub={pub} host={host} /> : bouquet ? <BouquetLobby pub={pub} host={host} /> : bluff ? <BluffLobby pub={pub} host={host} /> : haiku ? <HaikuLobby pub={pub} host={host} /> : fate ? <FateLobby pub={pub} host={host} /> : <PickLobby pub={pub} host={host} />}
      <div style={{ marginTop: 16 }}>
        {host ? <>
          <button className="primary wide" disabled={!!pub.startError} onClick={() => send({ t: 'start' })}>ゲーム開始</button>
          {pub.startError && <p className="muted small">{pub.startError}</p>}
        </> : <p className="muted">ホストの開始を待っています…{pub.startError && <><br /><span className="small">{pub.startError}</span></>}</p>}
      </div>
    </section>
  </>;
}
