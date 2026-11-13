// お題の設定：モードごとのタブを切り替える枠。中身（一覧と作成画面）は、各モードのフォルダの TopicsEditor にある
import { TitleBar } from '../ui/common';
import { backToRoom, setScreen, TOPIC_TABS, topicTabOf, useStore } from './store';
import { TierList } from '../modes/tier/TopicsEditor';
import { FiveList } from '../modes/five/TopicsEditor';
import { FateList } from '../modes/fate/TopicsEditor';
import { HaikuList } from '../modes/haiku/TopicsEditor';
import { BouquetList } from '../modes/bouquet/TopicsEditor';
import { GAME_MODES } from '../core/types';
import { TopicTools } from './TopicTools';

export function Topics() {
  const saved = useStore(s => s.topicsTab);
  const roomEdit = useStore(s => s.roomEdit);
  const playing = useStore(s => s.pub?.gameMode);
  // タブは、お題を作れるモードだけ（お題を使わないモードまで並べると、どれを編集しているのか分かりにくい）
  const tab = TOPIC_TABS.includes(saved) ? saved : 'tier';
  // 部屋から開いたとき：いま部屋で選ばれているモードと、そのモードが使うお題のタブ
  const now = roomEdit && playing ? playing : null;
  const nowTab = now ? topicTabOf(now) : null;
  return (
    <>
      <TitleBar right={roomEdit
        ? <button className="small primary" onClick={backToRoom}>部屋に戻る</button>
        : <button className="small" onClick={() => setScreen('home')}>← 戻る</button>} />
      <h2 style={{ fontSize: 20, margin: '0 0 12px' }}>お題の設定</h2>
      {now && <div className="nowmode">
        <b>いま部屋で遊ぶのは「{GAME_MODES[now]}」</b>
        <span>{nowTab == null ? 'このモードは、自分で作るお題を使いません（下は、ほかのモード用のお題です）'
          : now === 'bomb' ? '爆弾まわしは、セレクトファイブのお題を使います'
          : now === 'fate' ? '運命の二者択一は、セレクトファイブのお題も問題として使います'
          : tab === nowTab ? 'このモードのお題を開いています' : `下で開いているのは「${GAME_MODES[tab]}」のお題です`}</span>
      </div>}
      {roomEdit && <p className="muted small" style={{ margin: '0 0 10px' }}>部屋に入ったまま編集しています。「部屋に戻る」を押すと、チェックを入れたお題が部屋に反映されます。</p>}
      {/* お題の形がモードごとに違うので、ストックを分ける */}
      <div className="seg wrap" style={{ marginBottom: 12 }}>{TOPIC_TABS.map(k => (
        <button key={k} className={tab === k ? 'on' : ''} onClick={() => useStore.setState({ topicsTab: k })}>{GAME_MODES[k]}{k === nowTab && <span className="nowtag">いま</span>}</button>
      ))}</div>
      {/* 取り込み・書き出しは、お題を作って持ち寄るモードにだけ置く（ハイカー575 は、その場でみんなが書く。ワードブーケは、お題が1行だけ） */}
      {(tab === 'tier' || tab === 'five' || tab === 'fate') && <TopicTools key={tab} mode={tab} />}
      {tab === 'five' ? <FiveList /> : tab === 'fate' ? <FateList /> : tab === 'haiku' ? <HaikuList /> : tab === 'bouquet' ? <BouquetList /> : <TierList />}
    </>
  );
}
