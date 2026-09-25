import * as THREE from "three";

export class Discovery {
  constructor() {
    this.found = new Map();
    this.listeners = [];
  }

  unlock(entry) {
    if (this.found.has(entry.id)) return false;
    this.found.set(entry.id, { ...entry, at: Date.now() });
    this.listeners.forEach((fn) => fn(entry));
    return true;
  }

  list() {
    return [...this.found.values()];
  }

  count() {
    return this.found.size;
  }
}

export class QuestLog {
  constructor() {
    this.quests = [
      {
        id: "drums",
        title: "Follow the sound of the drums",
        hint: "Kirtan gathers near the temple courtyard.",
        done: false,
        check: (g) => g.player.position().distanceTo(new THREE.Vector3(52, 0, 0)) < 8,
      },
      {
        id: "calf",
        title: "Find the missing calf",
        hint: "A child on the lane is searching. Look near the ghat steps.",
        done: false,
        check: (g) => g.cows.some((c) => c.group.position.z < -12 && g.player.position().distanceTo(c.group.position) < 3),
      },
      {
        id: "flowers",
        title: "Bring flowers to the temple",
        hint: "Take a garland from the market, then walk to the courtyard.",
        done: false,
        check: (g) => g.flags.carryingFlowers && g.player.position().distanceTo(new THREE.Vector3(58, 0, 0)) < 10,
      },
      {
        id: "sunset",
        title: "Watch sunset from the old ghat",
        hint: "Be at the river when the sky turns saffron.",
        done: false,
        check: (g) => g.cycle.phase === "sunset" && g.player.position().z < -14,
      },
      {
        id: "flute",
        title: "Find the source of the flute",
        hint: "When the forest grows quiet, walk toward the blue light.",
        done: false,
        check: (g) => g.krishna.seen,
      },
      {
        id: "peacocks",
        title: "Photograph three peacocks",
        hint: "Open photo mode when a fan of feathers appears.",
        done: false,
        check: (g) => g.flags.peacockPhotos >= 3,
      },
      {
        id: "monkey",
        title: "Find the monkey that stole the basket",
        hint: "Watch the rooftops. Mischief travels by leap.",
        done: false,
        check: (g) => g.monkeys.some((m) => m.stolen && g.player.position().distanceTo(m.group.position) < 6),
      },
      {
        id: "garden",
        title: "Discover the hidden garden",
        hint: "Behind the temple, where the wall forgets to be a wall.",
        done: false,
        check: (g) => g.player.position().distanceTo(new THREE.Vector3(72, 0, 18)) < 6,
      },
    ];
    this.active = this.quests[0];
  }

  update(game) {
    for (const q of this.quests) {
      if (!q.done && q.check(game)) {
        q.done = true;
        game.toast?.(`Remembered: ${q.title}`);
        game.discovery.unlock({
          id: "quest-" + q.id,
          title: q.title,
          cat: "SPECIAL ENCOUNTERS",
          text: q.hint,
        });
      }
    }
    this.active = this.quests.find((q) => !q.done) || this.quests[this.quests.length - 1];
  }
}

export class FestivalCalendar {
  constructor() {
    this.festivals = [
      { id: "ordinary", name: "Ordinary sacred day", transform: "none" },
      { id: "holi", name: "Holi — Festival of Colors", transform: "holi" },
      { id: "janmashtami", name: "Janmashtami", transform: "janma" },
      { id: "diwali", name: "Diwali of Lamps", transform: "diwali" },
      { id: "flowers", name: "Flower Festival", transform: "flowers" },
      { id: "kartik", name: "Kartik evening", transform: "kartik" },
    ];
  }

  forDay(dayIndex) {
    if (dayIndex % 11 === 0) return this.festivals[1];
    if (dayIndex % 13 === 0) return this.festivals[2];
    if (dayIndex % 17 === 0) return this.festivals[3];
    if (dayIndex % 7 === 0) return this.festivals[4];
    if (dayIndex % 5 === 0) return this.festivals[5];
    return this.festivals[0];
  }
}

