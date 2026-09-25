export class Input {
  constructor(target) {
    this.keys = new Set();
    this.look = { x: 0, y: 0 };
    this.pointerLocked = false;
    this.interact = false;
    this.emote = 0;
    this.toggles = new Set();
    this._onKey = (e) => {
      if (e.repeat) return;
      if (e.type === "keydown") {
        this.keys.add(e.code);
        if (e.code === "KeyE") this.interact = true;
        if (e.code === "Digit1") this.emote = 1;
        if (e.code === "Digit2") this.emote = 2;
        if (e.code === "Digit3") this.emote = 3;
        if (e.code === "Digit4") this.emote = 4;
        for (const code of ["KeyC", "KeyP", "KeyM", "KeyJ", "Escape", "KeyF", "KeyH"]) {
          if (e.code === code) this.toggles.add(e.code);
        }
      } else {
        this.keys.delete(e.code);
      }
    };
    this._onMove = (e) => {
      if (this.pointerLocked || e.buttons === 2 || e.buttons === 1) {
        this.look.x += e.movementX * 0.0022;
        this.look.y += e.movementY * 0.0022;
      }
    };
    this.allowLock = true;
    this._onClick = () => {
      if (this.allowLock && !this.pointerLocked) target.requestPointerLock?.();
    };
    this._lock = () => {
      this.pointerLocked = document.pointerLockElement === target;
    };
    window.addEventListener("keydown", this._onKey);
    window.addEventListener("keyup", this._onKey);
    window.addEventListener("mousemove", this._onMove);
    target.addEventListener("click", this._onClick);
    document.addEventListener("pointerlockchange", this._lock);
    target.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  consumeInteract() {
    const v = this.interact;
    this.interact = false;
    return v;
  }

  consumeEmote() {
    const v = this.emote;
    this.emote = 0;
    return v;
  }

  consumeToggle(code) {
    if (this.toggles.has(code)) {
      this.toggles.delete(code);
      return true;
    }
    return false;
  }
}
