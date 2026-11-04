// BGMの試聴ページ（ゲームに組み込む前に、曲の方向性を確かめるため）
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/m-plus-rounded-1c/400.css';
import '@fontsource/m-plus-rounded-1c/800.css';
import './styles/app.css';
import { SnesPlayer } from './audio/snes/engine';
import { SONGS } from './audio/snes/songs';
import type { Scene } from './audio/sound';
import { Logo } from './ui/common';

const LABEL: Record<Scene, string> = { lobby: 'ロビー・ホーム', pick: '並び替え（準備・予想）', reveal: '答え合わせ', result: '最終結果' };
const MOOD: Record<Scene, string> = {
  lobby: 'のんびりした町の曲。待ち時間にずっと流れていても疲れない',
  pick: '少し急かされる、軽快でワクワクする曲',
  reveal: 'ドキドキする溜めの曲。声や効果音を邪魔しないよう、メロディは控えめ',
  result: 'ファンファーレから始まる、明るいエンディング',
};

function Preview() {
  const ctx = useRef<AudioContext | null>(null);
  const player = useRef<SnesPlayer | null>(null);
  const [now, setNow] = useState<Scene | null>(null);
  const [vol, setVol] = useState(0.6);
  const play = (s: Scene) => {
    ctx.current ??= new AudioContext();
    void ctx.current.resume();
    player.current ??= new SnesPlayer(ctx.current);
    if (now === s) { player.current.stop(0.5); setNow(null); return; }
    player.current.play(SONGS[s], vol, 0.3);
    setNow(s);
  };
  return (
    <>
      <Logo />
      <p className="sub">BGM試聴（スーファミ風・オリジナル曲）</p>
      <section className="card">
        <label className="field">音量（{Math.round(vol * 100)}%）
          <input type="range" min={0} max={100} value={Math.round(vol * 100)} style={{ width: '100%' }}
            onChange={e => { const v = Number(e.target.value) / 100; setVol(v); if (now) player.current?.setVolume(v); }} />
        </label>
      </section>
      {(Object.keys(SONGS) as Scene[]).map(s => (
        <section className="card" key={s}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <span className="status">{LABEL[s]}</span>
              <div className="qtitle" style={{ fontSize: 20 }}>「{SONGS[s].title}」</div>
            </div>
            <button className={now === s ? '' : 'primary'} style={{ minWidth: 96 }} onClick={() => play(s)}>{now === s ? '■ 止める' : '▶ 再生'}</button>
          </div>
          <p className="muted small" style={{ margin: '6px 0 0' }}>{MOOD[s]}（テンポ {SONGS[s].bpm}）</p>
        </section>
      ))}
    </>
  );
}

createRoot(document.getElementById('app')!).render(<Preview />);
