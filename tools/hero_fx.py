"""Rebuild the two textures behind the live hero (assets/hero.js).

    python3 tools/hero_fx.py upscale path/to/RealESRGAN_x4plus.pth   writes assets/hermes-hd.webp
    python3 tools/hero_fx.py fx                                      writes assets/hermes-fx.png

Run it from the root of the site. Nothing here runs on the site itself; it
only makes the two images that assets/hero.js loads.

upscale
    Real-ESRGAN x4plus (https://github.com/xinntao/Real-ESRGAN, BSD 3-Clause)
    on assets/hermes.webp, then scaled to 5600 x 1396. It runs without
    PyTorch: the weights are read straight out of the .pth file by an
    unpickler that lets nothing but tensor data through, and the network is
    rebuilt as an ONNX graph for onnxruntime. The weights are here:
    https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth

fx
    Measures the engraving and packs what the shader needs into a 1400 x 349
    RGB PNG (no alpha, so no browser can premultiply the data away):
      R  depth, 0 far to 1 near
      G  0.5 neutral, above it the silver figure, below it the lightning veins
      B  signal id: 1 to 199 the two fans of cables, 200 to 227 the rods in
         the chest fist, 228 to 255 the rods running through the right hands

Everything measured here belongs to this engraving: the panel edges, the
points the cables fan out from, the lines of the held bundles, and the boxes
that teach the figure classifier what is figure and what is background. New
art needs those redone, and the matching constants at the top of
assets/hero.js (FACE and EMIT) with them.

Needs numpy, pillow, opencv-python, scipy, scikit-image and scikit-learn,
plus onnx and onnxruntime for upscale.
"""
import collections
import io
import pickle
import sys
import time
import zipfile

import numpy as np
from PIL import Image

SRC = "assets/hermes.webp"
HD = "assets/hermes-hd.webp"
FX = "assets/hermes-fx.png"

# measured on the 2800 x 698 art
PANEL_X = (887, 1915)                        # the dark panel behind the figure
EMIT_L, EMIT_R = (871.0, 348.0), (1880.0, 306.0)   # where each fan of cables converges
BUNDLES = [                                  # rods held in the fists: centre line, width, first id
    ([(1452, 330), (1372, 520), (1300, 698)], 50, 200),
    ([(1995, 0), (1940, 150), (1868, 400), (1790, 640), (1772, 698)], 46, 228),
]
FIGURE_BOXES = [
    (1340, 110, 1420, 200), (1310, 60, 1400, 100), (1150, 300, 1300, 420), (900, 20, 990, 150),
    (1350, 400, 1750, 470), (1500, 230, 1700, 300), (1700, 20, 1760, 150), (1600, 520, 1700, 580),
    (1000, 500, 1100, 650), (1810, 370, 1900, 450), (1890, 110, 1990, 190), (1720, 600, 1800, 680),
    (1400, 290, 1450, 360), (1200, 200, 1330, 280), (950, 300, 1100, 380), (1450, 360, 1600, 400),
    (1550, 470, 1650, 520), (1500, 500, 1560, 540), (1640, 560, 1700, 600), (1010, 520, 1080, 640),
    (805, 370, 850, 440), (1760, 175, 1840, 215), (1560, 535, 1620, 570), (1640, 575, 1700, 610),
    (1480, 480, 1540, 520),
]
BACKGROUND_BOXES = [
    (1100, 520, 1250, 698), (1450, 580, 1600, 698), (1500, 30, 1620, 110), (1770, 255, 1860, 330),
    (1030, 60, 1150, 180), (900, 450, 980, 698), (0, 0, 700, 698), (2150, 0, 2800, 698),
    (1620, 600, 1700, 698), (1230, 0, 1290, 60), (1780, 470, 1880, 600), (1560, 120, 1640, 200),
    (1700, 330, 1800, 380), (1250, 470, 1330, 540), (1150, 0, 1230, 50), (1450, 0, 1520, 50),
]


# ------------------------------------------------------------------ upscale

