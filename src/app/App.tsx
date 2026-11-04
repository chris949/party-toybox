import { useEffect } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { ConfirmDialog, ErrorBanner } from '../ui/common';
import { Home } from './Home';
import { Room } from './Room';
import { useStore } from './store';
import { Edit, Topics } from './Topics';
import { SoundSettings } from './SoundSettings';
import { Sound, type Scene } from '../audio/sound';

export function App() {
  const screen = useStore(s => s.screen);
  const pub = useStore(s => s.pub);
  const inRoom = screen === 'room' && pub;
  // 画面（フェーズ）が変わったときだけ入場の動きを付ける。同じ画面の更新では動かさない
  const key = inRoom ? `room-${pub.phase}-${pub.round}` : screen;
  useEffect(() => { window.scrollTo(0, 0); }, [key]);
  // 場面ごとにBGMを切り替える（音の設定の画面では、試聴のために切り替えない）
  const scene: Scene | null = screen === 'sound' ? null : !inRoom || pub.phase === 'lobby' ? 'lobby'
    : pub.phase === 'ranking' || pub.phase === 'guess' ? 'pick' : pub.phase;
  useEffect(() => { if (scene) Sound.setScene(scene); }, [scene]);
  // 端末で「動きを減らす」設定をしている人には、揺れや回転を出さない
  return <MotionConfig reducedMotion="user">
    <motion.div key={key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      {inRoom ? <Room /> : screen === 'topics' ? <Topics /> : screen === 'edit' ? <Edit /> : screen === 'sound' ? <SoundSettings /> : <Home />}
    </motion.div>
    <ConfirmDialog />
    <ErrorBanner />
  </MotionConfig>;
}
