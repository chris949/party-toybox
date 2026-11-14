import { useState } from 'react';
import { MAX_PLAYERS, NAME_MAX, MIN_PLAYERS_DEFAULT } from '../core/constants';
import { ROOM_CODE_LEN } from '../net/protocol';
import { motion } from 'motion/react';
import { Logo, Notice, SoundButton, TitleBar, Version } from '../ui/common';
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
  // メニューの項目は、順に現れる（端末で「動きを減らす」にしている人には、動かさない）
  const item = (i: number) => ({ initial: { opacity: 0, x: -14 }, animate: { opacity: 1, x: 0 }, transition: { delay: 0.08 + i * 0.07, duration: 0.25 } });
  return (
    <>
      <div className="top-right"><Version /><SoundButton /></div>
      <Logo />
      <p className="sub">通話でわいわい、9つのゲーム</p>
      <div className="home-grid">
        {/* 主役：名前を入れて、部屋を作るか、参加する */}
        <section className="card home-play">
          <h2>あそぶ</h2>
          <label className="field">あなたの名前
            <input type="text" maxLength={NAME_MAX} value={name} placeholder="例）たろう" onChange={e => setName(e.target.value)} />
          </label>
          {/* 部屋コードが入っているとき（招待リンク・切断から戻った）は「参加」が主役 */}
          {prefilled ? (
            <div className="stack" style={{ marginTop: 12 }}>
              {codeInput}
              <button className="primary wide" disabled={connecting} onClick={() => joinRoom(code)}>この部屋に参加する</button>
              <button className="ghost wide" disabled={connecting} onClick={hostRoom}>自分で部屋を作る</button>
            </div>
          ) : (
            <>
              <button className="primary wide" style={{ marginTop: 12 }} disabled={connecting} onClick={hostRoom}>部屋を作る（ホスト）</button>
              <p className="muted small" style={{ margin: '14px 0 6px' }}>部屋コードをもらった人はこちら</p>
              <div className="row">{codeInput}<button disabled={connecting} onClick={() => joinRoom(code)}>参加</button></div>
            </>
          )}
          {connecting && <p className="muted">接続中…</p>}
          <Notice>{notice}</Notice>
        </section>
        {/* メニュー：選ぶと、それぞれの画面へ移る */}
        <nav className="menu" aria-label="メニュー">
          <motion.button className="menu-item" {...item(0)} onClick={() => setScreen('topics')}>
            <span className="menu-icon" aria-hidden>🗂️</span>
            <span className="menu-text"><b>お題の設定</b><small>持っていく {count}件（ゲームで使うお題を作る・選ぶ）</small></span>
            <span className="menu-go" aria-hidden>›</span>
          </motion.button>
          <motion.button className="menu-item" {...item(1)} onClick={() => setScreen('howto')}>
            <span className="menu-icon" aria-hidden>📖</span>
            <span className="menu-text"><b>あそびかた</b><small>9つのゲームのルールと、部屋の集まり方</small></span>
            <span className="menu-go" aria-hidden>›</span>
          </motion.button>
          <motion.button className="menu-item" {...item(2)} onClick={() => setScreen('sound')}>
            <span className="menu-icon" aria-hidden>🎵</span>
            <span className="menu-text"><b>音の設定</b><small>BGM・効果音の音量、場面ごとの曲</small></span>
            <span className="menu-go" aria-hidden>›</span>
          </motion.button>
          <motion.button className="menu-item" {...item(3)} onClick={() => window.open(feedbackUrl(APP_VERSION), '_blank', 'noopener')}>
            <span className="menu-icon" aria-hidden>💬</span>
            <span className="menu-text"><b>意見・不具合を送る</b><small>GitHub のページが開きます（アカウントが要ります。内容は公開されます）</small></span>
            <span className="menu-go" aria-hidden>↗</span>
          </motion.button>
        </nav>
      </div>
    </>
  );
}

// あそびかた：部屋の集まり方と、ゲームごとの3つの手順（ホームのメニューから開く）
export function HowToScreen() {
  return (
    <>
      <TitleBar right={<button className="small" onClick={() => setScreen('home')}>← 戻る</button>} />
      <h2 style={{ fontSize: 20, margin: '0 0 12px' }}>あそびかた</h2>
      <section className="card">
        <h2>集まり方</h2>
        <ol className="rules">
          <li>通話をつなぎ、1人が「部屋を作る」。出てきた部屋コードか招待リンクを、みんなに伝えます（{MIN_PLAYERS_DEFAULT}〜{MAX_PLAYERS}人）。</li>
          <li>ホストが、ロビーで遊ぶゲーム（モード）を選んで「ゲーム開始」。人数が足りないときは、CPU を足せるゲームもあります。</li>
          <li>ゲームによっては、みんなが作った「お題」を使います。「お題の設定」で作って、持っていくものにチェックを入れてください（作らなくても、サンプルで遊べます）。</li>
        </ol>
      </section>
      <div className="howto-list">{(Object.keys(GAME_MODES) as GameMode[]).map(k => (
        <section className="card" key={k}><h2>{GAME_MODES[k]}</h2><HowTo mode={k} compact /></section>
      ))}</div>
    </>
  );
}
