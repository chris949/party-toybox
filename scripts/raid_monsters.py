"""ダイスレイドのモンスターの絵を、1枚の素材集から切り出す。

使い方（Pillow・numpy・scipy が要る）：
  python scripts/raid_monsters.py ~/Downloads/モンスターアニメーション素材集-1.png

入力：ドラゴン（ボス）・スライム・ゴブリン・コボルトの、待機・移動・攻撃・被弾・撃破が並んだ1枚絵（1536×1024）。
      きれいな格子ではないので、コマの位置は、下の FRAMES に書いてある。
出力：public/raid/sd/{種類}_{動き}{番号}.png と、raid/src/sd-manifest.json の書き換え。
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
OUTLINE = 4    # ほかの絵に合わせて付ける、白いふちの太さ

# コマの位置。帯（y の範囲）ごとに、動きと、各コマの体の中心あたりの点 (x, y) を書く。
# 1コマに点を2つ以上書くと、どれも同じコマになる（例：ブレスの3コマ目は、ドラゴンの体と、炎）
def row(y, xs):
    return [(x, y) for x in xs]


def dragon(x, y, *more):
    """ドラゴン1体ぶんの点：体・翼の付け根と先（体の左上）・頭（体の右上）。重なった隣のドラゴンに、翼や頭を取られないようにする"""
    return ((x, y), (x - 40, y - 25), (x - 58, y - 68), (x - 22, y - 60), (x + 32, y - 52)) + more


FRAMES = {
    'boss': {'facing': 'right', 'bands': [
        ((82, 242), [('idle', [dragon(97, 190), dragon(220, 190), dragon(328, 190)]),
                     ('walk', [dragon(450, 190), dragon(568, 190), dragon(666, 190)]),
                     ('attack', [dragon(805, 190), dragon(920, 190, (952, 128), (972, 148)), dragon(1020, 190, (1110, 165), (1150, 150))]),   # ブレス
                     ('claw', [dragon(1245, 190), dragon(1365, 190, (1405, 195)), dragon(1475, 190)])]),             # 爪（いまは使っていない。切り分けのために書く）
        ((266, 426), [('hit', [dragon(87, 358), dragon(220, 368), dragon(353, 358)]), ('down', row(394, [500])),
                      ('ko', [dragon(676, 348), (819, 374), (952, 394), (1095, 394)])]),
    ]},
    'slime': {'facing': 'left', 'bands': [
        ((504, 590), [('idle', row(550, [93, 174, 254])), ('walk', row(550, [386, 463, 527])), ('walk4', row(550, [598])),
                      ('attack', row(550, [700, 782, 866])), ('hit', row(552, [971, 1062, 1150])), ('ko', [(1310, 552), (1390, 552), (1480, 568)])]),
    ]},
    'goblin': {'facing': 'left', 'bands': [
        ((598, 786), [('idle', row(725, [67, 157, 239])), ('walk', row(725, [346, 433, 531])),
                      ('attack', row(725, [654, 727, 812])), ('hit', row(730, [985, 1100, 1196])), ('ko', [(1297, 730), (1378, 752), (1475, 765)])]),
    ]},
    'orc': {'facing': 'right', 'bands': [
        ((856, 990), [('idle', row(935, [75, 163, 235])), ('walk', row(935, [371, 453, 546])),
                      ('attack', row(935, [650, 741, 850])), ('hit', row(940, [981, 1081, 1179])), ('ko', [(1287, 935), (1373, 965), (1480, 972)])]),
    ]},
}
# どうしても隣の絵のかけらが付くコマは、右の端を手で決める（x より右を捨てる）
XMAX = {('boss', 'attack', 2): 976}
UNUSED = {'claw', 'down', 'walk4'}  # 切り分けのために書いたが、ゲームでは使わない動き


# 見出しの札（「待機」「モブ - スライム」など）がある行。絵のすぐ上にあって、絵の先（翼・武器）と重なることがある
LABEL_ROWS = [(4, 48), (46, 84), (236, 271), (430, 469), (470, 507), (586, 662), (788, 824), (821, 858)]


def erase_labels(arr):
    """見出しの札（濃い紺色の角丸の札と、中の白い文字）を消す。札のある行の中だけで、紺色のまとまりを探す"""
    r, g, b, a = (arr[:, :, c].astype(int) for c in range(4))
    navy = (a > 60) & (abs(r - 42) < 24) & (abs(g - 50) < 24) & (abs(b - 61) < 26) & (b >= r + 4)
    rows = np.zeros(a.shape, bool)
    for y0, y1 in LABEL_ROWS:
        rows[y0:y1] = True
    navy &= rows
    core = ndi.binary_opening(ndi.binary_closing(navy, structure=np.ones((5, 9), bool)), structure=np.ones((7, 14), bool))
    pill = ndi.binary_dilation(ndi.binary_fill_holes(core), iterations=4) & rows
    arr[pill] = 0
    return arr


def segment(alpha, y0, y1, seeds):
    """帯の中の絵を、コマごとに分ける。seeds[コマ] = そのコマの体の中の点 (x, y) を1つ以上（体・翼・頭 など）。
    つながっていない絵は、丸ごとそのコマになる。重なってつながっている絵は、それぞれの点から同じ速さで広げていって、ぶつかった所で分ける"""
    mask = alpha[y0:y1] > ALPHA
    dist = ndi.distance_transform_edt(mask)
    lab = np.zeros(mask.shape, np.int16)
    for n, pts in enumerate(seeds, 1):
        for (x, y) in pts:
            # 種は、近くでいちばん絵の太い所に置く（絵の外に置かれた点は、使わない）
            t, l = max(0, y - y0 - 12), max(0, x - 12)
            win = dist[t:y - y0 + 13, l:x + 13]
            if win.size == 0 or win.max() < 2:
                continue
            py, px = np.unravel_index(np.argmax(win), win.shape)
            lab[t + py, l + px] = n
    while True:
        grown = ndi.maximum_filter(lab, size=3)
        grow = mask & (lab == 0) & (grown > 0)
        if not grow.any():
            break
        lab[grow] = grown[grow]
    # 種のないかたまり（星・魂・しぶき など）は、いちばん近いコマに付ける。遠いものと、小さすぎるものは捨てる
    comps, _ = ndi.label(mask)
    centers = [np.mean([p[0] for p in pts]) for pts in seeds]
    for i, sl in enumerate(ndi.find_objects(comps), 1):
        sel = comps[sl] == i
        if (lab[sl][sel] > 0).any() or sel.sum() < 60:
            continue
        # 見出しの行の中だけにあるものは、見出しの消し残しなので捨てる
        if any(r0 <= y0 + sl[0].start and y0 + sl[0].stop <= r1 for r0, r1 in LABEL_ROWS):
            continue
        cx = (sl[1].start + sl[1].stop) / 2
        near = int(np.argmin([abs(cx - c) for c in centers]))
        if abs(cx - centers[near]) < 90:
            lab[sl][sel] = near + 1
    return lab


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


def main(src):
    arr = erase_labels(np.array(Image.open(src).convert('RGBA')))
    sheet = Image.fromarray(arr)
    alpha = arr[:, :, 3]
    with open(MANIFEST) as f:
        manifest = json.load(f)
    for kind, spec in FRAMES.items():
        entry = {'facing': spec['facing']}
        for (y0, y1), motions in spec['bands']:
            names = [(m, n) for m, pts in motions for n in range(1, len(pts) + 1)]
            seeds = [[p] if isinstance(p[0], int) else list(p) for _, pts in motions for p in pts]
            lab = segment(alpha, y0, y1, seeds)
            for idx, (motion, n) in enumerate(names, 1):
                sel = lab == idx
                if len(seeds[idx - 1]) > 1:
                    # 重なった絵を分けたコマ：隣に取られて、ちぎれて浮いた小さなかけらは捨てる
                    parts, _ = ndi.label(sel)
                    sizes = np.bincount(parts.ravel())[1:]
                    sel = np.isin(parts, 1 + np.nonzero(sizes >= sizes.max() * 0.15)[0])
                if (kind, motion, n) in XMAX:
                    sel[:, XMAX[(kind, motion, n)]:] = False
                ys, xs = np.nonzero(sel)
                x0, x1, t, b = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
                cell = np.array(sheet.crop((x0, y0 + t, x1, y0 + b)))
                cell[~sel[t:b, x0:x1]] = 0
                cell = Image.fromarray(cell)
                fx, fy = foot(np.array(cell)[:, :, 3])
                piece, pad = outlined(cell)
                if motion in UNUSED:
                    continue
                name = f'{kind}_{motion}{n}'
                piece.save(f'{OUT}/{name}.png', optimize=True)
                entry.setdefault(motion, []).append({'file': f'sd/{name}.png', 'w': piece.width, 'h': piece.height,
                                                     'ox': round((fx + pad) / piece.width, 3), 'oy': round((fy + pad) / piece.height, 3)})
        manifest[kind] = entry
        print(kind, {m: len(v) for m, v in entry.items() if isinstance(v, list)})
    with open(MANIFEST, 'w') as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write('\n')


if __name__ == '__main__':
    main(sys.argv[1])
