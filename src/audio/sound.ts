// BGM と効果音をブラウザの中で合成する（音源ファイルは使わない。著作権の心配がなく、読み込みも速い）
import { loadSoundMode, saveSoundMode, type SoundMode } from '../storage/local';

type SfxName = 'click' | 'start' | 'pop' | 'tick' | 'drumroll' | 'fanfare' | 'perfect';

let ctx: AudioContext | null = null;
let bgmGain: GainNode, seGain: GainNode, noiseBuf: AudioBuffer;
let bgmTimer: ReturnType<typeof setInterval> | null = null, nextTime = 0, step = 0;
let mode: SoundMode = loadSoundMode();
const midi = (m: number) => 440 * 2 ** ((m - 69) / 12);

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    bgmGain = ctx.createGain(); seGain = ctx.createGain();
    bgmGain.connect(ctx.destination); seGain.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  bgmGain.gain.value = mode === 'all' ? 0.05 : 0; // 通話の声を邪魔しない小さめの音量
  seGain.gain.value = mode === 'off' ? 0 : 0.2;
  if (mode === 'all') startBgm(); else stopBgm();
}

function tone(freq: number, t: number, dur: number, type: OscillatorType, gain: number, dest: AudioNode = seGain) {
  const o = ctx!.createOscillator(), g = ctx!.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  return o;
}

function noise(t: number, dur: number, gain: number, dest: AudioNode = seGain, cutoff = 3000) {
  const src = ctx!.createBufferSource(), f = ctx!.createBiquadFilter(), g = ctx!.createGain();
  src.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest); src.start(t); src.stop(t + dur + 0.05);
}

// BGM：C–Am–F–G をくり返す軽いループ。少し先まで予約して鳴らす
const EIGHTH = 60 / 112 / 2;
const CHORDS = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
const ARP = [0, 1, 2, 1, 0, 1, 2, 1];
function schedule() {
  while (nextTime < ctx!.currentTime + 0.4) {
    const ch = CHORDS[Math.floor(step / 8) % 4], beat = step % 8;
    if (beat % 4 === 0) tone(midi(ch[0] - 24), nextTime, EIGHTH * 3.5, 'sine', 0.9, bgmGain);
    tone(midi(ch[ARP[beat]] + 12), nextTime, EIGHTH * 0.9, 'triangle', 0.3, bgmGain);
    if (beat % 2 === 1) noise(nextTime, 0.04, 0.12, bgmGain, 7000);
    nextTime += EIGHTH; step++;
  }
}
function startBgm() { if (bgmTimer || !ctx) return; nextTime = ctx.currentTime + 0.1; bgmTimer = setInterval(schedule, 120); }
function stopBgm() { if (bgmTimer) clearInterval(bgmTimer); bgmTimer = null; }

const SFX: Record<SfxName, (t: number) => void> = {
  click: t => { tone(880, t, 0.08, 'sine', 0.5); },
  start: t => [67, 72].forEach((m, i) => tone(midi(m), t + i * 0.1, 0.15, 'triangle', 0.6)),
  pop: t => { tone(520, t, 0.2, 'triangle', 0.8).frequency.exponentialRampToValueAtTime(1040, t + 0.12); },
  tick: t => { tone(1320, t, 0.05, 'square', 0.2); },
  drumroll: t => { for (let i = 0; i < 26; i++) noise(t + i * 0.07, 0.06, 0.25 + i * 0.02, seGain, 1200); },
  fanfare: t => [72, 76, 79, 84].forEach((m, i) => tone(midi(m), t + i * 0.11, i === 3 ? 0.7 : 0.16, 'triangle', 0.7)),
  perfect: t => [84, 88, 91, 96, 91, 96].forEach((m, i) => tone(midi(m), t + i * 0.07, 0.14, 'sine', 0.45)),
};

export const Sound = {
  ensure,
  get mode() { return mode; },
  cycle(): SoundMode {
    mode = mode === 'all' ? 'se' : mode === 'se' ? 'off' : 'all';
    saveSoundMode(mode);
    ensure();
    return mode;
  },
  play(name: SfxName, delay = 0) {
    if (ctx && mode !== 'off' && ctx.state === 'running') SFX[name](ctx.currentTime + 0.02 + delay);
  },
};

// ブラウザの決まりで、最初に画面に触れるまでは音を出せない
document.addEventListener('pointerdown', () => Sound.ensure(), true);
document.addEventListener('keydown', () => Sound.ensure(), true);
