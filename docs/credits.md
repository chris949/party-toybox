# 素材の出典と、使っているライブラリ

このリポジトリのコード・文書・同梱のお題・キャラクター・内蔵の曲は、[MIT License](../LICENSE) で公開している。
ここには、ゲームに同梱している素材（曲・効果音・フォント）の出典と、アプリに組み込んで配っているライブラリのライセンスをまとめる。素材やライブラリを足したら、ここに追記する。

## 素材

| 素材 | ファイル | 作者・入手先 | 利用条件（ライセンス） | 確認日 |
|---|---|---|---|---|
| フォント：M PLUS Rounded 1c | `@fontsource/m-plus-rounded-1c`（npm） | M+ FONTS PROJECT / Google Fonts | SIL Open Font License 1.1 | 2026-11-05 |
| 内蔵のBGM（ひだまりの町・せかせかタイム・ドキドキの瞬間・かちどき） | `src/audio/snes/songs.ts`（楽譜として書いたもの。音源ファイルはない） | このプロジェクトで作曲（オリジナル） | このリポジトリと同じ扱い | 2026-11-05 |
| 同梱のBGM・効果音 | （まだなし） | — | — | — |

**曲を足すときの確認事項**
- ゲームで使ってよいか
- 公開リポジトリに置いてよいか（素材そのものの再配布にあたらないか）
- クレジットの表記が必要か（必要なら、README とこの表に書く）

## 使っているライブラリ

アプリに組み込んで配っているもの（`package.json` の `dependencies`）。どれも、著作権表示とライセンスの文面を残すことが条件。文面は、各ライブラリのリポジトリ（下のリンク）と、`node_modules/<名前>/LICENSE` にある。

| ライブラリ | 何に使っているか | ライセンス | 著作権者 | 入手先 |
|---|---|---|---|---|
| React・React DOM | 画面 | MIT | Meta Platforms, Inc. and affiliates | https://react.dev/ |
| three.js | 3Dの舞台（運命の二者択一・まぎれろ！） | MIT | three.js authors | https://threejs.org/ |
| PeerJS | 端末同士の通信（P2P） | MIT | Michelle Bu and Eric Zhang | https://peerjs.com |
| Zustand | 画面の状態の管理 | MIT | Paul Henschel | https://github.com/pmndrs/zustand |
| Motion | 画面の動き | MIT | Motion B.V. | https://github.com/motiondivision/motion |
| dnd kit（@dnd-kit/core） | 並び替えのドラッグ | MIT | Claudéric Demers | https://github.com/clauderic/dnd-kit |
| howler.js | 音の再生 | MIT | James Simpson and GoldFire Studios, Inc. | https://howlerjs.com |
| canvas-confetti | 紙吹雪 | ISC | Kiril Vatev | https://github.com/catdad/canvas-confetti |
| Fontsource（M PLUS Rounded 1c） | フォント | SIL Open Font License 1.1 | The Rounded M+ Project Authors | https://fontsource.org/fonts/m-plus-rounded-1c |

- 開発のときだけ使うもの（Vite・TypeScript・Vitest・Playwright など。`devDependencies`）は、アプリに組み込まれないので、ここには載せていない
- 版は `package.json` と `package-lock.json` にある（確認日：2026-11-15）
- スタンプ伝言のスタンプは、端末に入っている絵文字を表示している（絵の部品は同梱していない）

