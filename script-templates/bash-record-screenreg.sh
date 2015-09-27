#!/bin/bash
timestamp=$(date +%Y%m%d_%H%M%S)
gphoto2 --auto-detect
screens=REPLACE_SCREENLIST

##record masks
for screen in ${screens[@]}
do
  echo $screen
  curl -X POST REPLACE_SERVER/screens/$screen/highlight
  sleep 2
  gphoto2 --capture-image-and-download --filename=$timestamp/screen_$screen.cr2
done

##record samples
colors=('{"red":255,"green":0,"blue":0}' '{"red":0,"green":255,"blue":0}' '{"red":0,"green":0,"blue":255}' '{"red":128,"green":128,"blue":128}' '{"red":255,"green":255,"blue":255}')
i=0
for color in ${colors[@]}
do
  echo $color
  curl -X POST -H "Content-Type: application/json" -d $color REPLACE_SERVER/setColor 
  sleep 2
  gphoto2 --capture-image-and-download --filename=$timestamp/sample_$i.cr2
  i=$((i+1))
done
