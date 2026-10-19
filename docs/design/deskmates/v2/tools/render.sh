#!/bin/sh
B=/private/tmp/claude-501/-Users-mohamed-dsba-hub/5411a11a-0ba5-46f6-8270-b4d416f58375/scratchpad/identity/b2
SVG=$1; W=$2; H=$3; OUT=$4; HTML=$B/tools/_wrap.html
{ echo "<!doctype html><html><head><meta charset=utf-8><base href=\"file://$B/\"><link href=\"https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Figtree:wght@400..800&family=JetBrains+Mono:wght@500;700&display=block\" rel=stylesheet><style>html,body{margin:0}svg{display:block}</style></head><body>"; cat $B/$SVG; echo "</body></html>"; } > $HTML
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=$W,$H --virtual-time-budget=6000 --screenshot=$B/renders/$OUT file://$HTML 2>/dev/null
true
