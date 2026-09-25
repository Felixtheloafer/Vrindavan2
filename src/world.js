import * as THREE from "three";
import { PALETTE, WALL_COLORS, DOOR_COLORS, CLOTH_COLORS } from "./config.js";
import { patchPainterly, makeSky, makeWater } from "./shaders.js";
import { seeded } from "./textures.js";

function mat(textures, map, color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    map,
    color,
    roughness: opts.roughness ?? 0.78,
    metalness: opts.metalness ?? 0.04,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
  patchPainterly(m, { wind: opts.wind ?? 0 });
  return m;
}

function box(geo, material, x, y, z, sx, sy, sz, rotY = 0) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class World {
  constructor(scene, textures, quality) {
    this.scene = scene;
    this.textures = textures;
    this.quality = quality;
    this.colliders = [];
    this.lamps = [];
    this.rooftops = [];
    this.waypoints = [];
    this.zones = [];
    this.interactives = [];
    this.wind = 0.6;
    this.rng = seeded(20260924);
    this.shared = {
      box: new THREE.BoxGeometry(1, 1, 1),
      sphere: new THREE.SphereGeometry(1, 12, 10),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
      cone: new THREE.ConeGeometry(1, 1, 8),
      plane: new THREE.PlaneGeometry(1, 1),
    };
    this.group = new THREE.Group();
    this.group.name = "world";
    scene.add(this.group);
  }

  build() {
    this.sky = makeSky();
    this.scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight(0xb8c8ff, 0x6a4a30, 0.7);
    this.sun = new THREE.DirectionalLight(0xffe6b8, 1.4);
    this.sun.position.set(30, 50, 12);
    this.sun.castShadow = this.quality.shadows;
    this.sun.shadow.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
    this.sun.shadow.camera.near = 2;
    this.sun.shadow.camera.far = 160;
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70;
    this.sun.shadow.camera.bottom = -70;
    this.scene.add(this.hemi, this.sun);
    this.scene.fog = new THREE.FogExp2(0x9eb4d0, 0.007);

    this._ground();
    this._street();
    this._temple();
    this._market();
    this._ghat();
    this._forest();
    this._hiddenGarden();
    this.water = makeWater();
    this.group.add(this.water);
    this._fillLifeProps();
    this._zones();
    return this;
  }

  _addCollider(x, z, w, d, h = 8, y = 0) {
    this.colliders.push({
      min: new THREE.Vector3(x - w / 2, y, z - d / 2),
      max: new THREE.Vector3(x + w / 2, y + h, z + d / 2),
    });
  }

  _ground() {
    const earth = mat(this.textures, this.textures.earth, 0xb08a5a, { roughness: 0.95 });
    const street = mat(this.textures, this.textures.stone, 0xc9b08a, { roughness: 0.9 });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), earth);
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    this.group.add(g);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(96, 11.5), street);
    path.rotation.x = -Math.PI / 2;
    path.position.set(4, 0.02, 0);
    path.receiveShadow = true;
    this.group.add(path);
    const petals = this._instancedPetals(900 * this.quality.particles);
    this.group.add(petals);
  }

  _instancedPetals(count) {
    const geo = new THREE.PlaneGeometry(0.18, 0.12);
    const m = new THREE.MeshStandardMaterial({
      color: 0xe08a3c,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    patchPainterly(m, { wind: 1.2 });
    const inst = new THREE.InstancedMesh(geo, m, count);
    inst.receiveShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set((this.rng() - 0.5) * 90, 0.04, (this.rng() - 0.45) * 24);
      dummy.rotation.set(-Math.PI / 2, 0, this.rng() * 6);
      dummy.scale.setScalar(0.7 + this.rng());
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      inst.setColorAt(i, new THREE.Color().setHSL(0.04 + this.rng() * 0.08, 0.7, 0.55 + this.rng() * 0.15));
    }
    return inst;
  }

  _street() {
    const rng = this.rng;
    for (const side of [-1, 1]) {
      let x = -42;
      while (x < 42) {
        const w = 4.2 + rng() * 5.5;
        const d = 5.2 + rng() * 2.4;
        const h = 4.6 + rng() * 7.2;
        const zBase = side * (6.6 + rng() * 1.4) + Math.sin(x * 0.08) * 1.2;
        const wallCol = WALL_COLORS[(rng() * WALL_COLORS.length) | 0];
        const building = this._building(x + w / 2, zBase, w, d, h, wallCol, side);
        this.group.add(building);
        this._addCollider(x + w / 2, zBase, w * 0.92, d * 0.92, h);
        this.rooftops.push(new THREE.Vector3(x + w / 2, h + 0.2, zBase));
        if (rng() > 0.35) this._awning(x + w / 2, zBase - side * (d / 2 + 0.4), w * 0.8, side);
        if (rng() > 0.4) this._garland(x + w / 2, 2.4 + rng(), zBase - side * (d / 2 + 0.15), w * 0.7);
        x += w + 0.45 + rng() * 0.8;
        this.waypoints.push(new THREE.Vector3(x - 2, 0, side * 1.8));
      }
    }
    for (let i = 0; i < 18; i++) {
      const x = -40 + i * 4.8;
      if (i % 2 === 0) this._lamp(x, 0, 4.9);
      else this._lamp(x, 0, -4.9);
    }
    this._flags();
  }

  _building(x, z, w, d, h, color, side) {
    const g = new THREE.Group();
    const wall = mat(this.textures, this.textures.plaster, color);
    const body = new THREE.Mesh(this.shared.box, wall);
    body.position.set(x, h / 2, z);
    body.scale.set(w, h, d);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(
      this.shared.box,
      mat(this.textures, this.textures.earth, 0x8a4a32, { roughness: 0.85 })
    );
    roof.position.set(x, h + 0.18, z);
    roof.scale.set(w + 0.35, 0.35, d + 0.35);
    roof.castShadow = true;
    g.add(roof);
    const doorCol = DOOR_COLORS[(this.rng() * DOOR_COLORS.length) | 0];
    const door = new THREE.Mesh(this.shared.box, mat(this.textures, this.textures.wood, doorCol));
    const faceZ = z - side * (d / 2 + 0.02);
    door.position.set(x, 1.15, faceZ);
    door.scale.set(0.9, 2.3, 0.12);
    g.add(door);
    const floors = Math.max(1, Math.floor(h / 2.6));
    for (let f = 1; f <= floors; f++) {
      for (const ox of [-w * 0.22, w * 0.22]) {
        const win = new THREE.Mesh(
          this.shared.box,
          mat(this.textures, this.textures.wood, 0x24356e, { emissive: 0xe8c36a, emissiveIntensity: 0.08 })
        );
        win.position.set(x + ox, 1.2 + f * 2.15, faceZ);
        win.scale.set(0.7, 0.9, 0.1);
        g.add(win);
      }
    }
    if (this.rng() > 0.45) {
      const bal = new THREE.Mesh(this.shared.box, mat(this.textures, this.textures.stone, 0xd4c0a0));
      bal.position.set(x, h * 0.55, faceZ - side * 0.35);
      bal.scale.set(w * 0.55, 0.12, 0.7);
      g.add(bal);
    }
    if (this.rng() > 0.5) {
      const fabric = new THREE.Mesh(
        this.shared.plane,
        mat(this.textures, this.textures.cloth, CLOTH_COLORS[(this.rng() * CLOTH_COLORS.length) | 0], {
          side: THREE.DoubleSide,
          wind: 1.6,
        })
      );
      fabric.position.set(x + w * 0.3, h * 0.7, faceZ - side * 0.2);
      fabric.scale.set(1.4, 2.2, 1);
      g.add(fabric);
    }
    return g;
  }

  _awning(x, z, w, side) {
    const m = mat(this.textures, this.textures.cloth, CLOTH_COLORS[(this.rng() * CLOTH_COLORS.length) | 0], {
      wind: 1.4,
      side: THREE.DoubleSide,
    });
    const a = new THREE.Mesh(this.shared.box, m);
    a.position.set(x, 2.55, z);
    a.scale.set(w, 0.08, 1.6);
    a.rotation.x = side * 0.18;
    this.group.add(a);
  }

  _garland(x, y, z, w) {
    const m = new THREE.MeshStandardMaterial({ color: 0xe08a3c, roughness: 0.5, emissive: 0x4a2008, emissiveIntensity: 0.15 });
    patchPainterly(m, { wind: 0.8 });
    const curve = new THREE.Mesh(new THREE.TorusGeometry(w / 2, 0.05, 6, 18, Math.PI), m);
    curve.position.set(x, y, z);
    curve.rotation.x = Math.PI / 2;
    this.group.add(curve);
  }

  _lamp(x, y, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(this.shared.cyl, mat(this.textures, this.textures.wood, 0x4a3020));
    pole.position.set(x, 1.5, z);
    pole.scale.set(0.07, 3, 0.07);
    const flame = new THREE.PointLight(0xffc978, 0.0, 9, 2);
    flame.position.set(x, 3.15, z);
    const bowl = new THREE.Mesh(
      this.shared.sphere,
      mat(this.textures, this.textures.gold, PALETTE.gold, { emissive: 0xffaa44, emissiveIntensity: 0.4 })
    );
    bowl.position.set(x, 3.1, z);
    bowl.scale.setScalar(0.16);
    g.add(pole, bowl, flame);
    this.group.add(g);
    this.lamps.push({ light: flame, bowl });
  }

  _flags() {
    for (let i = 0; i < 12; i++) {
      const f = new THREE.Mesh(
        this.shared.plane,
        mat(this.textures, this.textures.cloth, CLOTH_COLORS[i % CLOTH_COLORS.length], {
          side: THREE.DoubleSide,
          wind: 2,
        })
      );
      f.position.set(-36 + i * 7, 5.5 + (i % 3), (i % 2 === 0 ? 7.4 : -7.4));
      f.scale.set(1.1, 1.8, 1);
      this.group.add(f);
    }
  }

  _temple() {
    const g = new THREE.Group();
    g.position.set(58, 0, 0);
    const cream = mat(this.textures, this.textures.stone, 0xf0e2c4, { roughness: 0.65 });
    const gold = mat(this.textures, this.textures.gold, PALETTE.gold, { metalness: 0.35, roughness: 0.4, emissive: 0x6a4010, emissiveIntensity: 0.2 });
    const plinth = new THREE.Mesh(this.shared.box, cream);
    plinth.position.set(0, 0.45, 0);
    plinth.scale.set(22, 0.9, 18);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    g.add(plinth);
    const hall = new THREE.Mesh(this.shared.box, cream);
    hall.position.set(0, 4.2, 0);
    hall.scale.set(14, 7.2, 12);
    hall.castShadow = true;
    g.add(hall);
    const inner = new THREE.Mesh(this.shared.box, cream);
    inner.position.set(3.5, 5.2, 0);
    inner.scale.set(8, 9.2, 8);
    g.add(inner);
    const spire = new THREE.Mesh(this.shared.cone, gold);
    spire.position.set(3.5, 14.2, 0);
    spire.scale.set(3.8, 9.5, 3.8);
    g.add(spire);
    const kalash = new THREE.Mesh(this.shared.sphere, gold);
    kalash.position.set(3.5, 19.3, 0);
    kalash.scale.setScalar(0.55);
    g.add(kalash);
    for (let i = 0; i < 8; i++) {
      const col = new THREE.Mesh(this.shared.cyl, cream);
      const a = (i / 8) * Math.PI * 2;
      col.position.set(Math.cos(a) * 7.2, 2.8, Math.sin(a) * 5.8);
      col.scale.set(0.38, 5.4, 0.38);
      g.add(col);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.28, 8, 16, Math.PI), gold);
    arch.position.set(-7.2, 3.4, 0);
    arch.rotation.y = Math.PI / 2;
    g.add(arch);
    const door = new THREE.Mesh(this.shared.box, mat(this.textures, this.textures.wood, 0x6a3a18, { emissive: 0xe8c36a, emissiveIntensity: 0.12 }));
    door.position.set(-7.1, 2.2, 0);
    door.scale.set(0.2, 4.2, 2.4);
    g.add(door);
    this._addCollider(64, 0, 8, 12, 12, 0);
    this._addCollider(58, 5.5, 12, 4, 10, 0);
    this._addCollider(58, -5.5, 12, 4, 10, 0);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const diya = new THREE.Mesh(
        this.shared.sphere,
        mat(this.textures, this.textures.gold, 0xffcc66, { emissive: 0xffaa33, emissiveIntensity: 0.7 })
      );
      diya.position.set(Math.cos(a) * 9.5, 1.05, Math.sin(a) * 7.6);
      diya.scale.setScalar(0.09);
      g.add(diya);
    }
    const godRay = new THREE.Mesh(
      new THREE.ConeGeometry(2.4, 8, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide })
    );
    godRay.position.set(3.2, 6.5, 0);
    godRay.rotation.z = Math.PI;
    g.add(godRay);
    this.templeRay = godRay;
    const bell = new THREE.Mesh(this.shared.cone, gold);
    bell.position.set(-8.4, 3.6, 2.2);
    bell.scale.set(0.28, 0.5, 0.28);
    g.add(bell);
    this.group.add(g);
    this.templeRoot = g;
    this.interactives.push({
      name: "Temple bell",
      pos: new THREE.Vector3(50, 1, 2.2),
      radius: 2.4,
      kind: "bell",
    });
    this.waypoints.push(new THREE.Vector3(48, 0, 0), new THREE.Vector3(58, 1, 6), new THREE.Vector3(52, 1, -5));
  }

  _market() {
    const stalls = [
      { x: -8, z: 7.8, c: 0xe08a3c, label: "marigolds" },
      { x: -2, z: 8.1, c: 0xd47a8a, label: "roses" },
      { x: 6, z: 7.6, c: 0x4ec4b8, label: "fabrics" },
      { x: -8, z: -7.9, c: 0xe8c36a, label: "sweets" },
      { x: 2, z: -8.2, c: 0x6a4a9a, label: "incense" },
    ];
    for (const s of stalls) {
      const g = new THREE.Group();
      const table = new THREE.Mesh(this.shared.box, mat(this.textures, this.textures.wood, 0x6a4028));
      table.position.set(s.x, 0.7, s.z);
      table.scale.set(2.6, 0.18, 1.4);
      table.castShadow = true;
      g.add(table);
      const cloth = new THREE.Mesh(this.shared.box, mat(this.textures, this.textures.cloth, s.c, { wind: 0.8 }));
      cloth.position.set(s.x, 1.55, s.z);
      cloth.scale.set(2.7, 0.06, 1.5);
      g.add(cloth);
      for (let i = 0; i < 7; i++) {
        const b = new THREE.Mesh(this.shared.sphere, mat(this.textures, this.textures.flower, s.c));
        b.position.set(s.x + (i - 3) * 0.28, 1.05, s.z + (i % 2) * 0.18);
        b.scale.setScalar(0.16 + (i % 3) * 0.04);
        g.add(b);
      }
      this.group.add(g);
      this.interactives.push({
        name: s.label,
        pos: new THREE.Vector3(s.x, 1, s.z),
        radius: 1.8,
        kind: "market",
        id: s.label,
      });
    }
  }

  _ghat() {
    const stone = mat(this.textures, this.textures.stone, 0xd8c4a4);
    for (let i = 0; i < 9; i++) {
      const step = new THREE.Mesh(this.shared.box, stone);
      step.position.set(6, 0.12 + i * 0.18, -18 - i * 1.15);
      step.scale.set(38 - i * 0.4, 0.22, 1.2);
      step.receiveShadow = true;
      this.group.add(step);
    }
    for (let i = 0; i < 8; i++) {
      this._lamp(-10 + i * 5.2, 0, -16.5);
    }
    for (let i = 0; i < 3; i++) {
      const boat = this._boat(-6 + i * 10, -0.05, -46 - i * 3);
      this.group.add(boat);
    }
    for (let i = 0; i < 40; i++) {
      const flower = new THREE.Mesh(
        new THREE.CircleGeometry(0.12, 8),
        new THREE.MeshStandardMaterial({ color: CLOTH_COLORS[i % CLOTH_COLORS.length], roughness: 0.5, side: THREE.DoubleSide })
      );
      flower.rotation.x = -Math.PI / 2;
      flower.position.set(-20 + this.rng() * 50, 0.02, -48 + this.rng() * 12);
      this.group.add(flower);
    }
    this.waypoints.push(new THREE.Vector3(0, 0, -16), new THREE.Vector3(12, 0, -18), new THREE.Vector3(-8, 0, -17));
  }

  _boat(x, y, z) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(this.shared.box, mat(this.textures, this.textures.wood, 0x6a3a22));
    hull.position.set(x, y, z);
    hull.scale.set(4.2, 0.45, 1.3);
    hull.castShadow = true;
    g.add(hull);
    const prow = new THREE.Mesh(this.shared.cone, mat(this.textures, this.textures.wood, 0x4a2814));
    prow.position.set(x + 2.3, y + 0.1, z);
    prow.rotation.z = -Math.PI / 2;
    prow.scale.set(0.45, 1.1, 0.45);
    g.add(prow);
    return g;
  }

  _forest() {
    const count = Math.floor(48 * this.quality.trees);
    for (let i = 0; i < count; i++) {
      const x = 8 + this.rng() * 70;
      const z = 18 + this.rng() * 48;
      if (z < 12) continue;
      this.group.add(this._tree(x, z, 4.5 + this.rng() * 5.5));
    }
    for (let i = 0; i < 16; i++) {
      this.group.add(this._tree(-48 + this.rng() * 20, 10 + this.rng() * 30, 5 + this.rng() * 4));
    }
    const shrine = new THREE.Group();
    const stone = mat(this.textures, this.textures.stone, 0xc8b898);
    const base = new THREE.Mesh(this.shared.box, stone);
    base.position.set(36, 0.5, 42);
    base.scale.set(3.2, 1, 3.2);
    shrine.add(base);
    const lingam = new THREE.Mesh(this.shared.cyl, mat(this.textures, this.textures.stone, 0xb0a090, { emissive: 0x446688, emissiveIntensity: 0.12 }));
    lingam.position.set(36, 1.5, 42);
    lingam.scale.set(0.35, 1.4, 0.35);
    shrine.add(lingam);
    this.group.add(shrine);
    this.interactives.push({
      name: "Forest shrine",
      pos: new THREE.Vector3(36, 1, 42),
      radius: 3,
      kind: "shrine",
    });
    this.krishnaSpot = new THREE.Vector3(48, 0, 46);
    const ruin = new THREE.Mesh(this.shared.box, stone);
    ruin.position.set(22, 1.1, 33);
    ruin.scale.set(1.2, 2.2, 0.4);
    ruin.rotation.z = 0.2;
    this.group.add(ruin);
    this.waypoints.push(new THREE.Vector3(20, 0, 16), new THREE.Vector3(36, 0, 40), new THREE.Vector3(50, 0, 44));
  }

  _tree(x, z, h) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(this.shared.cyl, mat(this.textures, this.textures.wood, 0x5a3824, { wind: 0.2 }));
    trunk.position.set(x, h * 0.28, z);
    trunk.scale.set(0.28 + this.rng() * 0.16, h * 0.55, 0.28);
    trunk.castShadow = true;
    g.add(trunk);
    const leaf = mat(this.textures, this.textures.foliage, 0x2f8a62, { wind: 1.3 });
    for (let i = 0; i < 4; i++) {
      const canopy = new THREE.Mesh(this.shared.sphere, leaf);
      canopy.position.set(x + (this.rng() - 0.5) * 1.4, h * 0.55 + i * 0.45, z + (this.rng() - 0.5) * 1.4);
      canopy.scale.set(1.6 + this.rng(), 1.2 + this.rng() * 0.6, 1.6 + this.rng());
      canopy.castShadow = true;
      g.add(canopy);
    }
    return g;
  }

  _hiddenGarden() {
    const g = new THREE.Group();
    g.position.set(72, 0, 18);
    const hedge = mat(this.textures, this.textures.foliage, 0x246a48, { wind: 0.7 });
    for (const p of [
      [0, 4, 6, 0.8, 1.2],
      [0, -4, 6, 0.8, 1.2],
      [5, 0, 0.8, 8, 1.2],
    ]) {
      const h = new THREE.Mesh(this.shared.box, hedge);
      h.position.set(p[0], 0.7, p[1]);
      h.scale.set(p[2], p[4], p[3]);
      g.add(h);
    }
    for (let i = 0; i < 18; i++) {
      const f = new THREE.Mesh(this.shared.sphere, mat(this.textures, this.textures.flower, CLOTH_COLORS[i % CLOTH_COLORS.length]));
      f.position.set((this.rng() - 0.5) * 6, 0.3, (this.rng() - 0.5) * 5);
      f.scale.setScalar(0.18);
      g.add(f);
    }
    this.group.add(g);
    this.interactives.push({
      name: "Hidden garden",
      pos: new THREE.Vector3(72, 1, 18),
      radius: 4,
      kind: "garden",
    });
  }

  _fillLifeProps() {
    for (let i = 0; i < 10; i++) {
      const bike = new THREE.Mesh(this.shared.box, mat(this.textures, this.textures.wood, 0x2a2a32));
      bike.position.set(-30 + i * 7, 0.35, (i % 2) * 3.4 - 1.5);
      bike.scale.set(1.4, 0.7, 0.18);
      bike.rotation.y = 0.2;
      this.group.add(bike);
    }
    const rickshaw = new THREE.Mesh(this.shared.box, mat(this.textures, this.textures.cloth, 0xe08a3c, { wind: 0.4 }));
    rickshaw.position.set(-18, 0.8, 3.2);
    rickshaw.scale.set(2.4, 1.4, 1.1);
    this.group.add(rickshaw);
  }

  _zones() {
    this.zones = [
      { id: "street", title: "Kunja Lane", cat: "LOCATIONS", pos: new THREE.Vector3(0, 0, 0), r: 14, text: "Narrow painted lanes where cows and pilgrims share the same golden dust." },
      { id: "temple", title: "Temple of Lamps", cat: "LOCATIONS", pos: new THREE.Vector3(58, 0, 0), r: 16, text: "A courtyard of cream stone and saffron light. Bells speak before people do." },
      { id: "market", title: "Flower Market", cat: "LOCATIONS", pos: new THREE.Vector3(0, 0, 8), r: 10, text: "Marigolds stacked like small suns. The air tastes of incense and sugar." },
      { id: "ghat", title: "Yamuna Ghat", cat: "LOCATIONS", pos: new THREE.Vector3(4, 0, -18), r: 14, text: "Steps descending into a river of turquoise and gold." },
      { id: "forest", title: "Vrindavan Forest", cat: "NATURE", pos: new THREE.Vector3(36, 0, 36), r: 20, text: "Kadamba shade, fireflies, and a path that sometimes isn't there." },
      { id: "garden", title: "Hidden Garden", cat: "MYSTERIES", pos: new THREE.Vector3(72, 0, 18), r: 8, text: "A quiet rectangle of flowers behind the temple wall." },
      { id: "shrine", title: "Forest Shrine", cat: "MYSTERIES", pos: new THREE.Vector3(36, 0, 42), r: 6, text: "Stone worn smooth by unnamed hands." },
      { id: "boats", title: "Evening Boats", cat: "LOCATIONS", pos: new THREE.Vector3(0, 0, -46), r: 12, text: "Hulls like dark brushstrokes on living water." },
    ];
  }

  getHeight(x, z) {
    if (z < -16 && z > -28 && Math.abs(x) < 22) {
      const i = THREE.MathUtils.clamp((-16 - z) / 1.15, 0, 9);
      return 0.12 + i * 0.18;
    }
    if (z > 16) return Math.sin(x * 0.08) * 0.35 + Math.cos(z * 0.05) * 0.4;
    if (z < -40) return -0.4;
    return 0;
  }

  updateMaterials(time, hour) {
    this.group.traverse((o) => {
      if (o.material?.userData?.uTime) {
        o.material.userData.uTime.value = time;
        if (o.material.userData.uWind) o.material.userData.uWind.value = this.wind;
      }
    });
    if (this.sky?.material?.uniforms) {
      this.sky.material.uniforms.uTime.value = time;
      this.sky.material.uniforms.uHour.value = hour;
    }
    if (this.water?.material?.uniforms) {
      this.water.material.uniforms.uTime.value = time;
      this.water.material.uniforms.uHour.value = hour;
    }
  }
}
