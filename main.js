
const { Engine, Bodies, Body, Composite } = Matter;

// load MediaPipe from ./vendor (see fetch-assets.sh); report clearly if it's missing
let FilesetResolver, HandLandmarker, PoseLandmarker;
const visionReady = import("./vendor/vision_bundle.mjs").then((m) => ({ FilesetResolver, HandLandmarker, PoseLandmarker } = m));

const WASM = "./vendor/wasm";
const HAND_MODEL = "./vendor/models/hand_landmarker.task";
const POSE_MODEL = "./vendor/models/pose_landmarker_lite.task";

const HOLD_FRAMES = 5; // frames a gesture must persist before it fires
const COOLDOWN_MS = 1800; // per-gesture
const SHOW_MS = 550; // how long the raw gesture emoji lingers before it transforms and falls
const MAX_BODIES = 70;

const video = document.getElementById("video");
const canvas = document.getElementById("fx");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");

// gesture -> what it looks like, and what it turns into
const SHAPES = {
  heart: { from: "🫶🏼", to: "❤️" },
  peace: { from: "✌️", to: "☮️" },
  thumbsUp: { from: "👍", to: "⭐" },
  armsUp: { from: "🙌", to: "🎉" },
  overhead: { from: "🙏", to: "☀️" },
  okSign: { from: "👌", to: "🍩" },
  rock: { from: "🤘", to: "🎸" },
  pointUp: { from: "☝️", to: "💡" },
  shaka: { from: "🤙", to: "🏄" },
  loveYou: { from: "🤟", to: "🌈" },
  tPose: { from: "🧍", to: "🦅" },
  handsOnHead: { from: "🙆", to: "👑" },
  crossArms: { from: "🙅", to: "🛡️" },
};
const KEY_ORDER = Object.keys(SHAPES);
const SPAWN_KEYS = "1234567890qwe"; // key i spawns KEY_ORDER[i]

// --- physics ---------------------------------------------------------------
const engine = Engine.create({ gravity: { y: 1.1 } });
let W = 1280, H = 720;
const items = []; // { body, glyph, born, size }

function buildWalls() {
  const t = 200;
  Composite.remove(engine.world, engine.world.bodies.filter((b) => b.label === "wall"));
  Composite.add(engine.world, [
    Bodies.rectangle(W / 2, H + t / 2, W * 3, t, { isStatic: true, label: "wall" }), // ground
    Bodies.rectangle(-t / 2, H / 2, t, H * 4, { isStatic: true, label: "wall" }),
    Bodies.rectangle(W + t / 2, H / 2, t, H * 4, { isStatic: true, label: "wall" }),
  ]);
}

function spawn(kind, x, y) {
  const shape = SHAPES[kind];
  const size = H * 0.11;
  const body = Bodies.circle(
    Math.min(Math.max(x, size), W - size), Math.max(y, size), size * 0.45,
    { restitution: 0.45, friction: 0.4, frictionAir: 0.01 },
  );
  const it = { body, home: { x: body.position.x, y: body.position.y }, glyph: shape.from, to: shape.to, born: performance.now(), size, fallen: false };
  items.push(it);
  Composite.add(engine.world, body);
  if (items.length > MAX_BODIES) {
    const old = items.shift();
    Composite.remove(engine.world, old.body);
  }
}

function step(now) {
  for (const it of items) {
    if (it.fallen) continue;
    if (now - it.born <= SHOW_MS) {
      // pinned where the gesture happened until it transforms
      Body.setPosition(it.body, it.home);
      Body.setVelocity(it.body, { x: 0, y: 0 });
    } else {
      it.fallen = true;
      it.glyph = it.to;
      Body.setVelocity(it.body, { x: (Math.random() - 0.5) * 3, y: -4 });
      Body.setAngularVelocity(it.body, (Math.random() - 0.5) * 0.2);
    }
  }
  Engine.update(engine, 1000 / 60);
}

// --- gesture detection (all in mirrored pixel space) ------------------------
const P = (lm) => ({ x: (1 - lm.x) * W, y: lm.y * H });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function handInfo(lms) {
  const p = lms.map(P);
  const scale = dist(p[0], p[9]); // wrist -> middle knuckle
  // finger is extended if its tip is clearly farther from the wrist than its middle joint
  const ext = (tip, pip) => dist(p[tip], p[0]) > dist(p[pip], p[0]) * 1.15;
  const fingers = { index: ext(8, 6), middle: ext(12, 10), ring: ext(16, 14), pinky: ext(20, 18) };
  const thumbOut = dist(p[4], p[17]) > dist(p[3], p[17]) * 1.05 && dist(p[4], p[5]) > scale * 0.4;
  return { p, scale, fingers, thumbOut };
}

