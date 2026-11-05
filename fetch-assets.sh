#!/usr/bin/env bash
# Downloads MediaPipe + Matter.js + models into ./vendor so the app has no runtime CDN dependency.
set -euo pipefail
cd "$(dirname "$0")"
V=0.10.21
NPM=https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@$V
GCS=https://storage.googleapis.com/mediapipe-models
mkdir -p vendor/wasm vendor/models
get() { [ -s "$2" ] && { echo "have $2"; return; }; echo "-> $2"; curl -fL --retry 5 --retry-all-errors -o "$2.part" "$1" && mv "$2.part" "$2"; }
get $NPM/vision_bundle.mjs vendor/vision_bundle.mjs
for f in vision_wasm_internal.js vision_wasm_internal.wasm; do
  get $NPM/wasm/$f vendor/wasm/$f
done
get $GCS/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task vendor/models/hand_landmarker.task
get $GCS/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task vendor/models/pose_landmarker_lite.task
get https://cdn.jsdelivr.net/npm/matter-js@0.20.0/build/matter.min.js vendor/matter.min.js
echo done
