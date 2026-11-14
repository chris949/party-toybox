// ルーム：ロビーと、ゲーム中の画面の切り替え
import { useState } from 'react';
import { MAX_PLAYERS } from '../core/constants';
import { GAME_MODES, HIDDEN_MODES, type GameMode } from '../core/types';
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
import { RaidLobby } from '../modes/raid/Lobby';
import { RaidStage } from '../modes/raid/screens';
import { RelayResult, RelayUnfold, RelayWork } from '../modes/relay/screens';
import { BombResult, BombStage } from '../modes/bomb/screens';
import { BlendResult, BlendStage } from '../modes/blend/screens';
import { BouquetBloom, BouquetChoose, BouquetCompose, BouquetResult } from '../modes/bouquet/screens';
import { BluffResult, BluffShow, BluffTalk } from '../modes/bluff/screens';
import { PickLobby } from '../modes/tier/Lobby';
import { FateResult, FateStage } from '../modes/fate/screens';
import { HaikuRecite, HaikuResult, HaikuWrite } from '../modes/haiku/screens';
import { Notice, TitleBar } from '../ui/common';
import { HowTo } from './howto';
import { addBot, DEV, isHost, leaveByUser, openRoomTopics, send, useStore, type Pub } from './store';

export function Room() {
  const pub = useStore(s => s.pub)!;
  const reconnecting = useStore(s => s.reconnecting);
  const notice = useStore(s => s.notice);
  const [help, setHelp] = useState(false);
  return <>
    {reconnecting && <div className="banner">ホストとの接続を確認しています… 再接続中</div>}
    <TitleBar right={<>
      {/* ゲーム中も、そのゲームのあそびかたを、いつでも開ける */}
      {pub.game && <button className="small sp-only" aria-expanded={help} aria-label="あそびかた" onClick={() => setHelp(!help)}>？</button>}
      <button className="small" onClick={leaveByUser}>退出</button>
    </>} />
    {notice && <Notice>{notice}</Notice>}
    {/* スマホ幅：上から順に1列。PC 幅：左にゲームの画面、右に参加者とあそびかたを出したままにする（docs/spec.md の 3.4.2） */}
    <div className={`room-grid ${pub.phase === 'lobby' ? 'lobby' : ''}`}>
      {pub.phase !== 'lobby' && <aside className="room-side">
        {help && pub.game && <section className="card helpcard sp-only">
          <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>{GAME_MODES[pub.game]} のあそびかた</h2><button className="small" onClick={() => setHelp(false)}>閉じる</button></div>
          <HowTo mode={pub.game} compact />
        </section>}
        {/* 運命の二者択一は、舞台の上に全員が出ているので、参加者の一覧は出さない */}
        {pub.game !== 'fate' && <section className="card"><h2 className="pc-only">参加者</h2><Players pub={pub} /></section>}
        {pub.game && <section className="card pc-only"><h2>{GAME_MODES[pub.game]} のあそびかた</h2><HowTo mode={pub.game} compact /></section>}
      </aside>}
      <div className="room-main">
        {pub.phase === 'lobby' ? <Lobby pub={pub} />
          : pub.phase === 'ranking' ? <Ranking pub={pub} />
          : pub.phase === 'guess' ? <Guess pub={pub} />
          : pub.phase === 'answer' ? <Answer pub={pub} />
          : pub.phase === 'question' || pub.phase === 'verdict' ? <FateStage pub={pub} />
          : pub.fate ? <FateResult pub={pub} />
          : pub.raid ? <RaidStage pub={pub} />
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
      </div>
    </div>
  </>;
}

function Players({ pub }: { pub: Pub }) {
  return (
    <div className="players">{pub.players.map(p => (
      <span key={p.id} className={`pl ${p.online ? '' : 'off'} ${p.id === pub.me ? 'me' : ''}`}>
        {p.id === pub.hostId && '👑'}{p.bot && '🤖'}{pub.phase === 'lobby' && pub.gameMode === 'fate' && charaOf(p.chara).face}{p.name}
        {pub.phase !== 'lobby' ? <span className="sc">{p.score}</span>
          : <span className="muted small">{pub.gameMode === 'fate' ? `問題${p.fates + p.fives}` : pub.gameMode === 'haiku' ? `お題${p.haikus}` : pub.gameMode === 'bluff' || pub.gameMode === 'blend' || pub.gameMode === 'relay' || pub.gameMode === 'raid' ? '' : pub.gameMode === 'bomb' ? `お題${p.fives}` : pub.gameMode === 'bouquet' ? `お題${p.bouquets}` : `お題${pub.gameMode === 'five' ? p.fives : p.topics}`}</span>}
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
  const raid = pub.gameMode === 'raid';
  return <div className="lobby-grid">
    <div className="lobby-left">
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
      {host && (fate || haiku || bluff || bouquet || blend || bomb || relay || raid) && <button className="wide small" style={{ marginTop: 8 }} disabled={pub.players.length >= MAX_PLAYERS} onClick={addBot}>＋ CPUを追加</button>}
      {host && pub.players.some(p => p.editing && p.id !== pub.me) && <p className="muted small" style={{ margin: '6px 0 0' }}>✏️ {pub.players.filter(p => p.editing && p.id !== pub.me).map(p => `${p.name}さん`).join('、')}がお題を編集中です</p>}
      {old.length > 0 && <Notice>⚠ ホスト（{hostVer}）と違う版の人がいます：{old.map(p => `${p.name}さん（${p.version}）`).join('、')}。ページを再読み込みしてもらってください</Notice>}
    </section>
    </div>
    <section className="card lobby-mode">
      <h2>モード</h2>
      {host
        ? <div className="seg wrap">{(Object.entries(GAME_MODES) as [GameMode, string][]).filter(([k]) => DEV || !HIDDEN_MODES.includes(k)).map(([k, label]) => (
            <button key={k} className={pub.gameMode === k ? 'on' : ''} onClick={() => send({ t: 'game', mode: k })}>{label}</button>
          ))}</div>
        : <p style={{ margin: 0, fontWeight: 800 }}>{GAME_MODES[pub.gameMode]}</p>}
      {/* 初めての人が、何をするゲームかを3つで分かるように（全員の画面に出る） */}
      <HowTo mode={pub.gameMode} />
      {raid ? <RaidLobby pub={pub} host={host} /> : relay ? <RelayLobby pub={pub} host={host} /> : bomb ? <BombLobby pub={pub} host={host} /> : blend ? <BlendLobby pub={pub} host={host} /> : bouquet ? <BouquetLobby pub={pub} host={host} /> : bluff ? <BluffLobby pub={pub} host={host} /> : haiku ? <HaikuLobby pub={pub} host={host} /> : fate ? <FateLobby pub={pub} host={host} /> : <PickLobby pub={pub} host={host} />}
      <div style={{ marginTop: 16 }}>
        {host ? <>
          <button className="primary wide" disabled={!!pub.startError} onClick={() => send({ t: 'start' })}>ゲーム開始</button>
          {pub.startError && <p className="muted small">{pub.startError}</p>}
        </> : <p className="muted">ホストの開始を待っています…{pub.startError && <><br /><span className="small">{pub.startError}</span></>}</p>}
      </div>
    </section>
  </div>;
}
