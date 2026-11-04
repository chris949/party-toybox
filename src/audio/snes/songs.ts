// 場面ごとのオリジナル曲（スーファミ風）。実在する曲のメロディは使っていない
import type { Scene } from '../sound';
import type { Song } from './engine';

// 楽譜を書く道具
const hold = (n: string) => `${n} ${'- '.repeat(15).trim()}`;                     // 1小節伸ばす
const bars = (...b: string[]) => b.join(' | ');
const times = (k: number, ...b: string[]) => bars(...Array.from({ length: k }, () => b).flat());
// 和音を1小節ずつ伸ばす（3声に分けて書く）
const pad = (voice: number, ...chords: string[][]) => bars(...chords.map(c => hold(c[voice])));
// ベース：根音と5度で弾む
const bounce = (r: string, v: string) => `${r} . . . ${v} . . . ${r} . . . ${r} . ${v} .`;
// アルペジオ（16分で上下に）
const arp = (a: string, b: string, c: string) => `${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b}`;

// ===== ロビー・ホーム：「ひだまりの町」 F長調・のんびり =====
const LOBBY_CHORDS = [['A3', 'C4', 'F4'], ['A3', 'D4', 'F4'], ['Bb3', 'D4', 'F4'], ['G3', 'C4', 'E4'], ['A3', 'C4', 'F4'], ['A3', 'C4', 'E4'], ['Bb3', 'D4', 'F4'], ['G3', 'Bb3', 'E4']];
const lobby: Song = {
  title: 'ひだまりの町',
  bpm: 92,
  parts: [
    { inst: 'pluck', vol: 0.5, pan: 0.15, loop: bars(
      'C5 . A4 . F4 . A4 . C5 . . . D5 . C5 .',
      'A4 . . . F4 . D4 . F4 . A4 . . . . .',
      'Bb4 . D5 . F5 . . . D5 . Bb4 . C5 . D5 .',
      'C5 - - - . . G4 . A4 . Bb4 . C5 . E5 .',
      'F5 . . . C5 . A4 . C5 . F5 . A5 . G5 .',
      'E5 . . . C5 . A4 . E4 . A4 . C5 . . .',
      'D5 . Bb4 . D5 . F5 . E5 . D5 . C5 . Bb4 .',
      'A4 . G4 . E4 . G4 . C5 - - - - - . .',
    ) },
    ...[0, 1, 2].map(i => ({ inst: 'strings' as const, vol: 0.13, pan: i - 1, loop: pad(i, ...LOBBY_CHORDS) })),
    { inst: 'bass', vol: 0.45, loop: bars(bounce('F2', 'C3'), bounce('D2', 'A2'), bounce('Bb1', 'F2'), bounce('C2', 'G2'), bounce('F2', 'C3'), bounce('A1', 'E2'), bounce('Bb1', 'F2'), bounce('C2', 'G2')) },
    { inst: 'drums', vol: 0.35, loop: times(8, 'k . . . h . . . r . . . h . . h') },
  ],
};

// ===== 並び替え：「せかせかタイム」 イ短調・速め =====
const PICK_CHORDS = [['A3', 'C4', 'E4'], ['A3', 'C4', 'F4'], ['B3', 'D4', 'G4'], ['B3', 'E4', 'G4'], ['A3', 'C4', 'E4'], ['A3', 'C4', 'F4'], ['B3', 'D4', 'G4'], ['G#3', 'B3', 'E4']];
const octaves = (lo: string, hi: string) => `${lo} . ${hi} . ${lo} . ${hi} . ${lo} . ${hi} . ${lo} . ${hi} .`;
const pick: Song = {
  title: 'せかせかタイム',
  bpm: 148,
  parts: [
    { inst: 'lead', vol: 0.32, pan: 0.1, loop: bars(
      'A4 . C5 . E5 . A5 . . G5 . E5 . C5 . .',
      'F5 . . E5 . C5 . . A4 . C5 . F5 . E5 .',
      'D5 . . B4 . G4 . . B4 . D5 . G5 . F5 .',
      'E5 - - - B4 . . . G4 . E4 . . . . .',
      'A4 . C5 . E5 . A5 . . B5 . C6 . B5 . .',
      'A5 . . F5 . C5 . . F5 . A5 . C6 . A5 .',
      'B5 . . G5 . D5 . . G5 . B5 . D6 . B5 .',
      'G#5 - - - E5 - - - B4 . . . G#4 . . .',
    ) },
    { inst: 'pluck', vol: 0.16, pan: -0.4, loop: bars(...PICK_CHORDS.map(c => arp(c[0], c[1], c[2]))) },
    { inst: 'bass', vol: 0.45, loop: bars(octaves('A1', 'A2'), octaves('F1', 'F2'), octaves('G1', 'G2'), octaves('E1', 'E2'), octaves('A1', 'A2'), octaves('F1', 'F2'), octaves('G1', 'G2'), octaves('E1', 'E2')) },
    { inst: 'drums', vol: 0.42, loop: bars(...Array.from({ length: 8 }, (_, i) => i === 7 ? 'k . h . s . h k s . s . s s s s' : 'k . h . s . h k k . h . s . h h')) },
  ],
};

