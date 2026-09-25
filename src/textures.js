import * as THREE from "three";

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seeded(n) {
  return mulberry32(n >>> 0);
}

function strokeField(ctx, w, h, rng, colors, count, widthMin, widthMax) {
  for (let i = 0; i < count; i++) {
    const c = colors[(rng() * colors.length) | 0];
    ctx.strokeStyle = c;
    ctx.globalAlpha = 0.18 + rng() * 0.55;
    ctx.lineWidth = widthMin + rng() * (widthMax - widthMin);
    ctx.lineCap = "round";
    const x = rng() * w;
    const y = rng() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const swirl = (rng() - 0.5) * 80;
    ctx.quadraticCurveTo(x + swirl, y + (rng() - 0.4) * 70, x + (rng() - 0.5) * 90, y + (rng() - 0.5) * 90);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function makePainterlyTexture(key, opts = {}) {
  const w = opts.size ?? 512;
  const h = opts.size ?? 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const rng = seeded(hash(key));
  ctx.fillStyle = opts.base ?? "#d9b48a";
  ctx.fillRect(0, 0, w, h);
  strokeField(ctx, w, h, rng, opts.strokes ?? ["#c9a07a", "#f0d8b0", "#a87850", "#e8c36a"], opts.count ?? 900, 2, 14);
  if (opts.flecks) {
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = opts.flecks[(rng() * opts.flecks.length) | 0];
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.ellipse(rng() * w, rng() * h, 1 + rng() * 3, 0.6 + rng() * 2, rng() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const cache = new Map();

export function tex(name, opts) {
  if (cache.has(name)) return cache.get(name);
  const t = makePainterlyTexture(name, opts);
  cache.set(name, t);
  return t;
}

export function createTextures() {
  return {
    plaster: tex("plaster", {
      base: "#e4c9a4",
      strokes: ["#f3e0c4", "#c9a07a", "#d4b08a", "#f0d8b8", "#b88860"],
    }),
    stone: tex("stone", {
      base: "#cbb9a0",
      strokes: ["#a89880", "#e8dcc8", "#8a7860", "#d4c4aa"],
    }),
    wood: tex("wood", {
      base: "#6a3e28",
      strokes: ["#8a5533", "#4a2818", "#c47a44", "#3a2014"],
      count: 700,
    }),
    gold: tex("gold", {
      base: "#d4a84a",
      strokes: ["#f0d080", "#b88828", "#ffe9a8", "#c47a20"],
    }),
    foliage: tex("foliage", {
      base: "#2a6a48",
      strokes: ["#1e4a30", "#4a9a62", "#0e3020", "#c9d46a", "#2f8a62", "#e08a3c"],
      flecks: ["#e8c36a", "#4ec4b8", "#d47a8a"],
    }),
    flower: tex("flower", {
      base: "#e08a3c",
      strokes: ["#ffd36a", "#d44a4a", "#f0e0c0", "#ef7a3c", "#d47a8a"],
    }),
    water: tex("water", {
      base: "#2a5c78",
      strokes: ["#4ec4b8", "#1a3a58", "#e8c36a", "#2f4ea8", "#7ad0d0"],
      count: 1100,
    }),
    cloth: tex("cloth", {
      base: "#c45a48",
      strokes: ["#e08a3c", "#f3e6c8", "#2f4ea8", "#6a4a9a"],
    }),
    earth: tex("earth", {
      base: "#8a6240",
      strokes: ["#c49a68", "#6a4428", "#e8c9a0", "#4a3020"],
    }),
    nightWall: tex("nightWall", {
      base: "#3a2a48",
      strokes: ["#5a3a68", "#2a1a38", "#e8c36a", "#4a4068"],
    }),
  };
}
