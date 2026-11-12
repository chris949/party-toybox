// 画面の状態と操作。通信（ホスト／参加者）とつなぎ、受け取った状態を画面に渡す
import { create } from 'zustand';
import { Sound } from '../audio/sound';
import { MIN_PLAYERS_DEFAULT, MIN_PLAYERS_DEV } from '../core/constants';
import { FIVE_PICK } from '../modes/five/topics';
import type { Action, GameMode } from '../core/types';
import type { Side } from '../modes/fate/rules';
import type { PlayerView } from '../core/view';
import { startGuest, type GuestOptions, type GuestSession } from '../net/guest';
import { startHost, type HostSession } from '../net/host';
import { ROOM_CODE_LEN } from '../net/protocol';
import { PHRASE_MAX } from '../modes/bouquet/words';
import type { Stamp } from '../modes/relay/stamps';
import {
  broughtFates, broughtFives, broughtBouquets, broughtHaikus, broughtTopics, loadBouquets, saveBouquets, type StoredBouquet, loadChara, loadFates, loadHaikus, saveHaikus, type StoredHaiku, loadFives, loadLastRoom, loadName, loadTopics, myId, myKey,
  saveChara, saveFates, saveFives, saveLastRoom, saveName, saveTopics,
  type StoredFate, type StoredFive, type StoredTopic,
} from '../storage/local';
import { playStateEffects } from './effects';
import { playStateSounds } from './sounds';

export const APP_VERSION = __APP_VERSION__;
export const COMMIT = __COMMIT__;
export const DEV = new URLSearchParams(location.search).has('dev'); // ?dev で最少2人から遊べる（動作確認用）

export type Screen = 'home' | 'topics' | 'edit' | 'editFive' | 'editFate' | 'sound' | 'room';
// 受け取った状態。締め切りは自分の時計に直して持つ
export type Pub = PlayerView & { localDeadline: number };
export interface Editing { id: string | null; title: string; options: string[]; count: number }
export interface EditingFive { id: string | null; title: string; answers: string[]; dummies: string[]; size: number; dummy: number | null }
export interface EditingFate { id: string | null; text: string; right: string; wrong: string }
export interface Dialog { msg: string; okLabel: string; onOk(): void }
interface Pending { msg: Action; key: string; tries: number }

interface State {
  screen: Screen;
  roomEdit: boolean; // 部屋に入ったまま、お題の設定を開いている（v0.16）
  notice: string;
  connecting: boolean;
  reconnecting: boolean;
  pub: Pub | null;
  pending: Pending | null;
  dialog: Dialog | null;
  editing: Editing | null;
  editingFive: EditingFive | null;
  editingFate: EditingFate | null;
  topicsTab: GameMode;
  error: string | null;
  name: string;
  topics: StoredTopic[];
  fives: StoredFive[];
  fates: StoredFate[];
  haikus: StoredHaiku[];
  bouquets: StoredBouquet[];
  bouquetDraft: { key: string; tokens: number[] }; // ワードブーケで並べている途中の文（0以上 = 手札の番号、負の数 = 助詞）
  relayDraft: { key: string; stamps: Stamp[]; text: string }; // スタンプ伝言で作っている途中の絵と答え
  chara: number; // 運命の二者択一で使うキャラクターの番号
  lastRoom: string;
  picker: { key: string; slots: (number | null)[] }; // slots[順位] = 選択肢の番号（空きは null）
  fivePick: { key: string; sel: number[] };          // セレクトファイブで選んでいる選択肢の番号
}

let session: HostSession | GuestSession | null = null;
let guestOpts: GuestOptions | null = null; // 再接続のときに送り直す参加の情報（お題を送り直したら更新する）
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<State>(() => ({
  screen: 'home', roomEdit: false, notice: '', connecting: false, reconnecting: false, pub: null, pending: null,
  dialog: null, editing: null, editingFive: null, editingFate: null, topicsTab: 'tier', error: null,
  name: loadName(), topics: loadTopics(), fives: loadFives(), fates: loadFates(), haikus: loadHaikus(), bouquets: loadBouquets(), bouquetDraft: { key: '', tokens: [] }, relayDraft: { key: '', stamps: [], text: '' }, chara: loadChara(), lastRoom: loadLastRoom(),
  picker: { key: '', slots: [] }, fivePick: { key: '', sel: [] },
}));
const set = useStore.setState;
const get = useStore.getState;

const turnKey = (v: { phase: string; gameNo: number; round: number }) => `${v.phase}-${v.gameNo}-${v.round}`;
export const isHost = () => !!session?.isHost;