export class KrishnaEncounter {
  constructor(scene, spot) {
    this.spot = spot.clone();
    this.seen = false;
    this.active = false;
    this.t = 0;
    this.cooldown = 40;
    this.group = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({
      color: 0x3a6aa8,
      roughness: 0.45,
      emissive: 0x1a3060,
      emissiveIntensity: 0.35,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.7, 6, 10), skin);
    body.position.y = 1;
    const dhoti = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 10), new THREE.MeshStandardMaterial({ color: 0xe8c36a, roughness: 0.55, emissive: 0x664400, emissiveIntensity: 0.2 }));
    dhoti.position.y = 0.4;
    const flute = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0xd4b07a }));
    flute.rotation.z = Math.PI / 2;
    flute.position.set(0.15, 1.35, 0.18);
    const feather = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.45, 6), new THREE.MeshStandardMaterial({ color: 0x2f8a62 }));
    feather.position.set(0, 1.85, 0);
    const glow = new THREE.PointLight(0x88bbff, 0, 12, 2);
    glow.position.y = 1.4;
    this.light = glow;
    this.group.add(body, dhoti, flute, feather, glow);
    this.group.visible = false;
    this.group.position.copy(this.spot);
    scene.add(this.group);
    this.particles = this._particles();
    scene.add(this.particles);
  }

  _particles() {
    const n = 80;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xd4e8ff, size: 0.08, transparent: true, opacity: 0, depthWrite: false });
    return new THREE.Points(geo, mat);
  }

  update(dt, playerPos, hour, audio) {
    this.cooldown -= dt;
    const near = playerPos.distanceTo(this.spot) < 14;
    const magicHour = hour > 17.8 || hour < 5.8;
    if (!this.active && !this.seen && near && magicHour && this.cooldown < 0) {
      this.active = true;
      this.t = 0;
      audio?.flute(this.spot.x, 1.5, this.spot.z);
      audio?.duck(0.35);
    }
    if (!this.active) {
      this.group.visible = false;
      this.particles.material.opacity = 0;
      return { slow: 1, frame: null };
    }
    this.t += dt;
    this.group.visible = this.t > 1.2 && this.t < 11;
    this.light.intensity = this.group.visible ? 2.2 : 0;
    this.particles.material.opacity = this.group.visible ? 0.7 : 0;
    const arr = this.particles.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      const a = i * 0.2 + this.t;
      arr[i] = this.spot.x + Math.cos(a) * (0.6 + (i % 7) * 0.08);
      arr[i + 1] = 0.4 + (i % 5) * 0.25 + Math.sin(a * 0.7) * 0.2;
      arr[i + 2] = this.spot.z + Math.sin(a) * (0.6 + (i % 6) * 0.08);
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.group.lookAt(playerPos.x, 1, playerPos.z);
    if (this.t > 12) {
      this.active = false;
      this.seen = true;
      audio?.duck(1);
      this.cooldown = 120;
    }
    return {
      slow: this.group.visible ? 0.42 : 0.75,
      frame: this.group.visible ? this.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)) : null,
    };
  }
}

export class RareEvents {
  constructor() {
    this.timer = 12;
    this.current = null;
  }

  update(dt, game) {
    this.timer -= dt;
    if (this.current && this.current.t > 0) {
      this.current.t -= dt;
      if (this.current.t <= 0) this.current = null;
      return this.current;
    }
    if (this.timer > 0) return this.current;
    this.timer = 18 + Math.random() * 28;
    const r = Math.random();
    if (r < 0.5) this.current = { id: "bell", t: 3, text: "A distant temple bell." };
    else if (r < 0.7) this.current = { id: "birds", t: 4, text: "A flock crosses the painted sky." };
    else if (r < 0.82) this.current = { id: "petals", t: 5, text: "Flowers blow across the lane." };
    else if (r < 0.9) this.current = { id: "silence", t: 4, text: "The street holds its breath." };
    else if (r < 0.96) this.current = { id: "flute", t: 5, text: "A flute, somewhere between the trees." };
    else this.current = { id: "fireflies", t: 8, text: "The forest fills with tiny lamps." };
    if (this.current.id === "flute") game.audio.flute(40, 2, 30);
    if (this.current.id === "bell") game.audio.addPulse?.(48, 4, 0, 680, 99, 0.12);
    game.toast?.(this.current.text);
    return this.current;
  }
}
