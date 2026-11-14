import manifest from './sd-manifest.json';
import { SD_HEIGHT } from './assets';

/** SDの種類：職業（warrior など）・ザコ（slime など）・ボス（boss） */
export type SdKey = string;

/** SDキャラのコマ。ox/oy は足元（基準点）の位置を画像に対する割合で表す */
export interface SdFrame {
  file: string;
  w: number;
  h: number;
  ox: number;
  oy: number;
}

export interface SdFx {
  file: string;
  w: number;
  h: number;
  /** 攻撃2コマ目の足元から見たエフェクト中心の位置（元画像のピクセル） */
  dx: number;
  dy: number;
}

export type Motion = 'idle' | 'walk' | 'attack' | 'hit' | 'ko';

interface SdSet {
  /** 絵の向き（プレイヤーは右向き、モンスターは左向きで描く） */
  facing: 'left' | 'right';
  idle: SdFrame[];
  walk: SdFrame[];
  attack: SdFrame[];
  hit: SdFrame[];
  /** 撃破のコマ（モンスターだけ。ない絵は、被弾の3コマ目を倒れた姿として使う） */
  ko?: SdFrame[];
  fx?: SdFx;
}

export const SD = manifest as unknown as Record<SdKey, SdSet>;

/** 表示したい高さ（px）になる拡大率 */
export function sdScale(key: SdKey, where: 'board' | 'battle'): number {
  const table = SD_HEIGHT[where];
  const target = table[key] ?? table.player;
  const f = SD[key].idle[0];
  return target / (f.h * f.oy);
}

/** 各モーションで再生するコマの順番（元の絵にない分はここで補う） */
const SEQUENCE: Record<Motion, { frames: (s: SdSet) => SdFrame[]; fps: number; loop: boolean }> = {
  idle: { frames: (s) => [s.idle[0], s.idle[1], s.idle[2], s.idle[1]], fps: 4, loop: true },
  walk: { frames: (s) => [s.walk[0], s.walk[1], s.walk[2], s.walk[1]], fps: 9, loop: true },
  attack: { frames: (s) => s.attack, fps: 6, loop: false },
  hit: { frames: (s) => (s.ko ? s.hit : [s.hit[0], s.hit[1]]), fps: 7, loop: false },
  ko: { frames: (s) => s.ko ?? [s.hit[2]], fps: 6, loop: false },
};

export function motionFrames(key: SdKey, motion: Motion) {
  const seq = SEQUENCE[motion];
  return { frames: seq.frames(SD[key]), fps: seq.fps, loop: seq.loop };
}

/** すべての画像パス（先読み用） */
export function allSdFiles(): string[] {
  const files: string[] = [];
  for (const set of Object.values(SD)) {
    for (const m of ['idle', 'walk', 'attack', 'hit', 'ko'] as const) for (const f of set[m] ?? []) files.push(f.file);
    if (set.fx) files.push(set.fx.file);
  }
  return files;
}

/** ブラウザに画像を先読みさせておく（戦闘中のちらつき防止） */
export function preloadSdImages() {
  for (const f of allSdFiles()) {
    const img = new Image();
    img.src = f;
  }
}

/**
 * DOM 上でSDキャラを動かす（戦闘シーン用）。
 * 足元を枠の下端中央に合わせて、コマを差し替えて再生する。
 */
export class DomSd {
  readonly el: HTMLDivElement;
  private img: HTMLImageElement;
  private timer: number | undefined;
  private motion: Motion | null = null;

  /** faceLeft：画面上で左を向かせるか（絵の向きに合わせて反転するかを決める） */
  constructor(private key: SdKey, private scale: number, faceLeft = false) {
    const flip = faceLeft !== (SD[key].facing === 'left');
    this.el = document.createElement('div');
    this.el.className = `sd-fig${flip ? ' flip' : ''}`;
    this.img = document.createElement('img');
    this.img.alt = '';
    this.el.appendChild(this.img);
    this.play('idle');
  }

  private show(f: SdFrame) {
    this.img.src = f.file;
    this.img.style.width = `${f.w * this.scale}px`;
    this.img.style.left = `calc(50% - ${f.ox * f.w * this.scale}px)`;
    this.img.style.top = `calc(100% - ${f.oy * f.h * this.scale}px)`;
  }

  /** モーションを再生。ループしないものは最後のコマで止まり、終わると resolve */
  play(motion: Motion, speed = 1): Promise<void> {
    window.clearInterval(this.timer);
    this.motion = motion;
    const { frames, fps, loop } = motionFrames(this.key, motion);
    let i = 0;
    this.show(frames[0]);
    if (frames.length === 1) return Promise.resolve();
    return new Promise((resolve) => {
      this.timer = window.setInterval(() => {
        i++;
        if (i >= frames.length) {
          if (loop) i = 0;
          else {
            window.clearInterval(this.timer);
            resolve();
            return;
          }
        }
        this.show(frames[i]);
      }, 1000 / fps / speed);
      if (loop) resolve();
    });
  }

  get current() {
    return this.motion;
  }

  /** 攻撃エフェクトの出現位置（足元からのずれ、表示ピクセル） */
  fxOffset() {
    const fx = SD[this.key].fx!;
    return { x: fx.dx * this.scale, y: fx.dy * this.scale, w: fx.w * this.scale, h: fx.h * this.scale, file: fx.file };
  }

  destroy() {
    window.clearInterval(this.timer);
    this.el.remove();
  }
}