// ===== 答え合わせ：「ドキドキの瞬間」 ニ短調・遅め。声と効果音を邪魔しないよう、メロディは控えめ =====
const REVEAL_CHORDS = [['D3', 'F3', 'A3'], ['D3', 'F3', 'Bb3'], ['D3', 'G3', 'Bb3'], ['C#3', 'E3', 'A3']];
const pulse8 = (n: string) => `${n} . ${n} . ${n} . ${n} . ${n} . ${n} . ${n} . ${n} .`;
const reveal: Song = {
  title: 'ドキドキの瞬間',
  bpm: 80,
  parts: [
    { inst: 'bass', vol: 0.4, loop: bars(pulse8('D2'), pulse8('Bb1'), pulse8('G1'), pulse8('A1')) },
    ...[0, 1, 2].map(i => ({ inst: 'strings' as const, vol: 0.1, pan: (i - 1) * 0.6, loop: pad(i, ...REVEAL_CHORDS) })),
    { inst: 'bell', vol: 0.14, pan: 0.3, loop: bars(
      'A5 . . . . . . . . . . . . . . .',
      '. . . . . . . . F5 . . . . . . .',
      'D6 . . . . . . . . . . . . . . .',
      '. . . . . . . . E5 . . . C#5 . . .',
    ) },
    { inst: 'drums', vol: 0.4, loop: bars('k . . k . . . . k . . k . . . .', 'k . . k . . . . k . . k . . . .', 'k . . k . . . . k . . k . . . .', 'k . . k . . . . k . . k . t t t') },
  ],
};

// ===== 最終結果：「かちどき」 ハ長調。ファンファーレから始まる明るいエンディング =====
const RESULT_CHORDS = [['E4', 'G4', 'C5'], ['E4', 'A4', 'C5'], ['F4', 'A4', 'C5'], ['D4', 'G4', 'B4'], ['E4', 'G4', 'C5'], ['E4', 'G4', 'B4'], ['F4', 'A4', 'C5'], ['D4', 'G4', 'B4']];
const result: Song = {
  title: 'かちどき',
  bpm: 126,
  parts: [
    { inst: 'brass', vol: 0.4, pan: 0.1,
      intro: bars('C5 . . C5 . . C5 . E5 - - - G5 - - -', 'C6 - - - - - - - G5 . A5 . B5 . C6 .'),
      loop: bars(
        'E5 . . C5 . . G4 . C5 . E5 . G5 - - -',
        'A5 . . G5 . . E5 . C5 - - - . . . .',
        'F5 . . E5 . . D5 . C5 . A4 . C5 . F5 .',
        'G5 - - - . . D5 . G5 . A5 . B5 . . .',
        'C6 . . B5 . . G5 . E5 . G5 . C6 - - -',
        'B5 . . G5 . . E5 . G5 . B5 . E6 - - -',
        'D6 . . C6 . . A5 . F5 . A5 . C6 . A5 .',
        'B5 - - - D6 - - - G5 - - - . . . .',
      ) },
    ...[0, 1, 2].map(i => ({ inst: 'strings' as const, vol: 0.12, pan: i - 1,
      intro: bars(hold(['E4', 'G4', 'C5'][i]), hold(['E4', 'G4', 'C5'][i])),
      loop: pad(i, ...RESULT_CHORDS) })),
    { inst: 'bass', vol: 0.45,
      intro: bars('C2 . . C2 . . C2 . C2 - - - C2 - - -', 'C2 - - - - - - - G1 . A1 . B1 . C2 .'),
      loop: bars(bounce('C2', 'G2'), bounce('A1', 'E2'), bounce('F1', 'C2'), bounce('G1', 'D2'), bounce('C2', 'G2'), bounce('E1', 'B1'), bounce('F1', 'C2'), bounce('G1', 'D2')) },
    { inst: 'drums', vol: 0.42,
      intro: bars('s . . s . . s . s s s s s s s s', 'k . . . . . . . s . s . s s s s'),
      loop: times(8, 'k . h . s . h . k k h . s . h .') },
  ],
};

export const SONGS: Record<Scene, Song> = { lobby, pick, reveal, result };
