// 曲の楽譜が正しく書けているか（1小節16個、音名やドラムの記号が読める、パートの長さがそろっている）
import { describe, expect, it } from 'vitest';
import { parse } from '../src/audio/snes/engine';
import { SONGS } from '../src/audio/snes/songs';

describe('BGMの楽譜', () => {
  for (const [scene, song] of Object.entries(SONGS)) {
    it(`${scene}（${song.title}）`, () => {
      const loops = song.parts.map(p => parse(p.loop, p, song.title).steps);
      expect(new Set(loops).size).toBe(1);
      const intros = song.parts.filter(p => p.intro).map(p => parse(p.intro!, p, song.title).steps);
      expect(new Set(intros).size).toBeLessThanOrEqual(1);
      for (const p of song.parts.filter(p => p.inst === 'drums')) {
        for (const e of parse(p.loop, p, song.title).events) expect('ksohrt').toContain(String(e.midi));
      }
    });
  }
});
