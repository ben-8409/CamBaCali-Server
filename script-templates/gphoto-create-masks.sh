#!/bin/bash
# exit for any error
set -e

# you can supply an output dir with the first argument. if none given, the current path is used
# we change to the output to prevent a bug in gphoto2 http://sourceforge.net/p/gphoto/bugs/805/
# Use the second argument to supply the uuid for the uuid to use.
basedir=`pwd`
if [ -d "$1" ]; then
  cd $1
fi
if [ -z "$2" ]; then
  uuid=$2
fi

echo "Output dir is $outdir"
gphoto2 --auto-detect
gphoto2 --set-config /main/imgsettings/imageformat=7
colors=('{"red":255,"green":0,"blue":0}')
i=0
for color in ${colors[@]}
do
  echo $color
  curl -X POST -H "Content-Type: application/json" -d $color REPLACE_SERVER/api/screens/setColor 
  sleep 2
  gphoto2 --capture-image-and-download --filename=redscreen.cr2
  dcraw -W -T redscreen.cr2
  i=$((i+1))
done
echo "Capture and Conversion of Redscreen done\n"

screens=REPLACE_SCREENS_BASHARRAY
for screen in ${screens[@]}
do
  echo $screen
  curl -X POST REPLACE_SERVER/api/screens/$screen/highlight
  sleep 2
  gphoto2 --capture-image-and-download --filename=screen_$screen.cr2
  (dcraw -W -T screen_$screen.cr2 &)
done

wait

echo "Capture and Conversion of screen identifiers done\n"
calibtool -a REPLACE_SERVER -s -v

#echo "Remove Camera Raw images"
#rm -v redscreen.cr2
#for screen in ${screens[@]}
#do
#  rm -v screen_$screen.cr2
#done

echo "Saved to: $1"
cd $basedir

if [ -z "$uuid" ]; then
  echo "Notify server of result"
  curl -X POST REPLACE_SERVER/api/run/$UUID/masksReady
fi
