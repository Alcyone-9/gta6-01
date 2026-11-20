// Coral City Heat v2 — the city itself: a five-by-five road grid on a harbour
// shore, now dressed to be read at speed. A gradient sky dome and a low sun
// disc sit over calibrated haze; towers vary in height, footprint and paint
// and carry canvas facades whose windows double as an emissive map, so the
// lit windows genuinely glow at golden hour. Ground floors get readable
// canvas shop signs (LUPE'S, MARINA MARKET, SABLE CABS…), awnings, benches,
// hydrants, traffic lights that cycle, two palm species, and a marina with
// sand, umbrellas, a timber dock and water that breathes. Four named
// districts — Downtown, Palm Heights, Portside, Marina — are exported for
// the HUD. Real shadow maps are off (headless capture stays smooth); every
// vehicle and character carries a soft blob shadow instead.

import * as THREE from 'three';
import { range, intRange, pick } from './rng.js';

/** Road centre-lines on both axes; the city is the square they span, plus the shore. */
export const ROADS = [-160, -80, 0, 80, 160];
export const ROAD_HALF = 7;
export const CITY_EDGE = 190;
export const SHORE_Z = 198;

export const LANDMARKS = {
  policeStation: { x: -168, z: -168 },
  hospital: { x: 168, z: -168 },
  garage: { x: 88, z: 88 },
  marinaDock: { x: 0, z: 226 },
  marinaPickup: { x: -24, z: 188 },
  dropOff: { x: -88, z: 24 },
  start: { x: 6, z: 24 },
  taxiPickup: { x: 96, z: -88 },
  taxiDrop: { x: -152, z: 96 },
  raceChecks: [
    { x: 80, z: -80 },
    { x: -80, z: -80 },
    { x: -80, z: 80 },
  ],
};

/** Named districts, checked in order; the HUD shows the first match. */
export const DISTRICTS = [
  { name: 'Marina', test: (x, z) => z > 148 },
  { name: 'Palm Heights', test: (x, z) => x > 55 && z < -40 },
  { name: 'Portside', test: (x, z) => x < -55 && z > 30 },
  { name: 'Downtown', test: () => true },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) if (d.test(x, z)) return d.name;
  return 'Downtown';
}

/** Is this ground position on asphalt? */
export function onRoad(x, z) {
  for (const r of ROADS) {
    if (Math.abs(x - r) < ROAD_HALF && Math.abs(z) < CITY_EDGE + 14) return true;
    if (Math.abs(z - r) < ROAD_HALF && Math.abs(x) < CITY_EDGE + 14) return true;
  }
  return false;
}

/** Canvas texture of lit and dark windows for a tower facade. */
function facadeTexture(rng, base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // Subtle vertical grime so big faces do not read as flat colour.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 16) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? '#ffe9a8' : 'rgba(18,28,42,0.88)';
      g.fillRect(x, y, 10, 10);
      if (lit) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, y, 10, 3); }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Readable shop sign: bold lettering on a painted board, drawn on canvas. */
function signTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.strokeStyle = fg;
  g.lineWidth = 5;
  g.strokeRect(8, 8, 496, 80);
  g.fillStyle = fg;
  g.font = 'bold 52px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Asphalt texture with a dashed centre line, repeated along the road.
 *  Speckle comes from the seeded stream: the city promises that a given
 *  ?seed= builds the same streets, and Math.random broke that promise. */
function asphaltTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#33383f';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#3b4048';
  for (let i = 0; i < 90; i++) g.fillRect(rng() * 64, rng() * 64, 2, 2);
  g.fillStyle = '#e8e4c8';
  g.fillRect(30, 6, 4, 20);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Gradient sky: warm at the horizon, deep blue up top, painted once. */
function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#2c5f9e');
  grad.addColorStop(0.42, '#7fb0d9');
  grad.addColorStop(0.68, '#f7c98b');
  grad.addColorStop(0.8, '#ffb26b');
  grad.addColorStop(1, '#ff9a5c');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const SHOP_SIGNS = [
  ["LUPE'S DINER", '#7a1f2b', '#ffd9a0'],
  ['MARINA MARKET', '#14586e', '#c8f2ff'],
  ['SABLE CABS', '#8a6d1c', '#fff3b0'],
  ['CORAL AUTO', '#274156', '#ffb03a'],
  ['HOTEL PALM', '#5b2a6e', '#f3d1ff'],
  ['PORTSIDE PAWN', '#3c4a2a', '#d8ffb0'],
  ['NOODLE BAR', '#8a3b12', '#ffe2b0'],
  ['CORAL PHARMACY', '#1d5c46', '#c8ffe8'],
  ['BAYSIDE BIKES', '#6e3410', '#ffd9a0'],
  ['PIER 9 COFFEE', '#31435c', '#dceeff'],
];

