#!/bin/sh
# Renders the DEBUG measure photos from PackKit into ios/App/DebugSamples.
# The pixels are the deterministic MeasureSampleLibrary scenes (bottle, cap, box).
set -eu
cd "$(dirname "$0")/.."
OUT="App/DebugSamples"
mkdir -p "$OUT"
swift run --package-path Packages/PackKit RenderMeasureSamples "$OUT"
for ppm in "$OUT"/*.ppm; do
  jpg="${ppm%.ppm}.jpg"
  ffmpeg -y -loglevel error -i "$ppm" -q:v 2 "$jpg"
  rm -f "$ppm"
done
echo "samples in $OUT"