// ===== 受け取った状態 =====
function setPub(view: PlayerView, rejoined = false) {
  const prev = get().pub;
  const next: Pub = { ...view, localDeadline: view.timeLeft != null ? Date.now() + view.timeLeft : 0 };
  let pending = get().pending;
  if (pending) {
    const moved = pending.key !== turnKey(next);
    if (moved || (pending.msg.t === 'rank' && next.myRank) || (pending.msg.t === 'guess' && next.myGuess) || (pending.msg.t === 'five' && next.five?.myPicks) || (pending.msg.t === 'kana' && next.haiku?.myDraft) || (pending.msg.t === 'bet' && next.bluff?.myBet != null) || (pending.msg.t === 'phrase' && next.bouquet?.myPhrase != null) || ((pending.msg.t === 'relayDraw' || pending.msg.t === 'relayGuess') && next.relay?.submitted)) {
      pending = null;
      if (pendingTimer) clearTimeout(pendingTimer);
    }
  }
  playStateSounds(prev, next);
  playStateEffects(prev, next);
  // ロビーでお題の設定を開いている間は、その画面のままにする。ゲームが始まったら部屋に戻す（保存していない編集は消える）
  if (get().roomEdit && next.phase === 'lobby') { set({ pub: next, pending, connecting: false }); return; }
  if (get().roomEdit) set({ roomEdit: false, editing: null, editingFive: null, editingFate: null, notice: 'ゲームが始まったので部屋に戻りました（保存していない編集は消えました）' });
  set({ pub: next, pending, screen: 'room', connecting: false });
  if (rejoined && pending) sendPending(); // 切れている間に送れなかった並び替えを送り直す
}

// ===== 部屋 =====
function canEnter(): boolean {
  if (!get().name.trim()) { set({ notice: '名前を入力してください' }); return false; }
  if (!broughtTopics(get().topics).length && !broughtFives(get().fives).length && !broughtFates(get().fates).length && !broughtHaikus(get().haikus).length && !broughtBouquets(get().bouquets).length) { set({ notice: 'お題を1つ以上「持っていく」にチェックしてください' }); return false; }
  return true;
}

export function hostRoom() {
  if (!canEnter()) return;
  set({ connecting: true, notice: '' });
  startHost({
    id: myId, key: myKey, name: get().name, topics: broughtTopics(get().topics), fives: broughtFives(get().fives), fates: broughtFates(get().fates), haikus: broughtHaikus(get().haikus), bouquets: broughtBouquets(get().bouquets), chara: get().chara, version: APP_VERSION,
    minPlayers: DEV ? MIN_PLAYERS_DEV : MIN_PLAYERS_DEFAULT,
    bots: DEV ? Math.trunc(Number(new URLSearchParams(location.search).get('bots'))) || 0 : 0, // ?dev&bots=9 で CPU を足す（動作確認用）
    onOpen: s => { session = s; },
    onView: v => setPub(v),
    onFail: msg => set({ connecting: false, notice: msg }),
  });
}

export function joinRoom(raw: string) {
  if (!canEnter()) return;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== ROOM_CODE_LEN) { set({ notice: `部屋コード（${ROOM_CODE_LEN}文字）を入力してください` }); return; }
  set({ connecting: true, notice: '' });
  session = startGuest(guestOpts = {
    code, id: myId, key: myKey, name: get().name, topics: broughtTopics(get().topics), fives: broughtFives(get().fives), fates: broughtFates(get().fates), haikus: broughtHaikus(get().haikus), bouquets: broughtBouquets(get().bouquets), chara: get().chara, version: APP_VERSION,
    onView: (v, rejoined) => {
      if (get().lastRoom !== code) { saveLastRoom(code); set({ lastRoom: code }); }
      setPub(v, rejoined);
    },
    onReconnecting: on => set({ reconnecting: on }),
    onLeave: msg => leaveRoom(msg),
  });
}

export function leaveRoom(msg = '') {
  session?.close();
  session = null;
  guestOpts = null;
  set({ roomEdit: false });
  if (pendingTimer) clearTimeout(pendingTimer);
  set({ screen: 'home', pub: null, pending: null, connecting: false, reconnecting: false, notice: msg, dialog: null });
}

export function leaveByUser() {
  askConfirm(isHost() ? 'ホストが退出すると部屋が解散します。退出しますか？' : '退出しますか？', '退出する', () => {
    saveLastRoom('');
    set({ lastRoom: '' });
    leaveRoom();
  });
}

