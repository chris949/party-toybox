// ダイスレイドの盤面の画面の進行役。ゲームは、ここでは進めない。
// 親のページ（パーティトイボックスの部屋）から「いまの盤面」と「直前に起きたこと」を受け取って演出し、自分の番の操作を親へ渡す。
// 親とのやり取り：
//   親 → ここ  { t: 'init', mySeat, host }      最初に1回
//               { t: 'state', game, events, seq }  操作が1つ進むたび
//   ここ → 親  { t: 'ready' }                    画面の用意ができた
//               { t: 'act', seq, action }         自分の番の操作
//               { t: 'lobby' }                    結果の画面で、ホストが「ロビーに戻る」を押した
import './style.css';
import Phaser from 'phaser';
import type { Action, GameEvent, GameState } from '../../src/modes/raid/engine';
import { Hud } from './hud';
import { EntityBook, Overlay } from './overlay';
import { BoardScene } from './scene';
import { preloadSdImages } from './sd';
import { sound } from './sound';
import { music } from './music';
import { ASSETS } from './assets';

for (const [name, url] of Object.entries(ASSETS.sfx)) if (url) sound.register(name as Parameters<typeof sound.register>[0], url);

const scene = new BoardScene();
try {
  if (localStorage.getItem('dr-view') === 'overview') scene.viewMode = 'overview';
} catch {
  /* 保存領域が使えない環境でも既定（追従）で動く */
}
/** 画面サイズが0のまま（非表示のタブなど）でWebGLを初期化すると失敗するので、大きさが決まってから起動する */
function bootPhaser() {
  if (window.innerWidth < 1 || window.innerHeight < 1) {
    window.addEventListener('resize', bootPhaser, { once: true });
    return;
  }
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#14121f',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [scene],
  });
}
bootPhaser();
preloadSdImages();

interface Update { game: GameState; events: GameEvent[]; seq: number }
const toParent = (m: unknown) => window.parent.postMessage(m, location.origin);

/** 親から届いた盤面で動く進行役（元は、この中でゲームを進めていた。いまは、ホストが進めたものを受け取るだけ） */
class NetGame {
  private state: GameState;
  private seq: number;
  private busy = true;
  private queue: Update[] = [];
  private hud: Hud;
  private overlay: Overlay;
  private book = new EntityBook();

  constructor(first: Update, mySeat: number, private host: boolean) {
    this.state = first.game;
    this.seq = first.seq;
    // 操作できるのは、自分の席だけ（見ているだけの人は、どの席も操作できない）
    const humans = new Set(mySeat >= 0 ? [mySeat] : []);
    this.book.remember(this.state);
    this.overlay = new Overlay(this.book, humans);
    document.addEventListener('pointerdown', this.skip);
    this.hud = new Hud(scene, this.overlay, humans, {
      dispatch: (a) => this.dispatch(a),
      restart: () => { if (this.host) toParent({ t: 'lobby' }); },
      setSpeed: (n) => {
        scene.speed = n;
        this.overlay.speed = n;
      },
    });
    scene.speed = this.hud.speed;
    this.overlay.speed = this.hud.speed;
    scene.render(this.state);
    if (this.state.boss) music.play('boss'); else music.play('field');
    this.render(true);
    const start = this.state.result || this.state.step !== 'roll' ? Promise.resolve() : this.overlay.turnCutin(this.state.players[this.state.current]);
    void start.then(() => { this.busy = false; this.render(false); void this.pump(); });
  }

  /** 演出中に画面をクリックすると早送り（防御/回避の選択中は除く） */
  private skip = (ev: Event) => {
    if (!this.busy || this.overlay.isReacting) return;
    if ((ev.target as HTMLElement).closest('button')) return;
    this.overlay.skipping = true;
    scene.skipping = true;
  };

  /** 自分の番の操作：親へ渡す（ホストが受け付ければ、次の盤面が届く） */
  private dispatch(action: Action) {
    if (this.busy || this.queue.length) return;
    toParent({ t: 'act', seq: this.seq, action });
  }

