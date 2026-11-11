// ホスト側：部屋を作り、参加者とつながり、ルールのエンジンで状態を進めて、各参加者に見せてよい情報を送る
import Peer, { type DataConnection } from 'peerjs';
import { CHARA_COUNT } from '../core/constants';
import { createRoom, joinError, nextTimer, reduce } from '../core/room';
import type { Action, RoomState } from '../core/types';
import type { Topic } from '../core/topics';
import type { FiveTopic } from '../core/fives';
import type { FateQuestion } from '../core/fates';
import { viewFor, type PlayerView } from '../modes/tier/view';
import { peerOptions } from './peerOptions';
import { cleanId, DEAD_MS, genCode, HEARTBEAT_MS, parseAction, PREFIX, type HostMsg } from './protocol';

type Conn = DataConnection & { pid?: string; lastSeen: number };

export interface HostSession { isHost: true; code: string; send(a: Action): void; close(): void }

export interface HostOptions {
  id: string; key: string; name: string; topics: Topic[]; fives: FiveTopic[]; fates: FateQuestion[]; chara: number; version: string; minPlayers: number;
  bots?: number; // 動作確認用：CPU の参加者の数（運命の二者択一でだけ動く）
  onOpen(session: HostSession): void;
  onView(view: PlayerView): void;
  onFail(msg: string): void;
}

export function startHost(o: HostOptions): void {
  const code = genCode();
  const peer = new Peer(PREFIX + code, peerOptions());
  const conns: Record<string, Conn> = {};
  let room: RoomState = createRoom(code, o.id, o.minPlayers);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let hb: ReturnType<typeof setInterval> | null = null;
  let opened = false;

  const sendTo = (c: Conn | undefined, m: HostMsg) => { if (c?.open) c.send(m); };

  // ===== 動作確認用の CPU（?dev&bots=9）。運命の二者択一で、出題のたびに左右へ動く =====
  const BOT_NAMES = ['じろう', 'さくら', 'ゆうき', 'みさき', 'けんた', 'あおい', 'りく', 'ひなた', 'そうた'];
  const bots = BOT_NAMES.slice(0, Math.max(0, Math.min(BOT_NAMES.length, o.bots ?? 0))).map((name, i) => ({ id: `bot${i + 1}`, name }));
  let botTimers: ReturnType<typeof setTimeout>[] = [];
  let botTurn = '';
  function runBots() {
    const g = room.game;
    if (!bots.length || g?.kind !== 'fate' || g.phase !== 'question') return;
    const turn = `${room.gameNo}-${g.round}`;
    if (turn === botTurn) return;
    botTurn = turn;
    botTimers.forEach(clearTimeout);
    botTimers = [];
    const right = g.deck[g.round].rightSide, wrong = right === 'L' ? 'R' : 'L';
    const span = room.fateTime * 1000 - 600;
    for (const b of bots) {
      // 生き残りは6割5分で正解へ。ゴーストはでたらめに動いて惑わせる。ときどき途中で迷って逆へ行く
      const last = b.id in g.out ? (Math.random() < 0.5 ? 'L' : 'R') : Math.random() < 0.65 ? right : wrong;
      const steps = Math.random() < 0.35 ? [last === 'L' ? 'R' : 'L', last] as const : [last] as const;
      const times = steps.map(() => 400 + Math.random() * span).sort((x, y) => x - y);
      steps.forEach((side, i) => botTimers.push(setTimeout(() => dispatch(b.id, { t: 'move', side }), times[i])));
    }
  }

  function broadcast() {
    const now = Date.now();
    for (const p of room.players) {
      const v = viewFor(room, p.id, now);
      if (p.id === o.id) o.onView(v);
      else sendTo(conns[p.id], { t: 'state', state: v });
    }
  }

  // 操作を受けて状態を進める。変わったら全員に送り、次のタイマーを仕掛け直す
  function dispatch(from: string, a: Action) {
    const next = reduce(room, { ...a, from } as never, { now: Date.now(), random: Math.random });
    if (next === room) return;
    room = next;
    broadcast();
    runBots();
    if (timer) clearTimeout(timer);
    const t = nextTimer(room);
    timer = t ? setTimeout(() => dispatch(o.id, t.action), Math.max(0, t.at - Date.now())) : null;
  }

  function reject(c: Conn, msg: string) {
    sendTo(c, { t: 'error', msg });
    setTimeout(() => c.close(), 500);
  }

  const gone = (c: Conn) => {
    if (c.pid && conns[c.pid] === c) { delete conns[c.pid]; dispatch(c.pid, { t: 'leave' }); }
  };

  peer.on('open', () => {
    opened = true;
    // 3秒ごとに合図を送り、10秒何も届かない参加者は切れたとみなす（スマホでブラウザが裏に回ると close が届かないことがある）
    hb = setInterval(() => {
      for (const c of Object.values(conns)) {
        if (Date.now() - c.lastSeen > DEAD_MS) { gone(c); try { c.close(); } catch { /* 既に閉じている */ } }
        else sendTo(c, { t: 'ping' });
      }
    }, HEARTBEAT_MS);
    dispatch(o.id, { t: 'join', name: o.name, key: o.key, topics: o.topics, fives: o.fives, fates: o.fates, chara: o.chara, version: o.version });
    bots.forEach((b, i) => dispatch(b.id, { t: 'join', name: b.name, key: 'bot', topics: o.topics, chara: (o.chara + 1 + i * 2) % CHARA_COUNT, version: o.version }));
    const session: HostSession = {
      isHost: true, code,
      send(a) {
        if (a.t === 'kick') {
          sendTo(conns[a.id], { t: 'error', msg: 'ホストに退出させられました' });
          setTimeout(() => conns[a.id]?.close(), 300);
        }
        dispatch(o.id, a);
      },
      close() {
        if (timer) clearTimeout(timer);
        botTimers.forEach(clearTimeout);
        if (hb) clearInterval(hb);
        try { peer.destroy(); } catch { /* 既に閉じている */ }
      },
    };
    o.onOpen(session);
  });

  peer.on('connection', (raw: DataConnection) => {
    const c = raw as Conn;
    c.lastSeen = Date.now();
    c.on('data', (m: any) => {
      c.lastSeen = Date.now();
      if (m?.t === 'join' && !c.pid) {
        const pid = cleanId(m.id);
        if (!pid || pid === o.id) { c.close(); return; }
        // 既にいる人のIDで来たら、本人の鍵を持っているときだけ入れ替える（なりすましで本人を追い出させない）
        const err = joinError(room, pid, m);
        if (err) { reject(c, err); return; }
        c.pid = pid;
        const old = conns[pid];
        if (old && old !== c) { delete conns[pid]; old.close(); }
        conns[pid] = c;
        dispatch(pid, { t: 'join', name: m.name, key: m.key, topics: m.topics, fives: m.fives, fates: m.fates, chara: m.chara, version: m.version });
        return;
      }
      if (!c.pid || conns[c.pid] !== c || m?.t === 'pong') return;
      const a = parseAction(m);
      if (a) dispatch(c.pid, a);
    });
    c.on('close', () => gone(c));
    c.on('error', () => gone(c));
  });

  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); }); // ブローカーが切れても既存の接続は生きている
  peer.on('error', (e: { type: string }) => {
    if (e.type === 'unavailable-id' && !opened) { peer.destroy(); startHost(o); return; } // コードが使われていたら作り直す
    if (!opened) { peer.destroy(); o.onFail('部屋を作れませんでした: ' + e.type); }
  });
}
