// ダイスレイドの曲（スーファミ風）。音源は、本体と同じもの（src/audio/snes/engine.ts）を使う。
// どちらもオリジナルで、実在する曲のメロディは使っていない。楽譜の書き方は、engine.ts の先頭にある
import type { Song } from '../../src/audio/snes/engine';

// 楽譜を書く道具
const hold = (n: string) => `${n} ${'- '.repeat(15).trim()}`;                     // 1小節伸ばす
const bars = (...b: string[]) => b.join(' | ');
// 和音を1小節ずつ伸ばす（3声に分けて書く）
const pad = (voice: number, ...chords: string[][]) => bars(...chords.map(c => hold(c[voice])));
// アルペジオ（16分で上下に）
const arp = (a: string, b: string, c: string) => `${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b}`;
// ベース：根音と5度で、歩くように
const walk = (r: string, v: string) => `${r} . . ${r} . . ${v} . ${r} . . ${r} . ${v} . .`;
// ベース：8分でたたみかける
const drive = (r: string, hi: string) => `${r} . ${r} . ${hi} . ${r} . ${r} . ${r} . ${hi} . ${r} ${hi}`;

// ===== 準備フェーズ：「旅立ちの回廊」 ニ短調・歩く速さ。すごろくを進む、少し不思議で前向きな曲 =====
const FIELD_CHORDS = [['D3', 'F3', 'A3'], ['Bb2', 'D3', 'F3'], ['C3', 'E3', 'G3'], ['A2', 'C#3', 'E3'], ['D3', 'F3', 'A3'], ['G2', 'Bb2', 'D3'], ['Bb2', 'D3', 'F3'], ['A2', 'C#3', 'E3']];
const field: Song = {
  title: '旅立ちの回廊',
  bpm: 104,
  parts: [
    { inst: 'lead', vol: 0.3, pan: 0.1, loop: bars(
      'D5 . . A4 . . D5 . F5 . E5 . D5 . . .',
      'F5 . . D5 . . Bb4 . D5 - - - . . C5 .',
      'E5 . . C5 . . G4 . C5 . E5 . G5 . . .',
      'E5 - - - C#5 . . . A4 - - - . . . .',
      'D5 . . A4 . . D5 . F5 . G5 . A5 . . .',
      'Bb5 . . G5 . . D5 . G5 - - - . . F5 .',
      'F5 . . D5 . . Bb4 . D5 . F5 . E5 . D5 .',
      'C#5 - - - E5 . . . A5 - - - - - . .',
    ) },
    { inst: 'pluck', vol: 0.18, pan: -0.35, loop: bars(...FIELD_CHORDS.map(c => arp(c[0], c[1], c[2]))) },
    ...[0, 1, 2].map(i => ({ inst: 'strings' as const, vol: 0.1, pan: i - 1, loop: pad(i, ...FIELD_CHORDS) })),
    { inst: 'bass', vol: 0.42, loop: bars(walk('D2', 'A2'), walk('Bb1', 'F2'), walk('C2', 'G2'), walk('A1', 'E2'), walk('D2', 'A2'), walk('G1', 'D2'), walk('Bb1', 'F2'), walk('A1', 'E2')) },
    { inst: 'drums', vol: 0.3, loop: bars(...Array.from({ length: 8 }, (_, i) => i % 4 === 3 ? 'k . . h . . r . k . h . r . t t' : 'k . . h . . r . k . h . r . . h')) },
  ],
};

// ===== 決戦フェーズ：「魔竜、目覚める」 ハ短調・速い。金管で押して、たたみかける曲 =====
const BOSS_CHORDS = [['C3', 'Eb3', 'G3'], ['Ab2', 'C3', 'Eb3'], ['Bb2', 'D3', 'F3'], ['G2', 'B2', 'D3'], ['C3', 'Eb3', 'G3'], ['F2', 'Ab2', 'C3'], ['Ab2', 'C3', 'Eb3'], ['G2', 'B2', 'D3']];
const boss: Song = {
  title: '魔竜、目覚める',
  bpm: 152,
  parts: [
    { inst: 'brass', vol: 0.3, pan: 0.05, intro: bars(
      'G4 - - - G4 - - - G4 . G4 . Ab4 - - -',
      'G4 - - - - - - - . . . . D5 . G5 .',
    ), loop: bars(
      'C5 . . G4 . . C5 . Eb5 . D5 . C5 . . .',
      'Eb5 . . C5 . . Ab4 . C5 - - - . . Bb4 .',
      'D5 . . Bb4 . . F4 . Bb4 . D5 . F5 . . .',
      'D5 - - - B4 . . . G4 - - - . . G4 G4',
      'C5 . . G4 . . C5 . Eb5 . F5 . G5 . . .',
      'Ab5 . . F5 . . C5 . F5 - - - . . Eb5 .',
      'Eb5 . . C5 . . Ab4 . C5 . Eb5 . D5 . C5 .',
      'B4 - - - D5 . . . G5 - - - - - . .',
    ) },
    { inst: 'lead', vol: 0.16, pan: -0.3, intro: bars(hold('D5'), hold('B4')), loop: bars(...BOSS_CHORDS.map(c => arp(c[1].replace('3', '4'), c[2].replace('3', '4'), c[0].replace(/\d/, d => String(Number(d) + 2))))) },
    ...[0, 1, 2].map(i => ({ inst: 'strings' as const, vol: 0.11, pan: i - 1, intro: pad(i, ['G2', 'B2', 'D3'], ['G2', 'B2', 'D3']), loop: pad(i, ...BOSS_CHORDS) })),
    { inst: 'bass', vol: 0.48, intro: bars(drive('G1', 'G2'), drive('G1', 'G2')), loop: bars(drive('C2', 'C3'), drive('Ab1', 'Ab2'), drive('Bb1', 'Bb2'), drive('G1', 'G2'), drive('C2', 'C3'), drive('F1', 'F2'), drive('Ab1', 'Ab2'), drive('G1', 'G2')) },
    { inst: 'drums', vol: 0.42, intro: bars('k . . . k . . . k . k . s . s .', 'k . t . k . t . s s s s t t t t'),
      loop: bars(...Array.from({ length: 8 }, (_, i) => i % 4 === 3 ? 'k . h k s . h k k . s . s s t t' : 'k . h k s . h . k k h . s . h h')) },
  ],
};

export const RAID_SONGS = { field, boss };
