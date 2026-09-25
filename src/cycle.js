import * as THREE from "three";

export class ClockCycle {
  constructor() {
    this.hour = 5.85;
    this.speed = 0.42;
    this.dayIndex = 3;
  }

  update(dt, paused) {
    if (paused) return;
    this.hour += dt * this.speed;
    if (this.hour >= 24) {
      this.hour -= 24;
      this.dayIndex += 1;
    }
  }

  get phase() {
    const h = this.hour;
    if (h < 6.5) return "night";
    if (h < 8.5) return "morning";
    if (h < 16.5) return "day";
    if (h < 19.5) return "sunset";
    return "night";
  }

  label() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour % 1) * 60);
    const ap = h >= 12 ? "PM" : "AM";
    const hr = ((h + 11) % 12) + 1;
    return `${hr}:${m.toString().padStart(2, "0")} ${ap}`;
  }

  sunDir() {
    const a = ((this.hour - 6) / 12) * Math.PI;
    return new THREE.Vector3(Math.cos(a) * 0.7, Math.sin(a), 0.25).normalize();
  }

  fogColor() {
    const p = this.phase;
    if (p === "morning") return new THREE.Color(0xc9b090);
    if (p === "day") return new THREE.Color(0x9eb4d0);
    if (p === "sunset") return new THREE.Color(0xd4784a);
    return new THREE.Color(0x12182e);
  }
}

export class Weather {
  constructor() {
    this.kind = "clear";
    this.t = 0;
    this.next = 40 + Math.random() * 50;
  }

  update(dt) {
    this.t += dt;
    if (this.t > this.next) {
      this.t = 0;
      this.next = 35 + Math.random() * 70;
      const roll = Math.random();
      if (roll < 0.42) this.kind = "clear";
      else if (roll < 0.62) this.kind = "cloudy";
      else if (roll < 0.78) this.kind = "haze";
      else if (roll < 0.9) this.kind = "mist";
      else if (roll < 0.97) this.kind = "rain";
      else this.kind = "storm";
    }
  }

  fogDensity() {
    if (this.kind === "mist") return 0.018;
    if (this.kind === "rain") return 0.014;
    if (this.kind === "storm") return 0.02;
    if (this.kind === "haze") return 0.011;
    if (this.kind === "cloudy") return 0.009;
    return 0.0065;
  }
}
