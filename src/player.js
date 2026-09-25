import * as THREE from "three";

export class Player {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = "player";
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0.18;
    this.onGround = true;
    this.sprinting = false;
    this.emote = 0;
    this.emoteT = 0;
    this.firstPerson = false;
    this.height = 1.62;
    this.radius = 0.32;
    this._buildMesh();
    this.group.position.set(-28, 0, 2.2);
  }

  _buildMesh() {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xc45a3a,
      roughness: 0.72,
      metalness: 0.04,
    });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd4a07a, roughness: 0.55 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 6, 10), bodyMat);
    torso.position.y = 0.95;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), skin);
    head.position.y = 1.52;
    head.castShadow = true;
    const dhoti = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 0.7, 10),
      new THREE.MeshStandardMaterial({ color: 0xf0d8b0, roughness: 0.8 })
    );
    dhoti.position.y = 0.42;
    const mala = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.018, 6, 16),
      new THREE.MeshStandardMaterial({ color: 0xe8c36a, roughness: 0.4, emissive: 0x4a3010, emissiveIntensity: 0.2 })
    );
    mala.position.y = 1.28;
    mala.rotation.x = Math.PI / 2;
    this.mesh = new THREE.Group();
    this.mesh.add(torso, head, dhoti, mala);
    this.group.add(this.mesh);
  }

  update(dt, input, cameraYaw, getHeight, colliders, timeScale) {
    const speed = (input.keys.has("ShiftLeft") || input.keys.has("ShiftRight") ? 6.4 : 3.35) * timeScale;
    this.sprinting = speed > 5;
    let ix = 0;
    let iz = 0;
    if (input.keys.has("KeyW")) iz -= 1;
    if (input.keys.has("KeyS")) iz += 1;
    if (input.keys.has("KeyA")) ix -= 1;
    if (input.keys.has("KeyD")) ix += 1;
    const moving = ix !== 0 || iz !== 0;
    const forward = new THREE.Vector3(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const wish = new THREE.Vector3();
    wish.addScaledVector(right, ix);
    wish.addScaledVector(forward, -iz);
    if (wish.lengthSq() > 0) wish.normalize();

    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, wish.x * speed, 8, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, wish.z * speed, 8, dt);
    this.velocity.y -= 18 * dt;
    if (this.onGround && input.keys.has("Space")) {
      this.velocity.y = 6.2;
      this.onGround = false;
    }

    this.group.position.x += this.velocity.x * dt;
    this.group.position.z += this.velocity.z * dt;
    this._resolve(colliders);
    const ground = getHeight(this.group.position.x, this.group.position.z);
    this.group.position.y += this.velocity.y * dt;
    if (this.group.position.y <= ground) {
      this.group.position.y = ground;
      this.velocity.y = 0;
      this.onGround = true;
    }

    if (moving) {
      this.yaw = Math.atan2(this.velocity.x, this.velocity.z);
      this.mesh.rotation.y = THREE.MathUtils.damp(this.mesh.rotation.y, this.yaw, 10, dt);
      this.mesh.position.y = Math.sin(performance.now() * 0.012 * speed) * 0.035;
    } else {
      this.mesh.position.y = Math.sin(performance.now() * 0.002) * 0.012;
    }

    const em = input.consumeEmote();
    if (em) {
      this.emote = em;
      this.emoteT = 1.6;
    }
    if (this.emoteT > 0) {
      this.emoteT -= dt;
      if (this.emote === 1) this.mesh.rotation.z = Math.sin(this.emoteT * 10) * 0.2;
      if (this.emote === 2) this.mesh.rotation.x = -0.25;
      if (this.emote === 3) this.group.position.y = ground + Math.min(0.45, (1.6 - this.emoteT) * 0.4);
      if (this.emote === 4) this.mesh.scale.y = 1 + Math.sin(this.emoteT * 12) * 0.05;
    } else {
      this.mesh.rotation.z = 0;
      this.mesh.rotation.x = 0;
      this.mesh.scale.y = 1;
    }
  }

  _resolve(colliders) {
    const p = this.group.position;
    for (const b of colliders) {
      const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x);
      const dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z);
      if (dx < this.radius && dz < this.radius && p.y < b.max.y && p.y + this.height > b.min.y) {
        const cx = (b.min.x + b.max.x) * 0.5;
        const cz = (b.min.z + b.max.z) * 0.5;
        const ox = p.x - cx;
        const oz = p.z - cz;
        const hx = (b.max.x - b.min.x) * 0.5 + this.radius;
        const hz = (b.max.z - b.min.z) * 0.5 + this.radius;
        if (Math.abs(ox / hx) > Math.abs(oz / hz)) p.x = cx + Math.sign(ox) * hx;
        else p.z = cz + Math.sign(oz) * hz;
      }
    }
  }

  position() {
    return this.group.position;
  }
}
