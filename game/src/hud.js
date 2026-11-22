// Laguna Azul — the HUD. One job: stars, cash, health, speed, objective and
// the circular minimap, all updated from one state object every frame.
export class HUD {
  constructor() {
    this.starsEl = document.getElementById('hud-stars');
    this.cashEl = document.getElementById('hud-cash');
    this.healthFill = document.getElementById('hud-health-fill');
    this.healthText = document.getElementById('hud-health-text');
    this.speedEl = document.getElementById('hud-speed');
    this.objectiveEl = document.getElementById('hud-objective');
    this.missionEl = document.getElementById('hud-mission');
    this.timerEl = document.getElementById('hud-timer');
    this.ammoEl = document.getElementById('hud-ammo');
    this.toastEl = document.getElementById('hud-toast');
    this.crosshairEl = document.getElementById('hud-crosshair');
    this.minimap = document.getElementById('hud-minimap');
    this.mapCtx = this.minimap?.getContext('2d') || null;
    this._toastTimer = null;
    this._lastStars = -1;
    this._lastCash = -1;
  }

  showToast(text, ms = 4200) {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.classList.add('visible');
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('visible'), ms);
  }

  formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  update(state) {
    const wanted = state.wanted || 0;
    if (this.starsEl && wanted !== this._lastStars) {
      this._lastStars = wanted;
      let stars = '';
      for (let i = 0; i < 5; i++) stars += i < wanted ? '★' : '☆';
      this.starsEl.textContent = stars;
      this.starsEl.classList.toggle('hot', wanted >= 3);
    }
    if (this.cashEl && state.cash !== this._lastCash) {
      this._lastCash = state.cash;
      this.cashEl.textContent = `$${Math.floor(state.cash).toLocaleString('en-US')}`;
    }
    if (this.healthFill) {
      const hp = Math.max(0, Math.min(100, state.health ?? 100));
      this.healthFill.style.width = `${hp}%`;
      this.healthFill.classList.toggle('low', hp < 30);
    }
    if (this.healthText) this.healthText.textContent = `${Math.ceil(state.health ?? 100)} HP`;
    if (this.speedEl) {
      this.speedEl.textContent = state.inCar ? `${Math.round(state.speedKmh || 0)} km/h` : 'ON FOOT';
    }
    if (this.objectiveEl) this.objectiveEl.textContent = state.objective || '';
    if (this.missionEl) this.missionEl.textContent = state.missionTitle || 'FREE ROAM';
    if (this.timerEl) this.timerEl.textContent = this.formatTime(state.playSeconds || 0);
    if (this.ammoEl) this.ammoEl.textContent = state.inCar ? 'DRIVE' : `AMMO ${state.ammo ?? 0}`;
    if (this.crosshairEl) this.crosshairEl.style.display = state.inCar ? 'none' : 'block';
    this._drawMinimap(state);
  }

  _drawMinimap(state) {
    const ctx = this.mapCtx;
    if (!ctx || !this.minimap) return;
    const size = this.minimap.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 2;
    // world -> map: x in [-280, 340], z in [-200, 200]
    const scale = (size - 8) / 620;
    const toMapX = (x) => cx + (x - 30) * scale;
    const toMapY = (z) => cy + z * scale;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    // land + water
    ctx.fillStyle = '#3a3f45';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#1f9db4';
    ctx.fillRect(toMapX(0), toMapY(-180), 250 * scale, 360 * scale);
    // roads
    ctx.strokeStyle = '#5a5f68';
    ctx.lineWidth = 2;
    for (const z of [-120, -60, 0, 60, 120]) {
      ctx.beginPath();
      ctx.moveTo(toMapX(-260), toMapY(z));
      ctx.lineTo(toMapX(0), toMapY(z));
      ctx.stroke();
    }
    for (const x of [-220, -160, -100, -40]) {
      ctx.beginPath();
      ctx.moveTo(toMapX(x), toMapY(-180));
      ctx.lineTo(toMapX(x), toMapY(180));
      ctx.stroke();
    }
    // causeway
    ctx.strokeStyle = '#f2c230';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(toMapX(-12), toMapY(0));
    ctx.lineTo(toMapX(252), toMapY(0));
    ctx.stroke();
    // lighthouse island
    ctx.fillStyle = '#e8d29a';
    ctx.beginPath();
    ctx.arc(toMapX(272), toMapY(48), 15 * scale, 0, Math.PI * 2);
    ctx.fill();
    // mission marker
    if (state.missionTarget) {
      const mx = toMapX(state.missionTarget.x);
      const my = toMapY(state.missionTarget.z);
      ctx.fillStyle = '#f2c230';
      ctx.beginPath();
      ctx.arc(mx, my, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // traffic dots
    if (state.traffic) {
      ctx.fillStyle = '#dfe6ee';
      for (const car of state.traffic) {
        ctx.fillRect(toMapX(car.x) - 1.5, toMapY(car.z) - 1.5, 3, 3);
      }
    }
    // police dots (flashing red/blue)
    if (state.police) {
      const flash = Math.floor(performance.now() / 300) % 2 === 0;
      ctx.fillStyle = flash ? '#ff4444' : '#4488ff';
      for (const car of state.police) {
        ctx.beginPath();
        ctx.arc(toMapX(car.x), toMapY(car.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // player arrow
    const px = toMapX(state.playerX || 0);
    const py = toMapY(state.playerZ || 0);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.sin(state.playerHeading || 0), Math.cos(state.playerHeading || 0)) * -1 + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    // rim
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}
