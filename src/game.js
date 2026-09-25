import * as THREE from "three";
import { QUALITY } from "./config.js";
import { createTextures } from "./textures.js";
import { Input } from "./input.js";
import { Player } from "./player.js";
import { CinematicCamera } from "./camera.js";
import { AudioWorld } from "./audio.js";
import { ClockCycle, Weather } from "./cycle.js";
import { World } from "./world.js";
import { Cow, Monkey, NPC, Flock, Peacock, Fireflies } from "./entities.js";
import { Discovery, QuestLog, FestivalCalendar, KrishnaEncounter, RareEvents } from "./systems.js";
import { UI } from "./ui.js";
import { makeComposer } from "./post.js";
import { seeded } from "./textures.js";

export class Game {
  constructor(mount) {
    this.mount = mount;
    this.qualityName = localStorage.getItem("vrindavan-quality") || "HIGH";
    this.quality = QUALITY[this.qualityName] || QUALITY.HIGH;
    this.clock = new THREE.Clock();
    this.time = 0;
    this.paused = false;
    this.flags = { carryingFlowers: false, peacockPhotos: 0 };
    this.toast = (t) => this.ui?.toast(`<strong>Vrindavan</strong>${t}`);
  }

  async start(skipIntro = false) {
    this._renderer();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 500);
    this.textures = createTextures();
    this.world = new World(this.scene, this.textures, this.quality).build();
    this.player = new Player();
    this.scene.add(this.player.group);
    this.cam = new CinematicCamera(this.camera);
    this.cam.intro = !skipIntro;
    this.input = new Input(this.renderer.domElement);
    this.renderer.domElement.addEventListener("wheel", (e) => {
      if (!this.ui?.photo && this.cam.mode !== "third") return;
      this.camera.fov = THREE.MathUtils.clamp(this.camera.fov + Math.sign(e.deltaY) * 2, 28, 85);
      this.camera.updateProjectionMatrix();
      if (!this.ui?.photo) this.cam.dist = THREE.MathUtils.clamp(this.cam.dist + Math.sign(e.deltaY) * 0.35, 3.2, 9);
    });
    this.audio = new AudioWorld();
    await this.audio.start();
    this.cycle = new ClockCycle();
    this.weather = new Weather();
    this.discovery = new Discovery();
    this.quests = new QuestLog();
    this.calendar = new FestivalCalendar();
    this.krishna = new KrishnaEncounter(this.scene, this.world.krishnaSpot);
    this.rare = new RareEvents();
    this.ui = new UI();
    this.ui.onAction = (act) => this._action(act);
    this._spawnLife();
    this._audioSources();
    this._rain();
    this._holi();
    const post = makeComposer(this.renderer, this.scene, this.camera, this.quality);
    this.composer = post.composer;
    this.grade = post.grade;
    this.festival = this.calendar.forDay(this.cycle.dayIndex);
    this.ui.setCalendar(this.calendar.festivals, this.festival);
    this.ui.toast(`<strong>${this.quests.active.title}</strong>${this.quests.active.hint}`);
    window.addEventListener("resize", () => this._resize());
    this._resize();
    this.ui.root.querySelector("#quality").value = this.qualityName;
    this.ui.root.querySelector("#quality").onchange = (e) => {
      localStorage.setItem("vrindavan-quality", e.target.value);
    };
    if (skipIntro) {
      this.ui.open(null);
      this.ui.veil(false);
      this.playing = true;
    }
    this.playing = this.playing || false;
    this.renderer.setAnimationLoop(() => this._frame());
  }

  _renderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quality.pixelRatio));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.mount.appendChild(this.renderer.domElement);
  }

  _spawnLife() {
    const rng = seeded(88);
    this.cows = [];
    const cowN = Math.floor(6 * this.quality.npc);
    for (let i = 0; i < cowN; i++) {
      const cow = new Cow(-20 + rng() * 40, (rng() - 0.5) * 6, rng);
      this.scene.add(cow.group);
      this.cows.push(cow);
    }
    this.monkeys = [];
    const mN = Math.floor(5 * this.quality.npc);
    for (let i = 0; i < mN; i++) {
      const m = new Monkey(this.world.rooftops, rng);
      this.scene.add(m.group);
      this.monkeys.push(m);
    }
    const kinds = ["pilgrim", "musician", "priest", "child", "seller", "boatman", "artist", "pilgrim", "seller"];
    this.npcs = [];
    const nN = Math.floor(kinds.length * this.quality.npc);
    for (let i = 0; i < nN; i++) {
      const npc = new NPC(kinds[i % kinds.length], this.world.waypoints, rng);
      this.scene.add(npc.group);
      this.npcs.push(npc);
    }
    this.flock = new Flock(this.scene, Math.floor(18 * this.quality.particles));
    this.peacocks = [new Peacock(12, 14), new Peacock(40, 28), new Peacock(-6, -15), new Peacock(28, 38)];
    this.peacocks.forEach((p) => this.scene.add(p.group));
    this.fireflies = new Fireflies(this.scene, Math.floor(70 * this.quality.particles));
  }

  _audioSources() {
    this.audio.addDrone(58, 2, 0, [130.8, 196, 261.6, 329.6], 0.05);
    this.audio.addDrone(0, 1.5, 8, [174.6, 220, 261.6], 0.03);
    this.audio.addDrone(4, 1, -18, [146.8, 220, 293.7], 0.025);
    this.audio.addBell(50, 4, 2);
    this.audio.addPulse(-2, 2, 8, 220, 1.6, 0.03);
  }

  _rain() {
    const n = Math.floor(900 * this.quality.particles);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 16;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xa8c8e0, size: 0.05, transparent: true, opacity: 0, depthWrite: false })
    );
    this.scene.add(this.rain);
  }

  _holi() {
    const n = 200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = Math.random() * 5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 12;
      const c = new THREE.Color().setHSL(Math.random(), 0.75, 0.55);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.powder = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0, depthWrite: false })
    );
    this.scene.add(this.powder);
  }

  _action(act) {
    if (act === "play") this._begin(false);
    if (act === "explore") this._begin(true);
    if (act === "journal") {
      this.ui.setJournal(this.discovery.list(), this.world.zones);
      this.ui.open("journal");
    }
    if (act === "calendar") this.ui.open("calendar");
    if (act === "settings") this.ui.open("settings");
    if (act === "close") this.ui.open(this.playing ? null : "menu");
  }

  async _begin(skip) {
    await this.audio.start();
    this.ui.open(null);
    this.playing = true;
    this.cam.intro = !skip;
    this.introPoints = [
      { pos: new THREE.Vector3(-10, 18, 40), look: new THREE.Vector3(20, 2, 10) },
      { pos: new THREE.Vector3(40, 16, 24), look: new THREE.Vector3(58, 8, 0) },
      { pos: new THREE.Vector3(10, 12, -8), look: new THREE.Vector3(0, 2, 0) },
      { pos: new THREE.Vector3(8, 7, -28), look: new THREE.Vector3(6, 0, -48) },
      { pos: new THREE.Vector3(-22, 4.2, 8), look: new THREE.Vector3(-10, 1.2, 1) },
    ];
    this.ui.subtitle("Dawn leans over Vrindavan.");
    if (skip) {
      this.ui.veil(false);
      this.cam.intro = false;
    }
  }

  _frame() {
    const dtRaw = Math.min(0.033, this.clock.getDelta());
    const overlay = this.ui.menuOpen;
    this.input.allowLock = this.playing && !overlay && !this.ui.photo;
    if (!this.playing) {
      this.time += dtRaw;
      const t = this.time * 0.07;
      this.camera.position.set(Math.sin(t) * 22 + 8, 9.5, Math.cos(t) * 16 + 6);
      this.camera.lookAt(20, 3, 0);
      this._light();
      this.world.updateMaterials(this.time, this.cycle.hour);
      this.cycle.update(dtRaw * 0.35, false);
      this.composer.render();
      return;
    }
    if (this.input.consumeToggle("Escape")) {
      if (this.ui.photo) this._photo(false);
      else this.ui.open(overlay ? null : "menu");
    }
    if (this.playing && !overlay && this.input.consumeToggle("KeyM")) {
      this.ui.drawMap(this.player.position(), this.world.zones, this.discovery.found);
      this.ui.open("map");
    }
    if (this.playing && this.input.consumeToggle("KeyJ")) {
      this.ui.setJournal(this.discovery.list(), this.world.zones);
      this.ui.open("journal");
    }
    if (this.playing && this.input.consumeToggle("KeyP")) this._photo(!this.ui.photo);

    if (this.cam.intro && this.playing) {
      this.ui.veil(this.cam.introT < 0.4);
      const done = this.cam.playIntro(dtRaw, this.introPoints);
      this._light(dtRaw);
      this.composer.render();
      if (done) {
        this.ui.veil(false);
        this.ui.subtitle("The lane is already awake.");
      }
      return;
    }

    const magic = this.krishna.active ? this.krishna : { slow: 1, frame: null };
    const dt = overlay || this.ui.photo ? 0 : dtRaw * (this._slow || 1);
    this.time += dtRaw;
    if (!overlay && this.playing) {
      this.cycle.update(dt, this.ui.photo);
      this.weather.update(dt);
      const yaw = this.cam.update(dtRaw, this.input, this.player, magic.frame);
      this.player.update(dt, this.input, this.cam.yaw, this.world.getHeight.bind(this.world), this.world.colliders, 1);
      this._living(dt);
      this._systems(dt);
      this.ui.setCompass(yaw || this.cam.yaw);
    }
    this._light(dtRaw);
    this._slow = magic.slow ?? 1;
    const k = this.krishna.update(dtRaw, this.player.position(), this.cycle.hour, this.audio);
    this._slow = k.slow;
    if (this.krishna.seen) {
      this.discovery.unlock({
        id: "krishna",
        title: "A blue-gold pause",
        cat: "SPECIAL ENCOUNTERS",
        text: "For a moment the forest forgot its own noise.",
      });
    }
    this.grade.uniforms.uHour.value = this.cycle.hour;
    this.world.updateMaterials(this.time, this.cycle.hour);
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    this.audio.setListener(this.player.position(), fwd);
    this.ui.setClock(this.cycle.label(), `${this.festival.name} · ${this.weather.kind}`);
    this.composer.render();
  }

  _living(dt) {
    const p = this.player.position();
    const interact = this.input.consumeInteract();
    for (const cow of this.cows) {
      const ev = cow.update(dt, this.world.getHeight.bind(this.world), p, interact);
      if (ev === "cow-pet") {
        this.discovery.unlock({ id: "cows", title: "The wandering cows", cat: "ANIMALS", text: "Warm as temple stone in the afternoon." });
        this.toast("The cow leans into your hand.");
      }
    }
    this.monkeys.forEach((m) => m.update(dt));
    if (Math.random() < 0.0008) {
      const thief = this.monkeys[0];
      if (thief) {
        thief.stolen = true;
        this.toast("A monkey vanishes with a flower basket.");
        this.discovery.unlock({ id: "monkeys", title: "Rooftop monkeys", cat: "ANIMALS", text: "Joy with a stolen garland." });
      }
    }
    this.npcs.forEach((n) => n.update(dt, this.cycle.hour));
    this.flock.update(dt);
    for (const pk of this.peacocks) {
      const ev = pk.update(dt, p);
      if (ev) {
        this.discovery.unlock({ id: "peacock", title: "A peacock's fan", cat: "ANIMALS", text: "Emerald geometry, briefly perfect." });
        if (this.ui.photo) this.flags.peacockPhotos += 1;
      }
    }
    const rare = this.rare.update(dt, this);
    this.fireflies.update(dt, this.cycle.hour, rare?.id === "fireflies" ? 2.2 : 1);

    let prompt = "";
    let nearest = null;
    for (const it of this.world.interactives) {
      if (p.distanceTo(it.pos) < it.radius) {
        nearest = it;
        prompt = `E — ${it.name}`;
      }
    }
    for (const npc of this.npcs) {
      if (p.distanceTo(npc.group.position) < 1.8) {
        nearest = { kind: "npc", npc };
        prompt = `E — ${npc.kind}`;
      }
    }
    this.ui.prompt(prompt);
    if (interact && nearest) {
      if (nearest.kind === "market") {
        this.flags.carryingFlowers = true;
        this.toast("You lift a garland of marigolds.");
        this.discovery.unlock({ id: "market", title: this.world.zones.find((z) => z.id === "market").title, cat: "LOCATIONS", text: this.world.zones.find((z) => z.id === "market").text });
      }
      if (nearest.kind === "bell") {
        this.audio.addPulse(50, 4, 2, 780, 99, 0.15);
        this.toast("The bell answers, then the courtyard does.");
      }
      if (nearest.kind === "npc") this.ui.subtitle(`“${nearest.npc.talk}”`);
      if (nearest.kind === "shrine" || nearest.kind === "garden") {
        this.discovery.unlock(this.world.zones.find((z) => z.id === nearest.kind) || nearest);
      }
    }
    if (this.weather.kind === "rain" || this.weather.kind === "storm") {
      this.cows.forEach((c) => {
        if (Math.abs(c.group.position.z) < 6) c.heading = c.group.position.z > 0 ? 1.2 : -1.2;
      });
    }
  }

  _systems(dt) {
    const p = this.player.position();
    for (const z of this.world.zones) {
      if (p.distanceTo(z.pos) < z.r) this.discovery.unlock(z);
    }
    this.quests.update(this);
    this.ui.toast(`<strong>${this.quests.active.title}</strong>${this.quests.active.hint}`);
    const rain = this.weather.kind === "rain" || this.weather.kind === "storm";
    this.rain.material.opacity = rain ? 0.55 : 0;
    if (rain) {
      const arr = this.rain.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= (this.weather.kind === "storm" ? 14 : 8) * dt;
        if (arr[i + 1] < 0) arr[i + 1] = 14;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    const holi = this.festival.transform === "holi";
    this.powder.material.opacity = holi ? 0.65 : 0;
    if (holi) {
      const arr = this.powder.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] += Math.sin(this.time + i) * 0.01;
        arr[i] += Math.cos(this.time * 0.3 + i) * 0.02;
      }
      this.powder.geometry.attributes.position.needsUpdate = true;
    }
    this.audio.setFestival(this.festival.transform === "none" ? 0 : 1);
    if (this.festival.transform === "diwali" || this.festival.transform === "janma" || this.festival.transform === "kartik") {
      this.world.lamps.forEach((l) => {
        l.light.intensity = Math.max(l.light.intensity, 1.6);
      });
    }
  }

  _light() {
    const dir = this.cycle.sunDir();
    this.world.sun.position.copy(dir.clone().multiplyScalar(60));
    const p = this.cycle.phase;
    if (p === "morning") {
      this.world.sun.color.set(0xffd6a0);
      this.world.sun.intensity = 1.15;
      this.world.hemi.intensity = 0.55;
      this.renderer.toneMappingExposure = 1.0;
    } else if (p === "day") {
      this.world.sun.color.set(0xfff0d0);
      this.world.sun.intensity = 1.55;
      this.world.hemi.intensity = 0.75;
      this.renderer.toneMappingExposure = 1.08;
    } else if (p === "sunset") {
      this.world.sun.color.set(0xff7a3c);
      this.world.sun.intensity = 1.7;
      this.world.hemi.intensity = 0.4;
      this.renderer.toneMappingExposure = 1.12;
    } else {
      this.world.sun.color.set(0x8899cc);
      this.world.sun.intensity = 0.18;
      this.world.hemi.intensity = 0.22;
      this.renderer.toneMappingExposure = 0.82;
    }
    this.scene.fog.color.copy(this.cycle.fogColor());
    this.scene.fog.density = this.weather.fogDensity();
    this.world.sky.material.uniforms.uSunDir.value.copy(dir);
    const lampOn = p === "night" || p === "sunset";
    for (const l of this.world.lamps) {
      l.light.intensity = THREE.MathUtils.lerp(l.light.intensity, lampOn ? 1.15 : 0.05, 0.05);
      if (l.bowl.material.emissiveIntensity !== undefined) l.bowl.material.emissiveIntensity = lampOn ? 0.85 : 0.12;
    }
    if (this.world.water?.material?.uniforms?.uSkyTint) {
      this.world.water.material.uniforms.uSkyTint.value.copy(this.scene.fog.color);
    }
  }

  _photo(on) {
    this.ui.setPhoto(on);
    if (on) {
      this.toast("The world holds still for a painting.");
      this.renderer.domElement.addEventListener("click", this._shot, { once: true });
    }
  }

  _shot = () => {
    const a = document.createElement("a");
    a.download = `vrindavan-${Date.now()}.png`;
    a.href = this.renderer.domElement.toDataURL("image/png");
    a.click();
    this.flags.peacockPhotos += this.peacocks.some((p) => p.display > 0) ? 1 : 0;
  };

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer?.setSize(innerWidth, innerHeight);
  }
}
