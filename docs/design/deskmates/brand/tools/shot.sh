#!/bin/sh
# shot.sh page.html W H out.png [scale]  — headless Chrome screenshot
SCALE=${5:-1}
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=$SCALE --window-size=$2,$3 --virtual-time-budget=5000 --screenshot="$4" "file://$1" 2>/dev/null
true
