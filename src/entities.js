import * as THREE from "three";
import { CLOTH_COLORS } from "./config.js";
import { patchPainterly } from "./shaders.js";

function std(color, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  patchPainterly(m, { wind: extra.wind ?? 0.2 });
  return m;
}

export class Cow {
  constructor(x, z, rng) {
    this.group = new THREE.Group();
    this.phase = rng() * 10;
    this.speed = 0.45 + rng() * 0.35;
    this.heading = rng() * Math.PI * 2;
    this.state = "wander";
    this.timer = 3 + rng() * 6;
    this.hunger = 0;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), std(0xf0e6d2));
    body.scale.set(1.5, 0.95, 0.9);
    body.position.y = 0.85;
    body.castShadow = true;
    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), std(0xe8d8c0));
    hump.position.set(-0.15, 1.25, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), std(0xf4ead8));
    head.position.set(0.7, 1.05, 0);
    head.castShadow = true;
    const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.28, 6), std(0xd8c8a8));
    hornL.position.set(0.78, 1.32, 0.12);
    hornL.rotation.z = -0.6;
    const hornR = hornL.clone();
    hornR.position.z = -0.12;
    const legGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.7, 6);
    this.legs = [];
    for (const p of [
      [0.35, 0.18],
      [0.35, -0.18],
      [-0.4, 0.18],
      [-0.4, -0.18],
    ]) {
      const leg = new THREE.Mesh(legGeo, std(0xf0e6d2));
      leg.position.set(p[0], 0.35, p[1]);
      this.legs.push(leg);
      this.group.add(leg);
    }
    this.group.add(body, hump, head, hornL, hornR);
    this.group.position.set(x, 0, z);
    this.body = body;
  }

  update(dt, getHeight, playerPos, interact) {
    this.timer -= dt;
    this.hunger += dt * 0.02;
    const d = this.group.position.distanceTo(playerPos);
    if (interact && d < 2.2) {
      this.state = "pet";
      this.timer = 2;
      return "cow-pet";
    }
    if (this.state === "pet") {
      this.body.scale.y = 0.95 + Math.sin(performance.now() * 0.008) * 0.04;
    } else if (this.timer < 0) {
      this.state = Math.random() > 0.35 ? "wander" : "idle";
      this.timer = 4 + Math.random() * 7;
      this.heading += (Math.random() - 0.5) * 1.5;
    }
    if (this.state === "wander") {
      this.group.position.x += Math.cos(this.heading) * this.speed * dt;
      this.group.position.z += Math.sin(this.heading) * this.speed * dt;
      this.group.rotation.y = Math.atan2(Math.cos(this.heading), Math.sin(this.heading));
      this.legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(performance.now() * 0.008 + i) * 0.35;
      });
      if (Math.abs(this.group.position.z) > 12 && this.group.position.z < 16) this.heading += Math.PI;
      if (this.group.position.x < -40 || this.group.position.x > 50) this.heading += Math.PI;
    } else {
      this.body.scale.y = 0.95 + Math.sin(performance.now() * 0.002 + this.phase) * 0.03;
    }
    this.group.position.y = getHeight(this.group.position.x, this.group.position.z);
    return null;
  }
}

export class Monkey {
  constructor(rooftops, rng) {
    this.rooftops = rooftops;
    this.i = (rng() * rooftops.length) | 0;
    this.group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), std(0x8a5a3a));
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), std(0xc49a72));
    head.position.y = 0.2;
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 5, 10, Math.PI), std(0x8a5a3a));
    tail.position.set(-0.16, 0.05, 0);
    tail.rotation.y = Math.PI / 2;
    this.group.add(body, head, tail);
    this.t = rng();
    this.stolen = false;
    this._place(1);
  }

  _place(alpha) {
    const a = this.rooftops[this.i % this.rooftops.length];
    const b = this.rooftops[(this.i + 1) % this.rooftops.length];
    this.group.position.lerpVectors(a, b, alpha);
    this.group.position.y += Math.sin(alpha * Math.PI) * 1.6;
  }

  update(dt) {
    this.t += dt * (0.35 + (this.stolen ? 0.4 : 0));
    if (this.t >= 1) {
      this.t = 0;
      this.i = (this.i + 1) % this.rooftops.length;
    }
    this._place(this.t);
  }
}

