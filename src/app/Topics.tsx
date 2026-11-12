// お題の設定：モードごとのタブを切り替える枠。中身（一覧と作成画面）は、各モードのフォルダの TopicsEditor にある
import { TitleBar } from '../ui/common';
import { backToRoom, setScreen, useStore } from './store';
import { TierList } from '../modes/tier/TopicsEditor';
import { FiveList } from '../modes/five/TopicsEditor';
import { FateList } from '../modes/fate/TopicsEditor';
import { HaikuList } from '../modes/haiku/TopicsEditor';
import { BouquetList } from '../modes/bouquet/TopicsEditor';
import { GAME_MODES, type GameMode } from '../core/types';

export function Topics() {
  const tab = useStore(s => s.topicsTab);
  const roomEdit = useStore(s => s.roomEdit);
  return (
    <>
      <TitleBar right={roomEdit
        ? <button className="small primary" onClick={backToRoom}>部屋に戻る</button>
        : <button className="small" onClick={() => setScreen('home')}>← 戻る</button>} />
      <h2 style={{ fontSize: 20, margin: '0 0 12px' }}>お題の設定</h2>
      {roomEdit && <p className="muted small" style={{ margin: '0 0 10px' }}>部屋に入ったまま編集しています。「部屋に戻る」を押すと、チェックを入れたお題が部屋に反映されます。</p>}
      {/* お題の形がモードごとに違うので、ストックを分ける */}
      <div className="seg wrap" style={{ marginBottom: 12 }}>{(Object.entries(GAME_MODES) as [GameMode, string][]).map(([k, label]) => (
        <button key={k} className={tab === k ? 'on' : ''} onClick={() => useStore.setState({ topicsTab: k })}>{label}</button>
      ))}</div>
      {tab === 'five' ? <FiveList /> : tab === 'fate' ? <FateList /> : tab === 'haiku' ? <HaikuList /> : tab === 'bouquet' ? <BouquetList /> : tab === 'tier' ? <TierList />
        : <section className="card"><p className="muted" style={{ margin: 0 }}>「{GAME_MODES[tab]}」は、お題を使わないモードです。</p></section>}
    </>
  );
}
