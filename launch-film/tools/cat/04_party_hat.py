#!/usr/bin/env python3
"""Step 4: the party hat.  python3 tools/cat/04_party_hat.py

  assets/cat/cat-cutout.png
    -> assets/cat/cat-party.png      the cutout wearing the hat (same 1080 x 2056 canvas)
    -> work/hat_alpha.npy            where the hat is visible (step 5 keeps its colours out of the warm grade)
    -> work/hat_only.png             the hat layer alone (RGBA) for inspection
    -> work/check_party_*.png        review composites on navy

The hat is not drawn: it is ray-traced (numpy, analytic cone + sphere, orthographic camera in canvas pixels,
3x supersampled) with the head's pose, then lit, shadowed and degraded to sit inside the photograph.

  pose      The head is tilted back and turned: the far ear points ~4 deg left of vertical, the (cropped) near ear
            ~60 deg right, the eye line and the crown line both slope ~30 deg. The crown's normal therefore leans
            to the right in the picture plane: the cone axis leans 21 deg that way (a little less than the crown,
            a hat on elastic sits up) and tips 15 deg towards the lens, so the rim shows as an ellipse resting on
            the forehead with its near edge in front.
  material  matte navy paper printed with gold-foil dots laid out on the *unrolled* cone (so they wrap and
            foreshorten correctly), a gold-foil rim band, a yarn pom-pom in the collar's yellow.
  light     the photo is lit by a big soft source upper-left of the lens plus white-tile fill: wrap diffuse from
            that direction, a broad satin streak along the lit generator, foil reflecting a soft environment,
            white bounce from the fur into the bottom of the cone.
  seating   the rim is in front of the forehead and the far ear, *behind* the near ear (the cutout's own fur matte
            does the occlusion); fur strands overlap the rim; a soft contact shadow falls down-right on the fur;
            the near ear shades the cone where it tucks behind.
  match     exposed like the photo (white fur at ~205, blacks lifted to ~15), then 1.5 px of lens softness,
            luminance noise and a JPEG round trip like the phone photo's.
"""
import os

import cv2
import numpy as np

from catlib import ASSETS, CAN_H, CAN_W, WORK, on_colour, save_rgba, smoothstep

rng = np.random.default_rng(20261006)

# ── pose (canvas pixels: x right, y down, z away from the lens) ──────────────────────────────────
BASE_C = np.array([783.0, 621.0, 0.0])      # centre of the hat's base circle, on the crown between the ears
BASE_R = 124.0                              # base radius
HEIGHT = 425.0                              # apex height above the base plane
LEAN = np.deg2rad(21.0)                     # in-plane lean to the right of vertical
TIP_TO_LENS = np.deg2rad(15.0)              # tilt of the apex towards the camera
POM_R = 43.0

U = np.array([np.sin(LEAN) * np.cos(TIP_TO_LENS), -np.cos(LEAN) * np.cos(TIP_TO_LENS), -np.sin(TIP_TO_LENS)])
V = -U                                      # apex -> base
APEX = BASE_C + U * HEIGHT
SLANT = float(np.hypot(HEIGHT, BASE_R))
COS_A, SIN_A = HEIGHT / SLANT, BASE_R / SLANT
POM_C = APEX + U * (POM_R * 0.45)
toward = np.array([0.0, 0.0, -1.0])
E1 = toward - toward.dot(V) * V
E1 /= np.linalg.norm(E1)                    # azimuth 0 = the generator facing the lens (seam is at the back)
E2 = np.cross(V, E1)

# ── light (directions point *from* the surface *to* the light) ────────────────────────────────────
KEY = np.array([-0.52, -0.62, -0.59]); KEY /= np.linalg.norm(KEY)
VIEW = np.array([0.0, 0.0, -1.0])


def lin(c):
    return (np.asarray(c, np.float64) / 255.0) ** 2.2


# The photo is exposed so that sunlit white fur sits at ~205/255 and its blacks at ~20: the render is exposed the same way.
EXPO = 0.70                                 # linear exposure (albedo-0.85 white under full light -> 205)
BLACK = 15.0                                # lifted black level of the phone photo
NAVY = lin([29, 46, 112])
GOLD_F0 = np.array([1.0, 0.80, 0.36])       # the photo renders brass (the bell) slightly lemon
POM = lin([255, 196, 56])


