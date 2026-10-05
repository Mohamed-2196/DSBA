#!/usr/bin/env python3
"""Joins the separately encoded stretches of the film (out/seg/*.mp4) into out/video_silent.mp4 without
re-encoding, and checks the result frame by frame against the cue sheet.

  python3 tools/assemble.py            # join + check
  python3 tools/assemble.py --mux NAME # ... and mux out/audio/mix.wav -> out/NAME.mp4 (+ NAME_no-music.mp4)

Why stretches: a change to one scene then costs that scene only (render its frames, tools/seg_encode.sh
it, run this again). The stretches are cut at scene starts. Every one is encoded by tools/glitch_post.py
with the same settings, so they share their stream headers and can be joined as they are; this is
checked below. The hold's loop is one file listed `loops` times.
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEG = ROOT / 'out' / 'seg'


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, **kw)


def packets(path):
    r = run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', str(path)], text=True)
    return int(r.stdout.strip().strip(','))


def headers(path):
    """The parameter sets (SPS, PPS) the stretch starts with, as a short hash."""
    r = run(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:v:0', '-c', 'copy', '-bsf:v', 'h264_mp4toannexb', '-frames:v', '1', '-f', 'h264', '-'])
    data = r.stdout
    nals, i = [], 0
    while True:
        j = data.find(b'\x00\x00\x01', i)
        if j < 0:
            break
        k = data.find(b'\x00\x00\x01', j + 3)
        nal = data[j + 3:k if k >= 0 else len(data)].rstrip(b'\x00')
        if nal and (nal[0] & 0x1F) in (7, 8):
            nals.append(nal)
        i = j + 3
        if k < 0:
            break
    return hashlib.sha1(b'|'.join(nals)).hexdigest()[:12], len(nals)


def plan(cues):
    """[(file stem, from s, to s, times it is played)] in film order."""
    fps = cues['fps']
    S = {s['id'].split('_')[0]: s for s in cues['scenes']}
    hold = cues['birthday'].get('hold')
    out = [('a_open', 0.0, S['s05']['start'], 1),                       # the pile-up, the name, the newsletter
           ('b_forum_noora', S['s05']['start'], S['s06']['start'], 1),  # the forum and Mini Noora
           ('c_montage_launch', S['s06']['start'], S['s08']['start'], 1)]   # montage, launch, glitch 1
    if hold:
        out += [('d_birthday', S['s08']['start'], hold['start'], 1),
                ('h0_hold_pre', hold['start'], hold['loop_start'], 1),
                ('h1_hold_loop', hold['loop_start'], hold['loop_start'] + hold['loop'], hold['loops'])]
    else:
        out += [('d_birthday', S['s08']['start'], S['g2']['start'], 1)]
    out += [('g_glitch2', S['g2']['start'], S['s09']['start'], 1),
            ('z_act3', S['s09']['start'], cues['duration'], 1)]
    return [(n, a, b, k, round((b - a) * fps)) for (n, a, b, k) in out]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mux', help='also mux the soundtrack: out/<NAME>.mp4 and out/<NAME>_no-music.mp4')
    ap.add_argument('--list', action='store_true', help='only print the stretches and what each needs')
    a = ap.parse_args()
    cues = json.loads((ROOT / 'cues.json').read_text())
    segs = plan(cues)
    if a.list:                                   # name, from, to, frames, times played (build.sh reads this)
        for (n, t0, t1, k, fr) in segs:
            print(f'{n} {t0:g} {t1:g} {fr} {k}')
        return
    total, ok, heads = 0, True, {}
    for (n, t0, t1, k, fr) in segs:
        f = SEG / f'{n}.mp4'
        if not f.exists():
            print(f'MISSING {f}'); ok = False; continue
        got = packets(f)
        h, nn = headers(f)
        heads[n] = h
        flag = 'ok ' if got == fr else 'BAD'
        ok &= got == fr
        total += got * k
        print(f'{flag} {n:18s} {t0:8.3f} - {t1:8.3f} s  {got:5d} frames (want {fr})' + (f'  x {k}' if k > 1 else '') + f'  headers {h} ({nn})')
    if len(set(heads.values())) > 1:
        print('BAD the stretches do not share their stream headers: they cannot be joined without re-encoding'); ok = False
    if total != cues['frames']:
        print(f'BAD {total} frames in all, the cue sheet has {cues["frames"]}'); ok = False
    if not ok:
        sys.exit(1)
    lst = SEG / 'list.txt'
    lst.write_text(''.join(f"file '{SEG / (n + '.mp4')}'\n" * k for (n, _, _, k, _) in segs))
    out = ROOT / 'out' / 'video_silent.mp4'
    r = run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c', 'copy', '-movflags', '+faststart', str(out)], text=True)
    if r.returncode:
        print(r.stderr); sys.exit(1)
    # every frame must be there once, 1/30 s apart
    r = run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', str(out)], text=True)
    pts = sorted(float(x.strip().strip(',')) for x in r.stdout.split() if x.strip().strip(','))
    step = [round((pts[i + 1] - pts[i]) * cues['fps'], 3) for i in range(len(pts) - 1)]
    odd = [(i, s) for i, s in enumerate(step) if abs(s - 1) > 0.02]
    print(f'joined: {len(pts)} frames, {pts[0]:.3f} - {pts[-1]:.3f} s' + (f'  UNEVEN at {odd[:8]}' if odd else '  evenly spaced'))
    if len(pts) != cues['frames'] or odd:
        sys.exit(1)
    if a.mux:
        for name, wav in ((a.mux, 'mix.wav'), (a.mux + '_no-music', 'sfx_only_mix.wav')):
            dst = ROOT / 'out' / f'{name}.mp4'
            r = run(['ffmpeg', '-y', '-v', 'error', '-i', str(out), '-i', str(ROOT / 'out' / 'audio' / wav), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', str(dst)], text=True)
            if r.returncode:
                print(r.stderr); sys.exit(1)
            print(f'wrote {dst} ({dst.stat().st_size / 1e6:.1f} MB)')


if __name__ == '__main__':
    main()
