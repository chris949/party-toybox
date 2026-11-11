// スーファミ風の小さな音源。音源ファイルは使わず、ブラウザの中で音色を作って鳴らす。
// 特徴のまね：少しこもった柔らかい音（全体に高音を削る）、深めのエコー、ビブラート、8音程度の同時発音
//
// 楽譜の書き方：1小節＝16個（16分音符）の記号を空白で区切り、小節は「|」で区切る。
//   音名（C4, F#3, Bb5 など） … その16分音符で鳴らす
//   -                        … 前の音を伸ばす
//   .                        … 休み
//   ドラム：k=キック s=スネア h=ハイハット o=オープンハイハット r=リム t=タム

export type InstName = 'lead' | 'brass' | 'strings' | 'bass' | 'pluck' | 'bell' | 'drums';

export interface Part {
  inst: InstName;
  vol: number;     // 0〜1
  pan?: number;    // -1（左）〜1（右）
  intro?: string;  // 最初に1回だけ鳴らす小節
  loop: string;    // くり返す小節
}

export interface Song {
  title: string;
  bpm: number;
  parts: Part[];
}

interface NoteEvent { step: number; len: number; midi: number | string; part: Part }

const NOTE = /^([A-G])(#|b)?(-?\d)$/;
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const toMidi = (n: string) => {
  const m = n.match(NOTE);
  if (!m) throw new Error(`音名が読めません: ${n}`);
  return SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
};
const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// 楽譜を音の一覧に直す。小節が16個でなければ、どこが違うか分かるように止める
export function parse(text: string, part: Part, title: string): { events: NoteEvent[]; steps: number } {
  const bars = text.split('|').map(b => b.trim()).filter(Boolean);
  const events: NoteEvent[] = [];
  let current: NoteEvent | null = null;
  bars.forEach((bar, bi) => {
    const tokens = bar.split(/\s+/);
    if (tokens.length !== 16) throw new Error(`${title} / ${part.inst}：${bi + 1}小節目が${tokens.length}個です（16個にする）`);
    tokens.forEach((tok, ti) => {
      const step = bi * 16 + ti;
      if (tok === '-') { if (current) current.len++; return; }
      current = null;
      if (tok === '.') return;
      if (part.inst === 'drums') { events.push({ step, len: 1, midi: tok, part }); return; }
      current = { step, len: 1, midi: toMidi(tok), part };
      events.push(current);
    });
  });
  return { events, steps: bars.length * 16 };
}

export class SnesPlayer {
  private out: GainNode;
  private bus: GainNode;
  private noise: AudioBuffer;
  private pulse: PeriodicWave;
  private timer: ReturnType<typeof setInterval> | null = null;
  private song: { intro: NoteEvent[]; introSteps: number; loop: NoteEvent[]; loopSteps: number; stepSec: number; baseStep: number } | null = null;
  private pos = 0;        // 次に予約する16分音符（イントロを含めた通し番号）
  private startAt = 0;    // 曲の始まりの時刻

  constructor(private ctx: AudioContext, dest: AudioNode = ctx.destination) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    // 少しこもった柔らかい音にする（スーファミは高音が丸い）
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 9000; tone.Q.value = 0.3;
    tone.connect(this.out);
    // 深めのエコー（繰り返すたびに高音が削れていく）
    const delay = ctx.createDelay(1), fb = ctx.createGain(), damp = ctx.createBiquadFilter(), wet = ctx.createGain();
    delay.delayTime.value = 0.24; fb.gain.value = 0.38; damp.type = 'lowpass'; damp.frequency.value = 2600; wet.gain.value = 0.3;
    delay.connect(damp); damp.connect(fb); fb.connect(delay); damp.connect(wet); wet.connect(tone);
    this.bus = ctx.createGain();
    this.bus.connect(tone); this.bus.connect(delay);
    // 打楽器用の雑音と、矩形波（デューティ25%）の音色
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = 32, real = new Float32Array(n), imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    this.pulse = ctx.createPeriodicWave(real, imag);
  }

  setVolume(v: number, sec = 0.05) {
    const g = this.out.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + sec);
  }

  play(song: Song, volume: number, fadeSec = 1) {
    this.stopScheduling();
    const intro = { events: [] as NoteEvent[], steps: 0 };
    const loop = { events: [] as NoteEvent[], steps: 0 };
    for (const part of song.parts) {
      if (part.intro) { const p = parse(part.intro, part, song.title); intro.events.push(...p.events); intro.steps = Math.max(intro.steps, p.steps); }
      const p = parse(part.loop, part, song.title); loop.events.push(...p.events); loop.steps = Math.max(loop.steps, p.steps);
    }
    this.song = { intro: intro.events, introSteps: intro.steps, loop: loop.events, loopSteps: loop.steps, stepSec: 60 / song.bpm / 4, baseStep: 60 / song.bpm / 4 };
    this.pos = 0;
    this.startAt = this.ctx.currentTime + 0.1;
    this.setVolume(volume, fadeSec);
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  // 速さを変える（1 = 元の速さ）。次に鳴らす音の時刻はそのままにして、そこから先の間隔だけ変える
  setRate(rate: number) {
    const s = this.song;
    if (!s) return;
    const next = this.startAt + this.pos * s.stepSec;
    s.stepSec = s.baseStep / rate;
    this.startAt = next - this.pos * s.stepSec;
  }

  stop(fadeSec = 1) {
    this.setVolume(0, fadeSec);
    setTimeout(() => this.stopScheduling(), fadeSec * 1000 + 50);
  }

  private stopScheduling() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  // 少し先（0.15秒）までの音を予約する
  private schedule() {
    const s = this.song;
    if (!s) return;
    const until = this.ctx.currentTime + 0.15;
    while (this.startAt + this.pos * s.stepSec < until) {
      const t = this.startAt + this.pos * s.stepSec;
      const inIntro = this.pos < s.introSteps;
      const step = inIntro ? this.pos : (this.pos - s.introSteps) % s.loopSteps;
      for (const e of inIntro ? s.intro : s.loop) if (e.step === step) this.voice(e, t, e.len * s.stepSec);
      this.pos++;
    }
  }

  private voice(e: NoteEvent, t: number, dur: number) {
    const ctx = this.ctx, p = e.part;
    const pan = ctx.createStereoPanner(); pan.pan.value = p.pan ?? 0; pan.connect(this.bus);
    const g = ctx.createGain(); g.connect(pan);
    if (typeof e.midi === 'string') return this.drum(e.midi, t, p.vol, g);
    const f = freq(e.midi), v = p.vol;
    // 音量の形（立ち上がり・減衰・持続・余韻）
    const env = (a: number, d: number, s: number, r: number, peak = v) => {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.linearRampToValueAtTime(peak * s, t + a + d);
      g.gain.setValueAtTime(peak * s, t + Math.max(a + d, dur));
      g.gain.linearRampToValueAtTime(0, t + Math.max(a + d, dur) + r);
      return t + Math.max(a + d, dur) + r + 0.05;
    };
    const osc = (type: OscillatorType | 'pulse', fr: number, detune = 0) => {
      const o = ctx.createOscillator();
      if (type === 'pulse') o.setPeriodicWave(this.pulse); else o.type = type;
      o.frequency.value = fr; o.detune.value = detune;
      return o;
    };
    const vibrato = (o: OscillatorNode, depth: number, delay = 0.18) => {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.5;
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(0, t + delay); lg.gain.linearRampToValueAtTime(f * depth, t + delay + 0.25);
      lfo.connect(lg); lg.connect(o.frequency);
      return lfo;
    };
    const run = (nodes: AudioScheduledSourceNode[], end: number) => nodes.forEach(n => { n.start(t); n.stop(end); });
    const lowpass = (fr: number, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = fr; b.Q.value = q; b.connect(g); return b; };

    switch (p.inst) {
      case 'lead': { // やわらかい矩形波＋ビブラート
        const o = osc('pulse', f), lp = lowpass(3800);
        o.connect(lp);
        run([o, vibrato(o, 0.006)], env(0.01, 0.12, 0.7, 0.12));
        break;
      }
      case 'brass': { // のこぎり波に、吹き始めだけ明るくなるフィルター
        const o1 = osc('sawtooth', f), o2 = osc('sawtooth', f, 7), lp = lowpass(900, 1.2);
        lp.frequency.setValueAtTime(700, t); lp.frequency.linearRampToValueAtTime(2600, t + 0.06); lp.frequency.linearRampToValueAtTime(1500, t + 0.3);
        o1.connect(lp); o2.connect(lp);
        run([o1, o2, vibrato(o1, 0.004, 0.25)], env(0.03, 0.2, 0.75, 0.15, v * 0.6));
        break;
      }
      case 'strings': { // 少しずらした2本ののこぎり波を、ゆっくり立ち上げる
        const o1 = osc('sawtooth', f, -8), o2 = osc('sawtooth', f, 8), lp = lowpass(1800);
        o1.connect(lp); o2.connect(lp);
        run([o1, o2], env(0.25, 0.3, 0.85, 0.5, v * 0.5));
        break;
      }
      case 'bass': { // 三角波＋短く弾く音（スラップっぽい頭）
        const o = osc('triangle', f), sub = osc('sine', f / 2), click = osc('square', f * 2), cg = ctx.createGain();
        cg.gain.setValueAtTime(v * 0.25, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        click.connect(cg); cg.connect(g);
        o.connect(g); sub.connect(g);
        run([o, sub, click], env(0.005, 0.15, 0.55, 0.06));
        break;
      }
      case 'pluck': { // マリンバっぽい、すぐ消える音
        const o = osc('sine', f), h = osc('triangle', f * 4), hg = ctx.createGain();
        hg.gain.setValueAtTime(v * 0.3, t); hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        h.connect(hg); hg.connect(g); o.connect(g);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        run([o, h], t + 0.65);
        break;
      }
      case 'bell': { // 鉄琴っぽい、余韻の長い音
        const o = osc('sine', f), h = osc('sine', f * 2.76), hg = ctx.createGain();
        hg.gain.value = 0.35; h.connect(hg); hg.connect(g); o.connect(g);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        run([o, h], t + 1.65);
        break;
      }
    }
  }

  private drum(kind: string, t: number, v: number, g: GainNode) {
    const ctx = this.ctx;
    const noise = (dur: number, type: BiquadFilterType, fr: number, peak: number) => {
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), ng = ctx.createGain();
      src.buffer = this.noise; f.type = type; f.frequency.value = fr;
      ng.gain.setValueAtTime(peak, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(ng); ng.connect(g); src.start(t); src.stop(t + dur + 0.02);
    };
    const thump = (from: number, to: number, dur: number, peak: number) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
      og.gain.setValueAtTime(peak, t); og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.02);
    };
    g.gain.value = v;
    switch (kind) {
      case 'k': thump(140, 45, 0.25, 1); break;
      case 's': noise(0.16, 'bandpass', 1800, 0.7); thump(220, 160, 0.08, 0.4); break;
      case 'h': noise(0.04, 'highpass', 7000, 0.35); break;
      case 'o': noise(0.22, 'highpass', 6500, 0.3); break;
      case 'r': thump(900, 700, 0.03, 0.4); noise(0.02, 'highpass', 4000, 0.2); break;
      case 't': thump(180, 90, 0.3, 0.8); break;
      default: throw new Error(`ドラムの記号が読めません: ${kind}`);
    }
  }
}
