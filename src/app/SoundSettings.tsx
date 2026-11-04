// 音の設定：場面ごとに自分の曲を選ぶ、音量を調整する。選んだ曲はこの端末にだけ保存し、他の人には送らない
import { useEffect, useRef, useState } from 'react';
import { hasCustom, ready, SCENES, Sound, sourceOf, type Scene } from '../audio/sound';
import { Notice, TitleBar } from '../ui/common';
import { setScreen } from './store';

const MAX_MB = 30;

export function SoundSettings() {
  const [, refresh] = useState(0);
  const [notice, setNotice] = useState('');
  const [trying, setTrying] = useState<Scene | null>(null);
  const inputs = useRef<Partial<Record<Scene, HTMLInputElement | null>>>({});
  const rerender = () => refresh(x => x + 1);
  useEffect(() => { void ready.then(rerender); return () => Sound.setScene('lobby'); }, []);

  const pick = async (s: Scene, file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) { setNotice(`ファイルが大きすぎます（${MAX_MB}MBまで）`); return; }
    try {
      await Sound.setCustom(s, file);
      setNotice('');
    } catch {
      setNotice('この端末では曲を保存できませんでした（プライベートブラウズなどでは使えません）');
    }
    rerender();
  };
  // 試聴：その場面の曲に切り替える（もう一度押すと止めてロビーの曲に戻る）
  const tryScene = (s: Scene) => {
    Sound.ensure();
    const next = trying === s ? null : s;
    setTrying(next);
    Sound.setScene(next ?? 'lobby');
  };

  return (
    <>
      <TitleBar right={<button className="small" onClick={() => setScreen('home')}>← 戻る</button>} />
      <h2 style={{ fontSize: 20, margin: '0 0 12px' }}>音の設定</h2>
      <section className="card">
        <h2>音量</h2>
        {(['bgm', 'se'] as const).map(k => (
          <label className="field" key={k}>{k === 'bgm' ? 'BGM' : '効果音'}（{Math.round(Sound.volumes[k] * 100)}%）
            <input type="range" min={0} max={100} value={Math.round(Sound.volumes[k] * 100)} style={{ width: '100%' }}
              onChange={e => { Sound.setVolume(k, Number(e.target.value) / 100); rerender(); }}
              onPointerUp={() => { if (k === 'se') Sound.play('pop'); }} />
          </label>
        ))}
        <p className="muted small" style={{ margin: 0 }}>右上の 🔊 で「BGM＋効果音 → 効果音だけ → 音なし」も切り替えられます。今は「{Sound.mode === 'all' ? 'BGM＋効果音' : Sound.mode === 'se' ? '効果音だけ' : '音なし'}」です。</p>
      </section>
      <section className="card">
        <h2>場面ごとのBGM</h2>
        <p className="muted small" style={{ margin: '0 0 8px' }}>自分の端末の音楽ファイルを選ぶと、その場面ではその曲が流れます（あなたの画面だけ。他の人には送りません）。</p>
        {(Object.entries(SCENES) as [Scene, string][]).map(([s, label]) => (
          <div className="topic" key={s} style={{ flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{label}</b>
              <div className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sourceOf(s)}</div>
            </div>
            <button className="small" onClick={() => tryScene(s)}>{trying === s ? '■ 止める' : '▶ 試聴'}</button>
            <button className="small" onClick={() => inputs.current[s]?.click()}>曲を選ぶ</button>
            {hasCustom(s) && <button className="small danger" onClick={async () => { await Sound.clearCustom(s); rerender(); }}>戻す</button>}
            <input type="file" accept="audio/*" hidden ref={el => { inputs.current[s] = el; }}
              onChange={e => { void pick(s, e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        ))}
        <Notice>{notice}</Notice>
      </section>
    </>
  );
}
