// 部屋の進行（どのモードでも共通）：参加・退出・ロビーの設定・開始・ロビーに戻る。
// ゲーム中の操作はモードに渡す。画面・通信・ブラウザの機能は使わない
import { MAX_PLAYERS, NAME_MAX } from './constants';
import { clean, sanitizeTopics } from './topics';
import { PICK_MODES, type Action, type ActionFrom, type Ctx, type RoomState, type Timer } from './types';
import { tierMode } from '../modes';

export function createRoom(code: string, hostId: string, minPlayers: number): RoomState {
  return { code, hostId, minPlayers, gameNo: 1, pickMode: 'random', players: [], topicsBy: {}, game: null };
}

// 参加を受け付けるか。断るときはその理由
export function joinError(room: RoomState, id: string, a: Extract<Action, { t: 'join' }>): string | null {
  const existing = room.players.find(p => p.id === id);
  if (existing) return existing.key === clean(a.key, 64) ? null : 'この参加者は既に部屋にいます';
  if (room.game) return 'ゲーム進行中のため参加できません';
  if (room.players.length >= MAX_PLAYERS) return `満員です（最大${MAX_PLAYERS}人）`;
  if (!sanitizeTopics(a.topics).length) return 'お題を1つ以上持ってきてください';
  return null;
}

// 操作を受けて次の状態を返す（引数の状態は書き換えない）。受け付けなかった操作は、同じ状態をそのまま返す
export function reduce(state: RoomState, a: ActionFrom, ctx: Ctx): RoomState {
  const room = structuredClone(state);
  const isHost = a.from === room.hostId;
  switch (a.t) {
    case 'join': {
      if (joinError(room, a.from, a)) return state;
      const tps = sanitizeTopics(a.topics);
      let p = room.players.find(x => x.id === a.from);
      if (!p) {
        p = { id: a.from, key: clean(a.key, 64), name: '', online: true, score: 0, version: '' };
        room.players.push(p);
      }
      p.name = clean(a.name, NAME_MAX) || '名無し';
      p.online = true;
      p.version = clean(a.version, 20) || '不明';
      if (!room.game && tps.length) room.topicsBy[a.from] = tps;
      return room;
    }
    case 'leave': {
      const p = room.players.find(x => x.id === a.from);
      if (!p) return state;
      if (!room.game) {
        room.players = room.players.filter(x => x.id !== a.from);
        delete room.topicsBy[a.from];
      } else {
        p.online = false;
        tierMode.checkAdvance(room, room.game, ctx);
      }
      return room;
    }
    case 'kick': {
      if (!isHost || room.game || a.id === room.hostId) return state;
      return reduce(state, { t: 'leave', from: a.id }, ctx);
    }
    case 'mode':
      if (!isHost || room.game || !(a.mode in PICK_MODES)) return state;
      room.pickMode = a.mode;
      return room;
    case 'start':
      if (!isHost || room.game || tierMode.startError(room)) return state;
      room.game = tierMode.start(room, ctx);
      return room;
    case 'lobby':
      if (!isHost || room.game?.phase !== 'result') return state;
      room.players = room.players.filter(p => p.online).map(p => ({ ...p, score: 0 }));
      room.topicsBy = Object.fromEntries(room.players.map(p => [p.id, room.topicsBy[p.id] ?? []]));
      room.gameNo++;
      room.game = null;
      return room;
    default:
      if (!room.game) return state;
      return tierMode.reduce(room, room.game, a, ctx) ? room : state;
  }
}

export const nextTimer = (room: RoomState): Timer | null => room.game ? tierMode.nextTimer(room.game) : null;
