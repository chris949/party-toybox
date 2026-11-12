// どの画面でも使う部品
import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Sound } from '../audio/sound';
import { APP_VERSION, COMMIT, closeDialog, useStore } from '../app/store';
import type { PlayerSummary } from '../core/view';

export const TIER_COLORS = ['#ff6f6f', '#ff9f43', '#ffc83d', '#bde05a', '#36c99a', '#4ac3d6', '#4aa6f0'];
export const tierColor = (r: number, n: number) => TIER_COLORS[n <= 1 ? 0 : Math.round((r / (n - 1)) * (TIER_COLORS.length - 1))];

export function Badge({ r, n, hidden }: { r: number; n: number; hidden?: boolean }) {
  return hidden
    ? <span className="badge hidden">{r + 1}</span>
    : <span className="badge" style={{ background: tierColor(r, n) }}>{r + 1}</span>;
}

const SOUND_ICON = { all: '🔊', se: '🔔', off: '🔇' } as const;
const SOUND_LABEL = { all: 'BGM＋効果音', se: '効果音だけ', off: '音なし' } as const;
export function SoundButton() {
  const [mode, setMode] = useState(Sound.mode);
  return (
    <button className="small sound" title={`${SOUND_LABEL[mode]}（押すと切り替え）`} onClick={() => setMode(Sound.cycle())}>
      {SOUND_ICON[mode]}
    </button>
  );
}

export const Version = () => <span className="ver" title={`build ${COMMIT}`}>{APP_VERSION}</span>;

export function Logo() {
  return (
    <div className="logo">
      <div className="bands">{[0, 2, 3, 4, 6].map(i => <span key={i} style={{ background: TIER_COLORS[i] }} />)}</div>
      <h1>パーティ<br /><span className="w">トイボックス</span></h1>
    </div>
  );
}

export function TitleBar({ right }: { right?: ReactNode }) {
  return (
    <div className="bar">
      <h1>パーティ<span className="w">トイボックス</span></h1>
      <div className="row"><SoundButton />{right}</div>
    </div>
  );
}

export const Notice = ({ children }: { children: ReactNode }) => children ? <div className="notice">{children}</div> : null;

// 確認ダイアログ（ブラウザ標準の confirm はアプリ内ブラウザで出ないことがあるため使わない）。外側を押すとキャンセル
export function ConfirmDialog() {
  const dialog = useStore(s => s.dialog);
  if (!dialog) return null;
  return (
    <div className="overlay" onClick={closeDialog}>
      <motion.div className="card dialog" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <p style={{ margin: '0 0 16px', fontWeight: 800 }}>{dialog.msg}</p>
        <div className="row">
          <button className="wide" onClick={closeDialog}>キャンセル</button>
          <button className="primary wide" onClick={() => { closeDialog(); dialog.onOk(); }}>{dialog.okLabel}</button>
        </div>
      </motion.div>
    </div>
  );
}

// 予期しないエラーを画面に出す（テストプレイで報告してもらえるように）
export function ErrorBanner() {
  const error = useStore(s => s.error);
  if (!error) return null;
  return <div id="err" title="タップで閉じる" onClick={() => useStore.setState({ error: null })}>エラーが起きました（タップで閉じる）：{error}</div>;
}

export function Standings({ players, me }: { players: PlayerSummary[]; me: string }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const medal = ['🥇', '🥈', '🥉'];
  let rank = 0;
  return <>{sorted.map((p, i) => {
    if (i === 0 || p.score < sorted[i - 1].score) rank = i;
    return (
      <div className={`rank-row ${rank === 0 ? 'first' : ''}`} key={p.id}>
        <span className="n">{medal[rank] ?? rank + 1}</span>
        <span className="nm">{p.name}{p.id === me ? '（あなた）' : ''}</span>
        <span className="pts">{p.score}点</span>
      </div>
    );
  })}</>;
}