export function send(a: Action) { session?.send(a); }
// CPU の参加者を1人足す（ホストだけ。ロビーにいる間）
export function addBot() { if (session?.isHost && get().pub?.phase === 'lobby') session.addBot(); }

// ===== ロビーでお題を選び直す・編集する（v0.16） =====
export function openRoomTopics() {
  if (get().pub?.phase !== 'lobby') return;
  set({ roomEdit: true, screen: 'topics', notice: '' });
  send({ t: 'editing', on: true });
}
// 部屋に戻る。持っていくお題をホストに送り直す
export function backToRoom() {
  const topics = broughtTopics(get().topics), fives = broughtFives(get().fives), fates = broughtFates(get().fates), haikus = broughtHaikus(get().haikus), bouquets = broughtBouquets(get().bouquets);
  if (guestOpts) Object.assign(guestOpts, { topics, fives, fates, haikus, bouquets });
  set({ roomEdit: false, screen: 'room', notice: '' });
  if (get().pub?.phase !== 'lobby') return;
  send({ t: 'topics', topics, fives, fates, haikus, bouquets });
  send({ t: 'editing', on: false });
}

// 決定した予想・回答を取り消して、選び直す（全員そろう前まで）
export function retract() {
  const pub = get().pub;
  if (!pub || get().pending || (pub.phase !== 'guess' && pub.phase !== 'answer')) return;
  Sound.play('click');
  send({ t: 'retract', round: pub.round });
}

// ===== 並び替え =====
export function ensurePicker(key: string, n: number) {
  const p = get().picker;
  if (p.key !== key || p.slots.length !== n) set({ picker: { key, slots: Array(n).fill(null) } });
}
const setSlots = (f: (s: (number | null)[]) => void) => {
  const slots = [...get().picker.slots];
  f(slots);
  set({ picker: { ...get().picker, slots } });
};
export const pickerFull = () => { const s = get().picker.slots; return s.length > 0 && s.every(v => v != null); };

export const place = (i: number) => setSlots(s => { const t = s.indexOf(null); if (t >= 0) s[t] = i; });
export const unplace = (r: number) => setSlots(s => { s[r] = null; });
export const swap = (a: number, b: number) => setSlots(s => { [s[a], s[b]] = [s[b], s[a]]; });

// 枠 t に入れる。埋まっていれば下（なければ上）の空きまで1つずつずらす。from は並べ済みの位置（画面下からなら null）
export const dropInto = (item: number, t: number, from: number | null) => setSlots(s => {
  if (from != null) s[from] = null;
  if (s[t] == null) { s[t] = item; return; }
  let gap = s.indexOf(null, t);
  if (gap >= 0) { for (let i = gap; i > t; i--) s[i] = s[i - 1]; }
  else { gap = s.lastIndexOf(null, t); for (let i = gap; i < t; i++) s[i] = s[i + 1]; }
  s[t] = item;
});

// 並び替えを送る。ホストの受け取り（状態の更新）が3秒来なければ送り直し、それでもだめなら再接続する
export function submitPick() {
  const { pub, pending, picker } = get();
  if (!pub || pending) return;
  const order = [...picker.slots];
  let msg: Action;
  if (pub.phase === 'ranking') msg = { t: 'rank', order, partial: !pickerFull() };
  else if (pub.phase === 'guess' && pickerFull()) msg = { t: 'guess', round: pub.round, order: order as number[] };
  else return;
  set({ pending: { msg, key: turnKey(pub), tries: 0 } });
  Sound.play('click');
  sendPending();
}
function sendPending() {
  const p = get().pending;
  if (!p) return;
  set({ pending: { ...p, tries: p.tries + 1 } });
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    const cur = get().pending;
    if (!cur) return;
    if (cur.tries >= 2 && session && !session.isHost) session.reconnect(); else sendPending();
  }, 3000);
  session?.send(p.msg);
}

// ===== セレクトファイブ =====
export function ensureFivePick(key: string) { if (get().fivePick.key !== key) set({ fivePick: { key, sel: [] } }); }
// タップで選ぶ・外す。5つ選んでいたら、それ以上は選べない
export function toggleFive(i: number) {
  const { key, sel } = get().fivePick;
  if (sel.includes(i)) set({ fivePick: { key, sel: sel.filter(x => x !== i) } });
  else if (sel.length < FIVE_PICK) set({ fivePick: { key, sel: [...sel, i] } });
}
// 5つそろったら送る。時間切れのときは、選んだ分だけ送る（0個なら送らない＝未提出）
export function submitFive(partial = false) {
  const { pub, pending, fivePick } = get();
  if (!pub?.five || pending || pub.phase !== 'answer') return;
  const picks = [...fivePick.sel];
  if (partial ? picks.length === 0 : picks.length !== FIVE_PICK) return;
  set({ pending: { msg: { t: 'five', round: pub.five.round, picks, partial }, key: turnKey(pub), tries: 0 } });
  Sound.play('click');
  sendPending();
}

