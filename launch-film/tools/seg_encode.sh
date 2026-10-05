#!/usr/bin/env bash
# Encodes one stretch of the film (glitch pass included) to its own video file, so that a change to one
# scene only costs that scene:   tools/seg_encode.sh <name> <from s> <to s> [frames dir]
# -> out/seg/<name>.mp4 (+ out/seg/<name>.log). The stretches are joined by tools/assemble.py.
set -euo pipefail
cd "$(dirname "$0")/.."
name=$1; from=$2; to=$3; frames=${4:-out/frames}
mkdir -p out/seg
python3 tools/glitch_post.py --frames "$frames" --cues cues.json --from "$from" --to "$to" --out "out/seg/$name.mp4" > "out/seg/$name.log" 2>&1
echo "done $name" >> "out/seg/$name.log"
