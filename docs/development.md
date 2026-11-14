# 開発者向け

React ＋ Vite ＋ TypeScript で作っています。構成と方針は [architecture.md](architecture.md) を見てください。

## 構成

| 場所 | 内容 |
|---|---|
| `src/core/` | どのモードでも共通のルール（部屋・参加・開始・CPU の参加者・見せる情報の共通部分）。画面も通信も使わない |
| `src/modes/<モード>/` | モードごとのフォルダ（`tier` ティアリスト／`five` セレクトファイブ／`fate` 運命の二者択一／`haiku` ハイカー575／`bluff` ブラインドブラフ／`bouquet` ワードブーケ／`blend` まぎれろ！／`bomb` 爆弾まわし／`relay` スタンプ伝言）。**仕様（`README.md`）**、ルール、お題の形、お題の作成画面、ロビーの設定、ゲーム画面、スタイルが入っている |
| `src/net/` | P2P 通信（PeerJS、見張り、自動再接続、CPU の参加者） |
| `src/app/` `src/ui/` | 画面の枠（ホーム・お題の設定・ルーム）と、共通の画面部品 |
| `src/audio/` `src/storage/` `src/styles/` | 音、端末への保存、共通のデザイン |
| `tests/` | ルールの自動テストと、CPU同士のシミュレーション |
| `e2e/` | 画面の通しテスト（Playwright。モードごとに1ファイル） |
| `docs/` | 共通の仕様書（`spec.md`）、技術構成、バックログ、テスト記録。**モードごとの仕様は、各モードのフォルダの `README.md`** |
| `CLAUDE.md` | 作業の決まり（仕様を先に直す、PR で入れる、など） |
| `legacy/v0.8.0.html` | 作り直す前の版（参照用。公開はされない） |

## 手元で動かす

```bash
npm install
npm run dev
```

表示された URL（http://localhost:5173/ など）を開きます。URL の末尾に `?dev` を付けると、2人から開始できます（動作確認用）。同じブラウザでもタブごとに別の参加者になるので、タブを複数開けば1人で通しで試せます。`?dev&bots=9` のように付けて部屋を作ると、CPU の参加者が入ります（最大9人。「運命の二者択一」「ハイカー575」「ブラインドブラフ」で動きます）。`?dev` のときは、開発者ツールから `__tlw.store`（画面の状態）と `__tlw.session`（通信）を触れます。

```bash
npm test
```

ルールの自動テストと、CPU 同士のシミュレーションが走ります。

```bash
npm run build && npm run e2e
```

画面の通しテスト（ブラウザ2つで1ゲーム遊ぶ）が走ります。初回は `npx playwright install chromium` が必要です。

依存ライブラリの更新とセキュリティの運用は [dependency-policy.md](dependency-policy.md) にまとめています。

## 進め方

1. 改善したいことは、まず `docs/backlog.md` に書き出す
2. 実装する前に `docs/spec.md` を更新して合意する
3. 1回の変更は1テーマ。実装したらテストプレイで確かめ、結果を `docs/playtest-log.md` に記録する

## 公開

`main` ブランチに push すると、GitHub Actions がビルド → GitHub Pages への公開を行います（1分ほど）。テスト（型チェック・ルールのテスト・画面の通しテスト・`npm audit`）は PR のときに走り、通らないとマージできません。公開のときはテストを走らせないので、PR を通さずに直接 push したものはテストなしで公開されます。

## 曲と効果音を同梱する

1. 曲は `public/audio/bgm/`、効果音は `public/audio/se/` にファイルを置く
2. `public/audio/manifest.json` にパスを書く（例：`"bgm": { "lobby": "bgm/lobby.mp3" }`）。場面は `lobby`・`pick`・`reveal`・`result`、効果音は `click`・`start`・`pop`・`tick`・`drumroll`・`fanfare`・`perfect`
3. 出典と利用規約を [credits.md](credits.md) に書く

書いていないものは、内蔵の音で鳴ります。BGM は `src/audio/snes/songs.ts` に楽譜として書いたスーファミ風のオリジナル曲で、`npm run dev` のあと `/bgm-preview.html` で試聴できます。楽譜の書き方は `src/audio/snes/engine.ts` の先頭にあります。**公開リポジトリに入るので、再配布してよい音源だけを置いてください。**

公開するたびに `package.json` の `version` を上げてください。ホーム右上に表示され（マウスを載せるとコミットのIDも出ます）、ホストと違う版の参加者がいるとロビーで警告が出ます。
