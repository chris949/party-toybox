"""ダイスレイドのコマ絵（味方4職とモンスター4種）を、1枚の素材集から切り出す。

使い方（Pillow・numpy・scipy が要る）：
  python scripts/raid_sprites.py ~/Downloads/図２.png

入力：背景が透明で、絵どうしの間が空いた素材集（1536×1024）。上から、魔法使い・戦士・僧侶・弓兵・ドラゴン・スライム・ゴブリン・コボルト の行。
      行の中の絵を、左から 1, 2, 3 … と数えて、どの動きの何コマ目に使うかを、下の KINDS に書いてある。
出力：public/raid/sd/{種類}_{動き}{番号}.png と、raid/src/sd-manifest.json の書き換え（味方の攻撃エフェクト fx は、前のものを残す）。
      コボルトは、ゲームの中の3体目のザコ（内部の名前は orc）の絵として使う。
"""
import json
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

OUT = 'public/raid/sd'
MANIFEST = 'raid/src/sd-manifest.json'
ALPHA = 60     # これより薄い所は、絵のまわりの「もや」として捨てる
BIG = 900      # これより大きいかたまりを、1コマの本体として数える（小さいものは、星・しぶき などの飾り）
OUTLINE = 4    # 白いふち（ステッカー風）の太さ

# 行（絵の中心の y の範囲）と、コマの割り当て。数字は、その行の本体を左から数えた番号。
# 'a+b' = 2つの本体を1コマにまとめる（体と、離れて描かれた斬撃 など）。('split', n, [x, …]) = くっついて1つになっている本体 n を、x のあたりで分ける
KINDS = {
    'mage':    {'y': (0, 162), 'facing': 'right', 'idle': [1, 2, 3], 'walk': [4, 5, 6], 'attack': [7, 8], 'hit': [9], 'ko': [10]},
    'warrior': {'y': (162, 318), 'facing': 'right', 'split': {11: [1400, 1485]},
                'idle': [1, 2, 3], 'walk': [4, 5, 6], 'attack': [7, '8+9'], 'hit': [10, '11a'], 'ko': ['11b']},
    'priest':  {'y': (318, 460), 'facing': 'right', 'idle': [1, 2, 3], 'walk': [4, 5, 6], 'attack': [7, 8], 'hit': [9, 10], 'ko': [11]},
    'archer':  {'y': (460, 603), 'facing': 'right', 'split': {10: [1390, 1475]},
                'idle': [1, 2, 3], 'walk': [4, 5, 6], 'attack': [7, 8], 'hit': [9, '10a'], 'ko': ['10b']},
    # ドラゴン：1・2 = 待機、3 = ブレス、4 = 爪、5 = 被弾、6 = 撃破。歩きは、待機の2コマを使う
    'boss':    {'y': (603, 768), 'facing': 'right', 'idle': [1, 2, 1], 'walk': [1, 2, 1], 'attack': [4, 3], 'hit': [5], 'ko': [6]},
    'slime':   {'y': (768, 838), 'facing': 'right', 'idle': [1, 2, 3], 'walk': [4, 5, 2], 'attack': [6, 7], 'hit': [8], 'ko': [9, 10]},
    'goblin':  {'y': (838, 934), 'facing': 'right', 'idle': [1, 2, 6], 'walk': [3, 4, 5], 'attack': [7, 8], 'hit': [9, 10], 'ko': [11, 12]},
    'orc':     {'y': (934, 1024), 'facing': 'right', 'idle': [1, 2, 3], 'walk': [4, 5, 3], 'attack': [6, 7], 'hit': [8, 9], 'ko': [10, 11, 12]},
}
MOTIONS = ['idle', 'walk', 'attack', 'hit', 'ko']


def outlined(im):
    pad = OUTLINE + 2
    canvas = Image.new('RGBA', (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad))
    solid = canvas.getchannel('A').point(lambda v: 255 if v > 90 else 0)
    ring = solid.filter(ImageFilter.MaxFilter(OUTLINE * 2 + 1)).filter(ImageFilter.GaussianBlur(0.7))
    white = Image.new('RGBA', canvas.size, (255, 255, 255, 0))
    white.putalpha(ring)
    white.alpha_composite(canvas)
    return white, pad


