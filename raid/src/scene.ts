import Phaser from 'phaser';
import { BOARD, BOSS, ENEMIES, TILE_INFO } from '../../src/modes/raid/engine';
import type { EntityRef, GameEvent, GameState, TileType } from '../../src/modes/raid/engine';
import { ASSETS } from './assets';
import { allSdFiles, motionFrames, SD, sdScale, type Motion, type SdKey } from './sd';
import { sound } from './sound';

/** ボード上のSDキャラ（プレイヤー・ザコ・ボス） */
interface BoardSd {
  img: Phaser.GameObjects.Image;
  key: SdKey;
  motion: Motion;
  index: number;
  last: number;
  /** 画面上で左を向いているか */
  left: boolean;
}

/** クォータービュー（アイソメトリック）の1マスの大きさ */
const TW = 104;
const TH = 52;
const DEPTH = 14;

export const PLAYER_COLORS = [0x5da9ff, 0xff7a6b, 0x7ee08a, 0xffd25d];

const TILE_COLORS: Record<TileType, number> = {
  start: 0xf2c14e,
  coin: 0xe0b84a,
  card: 0x5aa0e0,
  chest: 0xb36bf0,
  heal: 0x4fcf8a,
  shop: 0xf08a4b,
  fate: 0x7b7fd8,
  warp: 0x3cc3c9,
  trap: 0xd9485b,
  thief: 0x8a5a44,
  curse: 0x5b3a70,
  ambush: 0xb03040,
};

const OFFSETS = [
  [0, 0], [-18, -6], [18, -6], [0, -14], [-18, 8], [18, 8],
];

/** ボード上でのSDの高さ（足元から頭まで） */
function SDH(key: SdKey): number {
  const f = SD[key].idle[0];
  return f.h * f.oy * sdScale(key, 'board');
}

export function iso(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) };
}

function shade(color: number, f: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return Phaser.Display.Color.GetColor(Math.floor(c.red * f), Math.floor(c.green * f), Math.floor(c.blue * f));
}

export class BoardScene extends Phaser.Scene {
  private players = new Map<number, Phaser.GameObjects.Container>();
  /** 'p0'（プレイヤー）・'e3'（ザコ）・'boss' をキーに管理する */
  private sd = new Map<string, BoardSd>();
  private enemies = new Map<number, Phaser.GameObjects.Container>();
  private boss!: Phaser.GameObjects.Container;
  private bossLabel!: Phaser.GameObjects.Text;
  private dangerLayer!: Phaser.GameObjects.Graphics;
  private highlightLayer!: Phaser.GameObjects.Graphics;
  private previewLayer!: Phaser.GameObjects.Graphics;
  private highlighted: number[] = [];
  private onTileClick: ((tile: number) => void) | null = null;
  private arrows: Phaser.GameObjects.Container[] = [];
  /** マスにマウスを乗せたとき（説明の表示用） */
  onHover: ((tile: number | null, x: number, y: number) => void) | null = null;
  private dangerTween?: Phaser.Tweens.Tween;
  /** 演出速度（CPU早送り用） */
  speed = 1;
  /** カメラ：follow＝注目しているキャラに寄る、overview＝盤面全体 */
  viewMode: 'follow' | 'overview' = 'follow';
  private focus: Phaser.GameObjects.Container | null = null;
  private overviewUntil = 0;
  private fitZoom = 1;
  private cam = { x: 0, y: 0, zoom: 1, ready: false };
  private narrow = false;
  /** プレイヤーが手で動かした分（ドラッグ・ホイール）。「現在地に戻る」で0に戻る */
  private pan = { x: 0, y: 0 };
  private zoomMul = 1;
  private lastActor = -1;
  ready: Promise<void>;
  private resolveReady!: () => void;

  constructor() {
    super('board');
    this.ready = new Promise((r) => (this.resolveReady = r));
  }

  preload() {
    for (const file of allSdFiles()) this.load.image(file, file);
    this.load.image('board_bg', ASSETS.boardBackground.file);
  }

