#!/bin/sh
# zoom.sh src.png x y w h k out.png : crop and enlarge k times with hard pixels
D=$(dirname "$0"); D=$(cd "$D" && pwd)
W=$(($4*$6)); H=$(($5*$6))
SW=$(sips -g pixelWidth "$1" | awk '/pixelWidth/{print $2}')
cat > $D/_zoom.html <<H
<!doctype html><html><body style="margin:0;overflow:hidden"><div style="width:${W}px;height:${H}px;overflow:hidden;position:relative">
<img src="file://$1" style="position:absolute;left:-$(($2*$6))px;top:-$(($3*$6))px;width:$((SW*$6))px;image-rendering:pixelated"></div></body></html>
H
$D/shot.sh $D/_zoom.html $W $H "$7" 1
