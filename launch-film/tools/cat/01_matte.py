#!/usr/bin/env python3
"""Step 1 of the cat pipeline: clean the source photo and pull the raw masks.

  python3 tools/cat/01_matte.py

Reads  assets/cat/noor-cat.png (1080x1776 phone photo).
Writes tools/cat/work/src_clean.png               the photo with the phone-UI artefact on the right edge inpainted
       tools/cat/work/alpha_sam.png               hard mask of the cat: Segment Anything (ViT-B) with point prompts
       tools/cat/work/alpha_isnet-general-use.png soft saliency matte: only used to find the whiskers (step 2)

Needs `pip install rembg onnxruntime`; the ONNX models download from GitHub releases on first use (~/.rembg).
Why SAM and not a one-click matting model: ISNet and U2Net both keep a wedge of pale tile between the chin and the
chest and drop the dark eyes; the BiRefNet models need more memory than this sandbox has. SAM with a dozen hand-placed
points gives a clean hard outline, and step 2 (02_cutout.py) turns that outline into a soft fur matte.
"""
import os

import cv2
import numpy as np
from PIL import Image
from rembg import new_session, remove

from catlib import ROOT, WORK

src = cv2.imread(os.path.join(ROOT, 'assets/cat/noor-cat.png'), cv2.IMREAD_COLOR)
H, W = src.shape[:2]

# ── 1. the phone-UI artefact: a black rounded bar on the right edge, y ≈ 150–338 ──────────────
roi = np.zeros((H, W), np.uint8)
roi[120:360, 1056:] = 1
dark = (src.astype(np.int32).sum(axis=2) < 3 * 118).astype(np.uint8) & roi
dark = cv2.dilate(dark, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
clean = cv2.inpaint(src, dark * 255, 7, cv2.INPAINT_TELEA)
# the inpaint leaves the patch a little too smooth next to phone-JPEG texture: add matched noise
rng = np.random.default_rng(7)
noise = cv2.GaussianBlur(rng.normal(0, 2.2, (H, W, 1)).astype(np.float32), (0, 0), 0.8)[..., None]
clean = np.where(dark[..., None] > 0, np.clip(clean.astype(np.float32) + noise, 0, 255), clean).astype(np.uint8)
cv2.imwrite(os.path.join(WORK, 'src_clean.png'), clean)
print('artefact pixels inpainted:', int(dark.sum()))

pil = Image.fromarray(cv2.cvtColor(clean, cv2.COLOR_BGR2RGB))

# ── 2. Segment Anything with hand-placed points (x, y, 1 = cat / 0 = background), photo pixels ──
POINTS = [
    # the cat: face, far ear, near ear, neck, chest, body, collar, bell, back of the head
    (600, 500, 1), (640, 220, 1), (980, 430, 1), (700, 800, 1), (650, 1300, 1), (800, 1600, 1), (450, 1500, 1),
    (700, 1090, 1), (445, 1345, 1), (980, 900, 1), (350, 620, 1), (900, 1700, 1),
    # the tiles around it
    (150, 200, 0), (150, 800, 0), (120, 1300, 0), (100, 1700, 0), (900, 120, 0), (400, 150, 0), (250, 1100, 0), (230, 1550, 0),
]
prompts = [{'type': 'point', 'data': [x, y], 'label': label} for x, y, label in POINTS]
mask = remove(pil, session=new_session('sam'), only_mask=True, sam_prompt=prompts)
mask.save(os.path.join(WORK, 'alpha_sam.png'))
print('sam: mask covers', round(float((np.asarray(mask) > 127).mean()) * 100, 1), '% of the photo')

# ── 3. ISNet saliency matte (it follows the long whiskers, which SAM ignores) ───────────────────
soft = remove(pil, session=new_session('isnet-general-use'), only_mask=True, post_process_mask=False)
soft.save(os.path.join(WORK, 'alpha_isnet-general-use.png'))
print('isnet: done')