def load_pth(path):
    """State dict from a PyTorch zip checkpoint, as numpy arrays, without torch."""
    zf = zipfile.ZipFile(path)
    pkl = next(n for n in zf.namelist() if n.endswith("data.pkl"))
    prefix = pkl[: -len("data.pkl")]
    dtypes = {"FloatStorage": np.float32, "HalfStorage": np.float16, "DoubleStorage": np.float64,
              "LongStorage": np.int64, "IntStorage": np.int32}
    storages = {}

    def rebuild(storage, offset, size, stride, *rest):
        if not size:
            return storage[offset].copy()
        return np.lib.stride_tricks.as_strided(
            storage[offset:], shape=tuple(size), strides=tuple(s * storage.itemsize for s in stride)).copy()

    class Safe(pickle.Unpickler):
        def find_class(self, mod, name):
            if (mod, name) == ("torch._utils", "_rebuild_tensor_v2"):
                return rebuild
            if (mod, name) == ("torch._utils", "_rebuild_parameter"):
                return lambda data, *a: data
            if (mod, name) == ("collections", "OrderedDict"):
                return collections.OrderedDict
            if mod == "torch" and name in dtypes:
                return name
            raise pickle.UnpicklingError(f"refusing {mod}.{name}")

        def persistent_load(self, pid):
            _, kind, key, _where, _n = pid
            if key not in storages:
                storages[key] = np.frombuffer(zf.read(f"{prefix}data/{key}"), dtype=dtypes[kind])
            return storages[key]

    obj = Safe(io.BytesIO(zf.read(pkl))).load()
    return obj.get("params_ema", obj.get("params", obj))


def rrdb_session(path):
    """RRDBNet (23 blocks, 4x) as an onnxruntime session."""
    import onnx
    import onnxruntime as ort
    from onnx import TensorProto, helper, numpy_helper

    sd = load_pth(path)
    nodes, inits, count = [], [], [0]

    def name(p):
        count[0] += 1
        return f"{p}{count[0]}"

    def const(a):
        n = name("c")
        inits.append(numpy_helper.from_array(np.asarray(a), n))
        return n

    def op(t, ins, **kw):
        y = name(t)
        nodes.append(helper.make_node(t, ins, [y], **kw))
        return y

    def conv(x, key):
        return op("Conv", [x, const(sd[key + ".weight"].astype(np.float32)), const(sd[key + ".bias"].astype(np.float32))],
                  pads=[1, 1, 1, 1], kernel_shape=[3, 3])

    lrelu = lambda x: op("LeakyRelu", [x], alpha=0.2)
    scale = lambda x, s: op("Mul", [x, const(np.array(s, np.float32))])
    up2 = lambda x: op("Resize", [x, "", const(np.array([1, 1, 2, 2], np.float32))], mode="nearest")

    blocks = 1 + max(int(k.split(".")[1]) for k in sd if k.startswith("body."))
    feat = conv("x", "conv_first")
    h = feat
    for i in range(blocks):
        block_in = h
        for j in (1, 2, 3):
            base = f"body.{i}.rdb{j}"
            xs = [h]
            for c in range(1, 5):
                xs.append(lrelu(conv(xs[0] if len(xs) == 1 else op("Concat", xs, axis=1), f"{base}.conv{c}")))
            h = op("Add", [scale(conv(op("Concat", xs, axis=1), f"{base}.conv5"), 0.2), xs[0]])
        h = op("Add", [scale(h, 0.2), block_in])
    f = op("Add", [feat, conv(h, "conv_body")])
    f = lrelu(conv(up2(f), "conv_up1"))
    f = lrelu(conv(up2(f), "conv_up2"))
    out = conv(lrelu(conv(f, "conv_hr")), "conv_last")
    nodes.append(helper.make_node("Identity", [out], ["y"]))
    graph = helper.make_graph(nodes, "rrdb",
                              [helper.make_tensor_value_info("x", TensorProto.FLOAT, [1, 3, None, None])],
                              [helper.make_tensor_value_info("y", TensorProto.FLOAT, [1, 3, None, None])], inits)
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 8
    return ort.InferenceSession(model.SerializeToString(), providers=["CPUExecutionProvider"])


def upscale(weights):
    sess = rrdb_session(weights)
    img = np.asarray(Image.open(SRC).convert("L")).astype(np.float32) / 255
    H, W = img.shape
    tile, pad, s = 192, 12, 4
    out = np.zeros((H * s, W * s), np.float32)
    rgb = np.repeat(img[None, None], 3, axis=1)
    jobs = [(y, x) for y in range(0, H, tile) for x in range(0, W, tile)]
    t0 = time.time()
    for n, (y, x) in enumerate(jobs):
        y0, x0 = max(y - pad, 0), max(x - pad, 0)
        y1, x1 = min(y + tile + pad, H), min(x + tile + pad, W)
        res = sess.run(["y"], {"x": np.ascontiguousarray(rgb[:, :, y0:y1, x0:x1])})[0][0].mean(0)
        th, tw = (min(y + tile, H) - y) * s, (min(x + tile, W) - x) * s
        out[y * s:y * s + th, x * s:x * s + tw] = res[(y - y0) * s:(y - y0) * s + th, (x - x0) * s:(x - x0) * s + tw]
        print(f"\r  tile {n + 1}/{len(jobs)}, {time.time() - t0:.0f}s", end="", flush=True)
    print()
    big = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8))
    big.resize((W * 2, H * 2), Image.LANCZOS).convert("RGB").save(HD, "WEBP", quality=78, method=6)
    print("wrote", HD)