let debug = [];
function detect(hands, pose) {
  debug = [];
  const out = []; // { kind, x, y }
  const hs = hands.map(handInfo);

  // 🫶 two hands: thumb tips meet at the bottom, index tips meet at the top
  if (hs.length === 2) {
    const [a, b] = hs;
    const s = (a.scale + b.scale) / 2;
    const thumbs = dist(a.p[4], b.p[4]);
    const indexes = dist(a.p[8], b.p[8]);
    const indexAbove = (a.p[8].y + b.p[8].y) / 2 < (a.p[4].y + b.p[4].y) / 2;
    debug.push(`heart: thumbs ${(thumbs / s).toFixed(2)} (<1.6) · index ${(indexes / s).toFixed(2)} (<1.8) · indexAbove ${indexAbove}`);
    if (thumbs < s * 1.6 && indexes < s * 1.8 && indexAbove) {
      const c = mid(mid(a.p[8], b.p[8]), mid(a.p[4], b.p[4]));
      out.push({ kind: "heart", ...c });
    }
  }

  for (const h of hs) {
    const { fingers: f, p } = h;
    debug.push(`hand: idx ${+f.index} mid ${+f.middle} ring ${+f.ring} pinky ${+f.pinky} thumb ${+h.thumbOut}`);
    // ✌️ index + middle up, ring + pinky curled, fingers spread a little
    if (f.index && f.middle && !f.ring && !f.pinky && dist(p[8], p[12]) > h.scale * 0.15) {
      out.push({ kind: "peace", ...mid(p[8], p[12]) });
    }
    const curled = !f.index && !f.middle && !f.ring && !f.pinky;
    // 👌 thumb tip touches index tip, other three fingers up
    if (dist(p[4], p[8]) < h.scale * 0.35 && f.middle && f.ring && f.pinky) {
      out.push({ kind: "okSign", ...mid(p[4], p[8]) });
    }
    // 🤘 index + pinky up, middle + ring curled, thumb tucked
    if (f.index && f.pinky && !f.middle && !f.ring) {
      out.push({ kind: h.thumbOut ? "loveYou" : "rock", ...mid(p[8], p[20]) });
    }
    // 🤙 thumb + pinky out only
    if (f.pinky && h.thumbOut && !f.index && !f.middle && !f.ring) {
      out.push({ kind: "shaka", ...mid(p[4], p[20]) });
    }
    // ☝️ only the index finger, pointing up
    if (f.index && !f.middle && !f.ring && !f.pinky && !h.thumbOut && p[8].y < p[0].y - h.scale) {
      out.push({ kind: "pointUp", ...p[8] });
    }
    // 👍 thumb out and above the knuckles, all four fingers curled
    if (h.thumbOut && curled && p[4].y < p[5].y - h.scale * 0.2) {
      out.push({ kind: "thumbsUp", ...p[4] });
    }
  }

  if (pose) {
    const nose = P(pose[0]);
    const lw = P(pose[15]), rw = P(pose[16]);
    const ls = P(pose[11]), rs = P(pose[12]);
    const shoulderW = dist(ls, rs);
    const vis = (i) => (pose[i].visibility ?? 1) > 0.3;
    if (vis(15) && vis(16) && shoulderW > 0) {
      const bothUp = lw.y < nose.y - shoulderW * 0.4 && rw.y < nose.y - shoulderW * 0.4;
      const wristGap = dist(lw, rw);
      debug.push(`arms: bothUp ${bothUp} gap ${(wristGap / shoulderW).toFixed(2)} (<0.35 overhead, >0.8 armsUp)`);
      if (bothUp && wristGap < shoulderW * 0.5) out.push({ kind: "overhead", ...mid(lw, rw) });
      else if (bothUp && wristGap > shoulderW * 0.7) out.push({ kind: "armsUp", x: nose.x, y: nose.y - shoulderW * 0.6 });

      const center = mid(ls, rs);
      const nearHead = (w) => w.y > nose.y - shoulderW * 0.4 && w.y < nose.y + shoulderW * 0.3;
      // 🙆 both hands beside the head
      if (nearHead(lw) && nearHead(rw) && wristGap > shoulderW * 0.8 && wristGap < shoulderW * 1.8) {
        out.push({ kind: "handsOnHead", x: nose.x, y: nose.y - shoulderW * 0.5 });
      }
      // 🧍 T-pose: wrists out wide at shoulder height
      const atShoulder = (w, s) => Math.abs(w.y - s.y) < shoulderW * 0.5;
      if (atShoulder(lw, ls) && atShoulder(rw, rs) && wristGap > shoulderW * 2.2) {
        out.push({ kind: "tPose", ...center });
      }
      // 🙅 arms crossed over the chest: wrists swapped sides
      const chest = (w) => w.y > ls.y && w.y < ls.y + shoulderW * 1.6 && Math.abs(w.x - center.x) < shoulderW * 0.8;
      if (chest(lw) && chest(rw) && Math.sign(lw.x - rw.x) !== Math.sign(ls.x - rs.x) && wristGap > shoulderW * 0.1) {
        out.push({ kind: "crossArms", ...center });
      }
    }
  }
  return out;
}

