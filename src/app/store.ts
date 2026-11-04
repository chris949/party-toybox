// 画面の状態と操作。通信（ホスト／参加者）とつなぎ、受け取った状態を画面に渡す
import { create } from 'zustand';
import { Sound } from '../audio/sound';
import { MIN_PLAYERS_DEFAULT, MIN_PLAYERS_DEV } from '../core/constants';
import type { Action } from '../core/types';
import type { PlayerView } from '../modes/tier/view';
import { startGuest, type GuestSession } from '../net/guest';
import { startHost, type HostSession } from '../net/host';
import { ROOM_CODE_LEN } from '../net/protocol';
import {
  broughtTopics, loadLastRoom, loadName, loadTopics, myId, myKey, saveLastRoom, saveName, saveTopics, type StoredTopic,
} from '../storage/local';
import { playStateEffects } from './effects';
import { playStateSounds } from './sounds';

export const APP_VERSION = __APP_VERSION__;
export const COMMIT = __COMMIT__;
export const DEV = new URLSearchParams(location.search).has('dev'); // ?dev で最少2人から遊べる（動作確認用）

export type Screen = 'home' | 'topics' | 'edit' | 'sound' | 'room';
// 受け取った状態。締め切りは自分の時計に直して持つ
export type Pub = PlayerView & { localDeadline: number };
export interface Editing { id: string | null; title: string; options: string[]; count: number }
export interface Dialog { msg: string; okLabel: string; onOk(): void }
interface Pending { msg: Action; key: string; tries: number }

interface State {
  screen: Screen;
  notice: string;
  connecting: boolean;
  reconnecting: boolean;
  pub: Pub | null;
  pending: Pending | null;
  dialog: Dialog | null;
  editing: Editing | null;
  error: string | null;
  name: string;
  topics: StoredTopic[];
  lastRoom: string;
  picker: { key: string; slots: (number | null)[] }; // slots[順位] = 選択肢の番号（空きは null）
}

let session: HostSession | GuestSession | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<State>(() => ({
  screen: 'home', notice: '', connecting: false, reconnecting: false, pub: null, pending: null,
  dialog: null, editing: null, error: null,
  name: loadName(), topics: loadTopics(), lastRoom: loadLastRoom(),
  picker: { key: '', slots: [] },
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
    if (moved || (pending.msg.t === 'rank' && next.myRank) || (pending.msg.t === 'guess' && next.myGuess)) {
      pending = null;
      if (pendingTimer) clearTimeout(pendingTimer);
    }
  }
  playStateSounds(prev, next);
  playStateEffects(prev, next);
  set({ pub: next, pending, screen: 'room', connecting: false });
  if (rejoined && pending) sendPending(); // 切れている間に送れなかった並び替えを送り直す
}

// ===== 部屋 =====
function canEnter(): boolean {
  if (!get().name.trim()) { set({ notice: '名前を入力してください' }); return false; }
  if (!broughtTopics(get().topics).length) { set({ notice: 'お題を1つ以上「持っていく」にチェックしてください' }); return false; }
  return true;
}

export function hostRoom() {
  if (!canEnter()) return;
  set({ connecting: true, notice: '' });
  startHost({
    id: myId, key: myKey, name: get().name, topics: broughtTopics(get().topics), version: APP_VERSION,
    minPlayers: DEV ? MIN_PLAYERS_DEV : MIN_PLAYERS_DEFAULT,
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
  session = startGuest({
    code, id: myId, key: myKey, name: get().name, topics: broughtTopics(get().topics), version: APP_VERSION,
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

// 時間切れ：並べ終えていれば提出。準備フェーズは途中までを送り、ホストに残りをランダムで埋めてもらう。予想フェーズは未提出
export function onTimeUp() {
  const { pub, pending } = get();
  if (!pub || pending || !needsToPick(pub)) return;
  if (pickerFull() || pub.phase === 'ranking') submitPick();
}

export function needsToPick(pub: Pub) {
  if (pub.phase === 'ranking') return !!pub.myTopic && !pub.myRank;
  if (pub.phase === 'guess') return pub.target?.id !== pub.me && !pub.myGuess;
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

// ===== 確認ダイアログ（ブラウザ標準の confirm はアプリ内ブラウザで出ないことがあるため使わない） =====
export const askConfirm = (msg: string, okLabel: string, onOk: () => void) => set({ dialog: { msg, okLabel, onOk } });
export const closeDialog = () => set({ dialog: null });

export const showError = (msg: string) => set({ error: msg });

// 動作確認用：?dev のときだけ、開発者ツールから状態と通信を触れるようにする
if (DEV) (window as unknown as { __tlw: unknown }).__tlw = { store: useStore, get session() { return session; } };
