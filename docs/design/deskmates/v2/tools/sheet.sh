#!/bin/sh
# sheet.sh out.png W H : renders tools/_sheet.html content passed on stdin
B=/private/tmp/claude-501/-Users-mohamed-dsba-hub/5411a11a-0ba5-46f6-8270-b4d416f58375/scratchpad/identity/b2
cat > $B/tools/_sheet.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=$2,$3 --virtual-time-budget=5000 --screenshot=$1 file://$B/tools/_sheet.html 2>/dev/null
true
