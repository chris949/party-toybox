import type { SoundName } from './sound';

/**
 * 素材の差し替え口。本番の素材が届いたら、ここ（とファイル）を差し替えるだけで反映される。
 *   - SDキャラ・モンスター：tools/assets/sd_sheet.py / sd_grid.py で分割すると sd-manifest.json に入る
 *   - ボード背景：public/bg/board.png（テンプレート：tools/assets/templates/board_template.png）
 *   - カードの絵：public/cards/{カードID}.png（256×192 推奨）
 *   - BGM・効果音：public/audio/ に置き、下のパスを書き換える（null のあいだは合成音）
 */
export const ASSETS = {
  boardBackground: { file: 'bg/board.png', centerX: 750, centerY: 540 },
  cardArt: (id: string) => `cards/${id}.png`,
  bgm: { field: null, boss: null } as Record<'field' | 'boss', string | null>,
  sfx: {} as Partial<Record<SoundName, string>>,
};

/** SDの表示サイズ（足元から頭までの高さ）。絵の大きさが変わっても見た目の大きさがそろう */
export const SD_HEIGHT = {
  board: { player: 72, slime: 40, goblin: 60, orc: 62, boss: 140 } as Record<string, number>,
  battle: { player: 260, slime: 110, goblin: 190, orc: 195, boss: 300 } as Record<string, number>,
};