const held = {}; // kind -> consecutive frames
const lastFired = {};
function react(detections, now) {
  const seen = new Set();
  for (const d of detections) {
    seen.add(d.kind);
    held[d.kind] = (held[d.kind] ?? 0) + 1;
    if (held[d.kind] >= HOLD_FRAMES && now - (lastFired[d.kind] ?? -1e9) > COOLDOWN_MS) {
      lastFired[d.kind] = now;
      spawn(d.kind, d.x, d.y);
    }
  }
  for (const k of Object.keys(held)) if (!seen.has(k)) held[k] = 0;
}

// --- rendering ---------------------------------------------------------------
const HAND_LINES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const POSE_LINES = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24]];

function drawSkeleton(hands, pose) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(120,255,200,.8)";
  ctx.fillStyle = "rgba(255,255,255,.9)";
  for (const lms of hands) {
    const p = lms.map(P);
    ctx.beginPath();
    for (const [a, b] of HAND_LINES) { ctx.moveTo(p[a].x, p[a].y); ctx.lineTo(p[b].x, p[b].y); }
    ctx.stroke();
    for (const q of p) { ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, 7); ctx.fill(); }
  }
  if (pose) {
    ctx.strokeStyle = "rgba(255,170,120,.8)";
    const p = pose.map(P);
    ctx.beginPath();
    for (const [a, b] of POSE_LINES) { ctx.moveTo(p[a].x, p[a].y); ctx.lineTo(p[b].x, p[b].y); }
    ctx.stroke();
  }
}

function drawItems(now) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const it of items) {
    const { x, y } = it.body.position;
    const age = now - it.born;
    const pop = it.fallen ? 1 : Math.min(1, age / 150); // quick scale-in while showing the gesture emoji
    const wobble = !it.fallen ? 1 + 0.08 * Math.sin(age / 50) : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(it.body.angle);
    ctx.scale(pop * wobble, pop * wobble);
    ctx.font = `${it.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.fillText(it.glyph, 0, 0);
    ctx.restore();
  }
}

// --- main loop ---------------------------------------------------------------
let hand, poseModel, lastVideoTime = -1;
let latest = { hands: [], pose: null };

function frame() {
  const now = performance.now();
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const hr = hand.detectForVideo(video, now);
    const pr = poseModel.detectForVideo(video, now);
    latest = { hands: hr.landmarks, pose: pr.landmarks[0] ?? null };
    react(detect(latest.hands, latest.pose), now);
    statusEl.innerHTML = `${latest.hands.length} hand(s)${latest.pose ? " · body" : ""}<br><small>${debug.join("<br>") || "no gesture candidates"}</small>`;
  }
  step(now);
  ctx.clearRect(0, 0, W, H);
  drawSkeleton(latest.hands, latest.pose);
  drawItems(now);
  requestAnimationFrame(frame);
}

async function start() {
  document.getElementById("start").remove();
  statusEl.textContent = "starting camera…";
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" } });
  video.srcObject = stream;
  await video.play();
  W = canvas.width = video.videoWidth;
  H = canvas.height = video.videoHeight;
  const stage = document.getElementById("stage");
  stage.style.aspectRatio = `${W} / ${H}`;
  stage.style.width = `min(100vw, calc(100vh * ${W} / ${H}))`;
  buildWalls();

  statusEl.textContent = "loading models…";
  await visionReady.catch(() => { throw new Error("vendor/ files missing - run ./fetch-assets.sh"); });
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  hand = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" }, runningMode: "VIDEO", numHands: 2,
  });
  poseModel = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" }, runningMode: "VIDEO", numPoses: 1,
  });
  requestAnimationFrame(frame);
}

document.getElementById("startBtn").addEventListener("click", () => start().catch((e) => { statusEl.textContent = `error: ${e.message}`; console.error(e); }));

// keyboard fallback so the physics can be tried without a camera / while tuning
addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "c") { for (const it of items) Composite.remove(engine.world, it.body); items.length = 0; return; }
  const kind = KEY_ORDER[SPAWN_KEYS.indexOf(e.key.toLowerCase())];
  if (kind) spawn(kind, W * (0.2 + Math.random() * 0.6), H * 0.3);
});
buildWalls();
requestAnimationFrame(function idle(now) { if (!hand) { step(now); ctx.clearRect(0, 0, W, H); drawItems(now); requestAnimationFrame(idle); } });
