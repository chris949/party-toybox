// ホスト側：部屋を作り、参加者とつながり、ルールのエンジンで状態を進めて、各参加者に見せてよい情報を送る
import Peer, { type DataConnection } from 'peerjs';
import { CHARA_COUNT } from '../core/constants';
import { createRoom, joinError, nextTimer, reduce } from '../core/room';
import type { Action, RoomState } from '../core/types';
import type { Topic } from '../modes/tier/topics';
import type { FiveTopic } from '../modes/five/topics';
import type { FateQuestion } from '../modes/fate/questions';
import { viewFor, type PlayerView } from '../core/view';
import { peerOptions } from './peerOptions';
import { cleanId, DEAD_MS, genCode, HEARTBEAT_MS, parseAction, PREFIX, type HostMsg } from './protocol';

type Conn = DataConnection & { pid?: string; lastSeen: number };

export interface HostSession { isHost: true; code: string; send(a: Action): void; addBot(): void; close(): void }

export interface HostOptions {
  id: string; key: string; name: string; topics: Topic[]; fives: FiveTopic[]; fates: FateQuestion[]; haikus: string[]; bouquets: string[]; chara: number; version: string; minPlayers: number;
  bots?: number; // 最初から入れておく CPU の参加者の数（動作確認用。?dev&bots=9）
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

  // ===== CPU の参加者（docs/spec.md の2.1）。ホストがロビーで足す。運命の二者択一とハイカー575 でだけ動く =====
  const BOT_NAMES = ['じろう', 'さくら', 'ゆうき', 'みさき', 'けんた', 'あおい', 'りく', 'ひなた', 'そうた'];
  const botsNow = () => room.players.filter(p => p.bot);
  // 空いている番号で1人足す（満員なら、部屋のルールが断る）
  function addBot() {
    const i = BOT_NAMES.findIndex((_, k) => !room.players.some(p => p.id === `bot${k + 1}`));
    if (i < 0) return;
    dispatch(`bot${i + 1}`, { t: 'join', name: BOT_NAMES[i], key: 'bot', topics: [], chara: (o.chara + 1 + i * 2) % CHARA_COUNT, version: o.version, bot: true });
  }
  let botTimers: ReturnType<typeof setTimeout>[] = [];
  let botTurn = '';
  // ハイカー575：ランダムなひらがなを書き、作品にはランダムに★を付ける
  function runHaikuBots() {
    const g = room.game;
    const bots = botsNow();
    if (!bots.length || g?.kind !== 'haiku' || g.phase === 'result') return;
    const rating = g.phase === 'recite' && !!g.show?.rating;
    if (g.phase === 'recite' && !rating) return;
    const turn = `${room.gameNo}-${g.phase}-${g.phase === 'write' ? g.step : g.show!.idx}`;
    if (turn === botTurn) return;
    botTurn = turn;
    botTimers.forEach(clearTimeout);
    const kana = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん';
    botTimers = bots.map(b => setTimeout(() => dispatch(b.id, rating
      ? { t: 'rate', round: g.show!.idx, n: 1 + Math.floor(Math.random() * 5) }
      : { t: 'kana', step: g.step, ch: kana[Math.floor(Math.random() * kana.length)] }), 600 + Math.random() * 2500));
  }
  // ブラインドブラフ：見えているカード（自分以外）から、勝負か降りるかを決める。強いカードが見えているほど降りやすい
  function runBluffBots() {
    const g = room.game;
    const bots = botsNow();
    if (!bots.length || g?.kind !== 'bluff' || g.phase !== 'talk') return;
    const turn = `${room.gameNo}-bluff-${g.round}`;
    if (turn === botTurn) return;
    botTurn = turn;
    botTimers.forEach(clearTimeout);
    botTimers = bots.filter(b => b.id in g.cards).map(b => {
      const best = Math.max(0, ...Object.entries(g.cards).filter(([id]) => id !== b.id).map(([, n]) => n));
      const go = Math.random() < (best >= 12 ? 0.25 : best >= 9 ? 0.5 : 0.8);
      return setTimeout(() => dispatch(b.id, { t: 'bet', round: g.round, go }), 2500 + Math.random() * 6000);
    });
  }
  // ワードブーケ：手札からでたらめに文を作る。親のときは、ランダムに1つ選ぶ
  function runBouquetBots() {
    const g = room.game;
    const bots = botsNow();
    if (!bots.length || g?.kind !== 'bouquet' || (g.phase !== 'compose' && g.phase !== 'choose')) return;
    const turn = `${room.gameNo}-bouquet-${g.phase}-${g.round}`;
    if (turn === botTurn) return;
    botTurn = turn;
    botTimers.forEach(clearTimeout);
    const rnd = (n: number) => Math.floor(Math.random() * n);
    if (g.phase === 'choose') {
      const ids = Object.keys(g.phrases);
      botTimers = bots.filter(b => b.id === g.parentId).map(b => setTimeout(() => dispatch(b.id, { t: 'choose', round: g.round, id: ids[rnd(ids.length)] }), 5000));
      return;
    }
    botTimers = bots.filter(b => b.id in g.hands).map(b => {
      // 「修飾＋名詞＋助詞＋言い回し」の形に並べる（手札は、名詞6・言い回し5・修飾3 の順に入っている）
      const tokens = [11 + rnd(3), rnd(6), -(1 + rnd(8)), 6 + rnd(5)];
      return setTimeout(() => dispatch(b.id, { t: 'phrase', round: g.round, tokens }), 3000 + Math.random() * 7000);
    });
  }
  function runBots() {
    runBouquetBots();
    runHaikuBots();
    runBluffBots();
    const g = room.game;
    const bots = botsNow();
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
    dispatch(o.id, { t: 'join', name: o.name, key: o.key, topics: o.topics, fives: o.fives, fates: o.fates, haikus: o.haikus, bouquets: o.bouquets, chara: o.chara, version: o.version });
    for (let i = 0; i < Math.min(BOT_NAMES.length, o.bots ?? 0); i++) addBot();
    const session: HostSession = {
      isHost: true, code, addBot,
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
        dispatch(pid, { t: 'join', name: m.name, key: m.key, topics: m.topics, fives: m.fives, fates: m.fates, haikus: m.haikus, bouquets: m.bouquets, chara: m.chara, version: m.version });
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
