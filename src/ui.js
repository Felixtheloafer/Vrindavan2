import { CONTROLS_HELP } from "./config.js";

export class UI {
  constructor() {
    this.root = document.createElement("div");
    this.root.id = "ui-root";
    document.body.appendChild(this.root);
    this.root.innerHTML = `
      <div class="fade-veil" id="veil"></div>
      <div class="hud-compass" id="compass"></div>
      <div class="hud-time" id="time"><span id="clock"></span><small id="festival-chip"></small></div>
      <div class="hud-hint" id="hint">${CONTROLS_HELP}</div>
      <div class="interact-prompt" id="prompt"></div>
      <div class="quest-toast" id="quest"></div>
      <div class="subtitle" id="sub"></div>
      <div class="photo-bar" id="photo-bar">PHOTO · scroll FOV · P to leave · click to save</div>
      <div class="overlay open" id="menu">
        <div class="menu-card">
          <div class="brand">Vrindavan<span>The Living Garden</span></div>
          <p class="lead">A Van Gogh-inspired walking dream of lanes, lamps, cows, and a river that remembers the sky.</p>
          <div class="menu-list">
            <button data-act="play">Play</button>
            <button data-act="explore">Explore</button>
            <button data-act="journal">Journal</button>
            <button data-act="calendar">Festival Calendar</button>
            <button data-act="settings">Settings</button>
          </div>
        </div>
      </div>
      <div class="overlay" id="journal">
        <div class="sheet wide">
          <div class="brand" style="font-size:28px">Travel Journal</div>
          <div class="journal-grid" id="journal-grid"></div>
          <div class="menu-list"><button data-act="close">Close</button></div>
        </div>
      </div>
      <div class="overlay" id="map">
        <div class="sheet wide">
          <div class="brand" style="font-size:28px">Hand-painted map</div>
          <div class="map-wrap"><canvas id="map-canvas" width="900" height="560"></canvas></div>
          <div class="menu-list"><button data-act="close">Close</button></div>
        </div>
      </div>
      <div class="overlay" id="calendar">
        <div class="sheet">
          <div class="brand" style="font-size:28px">Festival Calendar</div>
          <div id="cal-body" style="margin:16px 0; font-size:18px; line-height:1.6"></div>
          <div class="menu-list"><button data-act="close">Close</button></div>
        </div>
      </div>
      <div class="overlay" id="settings">
        <div class="sheet">
          <div class="brand" style="font-size:28px">Settings</div>
          <div class="settings-row"><span>Quality</span>
            <select id="quality">
              <option>LOW</option>
              <option selected>MEDIUM</option>
              <option>HIGH</option>
              <option>ULTRA</option>
            </select>
          </div>
          <p style="opacity:.7;margin-top:12px;font-size:16px">Quality changes apply after returning to the lane.</p>
          <div class="menu-list"><button data-act="close">Close</button></div>
        </div>
      </div>
    `;
    this.menuOpen = true;
    this.photo = false;
    this.hiddenHud = false;
    this.root.addEventListener("click", (e) => {
      const act = e.target.dataset?.act;
      if (act) this.onAction?.(act);
    });
  }

  setClock(label, festival) {
    this.root.querySelector("#clock").textContent = label;
    this.root.querySelector("#festival-chip").textContent = festival;
  }

  setCompass(yaw) {
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const i = Math.round((((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
    this.root.querySelector("#compass").textContent = dirs[i];
  }

  prompt(text) {
    const el = this.root.querySelector("#prompt");
    el.textContent = text || "";
    el.classList.toggle("visible", !!text);
  }

  toast(text) {
    const el = this.root.querySelector("#quest");
    el.innerHTML = text;
  }

  subtitle(text, ms = 2800) {
    const el = this.root.querySelector("#sub");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(this._sub);
    this._sub = setTimeout(() => el.classList.remove("show"), ms);
  }

  veil(on) {
    this.root.querySelector("#veil").classList.toggle("clear", !on);
  }

  open(id) {
    this.root.querySelectorAll(".overlay").forEach((o) => o.classList.remove("open"));
    if (id) this.root.querySelector("#" + id)?.classList.add("open");
    this.menuOpen = !!id;
  }

  setJournal(entries, catalog) {
    const grid = this.root.querySelector("#journal-grid");
    grid.innerHTML = catalog
      .map((c) => {
        const found = entries.find((e) => e.id === c.id);
        return `<article class="journal-card ${found ? "" : "locked"}"><h3>${found ? c.title : "Undiscovered"}</h3><p>${found ? c.text : "The lane still keeps this secret."}</p><small>${c.cat}</small></article>`;
      })
      .join("");
  }

  setCalendar(items, today) {
    this.root.querySelector("#cal-body").innerHTML = items
      .map((f) => `<div>${f.name}${f.id === today.id ? " — <em>today</em>" : ""}</div>`)
      .join("");
  }

  drawMap(player, zones, found) {
    const c = this.root.querySelector("#map-canvas");
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#e7d3a0";
    ctx.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 220; i++) {
      ctx.strokeStyle = `rgba(120,80,40,${0.04 + Math.random() * 0.08})`;
      ctx.beginPath();
      ctx.moveTo(Math.random() * c.width, Math.random() * c.height);
      ctx.quadraticCurveTo(Math.random() * c.width, Math.random() * c.height, Math.random() * c.width, Math.random() * c.height);
      ctx.stroke();
    }
    ctx.strokeStyle = "#2f4ea8";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(80, 280);
    ctx.bezierCurveTo(200, 270, 500, 290, 780, 270);
    ctx.stroke();
    ctx.fillStyle = "#2a6a88";
    ctx.fillRect(40, 400, 820, 120);
    ctx.fillStyle = "#2f8a62";
    ctx.fillRect(480, 40, 360, 180);
    const toX = (x) => 420 + x * 4.2;
    const toY = (z) => 280 + z * 3.4;
    ctx.font = "16px 'IM Fell English', serif";
    for (const z of zones) {
      const known = found.has(z.id);
      ctx.fillStyle = known ? "#6a3a18" : "rgba(80,60,40,0.25)";
      ctx.beginPath();
      ctx.arc(toX(z.pos.x), toY(z.pos.z), 7, 0, Math.PI * 2);
      ctx.fill();
      if (known) ctx.fillText(z.title, toX(z.pos.x) + 10, toY(z.pos.z) - 6);
    }
    ctx.fillStyle = "#b8443c";
    ctx.beginPath();
    ctx.arc(toX(player.x), toY(player.z), 6, 0, Math.PI * 2);
    ctx.fill();
  }

  setPhoto(on) {
    this.photo = on;
    this.root.querySelector("#photo-bar").classList.toggle("open", on);
    this.root.querySelector("#hint").style.opacity = on ? "0" : "1";
    this.root.querySelector("#quest").style.opacity = on ? "0" : "1";
  }
}
