import { useState } from 'react';
import { MAX_OPT, MAX_PLAYERS, MIN_OPT, NAME_MAX, PERFECT_BONUS, MIN_PLAYERS_DEFAULT } from '../core/constants';
import { ROOM_CODE_LEN } from '../net/protocol';
import { Logo, Notice, SoundButton, Version } from '../ui/common';
import { CharaPicker } from '../modes/fate/charas';
import { hostRoom, joinRoom, setChara, setName, setScreen, useStore } from './store';

export function Home() {
  const { name, topics, fives, fates, haikus, bouquets, chara, notice, connecting, lastRoom } = useStore();
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
      <p className="sub">通話でわいわい、8つのゲーム</p>
      <section className="card">
        <label className="field">あなたの名前
          <input type="text" maxLength={NAME_MAX} value={name} placeholder="例）たろう" onChange={e => setName(e.target.value)} />
        </label>
        <div className="field muted small" style={{ margin: '4px 0 6px', fontWeight: 700 }}>キャラクター（「運命の二者択一」で使います）</div>
        <CharaPicker value={chara} onPick={setChara} />
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
          <li>事前に「お題の設定」でお題と選択肢（{MIN_OPT}〜{MAX_OPT}個）を作っておく。いくつでもストックできます。</li>
          <li>{MIN_PLAYERS_DEFAULT}〜{MAX_PLAYERS}人で部屋に集まり、ホストが開始。</li>
          <li>みんなのお題がランダムに1人1つ配られるので、<b>自分の好み</b>で順位をつける。</li>
          <li>メインゲーム：「〇〇さんの『お題』の順位は？」を本人以外が予想。</li>
          <li>答え合わせ。順位が1つ合うごとに1点、全部ピッタリならボーナス+{PERFECT_BONUS}点。</li>
          <li>全員分まわったら終了。最高得点の人の勝ち！</li>
          <li>ロビーでモードを「セレクトファイブ」にすると、正解とダミーが混ざった選択肢から正解を5つ選ぶクイズで遊べます。</li>
          <li>モードを「運命の二者択一」にすると、2択クイズのサバイバルで遊べます。左右に動いて答え、不正解の側は床が抜けて脱落。最後の1人になるまで続きます。</li>
          <li>モードを「爆弾まわし」にすると、いつ爆発するか分からない爆弾を回します。回ってきたら、お題に合う言葉を1つ入れて、誰かに渡してください。</li>
          <li>モードを「まぎれろ！」にすると、同じ見た目のキャラクターが大勢うろうろする舞台で、1体だけ人が動かします。ほかの全員で、どれが人かを当てます。</li>
          <li>モードを「ワードブーケ」にすると、配られた言葉のカードを並べて、お題に合うひとことを作ります。親がいちばん刺さったものを選びます。</li>
          <li>モードを「ブラインドブラフ」にすると、自分のカードだけ見えないトランプ遊びができます。ほかの人のカードは見えるので、通話でだまし合ってください。</li>
          <li>モードを「ハイカー575」にすると、みんなで1文字ずつ書いて回し、五・七・五の句を作って遊べます。できた句は担当者が読み上げて、全員で★を付けます。</li>
        </ol>
      </details>
    </>
  );
}