# ------------------------------------------------------------------ fx

def build_fx():
    import cv2
    from scipy import ndimage as ndi
    from skimage.morphology import disk, skeletonize, white_tophat
    from sklearn.ensemble import HistGradientBoostingClassifier

    L = np.asarray(Image.open(SRC).convert("L")).astype(np.float32) / 255
    H, W = L.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    inpanel = (xx >= PANEL_X[0]) & (xx <= PANEL_X[1])

    # which way each thin line runs (structure tensor)
    g = cv2.GaussianBlur(L, (0, 0), 1.0)
    gx, gy = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    Jxx, Jyy, Jxy = (cv2.GaussianBlur(a, (0, 0), 3.0) for a in (gx * gx, gy * gy, gx * gy))
    line_dir = 0.5 * np.arctan2(2 * Jxy, Jxx - Jyy) + np.pi / 2

    # the figure: a classifier on texture features, taught with the boxes above
    feats = [L]
    for s in (2, 4, 8, 16):
        mu = cv2.GaussianBlur(L, (0, 0), s)
        feats += [mu, np.sqrt(np.maximum(cv2.GaussianBlur(L * L, (0, 0), s) - mu * mu, 0)),
                  cv2.GaussianBlur((L > 0.1).astype(np.float32), (0, 0), s),
                  cv2.GaussianBlur((L > 0.7).astype(np.float32), (0, 0), s)]
    g15 = cv2.GaussianBlur(L, (0, 0), 1.5)
    ax, ay = cv2.Sobel(g15, cv2.CV_32F, 1, 0), cv2.Sobel(g15, cv2.CV_32F, 0, 1)
    for s in (3, 8):
        a, b, c = (cv2.GaussianBlur(v, (0, 0), s) for v in (ax * ax, ay * ay, ax * ay))
        feats += [np.sqrt((a - b) ** 2 + 4 * c * c) / (a + b + 1e-6), cv2.GaussianBlur(np.sqrt(ax * ax + ay * ay), (0, 0), s)]
    F = np.stack(feats, -1)
    rng = np.random.default_rng(1)
    X, y = [], []
    for boxes, label in ((FIGURE_BOXES, 1), (BACKGROUND_BOXES, 0)):
        for x0, y0, x1, y1 in boxes:
            f = F[y0:y1, x0:x1].reshape(-1, F.shape[-1])
            pick = rng.choice(len(f), min(len(f), 3000), replace=False)
            X.append(f[pick])
            y.append(np.full(len(pick), label))
    clf = HistGradientBoostingClassifier(max_iter=200, random_state=0).fit(np.concatenate(X), np.concatenate(y))
    P = clf.predict_proba(F.reshape(-1, F.shape[-1]))[:, 1].reshape(H, W).astype(np.float32)
    fig = ndi.binary_opening(cv2.GaussianBlur(P, (0, 0), 2.5) > 0.5, structure=np.ones((5, 5)))
    fig = ndi.binary_fill_holes(fig)
    lab, n = ndi.label(fig)
    sizes = ndi.sum(fig, lab, range(1, n + 1))
    fig = np.isin(lab, 1 + np.nonzero(sizes > 1500)[0])
    fig_soft = cv2.GaussianBlur(fig.astype(np.float32), (0, 0), 2.0)

    # veins: thin bright strokes in the panel, away from the figure
    th = white_tophat((L * 255).astype(np.uint8), disk(4)).astype(np.float32) / 255
    near_fig = cv2.GaussianBlur(fig.astype(np.float32), (0, 0), 3) > 0.15
    vein = ndi.binary_opening((th > 0.22) & (L > 0.42) & inpanel & ~near_fig, structure=np.ones((2, 2)))
    vein_soft = np.clip(cv2.GaussianBlur(vein.astype(np.float32), (0, 0), 1.2) * 1.6, 0, 1)

    # cables: bright lines outside the panel that point back at their fan's emitter
    right = xx >= 1400
    ex = np.where(right, EMIT_R[0], EMIT_L[0])
    ey = np.where(right, EMIT_R[1], EMIT_L[1])
    theta = np.arctan2(yy - ey, xx - ex)
    r = np.hypot(xx - ex, yy - ey)
    fig_dil = ndi.binary_dilation(fig, iterations=3)
    cable = (L > 0.26) & ~inpanel & ~fig_dil & (np.abs(np.sin(theta - line_dir)) < 0.22) & (r > 40)
    skel = skeletonize(ndi.binary_opening(cable, structure=np.ones((2, 2))))
    nb = ndi.convolve(skel.astype(np.uint8), np.ones((3, 3), np.uint8), mode="constant") - skel
    skel &= nb <= 2                                   # cut crossings so each ray is its own piece
    lab, n = ndi.label(skel, structure=np.ones((3, 3)))
    idx = np.arange(1, n + 1)
    count = ndi.sum(np.ones_like(L), lab, idx)
    ang = np.degrees(np.arctan2(ndi.mean(np.sin(theta), lab, idx), ndi.mean(np.cos(theta), lab, idx)))
    piece_side = np.round(ndi.mean(right.astype(np.float32), lab, idx))
    ray_of = np.zeros(n + 1, np.int32)
    rays = 0
    for s in (0, 1):                                  # pieces at the same angle are the same ray
        sel = np.nonzero((count >= 12) & (piece_side == s))[0]
        prev = None
        for c in sel[np.argsort(ang[sel])]:
            if prev is None or ang[c] - prev > 0.55:
                rays += 1
            ray_of[c + 1] = rays
            prev = ang[c]
    ids = np.where(skel, ray_of[lab], 0)
    value = np.concatenate([[0], np.random.default_rng(7).permutation(np.arange(1, 200))[np.arange(rays) % 199]])
    d, (iy, ix) = ndi.distance_transform_edt(ids == 0, return_indices=True)
    signal = np.where(~inpanel & ~fig_dil & (d < 14), value[ids[iy, ix]], 0).astype(np.uint8)

    # rods in the held bundles: one id per rod, from its offset across the bundle
    for pts, width, first in BUNDLES:
        reg = np.zeros((H, W), np.uint8)
        cv2.polylines(reg, [np.array(pts, np.int32)], False, 1, thickness=width)
        reg = reg.astype(bool) & ~ndi.binary_dilation(fig, iterations=2)
        best = np.full((H, W), 1e9, np.float32)
        off = np.zeros((H, W), np.float32)
        seg_dir = np.zeros((H, W), np.float32)
        for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
            ux, uy = (x1 - x0), (y1 - y0)
            length = np.hypot(ux, uy)
            ux, uy = ux / length, uy / length
            t = np.clip((xx - x0) * ux + (yy - y0) * uy, 0, length)
            dist = np.hypot(xx - (x0 + t * ux), yy - (y0 + t * uy))
            closer = dist < best
            best[closer] = dist[closer]
            off[closer] = ((xx - x0) * -uy + (yy - y0) * ux)[closer]
            seg_dir[closer] = np.arctan2(uy, ux)
        rod = reg & (L > 0.3) & (np.abs(np.sin(line_dir - seg_dir)) < 0.3)
        rod_id = (first + np.clip(np.round(off / 4.5).astype(int) + 14, 0, 27)).astype(np.uint8)
        d2, (iy2, ix2) = ndi.distance_transform_edt(~rod, return_indices=True)
        fill = np.where(reg & (d2 < 4), rod_id[iy2, ix2], 0).astype(np.uint8)
        signal = np.where(fill > 0, fill, signal)

    # depth: figure near, panel behind it, cables receding from the fists into space
    depth = np.where(inpanel, 0.34, 0.62 - 0.52 * np.clip(r / 1150.0, 0, 1) ** 0.8)
    held = np.zeros((H, W), np.uint8)
    for pts, width, _ in BUNDLES + [([(828, 420), (812, 698)], 40, 0)]:
        cv2.polylines(held, [np.array(pts, np.int32)], False, 1, thickness=width)
    depth = np.maximum(depth, fig_soft * 0.95)
    depth = np.maximum(depth, cv2.GaussianBlur(held.astype(np.float32), (0, 0), 6) * 0.85)
    depth = cv2.GaussianBlur(depth.astype(np.float32), (0, 0), 14)
    depth = np.maximum(depth, cv2.GaussianBlur(fig_soft, (0, 0), 4) * 0.92)

    half = lambda a: cv2.resize(a.astype(np.float32), (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    R = np.clip(half(depth) * 255 + 0.5, 0, 255).astype(np.uint8)
    fh, vh = half(fig_soft), half(vein_soft)
    G = np.clip((0.5 + 0.5 * fh - 0.5 * vh * (1 - fh)) * 255 + 0.5, 0, 255).astype(np.uint8)
    B = cv2.resize(signal, (W // 2, H // 2), interpolation=cv2.INTER_NEAREST)
    Image.fromarray(np.stack([R, G, B], -1)).save(FX, optimize=True)
    print(f"wrote {FX}: {rays} cables, {int(fig.mean() * 100)}% figure")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "upscale":
        upscale(sys.argv[2])
    elif len(sys.argv) == 2 and sys.argv[1] == "fx":
        build_fx()
    else:
        sys.exit(__doc__)
