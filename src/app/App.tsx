import { useEffect } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { ConfirmDialog, ErrorBanner } from '../ui/common';
import { Home } from './Home';
import { Room } from './Room';
import { useStore } from './store';
import { Topics } from './Topics';
import { Edit } from '../modes/tier/TopicsEditor';
import { EditFive } from '../modes/five/TopicsEditor';
import { EditFate } from '../modes/fate/TopicsEditor';
import { SoundSettings } from './SoundSettings';
import { Sound, type Scene } from '../audio/sound';

export function App() {
  const screen = useStore(s => s.screen);
  const pub = useStore(s => s.pub);
  const inRoom = screen === 'room' && pub;
  // 画面（フェーズ）が変わったときだけ入場の動きを付ける。同じ画面の更新では動かさない
  // 運命の二者択一は、出題から発表までキャラクターが同じ場所に居続けるので、1ゲームを通して同じ画面として扱う
  const key = !inRoom ? screen : pub.game === 'fate' && pub.phase !== 'result' ? `room-fate-${pub.gameNo}` : `room-${pub.phase}-${pub.round}`;
  useEffect(() => { window.scrollTo(0, 0); }, [key]);
  // 場面ごとにBGMを切り替える（音の設定の画面では、試聴のために切り替えない）
  const scene: Scene | null = screen === 'sound' ? null : !inRoom || pub.phase === 'lobby' ? 'lobby'
    : pub.phase === 'recite' || pub.phase === 'show' ? 'reveal' : pub.phase === 'reveal' || pub.phase === 'result' ? pub.phase : 'pick'; // 運命の二者択一は、出題も発表も同じ曲のまま（数秒ごとに曲が変わると落ち着かない）
  useEffect(() => { if (scene) Sound.setScene(scene); }, [scene]);
  // 端末で「動きを減らす」設定をしている人には、揺れや回転を出さない
  return <MotionConfig reducedMotion="user">
    <motion.div key={key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      {inRoom ? <Room /> : screen === 'topics' ? <Topics /> : screen === 'edit' ? <Edit /> : screen === 'editFive' ? <EditFive /> : screen === 'editFate' ? <EditFate /> : screen === 'sound' ? <SoundSettings /> : <Home />}
    </motion.div>
    <ConfirmDialog />
    <ErrorBanner />
  </MotionConfig>;
}
