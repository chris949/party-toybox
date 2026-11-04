// 自動テスト用の、接続の仲介サーバー（PeerJS の公開サーバーの代わり。外に出ない）
import { PeerServer } from 'peer';
PeerServer({ port: 9000, path: '/' });
console.log('peer server on :9000');
