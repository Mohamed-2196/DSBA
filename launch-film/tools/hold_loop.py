#!/usr/bin/env python3
"""The looping part of the birthday hold (cues.birthday.hold).

The film page renders the hold's first `pre + loop` seconds as they come. From there the picture
repeats the `loop`-second stretch until glitch #2, so only one pass has to be rendered and encoded.
To make the repeat seamless, the last `xfade` seconds of the pass cross-fade into the frames just
before the loop's start: the frame after the pass's last one is then, naturally, its first.

  python3 tools/hold_loop.py [--frames out/frames] [--out out/hold_loop]

Writes one pass, numbered like the film's own frames (so tools/glitch_post.py can encode it with
--from <loop_start> --to <loop_start + loop>): links to the untouched frames, new files for the
cross-faded ones. It also links the last second of the last pass into the frame store, where the
glitch pass expects to find the second before the glitch.
"""
import argparse
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', default=str(ROOT / 'out' / 'frames'))
    ap.add_argument('--out', default=str(ROOT / 'out' / 'hold_loop'))
    a = ap.parse_args()
    cues = json.loads((ROOT / 'cues.json').read_text())
    hold = cues['birthday'].get('hold')
    if not hold:
        raise SystemExit('this cut has no hold (cues.birthday.hold)')
    fps = cues['fps']
    n0 = round(hold['loop_start'] * fps)              # first frame of the pass
    n = round(hold['loop'] * fps)                     # frames in a pass
    nx = round(hold['xfade'] * fps)                   # frames that cross-fade
    assert nx <= round(hold['pre'] * fps), 'the cross-fade needs that much of the hold before the loop'
    src, out = Path(a.frames), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for f in out.glob('f_*.png'):
        f.unlink()
    name = lambda i: f'f_{i:05d}.png'
    need = [n0 + i for i in range(n)] + [n0 - nx + j for j in range(nx)]
    missing = [name(i) for i in need if not (src / name(i)).exists()]
    if missing:
        raise SystemExit(f'{len(missing)} frames missing in {src}: {missing[:6]} ...')
    for i in range(n - nx):
        os.symlink(src / name(n0 + i), out / name(n0 + i))
    for j in range(nx):
        i = n - nx + j
        p = (j + 1) / (nx + 1)
        w = p * p * (3 - 2 * p)                       # how much of the frames before the loop shows
        a_ = np.asarray(Image.open(src / name(n0 + i)).convert('RGB'), dtype=np.float32)
        b_ = np.asarray(Image.open(src / name(n0 - nx + j)).convert('RGB'), dtype=np.float32)
        Image.fromarray(np.clip(a_ * (1 - w) + b_ * w + 0.5, 0, 255).astype(np.uint8)).save(out / name(n0 + i), compress_level=1)
    # The glitch pass looks one second back from the glitch (its flash guard needs the history): give it the
    # last second of the last pass, under the numbers those frames have in the film.
    last = n0 + (hold['loops'] - 1) * n
    for i in range(n - fps, n):
        dst = src / name(last + i)
        if dst.is_symlink() or dst.exists():
            dst.unlink()
        os.symlink((out / name(n0 + i)).resolve(), dst)
    print(f'one pass of the hold: frames {n0}..{n0 + n - 1} ({hold["loop"]} s), the last {nx} cross-faded -> {out}')
    print(f'it repeats {hold["loops"]} times: {hold["loop_start"]} s to {hold["end"]} s')


if __name__ == '__main__':
    main()
