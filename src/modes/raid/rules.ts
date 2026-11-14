// ダイスレイドのルール（このフォルダの README.md の18章）。ゲームの中身は engine/（別に作っていたものを、そのまま持ち込んだ）にあり、
// ここは、部屋とのつなぎ役：誰がどの席か、誰の操作を受け付けるか、CPU の席をいつ動かすか、を決める。
// 画面・通信・ブラウザの機能は使わない（時刻と乱数は ctx で受け取る。ゲームの中の乱数は、engine が種から作る）
import { RAID_CPU_MS, RAID_SEATS } from '../../core/constants';
import { shuffle } from '../../core/random';
import type { ActionFrom, Ctx, RoomState, Timer } from '../../core/types';
import { applyAction, CLASS_IDS, contributionScore, createGame, decideAction, getActorId } from './engine';
import type { Action as RaidAction, GameEvent, GameState, Mode } from './engine';

export type RaidPhase = 'raid' | 'result';

export interface RaidState {
  kind: 'raid';
  phase: RaidPhase;
  seats: (string | null)[];   // 席（engine の playerId の順）に座っている参加者のID。null = CPU の席
  names: Record<string, string>;
  game: GameState;            // ゲームの中身（協力ゲームなので、隠す情報はない。全員に同じものを送る）
  events: GameEvent[];        // 直前の操作で起きたこと（画面の演出用）
  seq: number;                // 操作の通し番号（画面が、新しい操作が届いたかを見分ける）
  actAt: number;              // 直前の操作の時刻（CPU の席は、ここから少し間を置いて動く）
}

const online = (room: RoomState) => room.players.filter(p => p.online);
const isOnline = (room: RoomState, id: string | null) => !!id && !!room.players.find(p => p.id === id)?.online;
// その席を、いま CPU が動かすか（CPU の席・CPU の参加者・切断中の人の代打）
const cpuPlays = (room: RoomState, g: RaidState, seat: number) => {
  const id = g.seats[seat];
  return !id || !isOnline(room, id) || !!room.players.find(p => p.id === id)?.bot;
};
// その人の席（座っていなければ -1）
export const seatOf = (g: RaidState, id: string) => g.seats.indexOf(id);

export function startError(room: RoomState): string | null {
  const n = online(room).length;
  if (n < room.minPlayers) return `あと${room.minPlayers - n}人必要です（${room.minPlayers}〜${RAID_SEATS}人）`;
  if (n > RAID_SEATS) return `ダイスレイドは${RAID_SEATS}人までです（いま${n}人）`;
  return null;
}

export function start(room: RoomState, ctx: Ctx): RaidState {
  const players = shuffle(online(room), ctx.random).slice(0, RAID_SEATS);
  room.players.forEach(p => { p.score = 0; });
  // 席は4つ。人が座らない席は、CPU が埋める
  const seats = Array.from({ length: RAID_SEATS }, (_, i) => players[i]?.id ?? null);
  // 職業：ロビーで選んだ人は、その職業（同じ職業が重なってもよい）。選んでいない人と CPU の席は、まだ誰も使っていない職業から順に
  const picked = seats.map(id => (id && room.raidClassBy[id]) || null);
  const free = CLASS_IDS.filter(c => !picked.includes(c));
  const classes = picked.map((c, i) => c ?? free.shift() ?? CLASS_IDS[i % CLASS_IDS.length]);
  const game = createGame({
    seed: Math.floor(ctx.random() * 2 ** 31),
    mode: room.raidMode,
    players: seats.map((_, i) => {
      const p = players[i];
      return { name: p ? p.name : `CPU${i + 1}`, classId: classes[i], isCpu: !p || !!p.bot };
    }),
  });
  return { kind: 'raid', phase: 'raid', seats, names: Object.fromEntries(players.map(p => [p.id, p.name])), game, events: [], seq: 0, actAt: ctx.now };
}

// 操作を1つ進める。engine が受け付けない操作（番でない・できない行動）は、何も起きない
function apply(room: RoomState, g: RaidState, action: RaidAction, ctx: Ctx): boolean {
  let next;
  try { next = applyAction(g.game, action); } catch { return false; }
  g.game = next.state;
  g.events = next.events;
  g.seq++;
  g.actAt = ctx.now;
  if (g.game.result) {
    g.phase = 'result';
    // 勝ち負けは全員で同じ。順位は、貢献度で付ける
    g.seats.forEach((id, seat) => {
      const p = room.players.find(x => x.id === id);
      if (p) p.score = Math.round(contributionScore(g.game.players[seat]));
    });
  }
  return true;
}

export function checkAdvance(_room: RoomState, _g: RaidState, _ctx: Ctx) { /* 抜けた人の席は、CPU が代わりに動かす（nextTimer と tick が見る） */ }

export function reduce(room: RoomState, g: RaidState, a: ActionFrom, ctx: Ctx): boolean {
  const isHost = a.from === room.hostId;
  if (g.phase !== 'raid') return false;
  const actor = getActorId(g.game);
  switch (a.t) {
    case 'raidAct': {
      // 自分の席の番のときだけ、操作できる。誰の操作かは、届いた中身ではなく、席から決める（なりすましを防ぐ）
      const seat = seatOf(g, a.from);
      if (seat < 0 || actor !== seat || a.seq !== g.seq) return false;
      return apply(room, g, { ...(a.action as RaidAction), playerId: seat } as RaidAction, ctx);
    }
    case 'tick':
      // CPU の席の番：少し間を置いてから、CPU が決めた一手を進める（ホストのタイマーが出す）
      if (!isHost || actor == null || !cpuPlays(room, g, actor) || ctx.now < g.actAt + RAID_CPU_MS) return false;
      return apply(room, g, decideAction(g.game), ctx);
    default:
      return false;
  }
}

export function nextTimer(g: RaidState): Timer | null {
  // 誰の番かは部屋の状態も見ないと決まらないので、番の人がいる間は、いつも次の合図を仕掛けておく（人の番なら、tick は何もしない）
  if (g.phase !== 'raid' || getActorId(g.game) == null) return null;
  return { at: g.actAt + RAID_CPU_MS, action: { t: 'tick' } };
}

export type { Mode as RaidMode };