export class NPC {
  constructor(kind, waypoints, rng) {
    this.kind = kind;
    this.waypoints = waypoints;
    this.i = (rng() * waypoints.length) | 0;
    this.t = rng();
    this.speed = 0.7 + rng() * 0.6;
    this.talk = npcLine(kind);
    this.group = new THREE.Group();
    const cloth = CLOTH_COLORS[(rng() * CLOTH_COLORS.length) | 0];
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.55, 4, 8), std(cloth, { wind: 0.8 }));
    body.position.y = 0.85;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), std(0xd4a07a));
    head.position.y = 1.38;
    this.group.add(body, head);
    if (kind === "musician") {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.18, 8), std(0x8a4a28));
      drum.position.set(0.28, 0.9, 0);
      this.group.add(drum);
    }
    if (kind === "priest") {
      const tilak = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.01), std(0xe8c36a, { emissive: 0x886600, emissiveIntensity: 0.3 }));
      tilak.position.set(0, 1.42, 0.16);
      this.group.add(tilak);
    }
    this.home = kind;
  }

  update(dt, hour) {
    const morningTemple = hour > 6 && hour < 10 && (this.kind === "pilgrim" || this.kind === "priest");
    const eveningGhat = hour > 17 && hour < 20;
    this.t += dt * this.speed * (morningTemple ? 1.15 : 0.85) * 0.12;
    if (this.t >= 1) {
      this.t = 0;
      if (morningTemple) this.i = this.waypoints.length - 3 + ((this.i + 1) % 3);
      else if (eveningGhat) this.i = Math.max(0, this.waypoints.length - 6 + ((this.i + 1) % 3));
      else this.i = (this.i + 1) % this.waypoints.length;
    }
    const a = this.waypoints[this.i % this.waypoints.length];
    const b = this.waypoints[(this.i + 1) % this.waypoints.length];
    this.group.position.lerpVectors(a, b, this.t);
    this.group.position.y += 0.02;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    this.group.rotation.y = Math.atan2(dx, dz);
    this.group.position.y += Math.abs(Math.sin(this.t * 20)) * 0.03;
  }
}

function npcLine(kind) {
  const lines = {
    pilgrim: ["Radhe Radhe.", "The temple lamps are already lit.", "Have you walked to the river yet?"],
    musician: ["Follow the drums.", "The kirtan is beginning.", "My mridanga is thirsty for a song."],
    priest: ["Offer a flower, and stay a while.", "The courtyard is for listening."],
    child: ["Did you see the monkey?", "The cow with the broken horn is missing her calf!"],
    seller: ["Marigolds for the Lord.", "Fresh garlands, still warm from the sun."],
    boatman: ["Evening will gold the water.", "Aarti soon, if the sky agrees."],
    artist: ["The walls remember every festival.", "I am trying to paint the wind."],
  };
  const arr = lines[kind] || lines.pilgrim;
  return arr[(Math.random() * arr.length) | 0];
}

export class Flock {
  constructor(scene, n) {
    this.birds = [];
    const geo = new THREE.ConeGeometry(0.08, 0.28, 4);
    const mat = std(0x2a2a38);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = Math.PI / 2;
      scene.add(m);
      this.birds.push({
        mesh: m,
        t: Math.random() * 10,
        r: 8 + Math.random() * 30,
        y: 6 + Math.random() * 10,
        s: 0.4 + Math.random() * 0.5,
      });
    }
  }

  update(dt) {
    for (const b of this.birds) {
      b.t += dt * b.s;
      b.mesh.position.set(Math.cos(b.t) * b.r + 10, b.y + Math.sin(b.t * 2) * 0.6, Math.sin(b.t * 0.7) * b.r * 0.4);
      b.mesh.lookAt(b.mesh.position.clone().add(new THREE.Vector3(-Math.sin(b.t), 0, Math.cos(b.t))));
    }
  }
}

export class Peacock {
  constructor(x, z) {
    this.group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), std(0x2f6a8a, { emissive: 0x113344, emissiveIntensity: 0.2 }));
    body.position.y = 0.35;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.35, 6), std(0x2f8a62));
    neck.position.set(0.12, 0.55, 0);
    neck.rotation.z = 0.5;
    this.fan = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 16, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x2f8a62, side: THREE.DoubleSide, roughness: 0.45, emissive: 0x145a3a, emissiveIntensity: 0.15 })
    );
    this.fan.position.set(-0.1, 0.6, 0);
    this.fan.rotation.y = Math.PI / 2;
    this.fan.scale.set(0.15, 0.15, 0.15);
    this.group.add(body, neck, this.fan);
    this.group.position.set(x, 0, z);
    this.display = 0;
    this.cool = 8;
  }

  update(dt, playerPos) {
    this.cool -= dt;
    if (this.cool < 0 && playerPos.distanceTo(this.group.position) < 7) {
      this.display = 1;
      this.cool = 18 + Math.random() * 12;
      return "peacock";
    }
    if (this.display > 0) {
      this.display -= dt * 0.25;
      const s = Math.sin((1 - Math.max(this.display, 0)) * Math.PI) * 1.1;
      this.fan.scale.set(s, s, s);
    } else this.fan.scale.setScalar(0.12);
    return null;
  }
}

export class Fireflies {
  constructor(scene, n) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = 20 + Math.random() * 50;
      pos[i * 3 + 1] = 0.4 + Math.random() * 4;
      pos[i * 3 + 2] = 22 + Math.random() * 40;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xe8ff8a, size: 0.12, transparent: true, opacity: 0.0, depthWrite: false });
    this.points = new THREE.Points(geo, mat);
    scene.add(this.points);
    this.base = pos;
  }

  update(dt, hour, boost = 1) {
    const night = hour > 18.5 || hour < 6.2;
    this.points.material.opacity = THREE.MathUtils.damp(this.points.material.opacity, night ? 0.85 * boost : 0, 2, dt);
    const arr = this.points.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += Math.sin(performance.now() * 0.001 + i) * 0.01;
      arr[i + 1] += Math.cos(performance.now() * 0.0012 + i) * 0.008;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
