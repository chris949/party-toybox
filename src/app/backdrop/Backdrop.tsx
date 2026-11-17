// PC 幅のタイトル・ホームの後ろに、3Dの背景を出す（docs/spec.md の 3.0a）。
// 3D の部品（three.js と、背景の中身）は、ここで初めて読み込む。スマホ幅・「動きを減らす」設定・画質「なし」では、読み込まない
import { useEffect, useRef, useState } from 'react';
import { loadBackdrop, saveBackdrop, type BackdropQuality } from '../../storage/local';
import type { BackdropScene, Quality } from './scene';

const WIDE = '(min-width: 1000px)';
const LEVELS: { key: BackdropQuality; label: string }[] = [{ key: 'high', label: '高' }, { key: 'mid', label: '中' }, { key: 'low', label: '低' }, { key: 'off', label: 'なし' }];
// 読み込みの進み具合に合わせて出す、ひとこと
const STEPS = ['おもちゃ箱を開けています…', 'おもちゃを並べています…', '明かりをつけています…'];
const down = (q: Quality): BackdropQuality => q === 'high' ? 'mid' : 'low';

function useWide() {
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches);
  useEffect(() => {
    const m = matchMedia(WIDE), on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

// sharp = くっきり見せる（タイトル画面）。false のときは、手前の文字が読めるように、ぼかす（ホーム）
// onReady = 背景が出た／出さないと決まった（タイトル画面が、待つのをやめる合図）
export function Backdrop({ sharp, onReady }: { sharp: boolean; onReady?(): void }) {
  const wide = useWide();
  const [quality, setQuality] = useState(loadBackdrop);
  const [step, setStep] = useState(0);      // 読み込みの段階（0〜2）
  const [ready, setReady] = useState(false); // 最初の1枚を描き終えた
  const [failed, setFailed] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const on = wide && quality !== 'off' && !failed;
  const pick = (q: BackdropQuality) => { saveBackdrop(q); setQuality(q); };

  useEffect(() => {
    if (!on) return;
    let scene: BackdropScene | null = null, gone = false;
    setReady(false); setStep(0);
    import('./scene').then(m => {
      if (gone || !canvas.current) return;
      setStep(1);
      // 画面を1回描かせてから作る（「並べています」の文字を、先に見せる）
      requestAnimationFrame(() => {
        if (gone || !canvas.current) return;
        try {
          scene = new m.BackdropScene(canvas.current, quality as Quality, {
            onFirstFrame: () => { if (!gone) setReady(true); },
            // 重い端末では、画質を1段下げる（選んだ設定として覚える。次からは、最初から軽い）
            onSlow: () => { if (!gone && quality !== 'low') pick(down(quality as Quality)); },
          });
          setStep(2);
        } catch { setFailed(true); } // 3D（WebGL）が使えない端末では、いままでの背景のまま
      });
    }).catch(() => setFailed(true));
    return () => { gone = true; scene?.dispose(); };
  }, [on, quality]);

  // 背景が出ている間は、手前の画面の見た目を合わせる（タイトルの地を透かす・カードを少し透かす）
  useEffect(() => {
    document.body.classList.toggle('has-backdrop', on && ready);
    return () => document.body.classList.remove('has-backdrop');
  }, [on, ready]);

  const settled = !on || ready;
  useEffect(() => { if (settled) onReady?.(); }, [settled]);

  if (!wide) return null;
  return <>
    {on && <div className={`backdrop${sharp ? '' : ' soft'}${ready ? ' ready' : ''} q-${quality}`} aria-hidden><canvas ref={canvas} /></div>}
    {on && !ready && <div className="backdrop-load" role="status">
      <div className="backdrop-bar"><span style={{ width: `${[25, 60, 90][step]}%` }} /></div>
      <small>{STEPS[step]}</small>
    </div>}
    {!sharp && <div className="backdrop-quality" role="group" aria-label="背景の画質">
      <small>背景</small>
      {LEVELS.map(l => <button key={l.key} className={quality === l.key ? 'on' : ''} aria-pressed={quality === l.key} onClick={() => pick(l.key)}>{l.label}</button>)}
    </div>}
  </>;
}
