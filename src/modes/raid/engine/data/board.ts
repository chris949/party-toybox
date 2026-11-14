import type { Board, Tile, TileType } from '../types';

/**
 * 7x7 のボード。中央 (3,3) にボスが陣取る。
 *   外周（24マス）：安全な稼ぎ場。時計回りに進む
 *   内周（8マス）：ボスに隣接する危険地帯。ボスを殴れる
 *   連絡路（4マス）：外周と内周の辺の中央をつなぐ分岐路
 */
/** すべてのマスに何かが起きる。良いマスと不運マスを混ぜる */
const OUTER_TYPES: TileType[] = [
  'start', 'coin', 'card', 'fate', 'chest', 'thief', 'heal',
  'coin', 'trap', 'fate', 'shop', 'curse', 'chest',
  'card', 'ambush', 'fate', 'coin', 'thief', 'shop',
  'card', 'coin', 'warp', 'heal', 'trap',
];
const INNER_TYPES: TileType[] = ['heal', 'fate', 'trap', 'card', 'curse', 'fate', 'ambush', 'coin'];
const SPOKE_TYPES: TileType[] = ['fate', 'card', 'trap', 'coin'];

export const TILE_INFO: Record<TileType, { name: string; icon: string; desc: string; good: boolean }> = {
  start: { name: '拠点', icon: '🏠', desc: 'レベルアップできる。KOしたらここで復活', good: true },
  coin: { name: 'コイン', icon: '🪙', desc: 'コインがもらえる', good: true },
  card: { name: 'カード', icon: '🃏', desc: 'カードを1枚引く', good: true },
  chest: { name: '宝箱', icon: '🎁', desc: 'チップを3つの候補から1つ選ぶ', good: true },
  heal: { name: '回復の泉', icon: '💚', desc: 'HP回復。同じマスの仲間も回復', good: true },
  shop: { name: 'ショップ', icon: '🛒', desc: 'カード購入・レベルアップ', good: true },
  trap: { name: '罠', icon: '⚠️', desc: '防御できないダメージ', good: false },
  thief: { name: '盗賊', icon: '🦝', desc: 'コインを3割盗まれる', good: false },
  curse: { name: '呪い', icon: '💀', desc: '次のターン、ダイス1個が「1」になる', good: false },
  fate: { name: '運命', icon: '❓', desc: '良いことも悪いことも起きる', good: true },
  warp: { name: 'ワープ', icon: '🌀', desc: 'どこかのマスへ飛ばされる', good: true },
  ambush: { name: '待ち伏せ', icon: '⚔️', desc: '魔物が現れて襲ってくる', good: false },
};

function ringCoords(min: number, max: number): [number, number][] {
  const out: [number, number][] = [];
  for (let x = min; x <= max; x++) out.push([x, min]);
  for (let y = min + 1; y <= max; y++) out.push([max, y]);
  for (let x = max - 1; x >= min; x--) out.push([x, max]);
  for (let y = max - 1; y > min; y--) out.push([min, y]);
  return out;
}

export function buildBoard(): Board {
  const tiles: Tile[] = [];
  const at = new Map<string, number>();
  const add = (x: number, y: number, type: TileType, zone: Tile['zone']) => {
    const id = tiles.length;
    tiles.push({ id, x, y, type, zone, next: [] });
    at.set(`${x},${y}`, id);
    return id;
  };
  const outer = ringCoords(0, 6).map(([x, y], i) => add(x, y, OUTER_TYPES[i], 'outer'));
  const inner = ringCoords(2, 4).map(([x, y], i) => add(x, y, INNER_TYPES[i], 'inner'));
  const spokes: [number, number, number, number, number, number][] = [
    // 連絡路, 外側の端, 内側の端
    [3, 1, 3, 0, 3, 2],
    [5, 3, 6, 3, 4, 3],
    [3, 5, 3, 6, 3, 4],
    [1, 3, 0, 3, 2, 3],
  ];
  const id = (x: number, y: number) => at.get(`${x},${y}`)!;

  outer.forEach((t, i) => tiles[t].next.push(outer[(i + 1) % outer.length]));
  inner.forEach((t, i) => tiles[t].next.push(inner[(i + 1) % inner.length]));
  for (const [sx, sy, ox, oy, ix, iy] of spokes) {
    const s = add(sx, sy, SPOKE_TYPES[tiles.length - 32], 'spoke');
    tiles[s].next.push(id(ox, oy), id(ix, iy));
    tiles[id(ox, oy)].next.push(s);
    tiles[id(ix, iy)].next.push(s);
  }

  // 距離（向きを無視した最短歩数）
  const adj: number[][] = tiles.map(() => []);
  for (const t of tiles) {
    for (const n of t.next) {
      if (!adj[t.id].includes(n)) adj[t.id].push(n);
      if (!adj[n].includes(t.id)) adj[n].push(t.id);
    }
  }
  const dist = tiles.map((t) => {
    const d = tiles.map(() => Infinity);
    d[t.id] = 0;
    const q = [t.id];
    while (q.length) {
      const c = q.shift()!;
      for (const n of adj[c]) if (d[n] === Infinity) { d[n] = d[c] + 1; q.push(n); }
    }
    return d;
  });
  const bossDist = tiles.map((t) => 1 + Math.min(...inner.map((i) => dist[t.id][i])));

  return {
    tiles,
    bossPos: { x: 3, y: 3 },
    startTile: outer[0],
    spawnPoints: [outer[4], outer[9], outer[15], outer[20]],
    adj,
    dist,
    bossDist,
  };
}

export const BOARD = buildBoard();
