// BGM と効果音。曲・効果音のファイルがあれば Howler.js で鳴らし、ないものはブラウザの中で合成して鳴らす。
// 曲の優先順：各自が端末で選んだ曲 → 同梱の曲（public/audio/manifest.json）→ 合成BGM
import { Howl } from 'howler';
import { deleteCustomTrack, loadCustomTracks, saveCustomTrack } from '../storage/audioFiles';
import { loadSoundMode, loadVolumes, saveSoundMode, saveVolumes, type SoundMode, type Volumes } from '../storage/local';

export type Scene = 'lobby' | 'pick' | 'reveal' | 'result';
export const SCENES: Record<Scene, string> = { lobby: 'ロビー・ホーム', pick: '並び替え（準備・予想）', reveal: '答え合わせ', result: '最終結果' };
export type SfxName = 'click' | 'start' | 'pop' | 'tick' | 'drumroll' | 'fanfare' | 'perfect';

interface Track { url: string; format: string; label: string }

let mode: SoundMode = loadSoundMode();
let vol: Volumes = loadVolumes();
let started = false; // 最初に画面に触れたか（ブラウザの決まりで、それまでは音を出せない）
let scene: Scene = 'lobby';
let playing: { url: string | null; howl: Howl | null } | null = null; // url が null なら合成BGM

const effBgm = () => mode === 'all' ? vol.bgm : 0;
const effSe = () => mode === 'off' ? 0 : vol.se;
const BASE = import.meta.env.BASE_URL;
const extOf = (s: string) => (s.match(/\.([a-z0-9]+)(?:$|\?)/i)?.[1] ?? 'mp3').toLowerCase();
const FORMAT_BY_TYPE: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/flac': 'flac' };

// ===== 曲の出どころ =====
let manifest: { bgm: Partial<Record<Scene, string>>; se: Partial<Record<SfxName, string>> } = { bgm: {}, se: {} };
const custom: Partial<Record<Scene, Track & { name: string }>> = {};
const failed = new Set<string>(); // 読み込めなかった曲（合成音で代わりに鳴らす）

export const ready = Promise.all([
  fetch(`${BASE}audio/manifest.json`).then(r => r.ok ? r.json() : null).then(m => { if (m) manifest = { bgm: m.bgm ?? {}, se: m.se ?? {} }; }).catch(() => {}),
  loadCustomTracks().then(all => {
    for (const [k, t] of Object.entries(all)) {
      custom[k as Scene] = { url: URL.createObjectURL(t.blob), format: FORMAT_BY_TYPE[t.type] ?? extOf(t.name), label: '自分の曲', name: t.name };
    }
  }),
]).then(() => { if (started) startScene(); });

function trackFor(s: Scene): Track | null {
  const c = custom[s];
  if (c && !failed.has(c.url)) return c;
  const path = manifest.bgm[s];
  if (path && !failed.has(`${BASE}audio/${path}`)) return { url: `${BASE}audio/${path}`, format: extOf(path), label: '同梱の曲' };
  return null;
}

export const sourceOf = (s: Scene) => custom[s] ? `自分の曲：${custom[s]!.name}` : manifest.bgm[s] ? '同梱の曲' : '合成BGM';
export const hasCustom = (s: Scene) => !!custom[s];

// ===== BGM（ファイル） =====
const howls = new Map<string, Howl>();
function howlOf(t: Track): Howl {
  let h = howls.get(t.url);
  if (!h) {
    h = new Howl({
      src: [t.url], format: [t.format], loop: true, volume: 0,
      onloaderror: () => { failed.add(t.url); if (playing?.url === t.url) startScene(); }, // 読めなければ合成BGMに切り替える
      onplayerror: () => { h!.once('unlock', () => h!.play()); },
    });
    howls.set(t.url, h);
  }
  return h;
}

// 今の場面の曲を鳴らす。曲が変わるときは1秒かけて前の曲を小さくする
function startScene() {
  if (!started) return;
  const t = trackFor(scene);
  const url = t?.url ?? null;
  if (playing && playing.url === url && (url !== null || synthTimer)) { applyVolumes(); return; }
  const old = playing?.howl;
  if (old) { old.fade(old.volume(), 0, 1000); setTimeout(() => { if (playing?.howl !== old) old.stop(); }, 1050); }
  if (t) {
    stopSynth();
    const h = howlOf(t);
    if (!h.playing()) h.play();
    h.fade(h.volume(), effBgm(), 1000);
    playing = { url, howl: h };
  } else {
    playing = { url: null, howl: null };
    startSynth();
  }
}

// ===== 合成音（ファイルがないとき） =====
let ctx: AudioContext | null = null;
let synthGain: GainNode, seGain: GainNode, noiseBuf: AudioBuffer;
let synthTimer: ReturnType<typeof setInterval> | null = null, nextTime = 0, step = 0;
const midi = (m: number) => 440 * 2 ** ((m - 69) / 12);

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    synthGain = ctx.createGain(); seGain = ctx.createGain();
    synthGain.connect(ctx.destination); seGain.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
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