export function createCity(scene, rng) {
  const colliders = [];
  const addCollider = (x, z, w, d) => {
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  };
  const trafficLights = [];

  // ---- Sky, sun and light. Gradient dome + sun disc + warm directional.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(760, 24, 14),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(34, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff0b8, fog: false }),
  );
  sunDisc.position.set(-430, 150, 330);
  sunDisc.lookAt(0, 10, 0);
  scene.add(sunDisc);
  scene.background = new THREE.Color(0xf7c98b);
  scene.fog = new THREE.Fog(0xf2bd85, 170, 520);
  const sun = new THREE.DirectionalLight(0xffdfae, 2.7);
  sun.position.set(-120, 170, 90);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a6f4d, 0.95));

  // Base ground: sun-bleached grass-concrete between the blocks.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshLambertMaterial({ color: 0x77875f }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 60;
  scene.add(ground);

  // ---- Roads: long asphalt strips in both directions, markings along them.
  const asphalt = asphaltTexture(rng);
  const roadGeoLong = new THREE.PlaneGeometry(ROAD_HALF * 2, 430);
  for (const r of ROADS) {
    const texV = asphalt.clone();
    texV.needsUpdate = true;
    texV.repeat.set(1, 30);
    const v = new THREE.Mesh(roadGeoLong, new THREE.MeshLambertMaterial({ map: texV }));
    v.rotation.x = -Math.PI / 2;
    v.rotation.z = Math.PI / 2;
    v.position.set(r, 0.02, 0);
    scene.add(v);
    const texH = asphalt.clone();
    texH.needsUpdate = true;
    texH.repeat.set(30, 1);
    const h = new THREE.Mesh(roadGeoLong, new THREE.MeshLambertMaterial({ map: texH }));
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.021, r);
    scene.add(h);
  }

  // ---- Blocks: sidewalk slab, then a cluster of towers with setbacks.
  const facadeDefs = [
    ['#b08968', 0.42], ['#8fa3b8', 0.52], ['#c9a86a', 0.36], ['#7d8fa3', 0.56],
    ['#a3768f', 0.46], ['#6f8f7a', 0.4], ['#c47b4a', 0.48], ['#5d7fa6', 0.58],
  ];
  const facades = facadeDefs.map(([base, lit]) => {
    const tex = facadeTexture(rng, base, lit);
    return new THREE.MeshLambertMaterial({
      map: tex, emissive: 0xffb45e, emissiveMap: tex, emissiveIntensity: 0.38,
    });
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5348 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const slabMat = new THREE.MeshLambertMaterial({ color: 0xb9b3a4 });
  const gaps = [];
  for (let i = 0; i < ROADS.length - 1; i++) gaps.push([ROADS[i] + ROAD_HALF, ROADS[i + 1] - ROAD_HALF]);
  gaps.push([ROADS[ROADS.length - 1] + ROAD_HALF, CITY_EDGE + 12]);
  gaps.unshift([-CITY_EDGE - 12, ROADS[0] - ROAD_HALF]);

  let signIndex = 0;
  for (const [gx0, gx1] of gaps) {
    for (const [gz0, gz1] of gaps) {
      const cx = (gx0 + gx1) / 2;
      const cz = (gz0 + gz1) / 2;
      const w = gx1 - gx0;
      const d = gz1 - gz0;
      if (w < 20 || d < 20) continue;
      const slab = new THREE.Mesh(boxGeo, slabMat);
      slab.scale.set(w + 3, 0.24, d + 3);
      slab.position.set(cx, 0.12, cz);
      scene.add(slab);
      // One landmark block stays open: the garage forecourt south-east of centre.
      if (Math.abs(cx - 106) < 30 && Math.abs(cz - 106) < 30) continue;
      // The shore-front row stays open too: a waterfront promenade. Towers
      // here could swallow the marina pickup point (Job 1's first step sits
      // at z=188, inside this row) behind a collider the player can never
      // get within reach of, and they walled off the marina vista entirely.
      if (cz > 150) continue;
      const towers = rng() < 0.4 ? 1 : intRange(rng, 2, 4);
      for (let t = 0; t < towers; t++) {
        const bw = range(rng, 14, Math.min(30, w - 8));
        const bd = range(rng, 14, Math.min(30, d - 8));
        const bx = cx + range(rng, -1, 1) * Math.max(0, (w - bw) / 2 - 2);
        const bz = cz + range(rng, -1, 1) * Math.max(0, (d - bd) / 2 - 2);
        const downtownBoost = Math.hypot(bx, bz) < 120 ? 1.35 : 1;
        const height = range(rng, 13, 56) * downtownBoost * (rng() < 0.16 ? 1.55 : 1);
        const mat = pick(rng, facades);
        const tower = new THREE.Mesh(boxGeo, [roofMat, roofMat, roofMat, roofMat, mat, mat]);
        tower.scale.set(bw, height, bd);
        tower.position.set(bx, height / 2 + 0.24, bz);
        scene.add(tower);
        addCollider(bx, bz, bw + 0.4, bd + 0.4);
        if (rng() < 0.55) {
          const capH = range(rng, 2, 5);
          const cap = new THREE.Mesh(boxGeo, roofMat);
          cap.scale.set(bw * 0.5, capH, bd * 0.5);
          cap.position.set(bx, height + capH / 2 + 0.24, bz);
          scene.add(cap);
        }
        // Ground-floor shopfront on street-facing towers: sign + awning.
        if (height < 60 && rng() < 0.62) {
          const [label, bg, fg] = SHOP_SIGNS[signIndex % SHOP_SIGNS.length];
          signIndex += 1;
          const faceSouth = bz + bd / 2 <= SHORE_Z;
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(Math.min(13, bw * 0.8), 2.1),
            new THREE.MeshBasicMaterial({ map: signTexture(label, bg, fg) }),
          );
          sign.position.set(bx, 4.6, bz + (faceSouth ? bd / 2 + 0.06 : -bd / 2 - 0.06));
          if (!faceSouth) sign.rotation.y = Math.PI;
          scene.add(sign);
          const awning = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: new THREE.Color(bg) }));
          awning.scale.set(Math.min(13, bw * 0.8), 0.18, 2.2);
          awning.position.set(bx, 3.4, bz + (faceSouth ? bd / 2 + 1 : -bd / 2 - 1));
          awning.rotation.x = faceSouth ? 0.35 : -0.35;
          scene.add(awning);
        }
      }
    }
  }

  // ---- Landmark buildings: flat colours and a sign band so they read at speed.
  function landmark(x, z, w, d, h, color, band, label) {
    const b = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color }));
    b.scale.set(w, h, d);
    b.position.set(x, h / 2, z);
    scene.add(b);
    const stripe = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: band }));
    stripe.scale.set(w + 0.3, 1.6, d + 0.3);
    stripe.position.set(x, h - 2.2, z);
    scene.add(stripe);
    if (label) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(20, w * 0.85), 2.6),
        new THREE.MeshBasicMaterial({ map: signTexture(label, '#20303f', '#ffffff') }),
      );
      sign.position.set(x, h - 5.4, z + d / 2 + 0.08);
      scene.add(sign);
    }
    addCollider(x, z, w + 0.4, d + 0.4);
    return b;
  }
  landmark(LANDMARKS.policeStation.x, LANDMARKS.policeStation.z, 30, 22, 16, 0x4d6a8a, 0x2f6fd0, 'POLICE HQ');
  landmark(LANDMARKS.hospital.x, LANDMARKS.hospital.z, 30, 22, 20, 0xe8e4da, 0xd23b3b, 'CORAL GENERAL');
  landmark(LANDMARKS.garage.x - 14, LANDMARKS.garage.z - 14, 24, 18, 8, 0x707880, 0x27c2a5, 'TEAL GARAGE');

  // District name boards at the four quarter entrances — the city labels itself.
  const districtBoards = [
    ['DOWNTOWN', 12, -12], ['PALM HEIGHTS', 92, -92], ['PORTSIDE', -92, 92], ['MARINA', 12, 168],
  ];
  for (const [label, bx, bz] of districtBoards) {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 2.6),
      new THREE.MeshBasicMaterial({ map: signTexture(label, '#17352b', '#ffe9a8'), side: THREE.DoubleSide }),
    );
    board.position.set(bx, 4.4, bz);
    board.rotation.y = Math.PI / 4;
    scene.add(board);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.4, 6), new THREE.MeshLambertMaterial({ color: 0x3c4248 }));
    post.position.set(bx, 2.2, bz);
    scene.add(post);
  }

  // ---- Palms (two species), lamps, benches, hydrants along the avenues.
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.36, 6.5, 6);
  const trunkTallGeo = new THREE.CylinderGeometry(0.16, 0.3, 9.5, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const frondGeo = new THREE.ConeGeometry(2.6, 0.9, 7);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  const frondMat2 = new THREE.MeshLambertMaterial({ color: 0x57a83e });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.6, 5);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4248 });
  const bulbGeo = new THREE.SphereGeometry(0.32, 6, 5);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6e5136 });
  const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xd23b3b });
  for (const r of ROADS) {
    for (let s = -CITY_EDGE; s <= CITY_EDGE; s += 26) {
      if (rng() < 0.22) continue;
      for (const side of [-1, 1]) {
        const px = r + side * (ROAD_HALF + 2.2);
        const pz = s + range(rng, -3, 3);
        if (!onRoad(px, pz) && pz <= SHORE_Z - 4) {
          const tall = rng() < 0.45;
          const trunk = new THREE.Mesh(tall ? trunkTallGeo : trunkGeo, trunkMat);
          trunk.position.set(px, tall ? 4.75 : 3.25, pz);
          trunk.rotation.z = range(rng, -0.09, 0.09);
          trunk.rotation.x = range(rng, -0.05, 0.05);
          scene.add(trunk);
          const frond = new THREE.Mesh(frondGeo, tall ? frondMat2 : frondMat);
          frond.scale.setScalar(tall ? 1.25 : range(rng, 0.85, 1.15));
          frond.position.set(px + trunk.rotation.z * -6, tall ? 9.7 : 6.7, pz);
          frond.rotation.x = Math.PI;
          frond.rotation.y = rng() * Math.PI;
          scene.add(frond);
        }
        const lamp = new THREE.Mesh(poleGeo, poleMat);
        lamp.position.set(s + range(rng, -2, 2), 2.8, r + side * (ROAD_HALF + 1.2));
        scene.add(lamp);
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.copy(lamp.position);
        bulb.position.y = 5.7;
        scene.add(bulb);
        if (rng() < 0.3) {
          const bench = new THREE.Mesh(boxGeo, benchMat);
          bench.scale.set(2.2, 0.5, 0.6);
          bench.position.set(px, 0.5, pz + 4);
          scene.add(bench);
        }
        if (rng() < 0.14) {
          const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.8, 7), hydrantMat);
          hyd.position.set(r + side * (ROAD_HALF + 1.5), 0.4, s + 6);
          scene.add(hyd);
        }
      }
    }
  }

  // ---- Traffic lights at every crossing: pole, head, three lamps that cycle.
  const tlPoleGeo = new THREE.CylinderGeometry(0.1, 0.1, 4.6, 6);
  const tlHeadGeo = new THREE.BoxGeometry(0.55, 1.5, 0.55);
  const tlHeadMat = new THREE.MeshLambertMaterial({ color: 0x22262e });
  const tlMats = {
    red: new THREE.MeshBasicMaterial({ color: 0x571512 }),
    amber: new THREE.MeshBasicMaterial({ color: 0x57430f }),
    green: new THREE.MeshBasicMaterial({ color: 0x0f4718 }),
  };
  const tlLampGeo = new THREE.SphereGeometry(0.17, 8, 6);
  // Phase from the crossing's grid indices, NOT from its coordinates: every
  // road coordinate is a multiple of 80, so (rx + rz) % 2 was always 0 and
  // the whole city's lights cycled in lockstep instead of alternating.
  let tlIndex = 0;
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      const thisIndex = tlIndex;
      tlIndex += 1;
      const pole = new THREE.Mesh(tlPoleGeo, poleMat);
      pole.position.set(rx + ROAD_HALF + 1.1, 2.3, rz + ROAD_HALF + 1.1);
      scene.add(pole);
      const head = new THREE.Mesh(tlHeadGeo, tlHeadMat);
      head.position.set(rx + ROAD_HALF + 1.1, 5.1, rz + ROAD_HALF + 1.1);
      scene.add(head);
      const lamps = {};
      [['red', 0.48], ['amber', 0], ['green', -0.48]].forEach(([name, dy]) => {
        const lampMesh = new THREE.Mesh(tlLampGeo, tlMats[name].clone());
        lampMesh.position.set(rx + ROAD_HALF + 1.1, 5.1 + dy, rz + ROAD_HALF + 0.75);
        scene.add(lampMesh);
        lamps[name] = lampMesh.material;
      });
      trafficLights.push({ lamps, phase: thisIndex % 2 === 0 ? 0 : 5 });
    }
  }

  // ---- The shore: sand, umbrellas, a timber dock, animated water.
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(900, 26), new THREE.MeshLambertMaterial({ color: 0xe3cf9e }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, SHORE_Z + 10);
  scene.add(sand);
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x1f6f96, transparent: true, opacity: 0.92 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 200), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.25, SHORE_Z + 118);
  scene.add(water);
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xeafcff, transparent: true, opacity: 0.5 });
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(900, 1.6), foamMat);
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.05, SHORE_Z + 21.5);
  scene.add(foam);
  const umbrellaCols = [0xd94f3d, 0xe8b93e, 0x2fb3a6, 0xd97bb0];
  for (let i = 0; i < 9; i++) {
    const ux = range(rng, -170, 170);
    if (Math.abs(ux) < 14) continue; // keep the dock approach clear
    const um = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.7, 8), new THREE.MeshLambertMaterial({ color: pick(rng, umbrellaCols) }));
    um.position.set(ux, 2.1, SHORE_Z + range(rng, 4, 14));
    scene.add(um);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 5), poleMat);
    stick.position.set(ux, 1.05, um.position.z);
    scene.add(stick);
  }
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
  const dock = new THREE.Mesh(boxGeo, dockMat);
  dock.scale.set(10, 1, 34);
  dock.position.set(LANDMARKS.marinaDock.x, 0.5, SHORE_Z + 14);
  scene.add(dock);
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xa3742f });
  for (let i = 0; i < 7; i++) {
    const crate = new THREE.Mesh(boxGeo, crateMat);
    const s = range(rng, 1.4, 2.6);
    crate.scale.set(s, s, s);
    crate.position.set(range(rng, -34, 30), s / 2, range(rng, 178, 194));
    crate.rotation.y = rng() * Math.PI;
    scene.add(crate);
    addCollider(crate.position.x, crate.position.z, s + 0.3, s + 0.3);
  }

  /** Per-frame ambience: breathing water, lapping foam, cycling traffic lights. */
  function update(t) {
    water.position.y = -0.25 + Math.sin(t * 0.8) * 0.06;
    waterMat.color.setHSL(0.55, 0.62, 0.32 + Math.sin(t * 0.5) * 0.03);
    foam.position.z = SHORE_Z + 21.5 + Math.sin(t * 0.8 + 1) * 0.7;
    foamMat.opacity = 0.35 + Math.sin(t * 1.6) * 0.15;
    const cycle = Math.floor(t % 10);
    for (const tl of trafficLights) {
      const ph = (cycle + tl.phase) % 10;
      tl.lamps.red.color.setHex(ph >= 5 ? 0xff3b30 : 0x571512);
      tl.lamps.amber.color.setHex(ph === 4 || ph === 9 ? 0xffc02e : 0x57430f);
      tl.lamps.green.color.setHex(ph < 4 ? 0x2eff6a : 0x0f4718);
    }
  }

  return { colliders, waterMat, update };
}

/** Push a circle (x, z, radius) out of every AABB collider; returns corrected {x, z}. */
export function collideCircle(colliders, x, z, radius) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * radius;
      z = nz + (dz / d) * radius;
    } else {
      // Centre inside the box: leave by the nearest face.
      const left = x - c.minX;
      const right = c.maxX - x;
      const top = z - c.minZ;
      const bottom = c.maxZ - z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = c.minX - radius;
      else if (m === right) x = c.maxX + radius;
      else if (m === top) z = c.minZ - radius;
      else z = c.maxZ + radius;
    }
  }
  return { x, z };
}