  push(u: Update) {
    if (u.seq <= this.seq || this.queue.some((q) => q.seq === u.seq)) return;
    this.queue.push(u);
    void this.pump();
  }

  /** 届いた盤面を、順に演出していく。たまってきたら、演出を飛ばして追いつく */
  private async pump() {
    if (this.busy) return;
    const u = this.queue.shift();
    if (!u) return;
    this.busy = true;
    const prev = this.state;
    const jumped = u.seq !== this.seq + 1; // 途中が抜けた（つなぎ直したあと など）：演出なしで、いまの盤面にする
    const hurry = this.queue.length >= 3;
    this.book.remember(u.game);
    this.overlay.hideReact();
    this.render(true);
    if (!jumped) {
      if (hurry) { this.overlay.skipping = true; scene.skipping = true; }
      for (const e of u.events) {
        playEventSound(e);
        // ダイス・イベント・戦闘は画面中央の演出、それ以外は盤面上で見せる
        if (await this.overlay.play(e, prev)) continue;
        if (e.t === 'spawn') scene.render(u.game);
        await scene.playOne(e);
      }
    }
    scene.render(u.game);
    this.state = u.game;
    this.seq = u.seq;
    this.overlay.skipping = false;
    scene.skipping = false;
    if (!jumped && !hurry && this.isNewTurn(prev, this.state)) await this.overlay.turnCutin(this.state.players[this.state.current]);
    this.busy = false;
    this.render(false);
    void this.pump();
  }

  private render(busy: boolean) {
    this.hud.render(this.state, busy);
    // 結果の画面の「もう一度」は、部屋のホストが「ロビーに戻る」として使う
    const again = document.getElementById('again') as HTMLButtonElement | null;
    if (again) {
      again.textContent = this.host ? 'ロビーに戻る' : 'ホストがロビーに戻すのを待っています…';
      again.disabled = !this.host;
    }
  }

  /** 新しいプレイヤーの手番が始まったか（ターン開始のカットイン用） */
  private isNewTurn(prev: GameState, next: GameState) {
    return !next.result && next.step === 'roll' && (prev.current !== next.current || prev.round !== next.round);
  }
}

/** 盤面上の出来事に合わせた効果音（ダイス・戦闘・イベントの音は Overlay 側で鳴らす） */
function playEventSound(e: GameEvent) {
  switch (e.t) {
    case 'ko': sound.play('ko'); break;
    case 'heal': sound.play('heal'); break;
    case 'bossSpawn': sound.play('roar'); music.play('boss'); break;
    case 'bossEnrage': sound.play('roar'); break;
    case 'bossAttack': if (e.intent.base > 0) sound.play('roar'); break;
    case 'gameover': music.stop(); sound.play(e.result === 'win' ? 'win' : 'lose'); break;
    case 'text': if (e.text.includes('🪙')) sound.play('coin'); break;
    case 'damage': if (e.target.kind === 'player') sound.play('hit'); break;
    default: break;
  }
}

let game: NetGame | null = null;
let seat = -1, host = false;
const early: Update[] = []; // 画面の用意ができる前に届いた盤面

window.addEventListener('message', (ev) => {
  // 同じ場所から開かれた、親のページからの連絡だけを受け取る
  if (ev.origin !== location.origin || ev.source !== window.parent) return;
  const m = ev.data as { t?: string; mySeat?: number; host?: boolean } & Partial<Update>;
  if (m?.t === 'init') { seat = Number(m.mySeat ?? -1); host = !!m.host; return; }
  if (m?.t !== 'state' || !m.game || typeof m.seq !== 'number') return;
  const u: Update = { game: m.game, events: m.events ?? [], seq: m.seq };
  if (game) game.push(u);
  else if (sceneReady) game = new NetGame(u, seat, host);
  else early.push(u);
});

let sceneReady = false;
void scene.ready.then(() => {
  sceneReady = true;
  toParent({ t: 'ready' });
  // 用意ができる前に届いていた分は、いちばん新しい盤面から始める
  const last = early.pop();
  if (last) game = new NetGame(last, seat, host);
});
