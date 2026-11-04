// 接続の仲介サーバーの指定。ふだんは PeerJS の無料公開サーバーを使う。
// 自動テストでは、手元で立てたサーバーを使うため ?peer=127.0.0.1:9000 を付ける。
// 他人が細工したリンクで別のサーバーへ誘導できないよう、自分の端末（localhost）で開いたときだけ受け付ける
import type { PeerOptions } from 'peerjs';

export function peerOptions(): PeerOptions {
  const base: PeerOptions = { debug: 0 };
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const custom = new URLSearchParams(location.search).get('peer');
  const m = custom?.match(/^([\w.-]+):(\d+)$/);
  if (!local || !m) return base;
  return { ...base, host: m[1], port: Number(m[2]), path: '/', secure: false, key: 'peerjs' };
}
