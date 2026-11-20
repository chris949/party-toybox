// お題の設定：モードごとのタブを切り替える枠。中身（一覧と作成画面）は、各モードのフォルダの TopicsEditor にある
import { TitleBar } from '../ui/common';
import { backToRoom, setScreen, TOPIC_TABS, topicTabOf, useStore } from './store';
import { TierList } from '../modes/tier/TopicsEditor';
import { FiveList } from '../modes/five/TopicsEditor';
import { FateList } from '../modes/fate/TopicsEditor';
import { HaikuList } from '../modes/haiku/TopicsEditor';
import { BouquetList } from '../modes/bouquet/TopicsEditor';
import { BlendLinesList } from '../modes/blend/TopicsEditor';
import { GAME_MODES, type GameMode } from '../core/types';
import { TopicTools } from './TopicTools';

export function Topics() {
  const saved = useStore(s => s.topicsTab);
  const roomEdit = useStore(s => s.roomEdit);
  const playing = useStore(s => s.pub?.gameMode);
  // モードごとの「持っていく数」（左の一覧に出す。どのモードに何を用意したかが、一目で分かるように）
  // （1つずつ取り出す。まとめて新しい入れ物で返すと、画面の作り直しが止まらなくなる）
  const tier = useStore(s => s.topics), five = useStore(s => s.fives), fate = useStore(s => s.fates), haiku = useStore(s => s.haikus), bouquet = useStore(s => s.bouquets);
  const blendLines = useStore(s => s.blendLines);
  const brought = { tier, five, fate, haiku, bouquet };
  // まぎれろ！のセリフは、入れたものをすべて持っていく
  const count = (k: GameMode) => k === 'blend' ? blendLines.length : (brought as Partial<Record<GameMode, { bring: boolean }[]>>)[k]?.filter(t => t.bring).length ?? 0;
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
          : now === 'blend' ? 'まぎれろ！は、キャラクターがしゃべるセリフだけ、持ち寄れます'
          : tab === nowTab ? 'このモードのお題を開いています' : `下で開いているのは「${GAME_MODES[tab]}」のお題です`}</span>
      </div>}
      {roomEdit && <p className="muted small" style={{ margin: '0 0 10px' }}>部屋に入ったまま編集しています。「部屋に戻る」を押すと、チェックを入れたお題が部屋に反映されます。</p>}
      {/* お題の形がモードごとに違うので、ストックを分ける。スマホ幅は上にタブ、PC 幅は左にモードの一覧（docs/spec.md の 3.2） */}
      <div className="topics-grid">
      <nav className="seg wrap topics-nav" aria-label="モード">{TOPIC_TABS.map(k => (
        <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k} onClick={() => useStore.setState({ topicsTab: k })}>
          <span>{GAME_MODES[k]}{k === nowTab && <span className="nowtag">いま</span>}</span>
          <span className="navcount" title="持っていく数">{count(k)}</span>
        </button>
      ))}</nav>
      <div className="topics-main">
      {/* AIに頼む・取り込み・書き出しは、お題を作れるモードのすべてに置く（docs/spec.md の 3.3.1） */}
      <TopicTools key={tab} mode={tab === 'blend' ? 'blendLines' : tab as 'tier' | 'five' | 'fate' | 'haiku' | 'bouquet'} />
      {tab === 'five' ? <FiveList /> : tab === 'fate' ? <FateList /> : tab === 'haiku' ? <HaikuList /> : tab === 'bouquet' ? <BouquetList /> : tab === 'blend' ? <BlendLinesList /> : <TierList />}
      </div>
      </div>
    </>
  );
}
