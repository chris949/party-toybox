/**
 * 効果音。素材が届くまでは Web Audio で合成した仮の音を鳴らす。
 * 本物の音源ができたら register('dice', 'sounds/dice.mp3') のように登録すれば、同じ名前で差し替わる。
 */
export type SoundName =
  | 'click' | 'dice' | 'diceLand' | 'step' | 'swing' | 'magic' | 'arrow' | 'hit' | 'evade' | 'heal' | 'coin'
  | 'flip' | 'silver' | 'gold' | 'turn' | 'bad' | 'good' | 'roar' | 'ko' | 'win' | 'lose';

class Sound {
  private ctx: AudioContext | null = null;
  private files = new Map<SoundName, HTMLAudioElement>();
  muted = false;
  volume = 0.5;

  constructor() {
    try {
      this.muted = localStorage.getItem('dr-muted') === '1';
    } catch {
      /* 保存領域が使えなくても既定（音あり）で動く */
    }
  }

  register(name: SoundName, url: string) {
    const a = new Audio(url);
    a.preload = 'auto';
    this.files.set(name, a);
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('dr-muted', m ? '1' : '0');
    } catch {
      /* 保存できなくても動作に影響なし */
    }
  }

  private audio(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  play(name: SoundName) {
    if (this.muted) return;
    const file = this.files.get(name);
    if (file) {
      const a = file.cloneNode() as HTMLAudioElement;
      a.volume = this.volume;
      void a.play().catch(() => {});
      return;
    }
    const ctx = this.audio();
    if (!ctx) return;
    SYNTH[name]?.(ctx, ctx.currentTime, this.volume);
  }
}

// ───────────────────────── 合成音 ─────────────────────────

function tone(ctx: AudioContext, t: number, freq: number, dur: number, vol: number, type: OscillatorType = 'sine', slideTo?: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(ctx: AudioContext, t: number, dur: number, vol: number, from = 2000, to = 400, type: BiquadFilterType = 'bandpass') {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
}

const SYNTH: Partial<Record<SoundName, (ctx: AudioContext, t: number, v: number) => void>> = {
  click: (c, t, v) => tone(c, t, 880, 0.05, 0.15 * v, 'triangle'),
  dice: (c, t, v) => { for (let i = 0; i < 6; i++) noise(c, t + i * 0.06, 0.04, 0.35 * v, 3500, 1500); },
  diceLand: (c, t, v) => { noise(c, t, 0.06, 0.5 * v, 1200, 300); tone(c, t, 220, 0.08, 0.25 * v, 'triangle'); },
  step: (c, t, v) => tone(c, t, 420, 0.06, 0.12 * v, 'sine', 300),
  swing: (c, t, v) => noise(c, t, 0.22, 0.45 * v, 600, 4000, 'bandpass'),
  magic: (c, t, v) => { tone(c, t, 500, 0.35, 0.22 * v, 'sine', 1400); noise(c, t, 0.3, 0.15 * v, 5000, 2000, 'highpass'); },
  arrow: (c, t, v) => noise(c, t, 0.18, 0.35 * v, 5000, 1500, 'bandpass'),
  hit: (c, t, v) => { tone(c, t, 160, 0.18, 0.5 * v, 'square', 60); noise(c, t, 0.15, 0.4 * v, 1500, 200, 'lowpass'); },
  evade: (c, t, v) => tone(c, t, 300, 0.2, 0.25 * v, 'sine', 1200),
  heal: (c, t, v) => [523, 659, 784].forEach((f, i) => tone(c, t + i * 0.07, f, 0.25, 0.18 * v, 'sine')),
  coin: (c, t, v) => { tone(c, t, 988, 0.08, 0.2 * v, 'square'); tone(c, t + 0.07, 1319, 0.2, 0.2 * v, 'square'); },
  flip: (c, t, v) => noise(c, t, 0.08, 0.3 * v, 3000, 1200),
  silver: (c, t, v) => { noise(c, t, 0.08, 0.3 * v, 3000, 1200); [784, 988].forEach((f, i) => tone(c, t + 0.05 + i * 0.07, f, 0.25, 0.18 * v, 'triangle')); },
  gold: (c, t, v) => { noise(c, t, 0.08, 0.3 * v, 3000, 1200); [784, 988, 1175, 1568].forEach((f, i) => tone(c, t + 0.05 + i * 0.08, f, 0.4, 0.2 * v, 'triangle')); },
  turn: (c, t, v) => { tone(c, t, 659, 0.12, 0.18 * v, 'triangle'); tone(c, t + 0.1, 988, 0.25, 0.18 * v, 'triangle'); },
  good: (c, t, v) => [659, 880].forEach((f, i) => tone(c, t + i * 0.08, f, 0.2, 0.18 * v, 'triangle')),
  bad: (c, t, v) => { tone(c, t, 330, 0.18, 0.2 * v, 'sawtooth', 220); tone(c, t + 0.15, 220, 0.3, 0.2 * v, 'sawtooth', 140); },
  roar: (c, t, v) => { tone(c, t, 90, 0.8, 0.45 * v, 'sawtooth', 50); noise(c, t, 0.8, 0.35 * v, 400, 80, 'lowpass'); },
  ko: (c, t, v) => tone(c, t, 440, 0.6, 0.3 * v, 'square', 80),
  win: (c, t, v) => [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.12, f, 0.4, 0.22 * v, 'triangle')),
  lose: (c, t, v) => [392, 330, 262].forEach((f, i) => tone(c, t + i * 0.18, f, 0.45, 0.22 * v, 'sawtooth')),
};

export const sound = new Sound();
