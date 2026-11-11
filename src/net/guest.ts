// 参加者側：ホストにつなぐ。切れたらホームに戻さず、同じ人として自動で入り直す
import Peer, { type DataConnection } from 'peerjs';
import type { Action } from '../core/types';
import type { Topic } from '../core/topics';
import type { FiveTopic } from '../core/fives';
import type { PlayerView } from '../modes/tier/view';
import { peerOptions } from './peerOptions';
import { DEAD_MS, GIVEUP_MS, HEARTBEAT_MS, normalizeView, PREFIX, type GuestMsg } from './protocol';

export interface GuestOptions {
  code: string; id: string; key: string; name: string; topics: Topic[]; fives: FiveTopic[]; version: string;
  onView(view: PlayerView, rejoined: boolean): void;
  onReconnecting(on: boolean): void;
  onLeave(msg: string): void; // ホームに戻す（断られた・つながらない・再接続をあきらめた）
}

export interface GuestSession { isHost: false; code: string; send(a: Action): boolean; reconnect(): void; close(): void }

export function startGuest(o: GuestOptions): GuestSession {
  let peer: Peer | null = null;
  let conn: DataConnection | null = null;
  let lastSeen = Date.now();
  let joined = false;          // 一度でも部屋に入れたか
  let reconnectSince = 0;      // 0 = 再接続中ではない
  let closed = false;

  function connect() {
    const p = new Peer(peerOptions());
    peer = p;
    lastSeen = Date.now();
    let gotState = false;
    const mine = () => peer === p && !closed;
    const fail = (msg: string) => {
      if (!mine()) return;
      if (reconnectSince) retry(); else finish(msg);
    };
    const timeout = setTimeout(() => { if (mine() && !gotState) fail('接続できませんでした。コードを確認してください'); }, GIVEUP_MS);
    p.on('open', () => {
      if (!mine()) return;
      const c = p.connect(PREFIX + o.code, { reliable: true });
      conn = c;
      c.on('open', () => c.send({ t: 'join', id: o.id, key: o.key, name: o.name, topics: o.topics, fives: o.fives, version: o.version } satisfies GuestMsg));
      c.on('data', (m: any) => {
        if (!mine()) return;
        lastSeen = Date.now();
        if (m?.t === 'ping') c.send({ t: 'pong' } satisfies GuestMsg);
        else if (m?.t === 'state') {
          clearTimeout(timeout);
          gotState = true;
          const rejoined = !!reconnectSince;
          joined = true;
          if (reconnectSince) { reconnectSince = 0; o.onReconnecting(false); }
          o.onView(normalizeView(m.state), rejoined);
        } else if (m?.t === 'error') { clearTimeout(timeout); reconnectSince = 0; finish(String(m.msg)); }
      });
      c.on('close', () => { if (mine()) startReconnect(); });
    });
    p.on('error', (e: { type: string }) => {
      clearTimeout(timeout);
      fail(e.type === 'peer-unavailable' ? '部屋が見つかりません' : '接続エラー: ' + e.type);
    });
  }

  function drop() {
    const p = peer;
    peer = null; conn = null; // 古い接続からの通知を無視する
    try { p?.destroy(); } catch { /* 既に閉じている */ }
  }

  function startReconnect() {
    if (!joined || reconnectSince || closed) return;
    reconnectSince = Date.now();
    o.onReconnecting(true);
    drop();
    connect();
  }

  function retry() {
    drop();
    if (Date.now() - reconnectSince > GIVEUP_MS) {
      reconnectSince = 0;
      finish('ホストとの接続が切れました。部屋が残っていれば、同じタブで「参加」を押すとゲーム中でも復帰できます');
      return;
    }
    setTimeout(() => { if (reconnectSince && !closed) connect(); }, 1500);
  }

  function finish(msg: string) {
    session.close();
    o.onLeave(msg);
  }

  // ホストから10秒何も届かなければ再接続する。ブラウザに戻ってきたときは早めに確かめる
  const watch = setInterval(() => {
    if (joined && !reconnectSince && Date.now() - lastSeen > DEAD_MS) startReconnect();
  }, 2000);
  const onVisible = () => {
    if (document.visibilityState === 'visible' && joined && !reconnectSince && Date.now() - lastSeen > HEARTBEAT_MS + 1500) startReconnect();
  };
  document.addEventListener('visibilitychange', onVisible);

  const session: GuestSession = {
    isHost: false, code: o.code,
    send(a) {
      if (!conn?.open) return false;
      conn.send(a);
      return true;
    },
    reconnect: startReconnect,
    close() {
      closed = true;
      clearInterval(watch);
      document.removeEventListener('visibilitychange', onVisible);
      drop();
    },
  };
  connect();
  return session;
}
