import { describe, expect, it } from 'vitest';
import { parse } from '../src/audio/snes/engine';
import { RAID_SONGS } from '../raid/src/songs';

describe('ダイスレイドの曲', () => {
  it('どの楽譜も読める（1小節＝16個）。同じ曲の中では、どのパートも同じ長さ', () => {
    for (const song of Object.values(RAID_SONGS)) {
      const loops = song.parts.map(p => parse(p.loop, p, song.title).steps);
      expect(new Set(loops).size).toBe(1);
      expect(loops[0]).toBe(8 * 16);
      const intros = song.parts.filter(p => p.intro).map(p => parse(p.intro!, p, song.title).steps);
      expect(new Set(intros).size).toBeLessThanOrEqual(1);
      // イントロがある曲は、全部のパートに付ける（付けないパートは、その間ずれてしまう）
      expect([0, song.parts.length]).toContain(intros.length);
    }
  });
});