  create() {
    this.cameras.main.setBackgroundColor('#14121f');
    this.drawBackground();
    this.drawBoard();
    this.dangerLayer = this.add.graphics().setDepth(900);
    this.previewLayer = this.add.graphics().setDepth(901);
    this.highlightLayer = this.add.graphics().setDepth(902);
    this.createBoss();
    this.fitCamera();
    this.scale.on('resize', () => this.fitCamera());
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      this.onHover?.(this.tileAt(ptr.worldX, ptr.worldY), ptr.x, ptr.y);
    });
    // ドラッグで盤面を動かす（動かさずに離したらマスのクリック）・ホイールで拡大縮小
    let down: { x: number; y: number; moved: boolean } | null = null;
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      down = { x: ptr.x, y: ptr.y, moved: false };
    });
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!down || !ptr.isDown) return;
      const dx = ptr.x - ptr.prevPosition.x;
      const dy = ptr.y - ptr.prevPosition.y;
      if (!down.moved && Math.hypot(ptr.x - down.x, ptr.y - down.y) < 6) return;
      down.moved = true;
      this.pan.x -= dx / this.cam.zoom;
      this.pan.y -= dy / this.cam.zoom;
      // ドラッグ中はカメラが即座についてくるように
      this.cam.x -= dx / this.cam.zoom;
      this.cam.y -= dy / this.cam.zoom;
    });
    this.input.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      const wasDrag = down?.moved;
      down = null;
      if (wasDrag || !this.onTileClick) return;
      const tile = this.tileAt(ptr.worldX, ptr.worldY);
      if (tile !== null && this.highlighted.includes(tile)) this.onTileClick(tile);
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.zoomMul = Phaser.Math.Clamp(this.zoomMul * (dy > 0 ? 0.9 : 1.1), 0.5, 2.2);
    });
    this.time.addEvent({ delay: 40, loop: true, callback: () => this.tickSd() });
    this.resolveReady();
  }

  // ───────────────────────── SDキャラのコマ送り ─────────────────────────

  private applySd(sd: BoardSd) {
    const { frames } = motionFrames(sd.key, sd.motion);
    const f = frames[sd.index % frames.length];
    const flip = sd.left !== (SD[sd.key].facing === 'left');
    sd.img.setTexture(f.file);
    sd.img.setOrigin(flip ? 1 - f.ox : f.ox, f.oy);
    sd.img.setFlipX(flip);
  }

  private addSd(id: string, key: SdKey, img: Phaser.GameObjects.Image, left: boolean) {
    img.setScale(sdScale(key, 'board'));
    const sd: BoardSd = { img, key, motion: 'idle', index: this.sd.size % 3, last: 0, left };
    this.sd.set(id, sd);
    this.applySd(sd);
  }

  private tickSd() {
    const now = this.time.now;
    for (const sd of this.sd.values()) {
      const { frames, fps, loop } = motionFrames(sd.key, sd.motion);
      if (now - sd.last < 1000 / (fps * this.speed)) continue;
      sd.last = now;
      if (sd.index + 1 < frames.length) sd.index++;
      else if (loop) sd.index = 0;
      else continue;
      this.applySd(sd);
    }
  }

  /** モーションを切り替える。holdMs を指定するとその後に待機へ戻る */
  setMotion(id: string, motion: Motion, holdMs?: number) {
    const sd = this.sd.get(id);
    if (!sd) return;
    sd.motion = motion;
    sd.index = 0;
    sd.last = this.time.now;
    this.applySd(sd);
    if (holdMs) window.setTimeout(() => sd.motion === motion && this.setMotion(id, 'idle'), holdMs / this.speed);
  }

  private face(id: string, left: boolean) {
    const sd = this.sd.get(id);
    if (!sd || sd.left === left) return;
    sd.left = left;
    this.applySd(sd);
  }

  private fitCamera() {
    const w = this.scale.width;
    const h = this.scale.height;
    const boardW = TW * 7 + 40;
    const boardH = TH * 7 + 180;
    this.narrow = w < 900;
    // PCでは左右のパネル、スマホでは上下のパネルを避ける
    const availW = this.narrow ? w : w - 540;
    const availH = this.narrow ? h - 330 : h - 230;
    this.fitZoom = Phaser.Math.Clamp(Math.min(availW / boardW, availH / boardH), 0.4, 1.6);
    if (!this.cam.ready) {
      const t = this.target();
      this.cam = { x: t.x, y: t.y, zoom: t.zoom, ready: true };
    }
  }

  /** いまカメラが向かうべき位置と倍率 */
  private target(): { x: number; y: number; zoom: number } {
    const overview = this.viewMode === 'overview' || this.time.now < this.overviewUntil || !this.focus;
    if (overview) {
      const c = iso(3, 3);
      const zoom = this.fitZoom * this.zoomMul;
      return { x: c.x + this.pan.x, y: c.y + (this.narrow ? -60 : 10) / this.fitZoom + this.pan.y, zoom };
    }
    const zoom = Math.min(2, this.fitZoom * 1.7) * this.zoomMul;
    // 下の操作パネルに隠れないよう、注目点を画面の少し上に置く
    return { x: this.focus!.x + this.pan.x, y: this.focus!.y + (this.narrow ? 40 : 25) / zoom + this.pan.y, zoom };
  }

  /** 手で動かしたカメラを元に戻す（現在地へ） */
  resetView() {
    this.pan = { x: 0, y: 0 };
    this.zoomMul = 1;
  }

  /** 毎フレーム、カメラを目標へなめらかに寄せる（キャラの移動に追従する） */
  update(_time: number, delta: number) {
    if (!this.cam.ready) return;
    const t = this.target();
    const k = 1 - Math.pow(0.001, delta / 1000 * this.speed * 1.4);
    this.cam.x += (t.x - this.cam.x) * k;
    this.cam.y += (t.y - this.cam.y) * k;
    this.cam.zoom += (t.zoom - this.cam.zoom) * k;
    const cam = this.cameras.main;
    cam.setZoom(this.cam.zoom);
    cam.centerOn(this.cam.x, this.cam.y);
  }

  /** カメラが注目するコマを決める */
  focusOn(ref: EntityRef | null) {
    if (!ref || ref.kind === 'boss') this.focus = null;
    else this.focus = (ref.kind === 'player' ? this.players.get(ref.id) : this.enemies.get(ref.id)) ?? null;
  }

  /** 一時的に盤面全体を見せる（ボスの攻撃など） */
  showOverview(ms: number) {
    this.overviewUntil = this.time.now + ms / this.speed;
  }

  private drawBackground() {
    const g = this.add.graphics().setDepth(-10);
    const c = iso(3, 3);
    for (let i = 8; i > 0; i--) {
      g.fillStyle(0x2a2150, 0.08);
      g.fillEllipse(c.x, c.y + 20, TW * 4 * (i / 4), TH * 4 * (i / 4));
    }
    // 星
    const rnd = new Phaser.Math.RandomDataGenerator(['dice-raid']);
    for (let i = 0; i < 120; i++) {
      g.fillStyle(0xffffff, rnd.realInRange(0.1, 0.5));
      g.fillCircle(c.x + rnd.between(-1400, 1400), c.y + rnd.between(-900, 900), rnd.realInRange(0.5, 1.8));
    }
  }

  protected diamond(g: Phaser.GameObjects.Graphics, cx: number, cy: number, scale = 1) {
    const w = (TW / 2) * scale;
    const h = (TH / 2) * scale;
    g.fillPoints([
      new Phaser.Math.Vector2(cx, cy - h),
      new Phaser.Math.Vector2(cx + w, cy),
      new Phaser.Math.Vector2(cx, cy + h),
      new Phaser.Math.Vector2(cx - w, cy),
    ], true);
  }

  /** 丸いマスの形（斜めから見た円＝楕円） */
  private disc(g: Phaser.GameObjects.Graphics, cx: number, cy: number, scale = 1) {
    g.fillEllipse(cx, cy, TW * 0.74 * scale, TH * 0.74 * scale);
  }

  /**
   * 盤面：石の床（仮。ボード背景の絵ができたら差し替え）の上に、道でつながった丸い台座のマスを置く
   */
  private drawBoard() {
    // 背景（部屋の床と壁）。画像の (centerX, centerY) をボード中央に合わせる
    const bg = ASSETS.boardBackground;
    const center = iso(3, 3);
    const tex = this.textures.get('board_bg').getSourceImage() as HTMLImageElement;
    this.add.image(center.x, center.y, 'board_bg').setOrigin(bg.centerX / tex.width, bg.centerY / tex.height).setDepth(-6);
    // 道（マス同士のつながり）
    const road = this.add.graphics().setDepth(-4);
    const drawn = new Set<string>();
    for (const t of BOARD.tiles) {
      for (const n of BOARD.adj[t.id]) {
        const key = [t.id, n].sort((a, b) => a - b).join('-');
        if (drawn.has(key)) continue;
        drawn.add(key);
        const a = iso(t.x, t.y);
        const b = iso(BOARD.tiles[n].x, BOARD.tiles[n].y);
        road.lineStyle(26, 0x2a2233, 0.9);
        road.lineBetween(a.x, a.y + 4, b.x, b.y + 4);
        road.lineStyle(18, 0xb9a27a, 0.55);
        road.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    // マス：厚みのある丸い台座
    const tiles = [...BOARD.tiles].sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const t of tiles) {
      const { x, y } = iso(t.x, t.y);
      const g = this.add.graphics().setDepth((t.x + t.y) * 10);
      const base = TILE_COLORS[t.type];
      const w = TW * 0.74;
      const h = TH * 0.74;
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(x, y + DEPTH + 4, w + 6, h + 4);
      g.fillStyle(shade(base, 0.4), 1);
      g.fillEllipse(x, y + DEPTH, w, h);
      g.fillRect(x - w / 2, y, w, DEPTH);
      g.fillStyle(0xf3ead2, 1);
      g.fillEllipse(x, y, w, h);
      g.fillStyle(t.zone === 'inner' ? shade(base, 0.85) : base, 1);
      g.fillEllipse(x, y, w * 0.84, h * 0.84);
      g.fillStyle(0xffffff, 0.18);
      g.fillEllipse(x - w * 0.12, y - h * 0.14, w * 0.5, h * 0.36);
      const icon = TILE_INFO[t.type].icon;
      if (icon) this.add.text(x, y - 3, icon, { fontSize: '22px' }).setOrigin(0.5).setDepth((t.x + t.y) * 10 + 1);
    }
    // ボスの祭壇
    const c = iso(3, 3);
    const g = this.add.graphics().setDepth(60);
    g.fillStyle(0x2a1430, 1);
    g.fillEllipse(c.x, c.y + 10, TW * 1.3, TH * 1.3);
    g.fillStyle(0x5a2a5e, 1);
    g.fillEllipse(c.x, c.y, TW * 1.3, TH * 1.3);
    g.lineStyle(3, 0xff6b7a, 0.6);
    g.strokeEllipse(c.x, c.y, TW * 1.1, TH * 1.1);
  }

  private createBoss() {
    const c = iso(3, 3);
    const shadow = this.add.ellipse(0, 10, 90, 34, 0x000000, 0.4);
    const body = this.add.image(0, 4, '');
    this.bossLabel = this.add.text(0, -96, '', {
      fontSize: '14px', color: '#ffd6da', backgroundColor: '#0008', padding: { x: 6, y: 2 },
    }).setOrigin(0.5);
    this.boss = this.add.container(c.x, c.y, [shadow, body, this.bossLabel]).setDepth(61);
    this.addSd('boss', 'boss', body, true);
    this.bossLabel.setY(-SDH('boss') - 14);
    this.tweens.add({ targets: body, y: -4, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  // ───────────────────────── 状態の反映 ─────────────────────────

  render(s: GameState) {
    // ボス
    if (s.boss) {
      this.boss.setAlpha(1);
      this.bossLabel.setText(`${s.boss.name} ${Math.max(0, s.boss.hp)}/${s.boss.maxHp}`);
      (this.boss.list[1] as Phaser.GameObjects.Image).setTint(s.boss.enraged ? 0xff8080 : 0xffffff);
    } else {
      this.boss.setAlpha(0.35);
      this.bossLabel.setText(`💤 出現まであと${s.config.bossRound - s.round}ラウンド`);
    }
    // 敵
    const alive = new Set(s.enemies.map((e) => e.id));
    for (const [id, c] of this.enemies) {
      if (alive.has(id)) continue;
      c.destroy();
      this.enemies.delete(id);
      this.sd.delete(`e${id}`);
    }
    for (const e of s.enemies) {
      let c = this.enemies.get(e.id);
      if (!c) {
        const def = ENEMIES[e.kind];
        // 名前とHPの吹き出し
        const plate = this.add.graphics();
        plate.fillStyle(0x1b1424, 0.92);
        plate.fillRoundedRect(-38, -66, 76, 26, 8);
        plate.lineStyle(2, 0xff6b7a, 1);
        plate.strokeRoundedRect(-38, -66, 76, 26, 8);
        plate.fillStyle(0x1b1424, 0.92);
        plate.fillTriangle(-5, -41, 5, -41, 0, -35);
        const img = this.add.image(0, 2, '');
        c = this.add.container(0, 0, [
          this.add.ellipse(0, 4, 36, 14, 0x000000, 0.35),
          img,
          plate,
          this.add.text(0, -60, def.name, { fontSize: '10px', color: '#ffd6da', fontStyle: 'bold' }).setOrigin(0.5, 0),
          this.add.rectangle(-30, -47, 60, 5, 0x000000).setOrigin(0, 0.5),
          this.add.rectangle(-30, -47, 60, 5, 0xff4d5e).setOrigin(0, 0.5),
          this.add.text(33, -47, '', { fontSize: '9px', color: '#fff' }).setOrigin(0, 0.5).setVisible(false),
        ]);
        this.addSd(`e${e.id}`, e.kind, img, true);
        // 吹き出しを頭の上に
        const lift = Math.max(0, SDH(e.kind) - 36);
        for (const k of [2, 3, 4, 5, 6]) (c.list[k] as unknown as Phaser.GameObjects.Components.Transform).y -= lift;
        c.setAlpha(0);
        this.tweens.add({ targets: c, alpha: 1, duration: 300 });
        this.enemies.set(e.id, c);
      }
      (c.list[3] as Phaser.GameObjects.Text).setText(`${ENEMIES[e.kind].name} ${Math.max(0, e.hp)}/${e.maxHp}`);
      (c.list[5] as Phaser.GameObjects.Rectangle).width = 60 * Math.max(0, e.hp) / e.maxHp;
      const t = BOARD.tiles[e.tile];
      const p = iso(t.x, t.y);
      c.setPosition(p.x + 22, p.y - 4).setDepth((t.x + t.y) * 10 + 4);
    }
    // プレイヤー
    const byTile = new Map<number, number[]>();
    for (const p of s.players) byTile.set(p.tile, [...(byTile.get(p.tile) ?? []), p.id]);
    for (const p of s.players) {
      let c = this.players.get(p.id);
      if (!c) {
        // SDキャラのコマ：足元にプレイヤー色の台座
        const img = this.add.image(0, 2, '');
        c = this.add.container(0, 0, [
          this.add.ellipse(0, 2, 40, 16, 0x000000, 0.45),
          this.add.ellipse(0, 0, 34, 13, PLAYER_COLORS[p.id]).setStrokeStyle(2, 0xffffff),
          img,
          this.add.text(0, -84, '▼', { fontSize: '16px', color: '#ffcc4d', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setVisible(false),
        ]);
        this.addSd(`p${p.id}`, p.classId, img, false);
        this.players.set(p.id, c);
      }
      const active = s.players[s.current].id === p.id && !s.result;
      const base = c.list[1] as Phaser.GameObjects.Ellipse;
      base.setStrokeStyle(active ? 3 : 2, active ? 0xffcc4d : 0xffffff);
      const marker = c.list[3] as Phaser.GameObjects.Text;
      if (active !== marker.visible) {
        marker.setVisible(active);
        this.tweens.killTweensOf(marker);
        if (active) this.tweens.add({ targets: marker, y: -92, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
      const pos = this.playerPos(p.tile, byTile.get(p.tile)!.indexOf(p.id));
      c.setPosition(pos.x, pos.y);
      const t = BOARD.tiles[p.tile];
      c.setDepth((t.x + t.y) * 10 + 5 + p.id * 0.1);
    }
    this.setDanger(s.boss?.intent?.tiles ?? []);
    if (!s.result) {
      this.focusOn({ kind: 'player', id: s.players[s.current].id });
      if (this.lastActor !== s.current) this.resetView();
      this.lastActor = s.current;
    }
  }

  private playerPos(tile: number, slot: number) {
    const t = BOARD.tiles[tile];
    const p = iso(t.x, t.y);
    const [ox, oy] = OFFSETS[slot % OFFSETS.length];
    return { x: p.x + ox - 8, y: p.y + oy };
  }

  private setDanger(tiles: number[]) {
    this.dangerLayer.clear();
    this.dangerTween?.remove();
    if (!tiles.length) return;
    for (const id of tiles) {
      const t = BOARD.tiles[id];
      const p = iso(t.x, t.y);
      this.dangerLayer.fillStyle(0xff2340, 0.45);
      this.disc(this.dangerLayer, p.x, p.y, 1.05);
    }
    this.dangerLayer.setAlpha(0.9);
    this.dangerTween = this.tweens.add({ targets: this.dangerLayer, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
  }

  /** クリック可能なマスを強調する（分岐の選択など） */
  setHighlights(tiles: number[], onClick: ((tile: number) => void) | null) {
    this.highlighted = tiles;
    this.onTileClick = onClick;
    this.highlightLayer.clear();
    for (const id of tiles) {
      const t = BOARD.tiles[id];
      const p = iso(t.x, t.y);
      this.highlightLayer.lineStyle(4, 0xffcc4d, 1);
      this.highlightLayer.fillStyle(0xffcc4d, 0.35);
      this.disc(this.highlightLayer, p.x, p.y, 1.1);
    }
  }

  /** 分かれ道：進める方向に矢印を出す。矢印かマスをクリックで選ぶ */
  setBranchArrows(from: number | null, options: number[], onClick: ((tile: number) => void) | null) {
    for (const a of this.arrows) a.destroy();
    this.arrows = [];
    if (from === null || !onClick) return;
    const ft = BOARD.tiles[from];
    const fp = iso(ft.x, ft.y);
    for (const to of options) {
      const tt = BOARD.tiles[to];
      const tp = iso(tt.x, tt.y);
      const angle = Math.atan2(tp.y - fp.y, tp.x - fp.x);
      const mx = fp.x + (tp.x - fp.x) * 0.55;
      const my = fp.y + (tp.y - fp.y) * 0.55 - 10;
      const g = this.add.graphics();
      g.fillStyle(0xffcc4d, 1);
      g.lineStyle(3, 0x2a1d00, 1);
      const pts = [new Phaser.Math.Vector2(22, 0), new Phaser.Math.Vector2(-10, -16), new Phaser.Math.Vector2(-4, 0), new Phaser.Math.Vector2(-10, 16)];
      g.fillPoints(pts, true);
      g.strokePoints(pts, true);
      g.setRotation(angle);
      const label = this.add.text(0, 26, TILE_INFO[tt.type].icon, { fontSize: '16px' }).setOrigin(0.5);
      const c = this.add.container(mx, my, [g, label]).setDepth(1500).setSize(56, 56);
      c.setInteractive({ useHandCursor: true });
      c.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev?.stopPropagation?.();
        onClick(to);
      });
      this.tweens.add({ targets: c, scale: 1.18, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.arrows.push(c);
    }
  }

  /** 移動先の候補を薄く表示する（ダイス割り当てのホバー時） */
  setPreview(tiles: number[]) {
    this.setRoutes(null, tiles.map((t) => [t]));
  }

  /** 移動ルートを点線で表示する。from から各 path をたどり、終点に印を付ける */
  setRoutes(from: number | null, paths: number[][], color = 0xff4d5e) {
    const g = this.previewLayer;
    g.clear();
    const center = (id: number) => {
      const t = BOARD.tiles[id];
      return iso(t.x, t.y);
    };
    for (const path of paths) {
      if (!path.length) continue;
      const pts = from === null ? path.map(center) : [from, ...path].map(center);
      g.lineStyle(5, color, 0.95);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.floor(len / 14));
        for (let k = 0; k < steps; k += 2) {
          const t0 = k / steps;
          const t1 = Math.min(1, (k + 1) / steps);
          g.lineBetween(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
        }
      }
      const end = pts[pts.length - 1];
      g.fillStyle(color, 0.35);
      this.disc(g, end.x, end.y, 0.9);
      g.lineStyle(3, color, 1);
      g.strokeCircle(end.x, end.y, 12);
    }
  }

  private tileAt(wx: number, wy: number): number | null {
    const fx = (wy / (TH / 2) + wx / (TW / 2)) / 2;
    const fy = (wy / (TH / 2) - wx / (TW / 2)) / 2;
    const x = Math.round(fx);
    const y = Math.round(fy);
    const t = BOARD.tiles.find((tt) => tt.x === x && tt.y === y);
    return t ? t.id : null;
  }

  // ───────────────────────── 演出 ─────────────────────────

  /** 描画ループが止まっていても（タブが裏にあるなど）進行が止まらないよう、setTimeout で待つ */
  /** クリックで演出を早送り中 */
  skipping = false;

  private wait(ms: number) {
    return new Promise<void>((r) => window.setTimeout(r, this.skipping ? Math.min(ms, 30) : ms / this.speed));
  }

  private tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig) {
    const duration = this.skipping ? 40 : (cfg.duration as number) / this.speed;
    return new Promise<void>((r) => {
      let done = false;
      const finish = (force: boolean) => {
        if (done) return;
        done = true;
        if (force && tw.isPlaying()) tw.complete();
        r();
      };
      const tw = this.tweens.add({ ...cfg, duration, onComplete: () => finish(false) });
      window.setTimeout(() => finish(true), duration + 80);
    });
  }

  private entityPos(ref: EntityRef): { x: number; y: number } {
    if (ref.kind === 'boss') return { x: this.boss.x, y: this.boss.y - 60 };
    const c = ref.kind === 'player' ? this.players.get(ref.id) : this.enemies.get(ref.id);
    return c ? { x: c.x, y: c.y - 30 } : iso(3, 3);
  }

  floatText(text: string, at: { x: number; y: number }, color = '#ffffff', size = 18) {
    const t = this.add.text(at.x, at.y, text, {
      fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(2000);
    this.tweens.add({ targets: t, y: at.y - 40, alpha: 0, duration: 1100 / this.speed, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  private async banner(text: string, color = '#ffcc4d') {
    const cam = this.cameras.main;
    const t = this.add.text(cam.midPoint.x, cam.midPoint.y - 40 / cam.zoom, text, {
      fontSize: `${Math.round(40 / cam.zoom)}px`, color, fontStyle: 'bold', stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(3000).setAlpha(0).setScale(0.8);
    await this.tween({ targets: t, alpha: 1, scale: 1, duration: 250, ease: 'Back.out' });
    await this.wait(550);
    await this.tween({ targets: t, alpha: 0, duration: 250 });
    t.destroy();
  }

  /** イベント1つ分の演出（盤面上で表現するもの） */
  async playOne(e: GameEvent) {
    switch (e.t) {
      case 'move': {
        const c = this.players.get(e.pid);
        if (!c) break;
        this.focusOn({ kind: 'player', id: e.pid });
        this.setMotion(`p${e.pid}`, 'walk');
        for (const tile of e.path) {
          const pos = this.playerPos(tile, 0);
          const t = BOARD.tiles[tile];
          // 進む向きを向く（SDキャラは右向き）
          if (Math.abs(pos.x - c.x) > 1) this.face(`p${e.pid}`, pos.x < c.x);
          c.setDepth((t.x + t.y) * 10 + 5);
          sound.play('step');
          await this.tween({ targets: c, x: pos.x, y: pos.y, duration: 220, ease: 'Linear' });
        }
        this.setMotion(`p${e.pid}`, 'idle');
        break;
      }
      case 'enemyMove': {
        const c = this.enemies.get(e.enemyId);
        if (!c) break;
        this.focusOn({ kind: 'enemy', id: e.enemyId });
        await this.wait(250);
        this.setMotion(`e${e.enemyId}`, 'walk');
        for (const tile of e.path) {
          const t = BOARD.tiles[tile];
          const p = iso(t.x, t.y);
          c.setDepth((t.x + t.y) * 10 + 4);
          if (Math.abs(p.x + 22 - c.x) > 1) this.face(`e${e.enemyId}`, p.x + 22 < c.x);
          await this.tween({ targets: c, x: p.x + 22, y: p.y - 4, duration: 260, ease: 'Linear' });
        }
        this.setMotion(`e${e.enemyId}`, 'idle');
        break;
      }
      case 'warp': {
        const c = this.players.get(e.pid);
        if (!c) break;
        await this.tween({ targets: c, alpha: 0, scale: 0.3, duration: 200 });
        const pos = this.playerPos(e.tile, 0);
        c.setPosition(pos.x, pos.y);
        await this.tween({ targets: c, alpha: 1, scale: 1, duration: 200 });
        break;
      }
      case 'tile':
        this.floatText(e.text, this.entityPos({ kind: 'player', id: e.pid }), '#ffe9a8', 16);
        await this.wait(250);
        break;
      case 'damage': {
        const pos = this.entityPos(e.target);
        this.floatText(`-${e.amount}`, pos, '#ff5d6c', e.target.kind === 'boss' ? 30 : 22);
        // 被弾ポーズを約1秒キープ
        if (e.target.kind === 'player') this.setMotion(`p${e.target.id}`, 'hit', 1000);
        else if (e.target.kind === 'enemy') this.setMotion(`e${e.target.id}`, 'hit', 1000);
        else this.setMotion('boss', 'hit', 1000);
        const obj = e.target.kind === 'boss' ? this.boss : e.target.kind === 'player' ? this.players.get(e.target.id) : this.enemies.get(e.target.id);
        if (obj) {
          // ノックバック：後ろへはじかれて、ゆっくり戻る
          const sd = this.sd.get(e.target.kind === 'player' ? `p${e.target.id}` : e.target.kind === 'enemy' ? `e${e.target.id}` : 'boss');
          const dir = sd?.left ? 1 : -1;
          const x0 = obj.x;
          this.tweens.chain({ targets: obj, tweens: [
            { x: x0 + 12 * dir, duration: 90 / this.speed, ease: 'Quad.out' },
            { x: x0, duration: 600 / this.speed, ease: 'Sine.inOut' },
          ] });
        }
        if (e.target.kind === 'boss') this.cameras.main.shake(150, 0.004);
        await this.wait(120);
        break;
      }
      case 'heal':
        this.floatText(`+${e.amount}`, this.entityPos({ kind: 'player', id: e.pid }), '#58d68d');
        await this.wait(120);
        break;
      case 'ko':
        this.setMotion(`p${e.pid}`, 'ko', 1500);
        this.floatText('KO!', this.entityPos({ kind: 'player', id: e.pid }), '#ff5d6c', 28);
        await this.wait(700);
        break;
      case 'kill': {
        this.setMotion(`e${e.enemyId}`, 'ko');
        const c = this.enemies.get(e.enemyId);
        if (c) await this.tween({ targets: c, alpha: 0, scale: 1.4, duration: 250 });
        break;
      }
      case 'text':
        this.floatText(e.text, e.at ? this.entityPos(e.at) : iso(3, 3), '#ffffff', 16);
        await this.wait(200);
        break;
      case 'roundStart':
        await this.banner(`ラウンド ${e.round}`);
        break;
      case 'bossSpawn':
        this.showOverview(2000);
        this.cameras.main.flash(400, 255, 80, 80);
        this.cameras.main.shake(600, 0.01);
        this.boss.setAlpha(1);
        await this.banner(`${BOSS.name} 降臨！`, '#ff8a8a');
        break;
      case 'bossEnrage':
        this.cameras.main.flash(300, 255, 40, 40);
        await this.banner('ボスが怒り狂った！', '#ff5d6c');
        break;
      case 'bossAttack':
        this.showOverview(1600);
        await this.banner(e.intent.label.split('：')[0], '#ff8a8a');
        if (e.intent.base > 0) this.cameras.main.shake(350, 0.012);
        break;
      default:
        break;
    }
  }
}