// ===== 運命の二者択一 =====
// 左右へ移動する。位置はホストから戻ってきた状態で表示する（届いていないのに動いたように見せない）
export function moveFate(side: Side) {
  const { pub } = get();
  if (!pub?.fate || pub.phase !== 'question' || pub.fate.paused || pub.fate.pos[pub.me] === side) return;
  if (pub.fate.authorIds.includes(pub.me)) return; // 自分が作った問題のあいだは、お立ち台から動けない
  if (pub.localDeadline && Date.now() > pub.localDeadline) return;
  Sound.play('click');
  send({ t: 'move', side });
}
// キャラクターを選ぶ（端末に保存。ロビーにいるときは、ほかの人にも伝える）
export function setChara(n: number) {
  saveChara(n);
  set({ chara: n });
  if (get().pub?.phase === 'lobby') send({ t: 'chara', n });
}

// 時間切れ：並べ終えていれば提出。準備フェーズは途中までを送り、ホストに残りをランダムで埋めてもらう。予想フェーズは未提出
export function onTimeUp() {
  const { pub, pending } = get();
  if (!pub || pending || !needsToPick(pub)) return;
  if (pub.phase === 'work') return submitRelay();     // スタンプ伝言：作っていた分で出す（何もなければ、ホストが埋める）
  if (pub.phase === 'compose') return submitPhrase(); // ワードブーケ：並べていた分で提出する（何も並べていなければ、提出なし）
  if (pub.phase === 'talk') return;  // ブラインドブラフ：選ばなかった人は、ホストが「降りる」にする
  if (pub.phase === 'write') return; // ハイカー575：書かなかった分は、ホストがランダムな文字で埋める
  if (pub.phase === 'answer') return submitFive(true);
  if (pickerFull() || pub.phase === 'ranking') submitPick();
}

export function needsToPick(pub: Pub) {
  if (pub.phase === 'ranking') return !!pub.myTopic && !pub.myRank;
  if (pub.phase === 'guess') return pub.target?.id !== pub.me && !pub.myGuess;
  if (pub.phase === 'answer') return !!pub.five?.answering && !pub.five.myPicks;
  if (pub.phase === 'write') return !!pub.haiku?.writing && pub.haiku.myDraft == null;
  if (pub.phase === 'talk') return !!pub.bluff?.dealt && pub.bluff.myBet == null;
  if (pub.phase === 'compose') return !!pub.bouquet?.hand && pub.bouquet.myPhrase == null;
  if (pub.phase === 'work') return !!pub.relay?.from && !pub.relay.submitted;
  return false;
}

// ===== ホーム・お題 =====
export const setName = (name: string) => { saveName(name); set({ name }); };
export const setScreen = (screen: Screen) => set({ screen, notice: '' });
export const updateTopics = (f: (t: StoredTopic[]) => StoredTopic[]) => {
  const topics = f(get().topics);
  saveTopics(topics);
  set({ topics });
};
export const updateFives = (f: (t: StoredFive[]) => StoredFive[]) => {
  const fives = f(get().fives);
  saveFives(fives);
  set({ fives });
};

// ===== スタンプ伝言 =====
// 作っている途中の絵と答えは、回ごとに持つ（紙が回ったら、空から始める）
export const relayKey = (pub: Pub) => `rl-${pub.gameNo}-${pub.relay?.step}`;
const relayDraftOf = (pub: Pub) => { const d = get().relayDraft; return d.key === relayKey(pub) ? d : { key: relayKey(pub), stamps: [] as Stamp[], text: '' }; };
export function setRelayStamps(stamps: Stamp[]) {
  const { pub } = get();
  if (pub?.relay?.from && !pub.relay.submitted) set({ relayDraft: { ...relayDraftOf(pub), stamps } });
}
export function setRelayText(text: string) {
  const { pub } = get();
  if (pub?.relay?.from && !pub.relay.submitted) set({ relayDraft: { ...relayDraftOf(pub), text } });
}
export function submitRelay() {
  const { pub, pending } = get();
  if (!pub?.relay?.from || pending || pub.phase !== 'work' || pub.relay.submitted) return;
  const d = relayDraftOf(pub), step = pub.relay.step;
  let msg: Action;
  if (pub.relay.kind === 'draw') { if (!d.stamps.length) return; msg = { t: 'relayDraw', step, stamps: d.stamps }; }
  else { if (!d.text.trim()) return; msg = { t: 'relayGuess', step, text: d.text.trim() }; }
  set({ pending: { msg, key: turnKey(pub), tries: 0 } });
  Sound.play('click');
  sendPending();
}

