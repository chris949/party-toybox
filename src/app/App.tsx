import { useEffect } from 'react';
import { motion } from 'motion/react';
import { ConfirmDialog, ErrorBanner } from '../ui/common';
import { Home } from './Home';
import { Room } from './Room';
import { useStore } from './store';
import { Edit, Topics } from './Topics';

export function App() {
  const screen = useStore(s => s.screen);
  const pub = useStore(s => s.pub);
  const inRoom = screen === 'room' && pub;
  // 画面（フェーズ）が変わったときだけ入場の動きを付ける。同じ画面の更新では動かさない
  const key = inRoom ? `room-${pub.phase}-${pub.round}` : screen;
  useEffect(() => { window.scrollTo(0, 0); }, [key]);
  return <>
    <motion.div key={key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      {inRoom ? <Room /> : screen === 'topics' ? <Topics /> : screen === 'edit' ? <Edit /> : <Home />}
    </motion.div>
    <ConfirmDialog />
    <ErrorBanner />
  </>;
}
