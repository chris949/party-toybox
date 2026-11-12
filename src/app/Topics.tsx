// お題の設定：モードごとのタブを切り替える枠。中身（一覧と作成画面）は、各モードのフォルダの TopicsEditor にある
import { TitleBar } from '../ui/common';
import { backToRoom, setScreen, useStore } from './store';
import { TierList } from '../modes/tier/TopicsEditor';
import { FiveList } from '../modes/five/TopicsEditor';
import { FateList } from '../modes/fate/TopicsEditor';
import { HaikuList } from '../modes/haiku/TopicsEditor';
import { GAME_MODES, type GameMode } from '../core/types';
import { TopicTools } from './TopicTools';

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
      {/* ハイカー575 は、その場でみんなが書くので、取り込み・書き出しは置かない */}
      {tab !== 'haiku' && <TopicTools key={tab} mode={tab} />}
      {tab === 'five' ? <FiveList /> : tab === 'fate' ? <FateList /> : tab === 'haiku' ? <HaikuList /> : <TierList />}
    </>
  );
}
