# Pose Shapes

Make a shape with your hands or body in front of your webcam. The matching emoji pops up where you made it, transforms into something new, and falls to the ground.

🫶🏼 → ❤️

**Try it: https://estit.github.io/pose-shapes/**

Runs entirely in the browser: your video never leaves your machine.

## Gestures

| Gesture | Appears as | Falls as |
|---|---|---|
| Heart hands (thumbs meet at the bottom, index fingers at the top) | 🫶🏼 | ❤️ |
| Peace sign | ✌️ | ☮️ |
| Thumbs up | 👍 | ⭐ |
| Both arms up and apart | 🙌 | 🎉 |
| Hands together overhead | 🙏 | ☀️ |
| OK sign | 👌 | 🍩 |
| Rock on | 🤘 | 🎸 |
| Point up | ☝️ | 💡 |
| Shaka | 🤙 | 🏄 |
| Love-you (rock on with thumb out) | 🤟 | 🌈 |
| T-pose | 🧍 | 🦅 |
| Hands beside your head | 🙆 | 👑 |
| Arms crossed over your chest | 🙅 | 🛡️ |

Add or change gestures in the `SHAPES` table and `detect()` in `main.js`.

## Run it

You need a browser with webcam access and Python 3 (any static file server works).

```bash
./fetch-assets.sh              # one-off: downloads MediaPipe, the models and Matter.js into vendor/
python3 -m http.server 8000
```

Open http://localhost:8000 and click **Start camera**.

The top-right of the page shows the number of tracked hands and live values for each gesture, which helps when tuning thresholds. Keys `1`–`9`, `0`, `Q`, `W`, `E` spawn each shape without a camera, and `C` clears the screen.

## How it works

- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) hand and pose landmarkers find fingers, wrists and shoulders every frame.
- `detect()` turns landmarks into gestures using distances relative to hand or shoulder size, so it works at any distance from the camera.
- A gesture must be held for a few frames and has a cooldown, so it doesn't fire by accident or spam.
- [Matter.js](https://brm.io/matter-js/) handles the falling and bouncing. A new shape is pinned in place for about half a second, then swapped to its result emoji and released.

## Notes

- Webcams need `localhost` or HTTPS.
- Gesture thresholds are hand-tuned guesses; lighting and camera angle matter.
- `vendor/` (~24 MB: MediaPipe, models, Matter.js) is committed so the app works on GitHub Pages with no build step. `fetch-assets.sh` re-downloads it.
- Hosted on GitHub Pages from the `main` branch root.