def env(d):
    """Soft environment seen by the foil: a big warm-white source upper-left of the lens (broad lobe + hot core),
    dim room elsewhere, the white cat below. Returns linear radiance."""
    key = 2.6 * np.exp(3.6 * (d @ KEY - 1.0)) + 8.0 * np.exp(26.0 * (d @ KEY - 1.0))
    up = np.clip(-d[..., 1], 0, 1)
    down = np.clip(d[..., 1], 0, 1)
    amb = 0.20 + 0.22 * up + 0.40 * down
    e = key + amb
    return e[..., None] * np.array([1.0, 0.97, 0.92])


def value_noise(shape, cell, seed):
    r = np.random.default_rng(seed)
    h, w = shape
    g = r.random((h // cell + 3, w // cell + 3)).astype(np.float32)
    return cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC)


# ── ray trace ────────────────────────────────────────────────────────────────────────────────────
SS = 3
X0, Y0, X1, Y1 = 600, 150, 1080, 760        # canvas window that contains the hat
w, h = (X1 - X0) * SS, (Y1 - Y0) * SS
px = (np.arange(w) + 0.5) / SS + X0
py = (np.arange(h) + 0.5) / SS + Y0
PX, PY = np.meshgrid(px, py)
O = np.stack([PX, PY, np.full_like(PX, -2000.0)], -1)
D = np.array([0.0, 0.0, 1.0])

# cone
CO = O - APEX
dv = D @ V
cov = CO @ V
a = dv * dv - COS_A ** 2
b = 2 * (dv * cov - (CO @ D) * COS_A ** 2)
c = cov * cov - (CO * CO).sum(-1) * COS_A ** 2
disc = b * b - 4 * a * c
ok = disc > 0
sq = np.sqrt(np.where(ok, disc, 0))
t_c = np.full(PX.shape, np.inf)
for sign in (-1, 1):
    t = (-b + sign * sq) / (2 * a)
    hh = cov + t * dv
    valid = ok & (t > 0) & (hh > 0) & (hh <= HEIGHT)
    t_c = np.where(valid & (t < t_c), t, t_c)
# pom-pom sphere
SO = O - POM_C
bs = SO @ D
cs = (SO * SO).sum(-1) - POM_R ** 2
ds = bs * bs - cs
t_s = np.where(ds > 0, -bs - np.sqrt(np.where(ds > 0, ds, 0)), np.inf)

hit_c = np.isfinite(t_c) & (t_c < t_s)
hit_s = np.isfinite(t_s) & (t_s <= t_c)

rgb = np.zeros(PX.shape + (3,))
rimdist = np.full(PX.shape, 1e3)            # slant distance above the rim (cone pixels)

# ---- cone shading
P = O + np.where(hit_c, t_c, 0.0)[..., None] * D
Wv = P - APEX
hgt = np.where(hit_c, Wv @ V, 1.0)
radial = Wv - hgt[..., None] * V
rn = np.linalg.norm(radial, axis=-1, keepdims=True) + 1e-9
rhat = radial / rn
N = rhat * COS_A - V * SIN_A
phi = np.arctan2(rhat @ E2, rhat @ E1)
s = hgt / COS_A                              # slant distance from the apex
rimdist = np.where(hit_c, SLANT - s, 1e3)
# developed (unrolled) coordinates: the printed sheet
th = phi * SIN_A
fx, fy = s * np.sin(th), s * np.cos(th)
# hex grid of foil dots
PITCH, DOT_R = 62.0, 16.5
gy = fy / (PITCH * 0.866) + 0.37
row = np.floor(gy)
gx = fx / PITCH + 0.5 * (row % 2) + 0.21
cx = (np.floor(gx) + 0.5 - 0.5 * (row % 2) - 0.21) * PITCH
cy = (row + 0.5 - 0.37) * PITCH * 0.866
dd = np.hypot(fx - cx, fy - cy)
aa = 0.9                                     # antialias width in sheet px
dot = 1 - smoothstep(DOT_R - aa, DOT_R + aa, dd)
BAND = 17.0
sc = np.hypot(cx, cy)                        # whole dots only: none cut by the tip or by the rim band
dot *= (sc > 46) & (sc < SLANT - BAND - DOT_R - 7)
band = smoothstep(SLANT - BAND - 0.8, SLANT - BAND + 0.8, s)
foil = np.clip(dot + band, 0, 1)
# paper
ndl = N @ KEY
wrap = np.clip((ndl + 1.0) / 2.0, 0, 1) ** 1.9          # half-Lambert: no hard terminator under a soft source
sky = 0.5 + 0.5 * np.clip(-N[..., 1], -1, 1)
bounce = np.clip(N[..., 1] * 0.5 + 0.5, 0, 1) * np.exp(-(SLANT - s) / 150.0)   # white fur lights the bottom of the cone
E = 0.13 + 1.02 * wrap + 0.16 * sky + 0.30 * bounce
Hh = KEY + VIEW
Hh /= np.linalg.norm(Hh)
sheen = np.clip(N @ Hh, 0, 1) ** 22
grain = 1 + 0.06 * (value_noise(PX.shape, 5, 3) - 0.5) + 0.05 * (value_noise(PX.shape, 23, 4) - 0.5)
paper = NAVY * (E * grain)[..., None] + 0.045 * sheen[..., None] * np.array([0.9, 0.95, 1.0])
# foil: mirror-ish reflection of the soft environment, with a little crinkle
jit = np.stack([value_noise(PX.shape, 9, 5), value_noise(PX.shape, 9, 6), value_noise(PX.shape, 9, 7)], -1) - 0.5
Nf = N + 0.10 * jit
Nf /= np.linalg.norm(Nf, axis=-1, keepdims=True)
Rv = D - 2 * (Nf @ D)[..., None] * Nf
fres = 0.82 + 0.18 * (1 - np.clip(-(Nf @ D), 0, 1)) ** 3
gold = env(Rv) * GOLD_F0 * fres[..., None]
gold = gold * (0.86 + 0.28 * value_noise(PX.shape, 3, 8))[..., None]
# embossed edge of each foil dot: a thin dark line on the lower-right, light on the upper-left
edge = smoothstep(DOT_R - 3.0, DOT_R - 0.5, dd) * dot
cone_rgb = paper * (1 - foil[..., None]) + gold * foil[..., None]
cone_rgb *= (1 - 0.22 * edge)[..., None]
# the pom-pom shades the tip
tipd = np.linalg.norm(P - POM_C, axis=-1) - POM_R
cone_rgb *= (1 - 0.5 * np.exp(-np.clip(tipd, 0, None) / 13.0))[..., None]
rgb = np.where(hit_c[..., None], cone_rgb, rgb)

# ---- pom-pom shading (yarn: tufted, velvety, fuzzy outline)
Ps = O + np.where(np.isfinite(t_s), t_s, 0)[..., None] * D
Ns = (Ps - POM_C) / POM_R
bump = np.stack([value_noise(PX.shape, 7, 11), value_noise(PX.shape, 7, 12), value_noise(PX.shape, 7, 13)], -1) - 0.5
Nb = Ns + 0.55 * bump
Nb /= np.linalg.norm(Nb, axis=-1, keepdims=True)
wrap_s = np.clip((Ns @ KEY + 0.35) / 1.35, 0, 1) ** 1.5              # the ball's own form
tuft_l = np.clip((Nb @ KEY + 0.5) / 1.5, 0, 1)                         # tufts catching the light
crev = value_noise(PX.shape, 6, 14)
crev = 0.74 + 0.26 * smoothstep(0.25, 0.7, crev)                       # dark gaps between tufts
velvet = (1 - np.clip(-(Ns @ D), 0, 1)) ** 2.2
E_p = (0.20 + 0.92 * wrap_s + 0.34 * tuft_l * wrap_s + 0.18 * (0.5 - 0.5 * Ns[..., 1])) * crev
pom_rgb = POM * E_p[..., None] + 0.07 * velvet[..., None] * np.array([1.0, 0.86, 0.5])
under = np.clip(Ns @ V, 0, 1)                                          # the side sitting on the cone is darker
pom_rgb *= (1 - 0.45 * under ** 1.5)[..., None]
rgb = np.where(hit_s[..., None], pom_rgb, rgb)

alpha = (hit_c | hit_s).astype(np.float64)
# fuzzy halo of yarn ends around the pom-pom
ang = np.arctan2(PY - POM_C[1], PX - POM_C[0])
rr = np.hypot(PX - POM_C[0], PY - POM_C[1])
lobes = value_noise(PX.shape, 16, 21)
spikes = (0.5 + 0.5 * np.sin(ang * 23 + 9 * lobes)) * (0.5 + 0.5 * np.sin(ang * 61 + 5 * value_noise(PX.shape, 11, 23)))
fuzz_r = POM_R * SS / SS + 0.5 + 2.2 * lobes + 4.5 * spikes
fuzz = (1 - smoothstep(fuzz_r - 2.6, fuzz_r + 0.4, rr)) * (~hit_s) * (rr > POM_R - 2.0)
lit_side = np.clip((-(PX - POM_C[0]) * 0.52 - (PY - POM_C[1]) * 0.62) / (POM_R * 0.81), -1, 1)
fz_rgb = POM[None, None, :] * (0.34 + 0.50 * np.clip(lit_side * 0.5 + 0.5, 0, 1) ** 1.3)[..., None]
rgb = np.where((fuzz > 0)[..., None] & (alpha[..., None] < 0.5), fz_rgb, rgb)
alpha = np.maximum(alpha, fuzz * 0.9)

# ---- tone curve, encode, downsample (premultiplied)
x = np.clip(rgb, 0, None) * EXPO
KNEE = 0.62                                         # linear below the knee, soft shoulder above: foil glints roll off
x = np.where(x < KNEE, x, KNEE + (1 - KNEE) * (1 - np.exp(-(x - KNEE) / (1 - KNEE))))
enc = np.clip(x, 0, 1) ** (1 / 2.2)
enc = BLACK / 255 + (1 - BLACK / 255) * enc
pre = cv2.resize((enc * alpha[..., None]).astype(np.float32), (X1 - X0, Y1 - Y0), interpolation=cv2.INTER_AREA)
al = cv2.resize(alpha.astype(np.float32), (X1 - X0, Y1 - Y0), interpolation=cv2.INTER_AREA)
rim_small = cv2.resize(np.where(hit_c, rimdist, 1e3).astype(np.float32), (X1 - X0, Y1 - Y0), interpolation=cv2.INTER_NEAREST)

hat_pre = np.zeros((CAN_H, CAN_W, 3), np.float32)
hat_a = np.zeros((CAN_H, CAN_W), np.float32)
rim_d = np.full((CAN_H, CAN_W), 1e3, np.float32)
hat_pre[Y0:Y1, X0:X1] = pre[..., ::-1] * 255          # -> BGR premultiplied
hat_a[Y0:Y1, X0:X1] = al
rim_d[Y0:Y1, X0:X1] = rim_small

# ── seat it in the photograph ────────────────────────────────────────────────────────────────────
cut = cv2.imread(os.path.join(ASSETS, 'cat-cutout.png'), cv2.IMREAD_UNCHANGED).astype(np.float32)
cat_bgr, cat_a = cut[..., :3], cut[..., 3] / 255
yy, xx = np.mgrid[0:CAN_H, 0:CAN_W].astype(np.float32)
SOFT = 1.5                                            # px: the photo's own softness at 100 %

# 1. the coat closes over the rim: an uneven soft edge plus a few longer wisps lying along the fur direction
ax2 = np.array([U[0], U[1]]) / np.hypot(U[0], U[1])


def streaks(length, sigma, seed):
    n = np.random.default_rng(seed).random((CAN_H, CAN_W)).astype(np.float32)
    ker = np.zeros((length, length), np.float32)
    for i in range(length * 2):
        tpos = i / 2 - length / 2
        kx, ky = int(round(length // 2 + ax2[0] * tpos)), int(round(length // 2 + ax2[1] * tpos))
        if 0 <= kx < length and 0 <= ky < length:
            ker[ky, kx] = 1
    n = cv2.GaussianBlur(cv2.filter2D(n, -1, ker / ker.sum()), (0, 0), sigma)
    return (n - n.mean()) / n.std()


wob = cv2.GaussianBlur(np.random.default_rng(31).random((CAN_H, CAN_W)).astype(np.float32), (0, 0), 5.0)
wob = np.clip((wob - wob.mean()) / wob.std() * 0.5 + 0.5, 0, 1)
depth = 1.5 + 5.5 * wob                                # how far up the band the coat reaches, px
uneven = 1 - smoothstep(depth - 1.4, depth + 1.4, rim_d)
wisp = smoothstep(1.0, 1.9, streaks(31, 0.9, 32)) * (1 - smoothstep(6.0, 17.0, rim_d))
tuft = smoothstep(0.7, 1.6, streaks(15, 1.3, 33)) * (1 - smoothstep(3.0, 10.0, rim_d))
fur_over = np.clip(np.maximum(uneven, np.maximum(wisp * 0.9, tuft * 0.8)), 0, 1) * cat_a

# 2. which side of the cat the hat is on: in front everywhere except behind the near ear (right of the crown valley)
front = 1 - smoothstep(862.0, 872.0, xx)
hat_vis = hat_a * (1 - fur_over * front)

# 3. shadows the hat casts on the coat (soft source upper-left -> they fall down-right), plus a tight contact line
near_rim = hat_a * (1 - smoothstep(6.0, 70.0, rim_d))
sh = np.zeros_like(hat_a)
for (ox, oy, sig, k) in ((3, 4, 2.4, 0.62), (9, 12, 7.5, 0.62), (22, 28, 19.0, 0.46)):
    Mx = np.float32([[1, 0, ox], [0, 1, oy]])
    sh += k * cv2.GaussianBlur(cv2.warpAffine(near_rim, Mx, (CAN_W, CAN_H)), (0, 0), sig)
sh = np.clip(sh, 0, 1.0)
SHADOW_BGR = np.array([0.70, 0.66, 0.655], np.float32)   # full-strength shadow multiplier: the photo's coat shadows, plus a breath of navy from the cone
cat_sh = cat_bgr * (1 - sh[..., None] * (1 - SHADOW_BGR))

# 4. the near ear shades the part of the cone that tucks behind it; the far ear's base gets a touch of occlusion too
ear_occ = np.clip(cv2.GaussianBlur(cat_a * (1 - front), (0, 0), 12.0) * 1.6, 0, 1)
shade_hat = 1 - 0.50 * ear_occ * smoothstep(815.0, 895.0, xx)
hat_col = hat_pre * shade_hat[..., None]

# 5. match the photo: lens softness, sensor noise, then a JPEG round trip on the hat pixels
hat_col = cv2.GaussianBlur(hat_col, (0, 0), SOFT)
hat_soft = cv2.GaussianBlur(hat_a, (0, 0), SOFT)
hat_vis = cv2.GaussianBlur(hat_vis, (0, 0), SOFT)
straight = hat_col / np.maximum(hat_soft, 1e-3)[..., None]
noise = cv2.GaussianBlur(rng.normal(0, 3.0, (CAN_H, CAN_W)).astype(np.float32), (0, 0), 0.8)
straight = np.clip(straight + noise[..., None], 0, 255)
ok_j, buf = cv2.imencode('.jpg', straight.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 84])
straight = 0.55 * straight + 0.45 * cv2.imdecode(buf, cv2.IMREAD_COLOR).astype(np.float32)

# 6. composite. Two full "over" composites (hat in front of the cat / cat in front of the hat), cross-faded by `front`:
#    no seam where the hat passes from one to the other.
def over(top_c, top_a, bot_c, bot_a):
    a = top_a + bot_a * (1 - top_a)
    c = top_c * top_a[..., None] + bot_c * (bot_a * (1 - top_a))[..., None]
    return c, a                                        # c is premultiplied


c_front, a_front = over(straight, hat_vis, cat_sh, cat_a)
c_back, a_back = over(cat_sh, cat_a, straight, hat_soft)
out_pre = c_front * front[..., None] + c_back * (1 - front[..., None])
out_a = a_front * front + a_back * (1 - front)
out_bgr = out_pre / np.maximum(out_a, 1e-4)[..., None]

save_rgba(os.path.join(ASSETS, 'cat-party.png'), out_bgr, out_a)
save_rgba(os.path.join(WORK, 'hat_only.png'), straight, hat_soft)
np.save(os.path.join(WORK, 'hat_alpha.npy'), np.clip(hat_vis * front + hat_soft * (1 - cat_a) * (1 - front), 0, 1))

navy = on_colour(out_bgr, out_a)
cv2.imwrite(os.path.join(WORK, 'check_party_head.png'), navy[130:1010, 330:1080])
cv2.imwrite(os.path.join(WORK, 'check_party_hat2x.png'), cv2.resize(navy[200:720, 620:1080], None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC))
cv2.imwrite(os.path.join(WORK, 'check_party_half.png'), cv2.resize(np.concatenate([navy, on_colour(out_bgr, out_a, (0, 0, 0))], 1), None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA))
print('apex', APEX.round(1), 'pom', POM_C.round(1), 'written', os.path.join(ASSETS, 'cat-party.png'))
