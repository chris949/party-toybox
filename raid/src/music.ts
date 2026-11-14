import { ASSETS } from './assets';
import { sound } from './sound';
import { SnesPlayer } from '../../src/audio/snes/engine';
import { RAID_SONGS } from './songs';

/**
 * BGM。ASSETS.bgm に曲のパスがあればそれをループ再生、なければ、スーファミ風の音源で内蔵の曲を鳴らす。
 *   field：準備フェーズ / boss：決戦フェーズ
 */
type Track = 'field' | 'boss';

// 曲は、スーファミ風の音源で鳴らす（本体と同じ音源。楽譜は songs.ts）
const SNES_VOLUME = 0.42;

class Music {
  private ctx: AudioContext | null = null;
  private player: SnesPlayer | null = null;
  private audio: HTMLAudioElement | null = null;
  private current: Track | null = null;
  volume = 0.12;

  play(track: Track) {
    if (this.current === track) return;
    // 次の曲もスーファミ風の音源で鳴らすときは、音源を止めない（止める予約が、あとから次の曲まで止めてしまうため。曲の入れ替えは、音源がやる）
    this.stop(!ASSETS.bgm[track] && !sound.muted);
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

  stop(keepPlayer = false) {
    this.audio?.pause();
    this.audio = null;
    if (!keepPlayer) this.player?.stop(0.3);
    this.current = null;
  }

  /** ミュートの切り替えに合わせて止める/再開する */
  refresh() {
    const t = this.current;
    this.stop(!sound.muted);
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
    this.player ??= new SnesPlayer(ctx);
    // 場面が変わるとき（準備 → 決戦）は、前の曲を小さくしながら、次の曲を始める
    this.player.play(RAID_SONGS[track], SNES_VOLUME, 0.6);
  }
}

export const music = new Music();
