// ダイスレイドの画面：盤面のページ（raid/index.html）を、枠（iframe）の中に開く（このフォルダの README.md の 18.5）。
// 盤面のページは、見た目の決まりがページ全体に掛かる作りなので、同じページには混ぜない。
// 盤面とのやり取りは、raid/src/main.ts の先頭に書いてある
import './styles.css';
import { useEffect, useRef, useState } from 'react';
import { isHost, send, type Pub } from '../../app/store';
import { Sound } from '../../audio/sound';
import { sanitizeRaidAction } from './actions';

export function RaidStage({ pub }: { pub: Pub }) {
  const r = pub.raid!;
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef(r);
  latest.current = r;
  const post = (m: unknown) => frame.current?.contentWindow?.postMessage(m, location.origin);
  const state = () => ({ t: 'state', game: latest.current.game, events: latest.current.events, seq: latest.current.seq });

  // 盤面のページからの連絡：用意ができた／自分の番の操作／ロビーに戻る
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== location.origin || ev.source !== frame.current?.contentWindow) return;
      const m = ev.data as { t?: string; seq?: unknown; action?: unknown };
      if (m?.t === 'ready') {
        post({ t: 'init', mySeat: latest.current.mySeat, host: isHost() });
        post(state());
        setReady(true);
      } else if (m?.t === 'act') {
        const action = sanitizeRaidAction(m.action);
        if (action && Number.isInteger(m.seq)) send({ t: 'raidAct', seq: m.seq as number, action });
      } else if (m?.t === 'lobby' && isHost()) send({ t: 'lobby' });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  // 操作が1つ進むたびに、新しい盤面を渡す
  useEffect(() => { if (ready) post(state()); }, [ready, r.seq]);
  // 盤面のページが自分の音を鳴らすので、こちらの BGM は止めておく
  useEffect(() => { Sound.setQuiet(true); return () => Sound.setQuiet(false); }, []);

  return (
    <div className="raid-frame">
      {!ready && <p className="raid-loading">盤面を読み込んでいます…</p>}
      <iframe ref={frame} title="ダイスレイドの盤面" src={`${import.meta.env.BASE_URL}raid/index.html`} allow="autoplay" />
    </div>
  );
}
