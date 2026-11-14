// 部屋の進行（どのモードでも共通）：参加・退出・ロビーの設定・開始・ロビーに戻る。
// ゲーム中の操作はモードに渡す。画面・通信・ブラウザの機能は使わない
import { CHARA_MAX, DEFAULT_FATE_LIVES, FATE_LIVES, DEFAULT_FATE_QUOTA, DEFAULT_FATE_TIME, FATE_QUOTAS, DEFAULT_TIME_LIMIT, FATE_TIMES, MAX_PLAYERS, NAME_MAX, TIME_LIMITS } from './constants';
import { clean } from './text';
import { sanitizeTopics } from '../modes/tier/topics';
import { GAME_MODES, PICK_MODES, type Action, type ActionFrom, type Ctx, type RoomState, type Timer } from './types';
import { MODES, modeOf } from '../modes';
import { sanitizeFives } from '../modes/five/topics';
import { sanitizeFates } from '../modes/fate/questions';
import { HAIKU_STYLES, sanitizeHaikus } from '../modes/haiku/themes';
import { sanitizeBouquets, sanitizeBouquetWords } from '../modes/bouquet/words';
import { DEFAULT_RAID_MODE, RAID_MODES, BOUQUET_HANDS, DEFAULT_BOUQUET_HAND, DEFAULT_RELAY_TIME, RELAY_TIMES, BOMB_FUSES, BOMB_ROUNDS, DEFAULT_BOMB_FUSE, DEFAULT_BOMB_ROUNDS, BLEND_CROWDS, BLEND_TIMES, DEFAULT_BLEND_CROWD, DEFAULT_BLEND_TIME, BOUQUET_GOALS, BOUQUET_TIMES, DEFAULT_BOUQUET_TIME, BLUFF_TIMES, DEFAULT_BLUFF_TIME, DEFAULT_HAIKU_TIME, HAIKU_TIMES } from './constants';

const charaOf = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < CHARA_MAX ? n as number : null;

export function createRoom(code: string, hostId: string, minPlayers: number): RoomState {
  return { code, hostId, minPlayers, gameNo: 1, gameMode: 'tier', pickMode: 'random', timeLimit: DEFAULT_TIME_LIMIT, fateTime: DEFAULT_FATE_TIME, fateQuota: DEFAULT_FATE_QUOTA, fateLives: DEFAULT_FATE_LIVES, haikuStyle: 'theme', haikuTime: DEFAULT_HAIKU_TIME, bluffTime: DEFAULT_BLUFF_TIME, blendTime: DEFAULT_BLEND_TIME, blendCrowd: DEFAULT_BLEND_CROWD, bombRounds: DEFAULT_BOMB_ROUNDS, bombFuse: DEFAULT_BOMB_FUSE, bombStyle: 'tap', relayTime: DEFAULT_RELAY_TIME, raidMode: DEFAULT_RAID_MODE, bouquetTime: DEFAULT_BOUQUET_TIME, bouquetGoal: 0, bouquetsBy: {}, bouquetWordsBy: {}, bouquetHand: DEFAULT_BOUQUET_HAND, bouquetMix: true, haikusBy: {}, players: [], topicsBy: {}, fivesBy: {}, fatesBy: {}, game: null };
}

// 参加を受け付けるか。断るときはその理由
export function joinError(room: RoomState, id: string, a: Extract<Action, { t: 'join' }>): string | null {
  const existing = room.players.find(p => p.id === id);
  if (existing) return existing.key === clean(a.key, 64) ? null : 'この参加者は既に部屋にいます';
  if (room.game) return 'ゲーム進行中のため参加できません';
  if (room.players.length >= MAX_PLAYERS) return `満員です（最大${MAX_PLAYERS}人）`;
  if (a.bot) return null; // CPU は、お題を持ってこない
  if (!sanitizeTopics(a.topics).length && !sanitizeFives(a.fives).length && !sanitizeFates(a.fates).length && !sanitizeHaikus(a.haikus).length && !sanitizeBouquets(a.bouquets).length) return 'お題を1つ以上持ってきてください';
  return null;
}

