#!/usr/bin/env bash
# Full film build. Needs: the DSBA Hub dev server on :5173 (for UI captures) and a static
# server for the film page (python3 -m http.server 5180 --bind 127.0.0.1, run from /home/claude).
set -euo pipefail
cd "$(dirname "$0")/.."
python3 tools/intake_brand.py                    # supplied logos + cover art -> assets/ and the app (needs the source files)
python3 tools/noora/from_app.py                  # Mini Noora's sprites: the app's public/noora -> assets/noora
python3 tools/make_cues.py                       # timeline -> cues.json
python3 tools/audio/build_audio.py --no-review   # soundtrack + SFX -> out/audio/*.wav
node tools/capture-ui.mjs                        # screenshots of the app -> assets/ui/
# Frames: everything but the repeats of the hold's loop (one pass is rendered; see tools/hold_loop.py).
read -r DUR HOLD_END LOOP_END <<< "$(python3 -c "
import json; c = json.load(open('cues.json')); h = c['birthday'].get('hold')
print(c['duration'], h['end'] if h else c['duration'], h['loop_start'] + h['loop'] if h else c['duration'])")"
node tools/frames.mjs --from 0 --to "$LOOP_END" --workers 2
if [ "$HOLD_END" != "$DUR" ]; then
  node tools/frames.mjs --from "$HOLD_END" --to "$DUR" --workers 2
  python3 tools/hold_loop.py                     # the loop's pass, its end cross-faded -> out/hold_loop/
fi
# Encode each stretch (glitch pass included), then join them and mux the sound.
python3 tools/assemble.py --list | while read -r name from to frames times; do
  if [ "$name" = h1_hold_loop ]; then tools/seg_encode.sh "$name" "$from" "$to" out/hold_loop
  else tools/seg_encode.sh "$name" "$from" "$to"; fi
done
python3 tools/assemble.py --mux DSBA_Hub_Launch_Film
