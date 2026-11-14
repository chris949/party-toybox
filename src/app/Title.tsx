// タイトル画面（docs/spec.md の 3.0）。ホームの前に、短く見せる。じゃまにならないよう、出す場面をしぼり、放っておいても進む
import { useEffect } from 'react';
import { motion } from 'motion/react';
import { GAME_MODES, type GameMode } from '../core/types';
import { loadLastRoom, loadTitleDay, markTitleDay } from '../storage/local';
import { TIER_COLORS } from '../ui/common';
import { HOWTO } from './howto';

const AUTO_MS = 3200; // 何もしなくても、この時間でホームへ進む
const today = () => new Date().toDateString();

// タイトル画面を出すか：招待リンクから来た人・切断から戻った人・その日に一度見た人・「動きを減らす」設定の人には出さない。
// 動作確認（?dev）のときも出さない（?title を付けると、いつでも出る）
export function shouldShowTitle(): boolean {
  const q = new URLSearchParams(location.search);
  if (q.has('title')) return true;
  if (q.has('dev') || q.get('room') || loadLastRoom()) return false;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return loadTitleDay() !== today();
}

const LETTERS_1 = [...'パーティ'], LETTERS_2 = [...'トイボックス'];
const pop = (i: number) => ({ initial: { opacity: 0, y: 30, scale: 0.4, rotate: -12 }, animate: { opacity: 1, y: 0, scale: 1, rotate: 0 }, transition: { delay: 0.15 + i * 0.07, type: 'spring' as const, stiffness: 420, damping: 16 } });

export function Title({ onDone }: { onDone(): void }) {
  useEffect(() => {
    markTitleDay(today());
    const id = setTimeout(onDone, AUTO_MS);
    const key = () => onDone();
    window.addEventListener('keydown', key);
    return () => { clearTimeout(id); window.removeEventListener('keydown', key); };
  }, []);
  const modes = Object.keys(GAME_MODES) as GameMode[];
  return (
    <motion.div className="title" role="button" tabIndex={0} aria-label="タイトル画面。タップすると、はじまります" onClick={onDone}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.06 }} transition={{ duration: 0.3 }}>
      <div className="title-bands">{[0, 2, 3, 4, 6].map((c, i) => (
        <motion.span key={c} style={{ background: TIER_COLORS[c] }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: i * 0.06, duration: 0.25 }} />
      ))}</div>
      <h1 className="title-logo" aria-label="パーティトイボックス">
        <span>{LETTERS_1.map((ch, i) => <motion.i key={i} {...pop(i)}>{ch}</motion.i>)}</span>
        <span className="w">{LETTERS_2.map((ch, i) => <motion.i key={i} {...pop(LETTERS_1.length + i)}>{ch}</motion.i>)}</span>
      </h1>
      <motion.p className="title-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>通話でわいわい、{modes.length}つのゲーム</motion.p>
      {/* 9つのゲームの印が、順に飛び出して、ゆっくり弾む */}
      <div className="title-games" aria-hidden>{modes.map((k, i) => (
        <motion.span key={k} initial={{ opacity: 0, y: 40, scale: 0 }} animate={{ opacity: 1, y: [40, -10, 0], scale: 1 }} transition={{ delay: 1.1 + i * 0.08, duration: 0.45 }}>
          <motion.b animate={{ y: [0, -8, 0] }} transition={{ delay: 1.8 + i * 0.12, duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}>{HOWTO[k].icon}</motion.b>
        </motion.span>
      ))}</div>
      <motion.p className="title-tap" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.4, 1] }} transition={{ delay: 1.9, duration: 1.2 }}>タップして はじめる</motion.p>
    </motion.div>
  );
}