// 操作を受けて次の状態を返す（引数の状態は書き換えない）。受け付けなかった操作は、同じ状態をそのまま返す
export function reduce(state: RoomState, a: ActionFrom, ctx: Ctx): RoomState {
  const room = structuredClone(state);
  const isHost = a.from === room.hostId;
  switch (a.t) {
    case 'join': {
      if (joinError(room, a.from, a)) return state;
      const tps = sanitizeTopics(a.topics), fvs = sanitizeFives(a.fives), fts = sanitizeFates(a.fates), hks = sanitizeHaikus(a.haikus), bqs = sanitizeBouquets(a.bouquets);
      let p = room.players.find(x => x.id === a.from);
      if (!p) {
        p = { id: a.from, key: clean(a.key, 64), name: '', online: true, score: 0, version: '', chara: 0 };
        room.players.push(p);
      }
      p.name = clean(a.name, NAME_MAX) || '名無し';
      if (a.bot) p.bot = true;
      p.online = true;
      p.version = clean(a.version, 20) || '不明';
      p.chara = charaOf(a.chara) ?? p.chara;
      if (!room.game && (tps.length || fvs.length || fts.length || hks.length || bqs.length)) { room.topicsBy[a.from] = tps; room.fivesBy[a.from] = fvs; room.fatesBy[a.from] = fts; room.haikusBy[a.from] = hks; room.bouquetsBy[a.from] = bqs; }
      if (!room.game && a.bouquetWords) room.bouquetWordsBy[a.from] = sanitizeBouquetWords(a.bouquetWords);
      return room;
    }
    case 'leave': {
      const p = room.players.find(x => x.id === a.from);
      if (!p) return state;
      if (!room.game) {
        room.players = room.players.filter(x => x.id !== a.from);
        delete room.topicsBy[a.from];
        delete room.fivesBy[a.from];
        delete room.fatesBy[a.from];
        delete room.haikusBy[a.from];
        delete room.bouquetsBy[a.from];
        delete room.bouquetWordsBy[a.from];
      } else {
        p.online = false;
        modeOf(room.game).checkAdvance(room, room.game, ctx);
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
    case 'game':
      if (!isHost || room.game || !(a.mode in GAME_MODES)) return state;
      room.gameMode = a.mode;
      return room;
    case 'time':
      if (!isHost || room.game || !(TIME_LIMITS as readonly number[]).includes(a.sec)) return state;
      room.timeLimit = a.sec;
      return room;
    case 'haikuStyle':
      if (!isHost || room.game || !(a.style in HAIKU_STYLES)) return state;
      room.haikuStyle = a.style;
      return room;
    case 'bouquetTime':
      if (!isHost || room.game || !(BOUQUET_TIMES as readonly number[]).includes(a.sec)) return state;
      room.bouquetTime = a.sec;
      return room;
    case 'bouquetHand':
      if (!isHost || room.game || !(BOUQUET_HANDS as readonly number[]).includes(a.n)) return state;
      room.bouquetHand = a.n;
      return room;
    case 'bouquetMix':
      if (!isHost || room.game || typeof a.on !== 'boolean' || room.bouquetMix === a.on) return state;
      room.bouquetMix = a.on;
      return room;
    case 'bouquetGoal':
      if (!isHost || room.game || !(BOUQUET_GOALS as readonly number[]).includes(a.n)) return state;
      room.bouquetGoal = a.n;
      return room;
    case 'raidMode':
      if (!isHost || room.game || !(RAID_MODES as readonly string[]).includes(a.mode)) return state;
      room.raidMode = a.mode;
      return room;
    case 'relayTime':
      if (!isHost || room.game || !(RELAY_TIMES as readonly number[]).includes(a.sec)) return state;
      room.relayTime = a.sec;
      return room;
    case 'bombRounds':
      if (!isHost || room.game || !(BOMB_ROUNDS as readonly number[]).includes(a.n)) return state;
      room.bombRounds = a.n;
      return room;
    case 'bombStyle':
      if (!isHost || room.game || (a.style !== 'tap' && a.style !== 'type')) return state;
      room.bombStyle = a.style;
      return room;
    case 'bombFuse':
      if (!isHost || room.game || !Number.isInteger(a.n) || a.n < 0 || a.n >= BOMB_FUSES.length) return state;
      room.bombFuse = a.n;
      return room;
    case 'blendTime':
      if (!isHost || room.game || !(BLEND_TIMES as readonly number[]).includes(a.sec)) return state;
      room.blendTime = a.sec;
      return room;
    case 'blendCrowd':
      if (!isHost || room.game || !(BLEND_CROWDS as readonly number[]).includes(a.n)) return state;
      room.blendCrowd = a.n;
      return room;
    case 'bluffTime':
      if (!isHost || room.game || !(BLUFF_TIMES as readonly number[]).includes(a.sec)) return state;
      room.bluffTime = a.sec;
      return room;
    case 'haikuTime':
      if (!isHost || room.game || !(HAIKU_TIMES as readonly number[]).includes(a.sec)) return state;
      room.haikuTime = a.sec;
      return room;
    case 'fateTime':
      if (!isHost || room.game || !(FATE_TIMES as readonly number[]).includes(a.sec)) return state;
      room.fateTime = a.sec;
      return room;
    case 'fateQuota':
      if (!isHost || room.game || !(FATE_QUOTAS as readonly number[]).includes(a.n)) return state;
      room.fateQuota = a.n;
      return room;
    case 'fateLives':
      if (!isHost || room.game || !(FATE_LIVES as readonly number[]).includes(a.n)) return state;
      room.fateLives = a.n;
      return room;
    case 'chara': {
      // キャラクターは、ロビーにいる間は誰でも自分の分を変えられる
      const p = room.players.find(x => x.id === a.from), n = charaOf(a.n);
      if (!p || room.game || n == null || p.chara === n) return state;
      p.chara = n;
      return room;
    }
    case 'topics': {
      // ロビーにいる間は、自分の持っていくお題を何度でも送り直せる（空でもよい。足りなければ開始できない理由に出る）
      const p = room.players.find(x => x.id === a.from);
      if (!p || room.game) return state;
      room.topicsBy[a.from] = sanitizeTopics(a.topics);
      room.fivesBy[a.from] = sanitizeFives(a.fives);
      room.fatesBy[a.from] = sanitizeFates(a.fates);
      room.haikusBy[a.from] = sanitizeHaikus(a.haikus);
      room.bouquetsBy[a.from] = sanitizeBouquets(a.bouquets);
      room.bouquetWordsBy[a.from] = sanitizeBouquetWords(a.bouquetWords);
      return room;
    }
    case 'editing': {
      const p = room.players.find(x => x.id === a.from);
      if (!p || room.game || !!p.editing === !!a.on) return state;
      p.editing = !!a.on;
      return room;
    }
    case 'start':
      if (!isHost || room.game || startErrorOf(room)) return state;
      room.players.forEach(p => { p.editing = false; });
      room.game = MODES[room.gameMode].start(room, ctx);
      return room;
    case 'lobby':
      if (!isHost || room.game?.phase !== 'result') return state;
      room.players = room.players.filter(p => p.online).map(p => ({ ...p, score: 0 }));
      room.topicsBy = Object.fromEntries(room.players.map(p => [p.id, room.topicsBy[p.id] ?? []]));
      room.fivesBy = Object.fromEntries(room.players.map(p => [p.id, room.fivesBy[p.id] ?? []]));
      room.fatesBy = Object.fromEntries(room.players.map(p => [p.id, room.fatesBy[p.id] ?? []]));
      room.haikusBy = Object.fromEntries(room.players.map(p => [p.id, room.haikusBy[p.id] ?? []]));
      room.bouquetsBy = Object.fromEntries(room.players.map(p => [p.id, room.bouquetsBy[p.id] ?? []]));
      room.bouquetWordsBy = Object.fromEntries(room.players.map(p => [p.id, room.bouquetWordsBy[p.id] ?? []]));
      room.gameNo++;
      room.game = null;
      return room;
    default:
      if (!room.game) return state;
      return modeOf(room.game).reduce(room, room.game, a, ctx) ? room : state;
  }
}

export const nextTimer = (room: RoomState): Timer | null => room.game ? modeOf(room.game).nextTimer(room.game) : null;
// CPU が動くモード
export const BOT_MODES: readonly string[] = ['fate', 'haiku', 'bluff', 'bouquet', 'blend', 'bomb', 'relay', 'raid'];
export const startErrorOf = (room: RoomState) =>
  room.players.some(p => p.bot) && !BOT_MODES.includes(room.gameMode)
    ? 'CPU は、このモードでは動きません。CPU を外すか、ティアリスト・セレクトファイブ以外のモードで遊んでください'
    : MODES[room.gameMode].startError(room);