// 合成BGM：C–Am–F–G をくり返す軽いループ。場面ごとに速さを変える
const TEMPO: Record<Scene, number> = { lobby: 104, pick: 132, reveal: 92, result: 120 };
const CHORDS = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
const ARP = [0, 1, 2, 1, 0, 1, 2, 1];
function schedule() {
  const eighth = 60 / TEMPO[scene] / 2;
  while (nextTime < ctx!.currentTime + 0.4) {
    const ch = CHORDS[Math.floor(step / 8) % 4], beat = step % 8;
    if (beat % 4 === 0) tone(midi(ch[0] - 24), nextTime, eighth * 3.5, 'sine', 0.9, synthGain);
    tone(midi(ch[ARP[beat]] + 12), nextTime, eighth * 0.9, 'triangle', 0.3, synthGain);
    if (beat % 2 === 1) noise(nextTime, 0.04, 0.12, synthGain, 7000);
    nextTime += eighth; step++;
  }
}
function startSynth() { if (synthTimer || !ctx) return; nextTime = ctx.currentTime + 0.1; synthTimer = setInterval(schedule, 120); applyVolumes(); }
function stopSynth() { if (synthTimer) clearInterval(synthTimer); synthTimer = null; }

const SYNTH_SFX: Record<SfxName, (t: number) => void> = {
  click: t => { tone(880, t, 0.08, 'sine', 0.5); },
  start: t => [67, 72].forEach((m, i) => tone(midi(m), t + i * 0.1, 0.15, 'triangle', 0.6)),
  pop: t => { tone(520, t, 0.2, 'triangle', 0.8).frequency.exponentialRampToValueAtTime(1040, t + 0.12); },
  tick: t => { tone(1320, t, 0.05, 'square', 0.2); },
  drumroll: t => { for (let i = 0; i < 26; i++) noise(t + i * 0.07, 0.06, 0.25 + i * 0.02, seGain, 1200); },
  fanfare: t => [72, 76, 79, 84].forEach((m, i) => tone(midi(m), t + i * 0.11, i === 3 ? 0.7 : 0.16, 'triangle', 0.7)),
  perfect: t => [84, 88, 91, 96, 91, 96].forEach((m, i) => tone(midi(m), t + i * 0.07, 0.14, 'sine', 0.45)),
};

// 効果音のファイル（同梱されていれば使う）
const seHowls: Partial<Record<SfxName, Howl>> = {};
function seHowl(name: SfxName): Howl | null {
  const path = manifest.se[name];
  if (!path || failed.has(`${BASE}audio/${path}`)) return null;
  const url = `${BASE}audio/${path}`;
  return seHowls[name] ??= new Howl({ src: [url], format: [extOf(path)], onloaderror: () => failed.add(url) });
}

function applyVolumes() {
  if (ctx) { synthGain.gain.value = effBgm() * 0.17; seGain.gain.value = effSe() * 0.28; }
  if (playing?.howl) playing.howl.volume(effBgm());
}

// ===== 外から使う =====
export const Sound = {
  get mode() { return mode; },
  get volumes() { return vol; },
  // 最初に画面に触れたとき
  ensure() {
    ensureCtx();
    if (!started) { started = true; startScene(); } else applyVolumes();
  },
  cycle(): SoundMode {
    mode = mode === 'all' ? 'se' : mode === 'se' ? 'off' : 'all';
    saveSoundMode(mode);
    applyVolumes();
    return mode;
  },
  setVolume(kind: keyof Volumes, v: number) {
    vol = { ...vol, [kind]: Math.max(0, Math.min(1, v)) };
    saveVolumes(vol);
    applyVolumes();
  },
  setScene(s: Scene) { if (s === scene) return; scene = s; startScene(); },
  play(name: SfxName, delay = 0) {
    if (effSe() === 0) return;
    const h = seHowl(name);
    if (h && h.state() === 'loaded') { setTimeout(() => { h.volume(effSe()); h.play(); }, delay * 1000); return; }
    if (ctx?.state === 'running') SYNTH_SFX[name](ctx.currentTime + 0.02 + delay);
  },
  // 各自の曲を設定する／同梱の曲に戻す
  async setCustom(s: Scene, file: File) {
    await saveCustomTrack(s, { name: file.name, type: file.type, blob: file });
    if (custom[s]) URL.revokeObjectURL(custom[s]!.url);
    custom[s] = { url: URL.createObjectURL(file), format: FORMAT_BY_TYPE[file.type] ?? extOf(file.name), label: '自分の曲', name: file.name };
    if (s === scene) startScene();
  },
  async clearCustom(s: Scene) {
    await deleteCustomTrack(s);
    const c = custom[s];
    delete custom[s];
    if (s === scene) startScene();
    if (c) { howls.get(c.url)?.unload(); howls.delete(c.url); URL.revokeObjectURL(c.url); }
  },
};

// 同梱の効果音は、最初に触れたときに読み込んでおく
const preloadSe = () => { void ready.then(() => (Object.keys(manifest.se) as SfxName[]).forEach(seHowl)); };
document.addEventListener('pointerdown', () => { Sound.ensure(); preloadSe(); }, { capture: true });
document.addEventListener('keydown', () => Sound.ensure(), { capture: true });
