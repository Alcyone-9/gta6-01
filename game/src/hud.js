// Coral City Heat v2 — everything drawn over the 3D view: health, cash, stars,
// the district name, the hidden-collectible counter, the objective card,
// phone messages, banners, the bust meter, the speedometer, a music/mute
// indicator and the canvas minimap (roads, shore, district tint, the
// player's arrow, the mission marker, collectible glints and every police
// and traffic blip worth knowing about).

import { ROADS, ROAD_HALF, SHORE_Z } from './city.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const hud = el('hud');
  const starsEl = el('stars');
  const moneyEl = el('money');
  const clockEl = el('clock');
  const districtEl = el('district');
  const collectEl = el('collect-count');
  const musicEl = el('music-state');
  const healthFill = el('healthbar').firstElementChild;
  const bustWrap = el('bustwrap');
  const bustFill = el('bustbar').firstElementChild;
  const objTitle = el('obj-title');
  const objText = el('obj-text');
  const phoneEl = el('phone');
  const phoneFrom = el('phone-from');
  const phoneMsg = el('phone-msg');
  const bannerEl = el('banner');
  const bannerBig = el('banner-big');
  const bannerSub = el('banner-sub');
  const promptEl = el('prompt');
  const speedoEl = el('speedo');
  const speedNum = el('speed-num');
  const hitEl = el('hitmarker');
  const mapCtx = el('minimap').getContext('2d');
  let phoneTimer = null;
  let bannerTimer = null;
  let lastStars = -1;

  function phone(from, msg, holdMs = 6500) {
    phoneFrom.textContent = `✆ ${from}`;
    phoneMsg.textContent = msg;
    phoneEl.classList.add('show');
    if (phoneTimer) clearTimeout(phoneTimer);
    phoneTimer = setTimeout(() => phoneEl.classList.remove('show'), holdMs);
  }

  function banner(big, sub, holdMs = 3400) {
    bannerBig.textContent = big;
    bannerSub.textContent = sub || '';
    bannerEl.classList.add('show');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => bannerEl.classList.remove('show'), holdMs);
  }

  function hitmark() {
    hitEl.style.opacity = '1';
    setTimeout(() => { hitEl.style.opacity = '0'; }, 90);
  }

  function setStars(n) {
    if (n === lastStars) return;
    lastStars = n;
    let html = '';
    for (let i = 0; i < 5; i++) html += i < n ? '★' : '<span class="off">★</span>';
    starsEl.innerHTML = html;
  }

  const WORLD = 235; // half-extent mapped onto the minimap
  function toMap(x, z) {
    return [((x + WORLD) / (WORLD * 2)) * 188, ((z + WORLD) / (WORLD * 2)) * 188];
  }

  function drawMinimap(view) {
    const g = mapCtx;
    g.fillStyle = '#22384a';
    g.fillRect(0, 0, 188, 188);
    // Water south of the shore line.
    const [, shoreY] = toMap(0, SHORE_Z);
    g.fillStyle = '#1f6f96';
    g.fillRect(0, shoreY, 188, 188 - shoreY);
    g.fillStyle = '#e3cf9e';
    g.fillRect(0, shoreY - 2, 188, 3);
    // Roads.
    g.strokeStyle = '#4a5a68';
    g.lineWidth = Math.max(2, (ROAD_HALF * 2 / (WORLD * 2)) * 188);
    for (const r of ROADS) {
      const [rx] = toMap(r, 0);
      g.beginPath(); g.moveTo(rx, 0); g.lineTo(rx, shoreY); g.stroke();
      const [, ry] = toMap(0, r);
      g.beginPath(); g.moveTo(0, ry); g.lineTo(188, ry); g.stroke();
    }
    // District label for wherever the player stands.
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = 'bold 8px sans-serif';
    g.fillText((view.district || 'DOWNTOWN').toUpperCase(), 6, 12);
    // Traffic blips.
    g.fillStyle = '#aeb9c2';
    for (const c of view.traffic) {
      const [x, y] = toMap(c.x, c.z);
      g.fillRect(x - 1, y - 1, 2, 2);
    }
    // Unfound collectibles glint teal.
    if (view.collectibles) {
      g.fillStyle = '#2fe8c8';
      for (const c of view.collectibles) {
        const [x, y] = toMap(c.x, c.z);
        g.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
    // The rival courier, when a job has one loose in the city.
    if (view.rival) {
      const [x, y] = toMap(view.rival.x, view.rival.z);
      g.fillStyle = '#c86bff';
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
    // Police blips flash blue/red.
    const flash = Math.floor(performance.now() / 350) % 2 === 0;
    for (const c of view.cops) {
      const [x, y] = toMap(c.x, c.z);
      g.fillStyle = flash ? '#3d8bff' : '#ff5147';
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
    if (view.officers) {
      for (const c of view.officers) {
        const [x, y] = toMap(c.x, c.z);
        g.fillStyle = flash ? '#ff5147' : '#3d8bff';
        g.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
    if (view.roadblock) {
      for (const c of view.roadblock) {
        const [x, y] = toMap(c.x, c.z);
        g.fillStyle = '#ff5147';
        g.fillRect(x - 2, y - 2, 4, 4);
      }
    }
    // Mission marker: a gold diamond that breathes.
    if (view.marker) {
      const [x, y] = toMap(view.marker.x, view.marker.z);
      const s = 5 + Math.sin(performance.now() / 280) * 1.4;
      g.fillStyle = '#ffd23e';
      g.beginPath();
      g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.5)';
      g.lineWidth = 1;
      g.stroke();
    }
    // Player arrow.
    const [px, py] = toMap(view.player.x, view.player.z);
    g.save();
    g.translate(px, py);
    g.rotate(Math.PI - view.player.heading);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -6); g.lineTo(4.4, 5); g.lineTo(0, 2.4); g.lineTo(-4.4, 5);
    g.closePath(); g.fill();
    g.restore();
  }

  return {
    show() { hud.classList.remove('hidden'); },
    phone,
    banner,
    hitmark,
    setStars,
    setMoney(n) { moneyEl.textContent = `$${n.toLocaleString()}`; },
    setHealth(ratio) { healthFill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`; },
    setBust(ratio) {
      const r = Math.max(0, Math.min(1, ratio));
      bustWrap.classList.toggle('hidden', r <= 0.01);
      bustFill.style.width = `${r * 100}%`;
      // The bar turns arrest-red as it fills, so the danger reads at a glance.
      bustFill.style.filter = r > 0.66 ? 'hue-rotate(-48deg) saturate(1.6)' : '';
    },
    setObjective(title, text) {
      if (objTitle.textContent !== title) objTitle.textContent = title;
      if (objText.textContent !== text) objText.textContent = text;
    },
    /** Clock line (legacy id) plus the named-district line under it. */
    setDistrict(name) {
      if (districtEl && districtEl.textContent !== name) districtEl.textContent = name;
      if (clockEl && clockEl.textContent !== 'Coral City') clockEl.textContent = 'Coral City';
    },
    setCollectibles(found, total) {
      if (collectEl) collectEl.textContent = `◆ ${found}/${total}`;
    },
    setMusic(muted) {
      if (musicEl) musicEl.textContent = muted ? '♪ OFF (M)' : '♪ ON (M)';
    },
    setPrompt(html) {
      if (html) {
        promptEl.innerHTML = html;
        promptEl.classList.remove('hidden');
      } else {
        promptEl.classList.add('hidden');
      }
    },
    setSpeed(kmh, driving) {
      speedoEl.classList.toggle('hidden', !driving);
      if (driving) speedNum.textContent = String(Math.round(Math.abs(kmh)));
    },
    drawMinimap,
  };
}