def foot(alpha):
    """足元（基準点）：横は、絵の重みの中心。縦は、ある程度の幅がある、いちばん下の行"""
    ys, xs = np.nonzero(alpha > 40)
    cols = np.bincount(xs - xs.min())
    w = cols ** 2
    cx = float((np.arange(len(cols)) * w).sum() / w.sum() + xs.min())
    rows = np.bincount(ys - ys.min())
    wide = np.nonzero(rows >= max(4, rows.max() * 0.15))[0]
    return cx, int(wide.max() + ys.min())


def split(sel, xs):
    """くっついた本体を、目印の x のあたりから同じ速さで広げて、ぶつかった所で分ける"""
    dist = ndi.distance_transform_edt(sel)
    lab = np.zeros(sel.shape, np.int16)
    for n, x in enumerate(xs, 1):
        col = np.zeros(sel.shape, bool)
        col[:, max(0, x - 14):x + 15] = True
        d = np.where(col, dist, 0)
        lab[np.unravel_index(np.argmax(d), d.shape)] = n
    while True:
        grown = ndi.maximum_filter(lab, size=3)
        grow = sel & (lab == 0) & (grown > 0)
        if not grow.any():
            break
        lab[grow] = grown[grow]
    return [lab == n for n in range(1, len(xs) + 1)]


def main(src):
    arr = np.array(Image.open(src).convert('RGBA'))
    mask = arr[:, :, 3] > ALPHA
    lab, n = ndi.label(mask)
    objs = ndi.find_objects(lab)
    sizes = ndi.sum(mask, lab, range(1, n + 1))
    with open(MANIFEST) as f:
        manifest = json.load(f)
    for kind, spec in KINDS.items():
        y0, y1 = spec['y']
        mine = [i for i, sl in enumerate(objs) if y0 <= (sl[0].start + sl[0].stop) / 2 < y1]
        big = sorted([i for i in mine if sizes[i] >= BIG], key=lambda i: objs[i][1].start)
        parts = {str(k): lab == i + 1 for k, i in enumerate(big, 1)}
        centers = {str(k): ((objs[i][1].start + objs[i][1].stop) / 2, (objs[i][0].start + objs[i][0].stop) / 2) for k, i in enumerate(big, 1)}
        # 飾り（星・しぶき・魂 など）は、いちばん近い本体に付ける。遠いものは捨てる
        for i in mine:
            if sizes[i] >= BIG or sizes[i] < 40:
                continue
            cx, cy = (objs[i][1].start + objs[i][1].stop) / 2, (objs[i][0].start + objs[i][0].stop) / 2
            near = min(centers, key=lambda k: abs(centers[k][0] - cx))
            if abs(centers[near][0] - cx) < 110:
                parts[near] = parts[near] | (lab == i + 1)
        for num, xs in spec.get('split', {}).items():
            for suffix, piece in zip('abcd', split(parts[str(num)], xs)):
                parts[f'{num}{suffix}'] = piece
        entry = {'facing': spec['facing']}
        saved = {}
        for motion in MOTIONS:
            frames = []
            for token in spec[motion]:
                key = str(token)
                if key not in saved:
                    sel = np.zeros(mask.shape, bool)
                    for t in key.split('+'):
                        sel |= parts[t]
                    ys, xs = np.nonzero(sel)
                    l, r, t, b = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
                    cell = arr[t:b, l:r].copy()
                    cell[~sel[t:b, l:r]] = 0
                    cell = Image.fromarray(cell)
                    fx, fy = foot(np.array(cell)[:, :, 3])
                    piece, pad = outlined(cell)
                    name = f'{kind}_{motion}{len(frames) + 1}'
                    piece.save(f'{OUT}/{name}.png', optimize=True)
                    saved[key] = {'file': f'sd/{name}.png', 'w': piece.width, 'h': piece.height,
                                  'ox': round((fx + pad) / piece.width, 3), 'oy': round((fy + pad) / piece.height, 3)}
                frames.append(saved[key])
            entry[motion] = frames
        if 'fx' in manifest.get(kind, {}):
            entry['fx'] = manifest[kind]['fx']
        manifest[kind] = entry
        print(kind, 'big', len(big), {m: len(entry[m]) for m in MOTIONS})
    with open(MANIFEST, 'w') as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write('\n')


if __name__ == '__main__':
    main(sys.argv[1])
