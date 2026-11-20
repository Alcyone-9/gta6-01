// hud.js — every piece of DOM and canvas HUD: cash, health, wanted stars,
// the objective banner, dialog box, speedometer, BUSTED meter, contextual
// hints, district name flashes and the 2D minimap.

import { fmtCash } from './rng.js';

export class Hud {
  constructor() {
    this.el = {};
    const ids = [
      'hud', 'cashLabel', 'cassetteLabel', 'hpFill', 'starsLabel', 'districtLabel',
      'objectiveLabel', 'dialogBox', 'dialogName', 'dialogText', 'speedo',
      'bustedWrap', 'bustedFill', 'hintLabel', 'toastLabel', 'minimap', 'phoneLabel',
    ];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.mapCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.toastTime = 0;
    this.lastDistrict = '';
    this.districtTime = 0;
  }

  show() {
    if (this.el.hud) this.el.hud.style.display = 'block';
  }
  hide() {
    if (this.el.hud) this.el.hud.style.display = 'none';
  }

  toast(text, seconds) {
    if (!this.el.toastLabel) return;
    this.el.toastLabel.textContent = text;
    this.el.toastLabel.style.opacity = '1';
    this.toastTime = seconds || 3;
  }

  update(dt, s) {
    if (this.toastTime > 0) {
      this.toastTime -= dt;
      if (this.toastTime <= 0 && this.el.toastLabel) this.el.toastLabel.style.opacity = '0';
    }
    if (this.el.cashLabel) this.el.cashLabel.textContent = fmtCash(s.cash);
    if (this.el.cassetteLabel) this.el.cassetteLabel.textContent = '📼 ' + s.cassettes + ' / 10';
    if (this.el.hpFill) {
      this.el.hpFill.style.width = Math.max(0, s.hp) + '%';
      this.el.hpFill.style.background = s.hp > 30 ? '#59d867' : '#e8433c';
    }
    if (this.el.starsLabel) {
      const stars = '★'.repeat(s.wanted) + '☆'.repeat(5 - s.wanted);
      this.el.starsLabel.textContent = stars;
      this.el.starsLabel.style.color = s.wanted > 0 ? '#ffd23e' : 'rgba(255,255,255,0.35)';
    }
    if (this.el.objectiveLabel) this.el.objectiveLabel.textContent = s.objective || '';
    if (this.el.phoneLabel) {
      this.el.phoneLabel.textContent = s.phoneText || '';
      this.el.phoneLabel.style.display = s.phoneText ? 'block' : 'none';
    }
    if (s.district && s.district !== this.lastDistrict) {
      this.lastDistrict = s.district;
      this.districtTime = 2.6;
      if (this.el.districtLabel) {
        this.el.districtLabel.textContent = s.district;
        this.el.districtLabel.style.opacity = '1';
      }
    }
    if (this.districtTime > 0) {
      this.districtTime -= dt;
      if (this.districtTime <= 0 && this.el.districtLabel) this.el.districtLabel.style.opacity = '0';
    }
    if (this.el.speedo) {
      if (s.driving) {
        this.el.speedo.style.display = 'block';
        this.el.speedo.textContent = Math.round(Math.abs(s.speed) * 3.6) + ' km/h';
      } else {
        this.el.speedo.style.display = 'none';
      }
    }
    if (this.el.bustedWrap) {
      if (s.busted > 0.02) {
        this.el.bustedWrap.style.display = 'block';
        this.el.bustedFill.style.width = Math.round(s.busted * 100) + '%';
      } else {
        this.el.bustedWrap.style.display = 'none';
      }
    }
    if (this.el.hintLabel) this.el.hintLabel.textContent = s.hint || '';
    this.drawMinimap(s);
  }

  showDialog(speaker, line) {
    if (!this.el.dialogBox) return;
    this.el.dialogBox.style.display = 'block';
    this.el.dialogName.textContent = speaker;
    this.el.dialogText.textContent = line;
  }
  hideDialog() {
    if (this.el.dialogBox) this.el.dialogBox.style.display = 'none';
  }

  drawMinimap(s) {
    const g = this.mapCtx;
    if (!g) return;
    const W = 176;
    const H = 176;
    const scale = W / 320;
    const toMap = (x, z) => [W / 2 + x * scale, H / 2 + z * scale];
    g.fillStyle = '#274b63';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#3f7a4d';
    g.fillRect(0, 0, W, H);
    // sea on the east
    const [seaX] = toMap(140, 0);
    g.fillStyle = '#2e86ab';
    g.fillRect(seaX, 0, W - seaX, H);
    g.fillStyle = '#eed9a0';
    const [sandX] = toMap(138, 0);
    g.fillRect(sandX, 0, Math.max(2, seaX - sandX + 6), H);
    // roads
    g.strokeStyle = '#22262b';
    g.lineWidth = 5;
    for (const c of [-112, -56, 0, 56, 112]) {
      const [rx] = toMap(c, 0);
      g.beginPath();
      g.moveTo(rx, 0);
      g.lineTo(rx, H);
      g.stroke();
      const [, rz] = toMap(0, c);
      g.beginPath();
      g.moveTo(0, rz);
      g.lineTo(W, rz);
      g.stroke();
    }
    const dot = (x, z, color, r) => {
      const [mx, my] = toMap(x, z);
      g.fillStyle = color;
      g.beginPath();
      g.arc(mx, my, r, 0, Math.PI * 2);
      g.fill();
    };
    if (s.cassettePts) for (const c of s.cassettePts) dot(c.x, c.z, '#ffe14d', 2);
    if (s.cops) for (const c of s.cops) dot(c.x, c.z, '#ff4444', 3);
    if (s.marker) dot(s.marker.x, s.marker.z, '#ffd23e', 4.5);
    // player arrow
    const [px, py] = toMap(s.playerX, s.playerZ);
    g.save();
    g.translate(px, py);
    g.rotate(Math.PI - (s.playerAngle || 0));
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4, 5);
    g.lineTo(-4, 5);
    g.closePath();
    g.fill();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, W - 2, H - 2);
  }
}