// ===== ワードブーケ =====
// 並べている途中の文は、ラウンドごと・手札ごとに持つ（引き直したら、並べていた分は消える）
export const bouquetKey = (pub: Pub) => `bq-${pub.gameNo}-${pub.bouquet?.round}-${pub.bouquet?.redrawn ? 1 : 0}`;
const draftOf = (pub: Pub) => { const d = get().bouquetDraft; return d.key === bouquetKey(pub) ? d.tokens : []; };
// カードや助詞を、文の最後に足す（手札は1枚1回まで・合わせて12個まで）
export function addToken(t: number) {
  const { pub } = get();
  if (!pub?.bouquet?.hand || pub.bouquet.myPhrase != null) return;
  const tokens = draftOf(pub);
  if (tokens.length >= PHRASE_MAX || (t >= 0 && tokens.includes(t))) return;
  set({ bouquetDraft: { key: bouquetKey(pub), tokens: [...tokens, t] } });
}
// 並べたものを1つ外す
export function removeToken(i: number) {
  const { pub } = get();
  if (!pub?.bouquet) return;
  set({ bouquetDraft: { key: bouquetKey(pub), tokens: draftOf(pub).filter((_, k) => k !== i) } });
}
export function submitPhrase() {
  const { pub, pending } = get();
  if (!pub?.bouquet?.hand || pending || pub.phase !== 'compose' || pub.bouquet.myPhrase != null) return;
  const tokens = draftOf(pub);
  if (!tokens.some(t => t >= 0)) return; // 手札を1枚以上使う
  set({ pending: { msg: { t: 'phrase', round: pub.bouquet.round, tokens }, key: turnKey(pub), tries: 0 } });
  Sound.play('click');
  sendPending();
}
export const updateBouquets = (f: (t: StoredBouquet[]) => StoredBouquet[]) => {
  const bouquets = f(get().bouquets);
  saveBouquets(bouquets);
  set({ bouquets });
};

// ===== ブラインドブラフ =====
// 勝負するか、降りるかを送る（選んだら変えられない）
export function submitBet(go: boolean) {
  const { pub, pending } = get();
  if (!pub?.bluff || pending || pub.phase !== 'talk' || !pub.bluff.dealt || pub.bluff.myBet != null) return;
  set({ pending: { msg: { t: 'bet', round: pub.bluff.round, go }, key: turnKey(pub), tries: 0 } });
  Sound.play('click');
  sendPending();
}

// ===== ハイカー575 =====
// 1文字書いて送る（ホストの受け取りが来なければ、ほかの提出と同じく送り直す）
export function submitKana(ch: string) {
  const { pub, pending } = get();
  if (!pub?.haiku || pending || pub.phase !== 'write' || pub.haiku.myDraft != null) return;
  set({ pending: { msg: { t: 'kana', step: pub.haiku.step, ch }, key: turnKey(pub), tries: 0 } });
  Sound.play('click');
  sendPending();
}
export const updateHaikus = (f: (t: StoredHaiku[]) => StoredHaiku[]) => {
  const haikus = f(get().haikus);
  saveHaikus(haikus);
  set({ haikus });
};

export const updateFates = (f: (t: StoredFate[]) => StoredFate[]) => {
  const fates = f(get().fates);
  saveFates(fates);
  set({ fates });
};

// ===== 確認ダイアログ（ブラウザ標準の confirm はアプリ内ブラウザで出ないことがあるため使わない） =====
export const askConfirm = (msg: string, okLabel: string, onOk: () => void) => set({ dialog: { msg, okLabel, onOk } });
export const closeDialog = () => set({ dialog: null });

export const showError = (msg: string) => set({ error: msg });

// 動作確認用：?dev のときだけ、開発者ツールから状態と通信を触れるようにする
if (DEV) (window as unknown as { __tlw: unknown }).__tlw = { store: useStore, get session() { return session; } };
