import { ASSETS } from './assets';
import { sound } from './sound';

/**
 * BGM。ASSETS.bgm に曲のパスがあればそれをループ再生、なければ合成の仮BGMを鳴らす。
 *   field：準備フェーズ / boss：決戦フェーズ
 */
type Track = 'field' | 'boss';

// 仮BGMの譜面（MIDIノート番号。0は休符）
const SONGS: Record<Track, { bpm: number; lead: number[]; bass: number[]; wave: OscillatorType }> = {
  field: {
    bpm: 96,
    lead: [69, 0, 72, 76, 74, 0, 72, 69, 67, 0, 69, 72, 71, 0, 67, 0, 65, 0, 69, 72, 71, 0, 69, 67, 69, 0, 0, 0, 0, 0, 0, 0],
    bass: [45, 45, 45, 45, 41, 41, 41, 41, 43, 43, 43, 43, 40, 40, 40, 40],
    wave: 'triangle',
  },
  boss: {
    bpm: 138,
    lead: [62, 62, 65, 62, 68, 67, 65, 62, 62, 62, 65, 62, 70, 69, 67, 65, 62, 0, 62, 65, 67, 0, 68, 67, 65, 0, 62, 0, 61, 0, 0, 0],
    bass: [38, 38, 38, 38, 41, 41, 37, 37, 38, 38, 38, 38, 36, 36, 37, 37],
    wave: 'sawtooth',
  },
};

const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class Music {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private timer: number | undefined;
  private audio: HTMLAudioElement | null = null;
  private current: Track | null = null;
  volume = 0.12;

  play(track: Track) {
    if (this.current === track) return;
    this.stop();
    this.current = track;
    if (sound.muted) return;
    const file = ASSETS.bgm[track];
    if (file) {
      this.audio = new Audio(file);
      this.audio.loop = true;
      this.audio.volume = this.volume * 3;
      void this.audio.play().catch(() => {});
      return;
    }
    this.synth(track);
  }

  stop() {
    window.clearInterval(this.timer);
    this.timer = undefined;
    this.audio?.pause();
    this.audio = null;
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    this.gain = null;
    this.current = null;
  }

  /** ミュートの切り替えに合わせて止める/再開する */
  refresh() {
    const t = this.current;
    this.stop();
    if (t && !sound.muted) this.play(t);
    else this.current = t;
  }

  private synth(track: Track) {
    try {
      this.ctx ??= new AudioContext();
    } catch {
      return;
    }
    const ctx = this.ctx;
    if (ctx.state === 'suspended') void ctx.resume();
    const song = SONGS[track];
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    gain.connect(ctx.destination);
    this.gain = gain;
    const step = 60 / song.bpm / 2; // 8分音符
    let i = 0;
    let next = ctx.currentTime + 0.05;
    const note = (freq: number, t: number, dur: number, type: OscillatorType, vol: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(gain);
      o.start(t);
      o.stop(t + dur + 0.05);
    };
    // 少し先まで予約しておく（タブが裏でもリズムが崩れにくい）
    const schedule = () => {
      while (next < ctx.currentTime + 0.6) {
        const lead = song.lead[i % song.lead.length];
        if (lead) note(hz(lead), next, step * 0.9, song.wave, 0.35);
        if (i % 2 === 0) note(hz(song.bass[(i / 2) % song.bass.length]), next, step * 1.8, 'sine', 0.6);
        next += step;
        i++;
      }
    };
    schedule();
    this.timer = window.setInterval(schedule, 200);
  }
}

export const music = new Music();
