export const PALETTE = {
  indigo: 0x24356e,
  cobalt: 0x2f4ea8,
  turquoise: 0x4ec4b8,
  gold: 0xe8c36a,
  saffron: 0xe08a3c,
  orange: 0xef7a3c,
  rose: 0xd47a8a,
  violet: 0x6a4a9a,
  emerald: 0x2f8a62,
  cream: 0xf3e6c8,
  earth: 0x8a5a3a,
  plaster: 0xe2c9a0,
  night: 0x0c1230,
  yamuna: 0x2a5c78,
};

export const WALL_COLORS = [
  0xe8c9a4, 0xf0d3b0, 0xd9b48a, 0xe2b07a, 0xc97a6a, 0xd48a7a, 0xe8d8c0, 0xc9a07a, 0xb86a5a, 0x7aa0a8,
  0xd4a84a, 0xc47c54, 0xead7b8,
];

export const DOOR_COLORS = [0x2f4ea8, 0x6a4a9a, 0x2f8a62, 0xb8443c, 0xe08a3c, 0x24356e, 0x4a3060];

export const CLOTH_COLORS = [
  0xe08a3c, 0xd47a8a, 0x2f4ea8, 0xe8c36a, 0x6a4a9a, 0xef7a3c, 0x4ec4b8, 0xf3e6c8, 0xb8443c, 0x2f8a62,
];

export const QUALITY = {
  LOW: {
    pixelRatio: 0.85,
    shadows: false,
    shadowSize: 512,
    bloom: false,
    particles: 0.35,
    npc: 0.55,
    lamps: 10,
    trees: 0.55,
  },
  MEDIUM: {
    pixelRatio: 1,
    shadows: true,
    shadowSize: 1024,
    bloom: true,
    particles: 0.7,
    npc: 0.8,
    lamps: 16,
    trees: 0.8,
  },
  HIGH: {
    pixelRatio: 1.25,
    shadows: true,
    shadowSize: 2048,
    bloom: true,
    particles: 1,
    npc: 1,
    lamps: 22,
    trees: 1,
  },
  ULTRA: {
    pixelRatio: 1.6,
    shadows: true,
    shadowSize: 2048,
    bloom: true,
    particles: 1.25,
    npc: 1.15,
    lamps: 28,
    trees: 1.2,
  },
};

export const WORLD = {
  streetLength: 92,
  streetHalf: 5.4,
};

export const CONTROLS_HELP =
  "WASD walk · Shift sprint · Space jump · Mouse look · E interact · C camera · P photo · M map · J journal · 1–4 emotes · Esc menu";
