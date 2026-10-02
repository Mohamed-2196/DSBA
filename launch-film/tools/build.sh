#!/usr/bin/env bash
# Full film build. Needs: the DSBA Hub dev server on :5173 (for UI captures) and a static
# server for the film page (python3 -m http.server 5180 --bind 127.0.0.1, run from /home/claude).
set -euo pipefail
cd "$(dirname "$0")/.."
python3 tools/make_cues.py                       # timeline -> cues.json
python3 tools/audio/build_audio.py --no-review   # soundtrack + SFX -> out/audio/*.wav
node tools/capture-ui.mjs                        # screenshots of the app -> assets/ui/
node tools/frames.mjs --from 0 --to 140 --workers 2            # 4200 clean frames -> out/frames/
python3 tools/glitch_post.py --frames out/frames --cues cues.json --out out/video_silent.mp4
ffmpeg -y -i out/video_silent.mp4 -i out/audio/mix.wav -c:v copy -c:a aac -b:a 320k -movflags +faststart out/DSBA_Hub_Launch_Film.mp4
ffmpeg -y -i out/video_silent.mp4 -i out/audio/sfx_only_mix.wav -c:v copy -c:a aac -b:a 320k -movflags +faststart out/DSBA_Hub_Launch_Film_no-music.mp4
