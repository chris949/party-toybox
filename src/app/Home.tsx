import { useState } from 'react';
import { MAX_PLAYERS, NAME_MAX, MIN_PLAYERS_DEFAULT } from '../core/constants';
import { ROOM_CODE_LEN } from '../net/protocol';
import { Logo, Notice, SoundButton, Version } from '../ui/common';
import { GAME_MODES, type GameMode } from '../core/types';
import { APP_VERSION, hostRoom, joinRoom, setName, setScreen, useStore } from './store';
import { HowTo } from './howto';
import { feedbackUrl } from './feedback';

export function Home() {
  const { name, topics, fives, fates, haikus, bouquets, notice, connecting, lastRoom } = useStore();
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room') || lastRoom);
  const count = topics.filter(t => t.bring).length + fives.filter(t => t.bring).length + fates.filter(t => t.bring).length + haikus.filter(t => t.bring).length + bouquets.filter(t => t.bring).length;
  const prefilled = !!(new URLSearchParams(location.search).get('room') || lastRoom);
  const codeInput = (
    <input type="text" className="code-input" maxLength={ROOM_CODE_LEN} placeholder="部屋コード" value={code}
      onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) joinRoom(code); }} />
  );
  return (
    <>
      <div className="top-right"><Version /><SoundButton /></div>
      <Logo />
      <p className="sub">通話でわいわい、9つのゲーム</p>
      <section className="card">
        <label className="field">あなたの名前
          <input type="text" maxLength={NAME_MAX} value={name} placeholder="例）たろう" onChange={e => setName(e.target.value)} />
        </label>
      </section>
      <section className="card">
        <h2>お題 <span className="count">持っていく {count}</span></h2>
        <p className="muted small" style={{ margin: '0 0 10px' }}>ストック ティアリスト {topics.length}件・セレクトファイブ {fives.length}件・運命の二者択一 {fates.length}件・ハイカー575 {haikus.length}件・ワードブーケ {bouquets.length}件</p>
        <button className="wide" onClick={() => setScreen('topics')}>お題の設定</button>
      </section>
      <section className="card">
        <h2>音</h2>
        <p className="muted small" style={{ margin: '0 0 10px' }}>BGM・効果音の音量や、場面ごとの曲を変えられます</p>
        <button className="wide" onClick={() => setScreen('sound')}>音の設定</button>
      </section>
      <section className="card">
        <h2>あそぶ</h2>
        {/* 部屋コードが入っているとき（招待リンク・切断から戻った）は「参加」が主役 */}
        {prefilled ? (
          <div className="stack">
            {codeInput}
            <button className="primary wide" disabled={connecting} onClick={() => joinRoom(code)}>この部屋に参加する</button>
            <button className="ghost wide" disabled={connecting} onClick={hostRoom}>自分で部屋を作る</button>
          </div>
        ) : (
          <>
            <button className="primary wide" disabled={connecting} onClick={hostRoom}>部屋を作る（ホスト）</button>
            <p className="muted small" style={{ margin: '14px 0 6px' }}>部屋コードをもらった人はこちら</p>
            <div className="row">{codeInput}<button disabled={connecting} onClick={() => joinRoom(code)}>参加</button></div>
          </>
        )}
        {connecting && <p className="muted">接続中…</p>}
        <Notice>{notice}</Notice>
      </section>
      <details className="card">
        <summary>あそびかた</summary>
        <ol className="rules">
          <li>通話をつなぎ、1人が「部屋を作る」。出てきた部屋コードか招待リンクを、みんなに伝えます（{MIN_PLAYERS_DEFAULT}〜{MAX_PLAYERS}人）。</li>
          <li>ホストが、ロビーで遊ぶゲーム（モード）を選んで「ゲーム開始」。人数が足りないときは、CPU を足せるゲームもあります。</li>
          <li>ゲームによっては、みんなが作った「お題」を使います。「お題の設定」で作って、持っていくものにチェックを入れてください（作らなくても、サンプルで遊べます）。</li>
        </ol>
        <h3 className="howto-title">ゲームごとのあそびかた</h3>
        {(Object.keys(GAME_MODES) as GameMode[]).map(k => <div key={k} className="howto-item"><b>{GAME_MODES[k]}</b><HowTo mode={k} compact /></div>)}
      </details>
      <section className="card">
        <button className="wide" onClick={() => window.open(feedbackUrl(APP_VERSION), '_blank', 'noopener')}>💬 意見・不具合を送る</button>
        <p className="muted small" style={{ margin: '8px 0 0' }}>GitHub のページが開きます（GitHub のアカウントが要ります）。送った内容は誰でも読めるように公開されるので、名前や連絡先は書かないでください。</p>
      </section>
    </>
  );
}
