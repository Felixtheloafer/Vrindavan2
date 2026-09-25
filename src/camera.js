import * as THREE from "three";

export class CinematicCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0.4;
    this.pitch = 0.22;
    this.dist = 5.6;
    this._look = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._breathe = 0;
    this.mode = "third";
    this.intro = true;
    this.introT = 0;
  }

  update(dt, input, player, eventFrame) {
    if (this.intro) return;
    this.yaw -= input.look.x;
    this.pitch = THREE.MathUtils.clamp(this.pitch - input.look.y, -0.85, 0.95);
    input.look.x = 0;
    input.look.y = 0;

    if (input.consumeToggle("KeyC")) {
      this.mode = this.mode === "third" ? "first" : "third";
      player.firstPerson = this.mode === "first";
    }
    player.mesh.visible = this.mode !== "first";

    const target = player.position().clone();
    target.y += this.mode === "first" ? player.height : 1.35;
    if (eventFrame) {
      target.lerp(eventFrame, 0.08);
    }

    const dist = this.mode === "first" ? 0.12 : this.dist;
    const ox = Math.sin(this.yaw) * Math.cos(this.pitch) * dist;
    const oy = Math.sin(this.pitch) * dist;
    const oz = Math.cos(this.yaw) * Math.cos(this.pitch) * dist;
    const desired = new THREE.Vector3(target.x - ox, target.y + oy + 0.4, target.z - oz);

    const still = player.velocity.length() < 0.15;
    this._breathe += dt * (still ? 1 : 0.25);
    desired.y += Math.sin(this._breathe * 0.7) * (still ? 0.05 : 0.012);

    this._pos.lerp(desired, 1 - Math.pow(0.0018, dt));
    this.camera.position.copy(this._pos);
    this._look.lerp(target, 1 - Math.pow(0.0008, dt));
    this.camera.lookAt(this._look);
    return this.yaw;
  }

  playIntro(dt, points) {
    this.introT += dt;
    const t = this.introT;
    const i = Math.min(points.length - 2, Math.floor(t / 3.2));
    const local = (t / 3.2) % 1;
    const a = points[i];
    const b = points[i + 1];
    this.camera.position.lerpVectors(a.pos, b.pos, smooth(local));
    const look = a.look.clone().lerp(b.look, smooth(local));
    this.camera.lookAt(look);
    if (t > points.length * 2.6) {
      this.intro = false;
      return true;
    }
    return false;
  }
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}
