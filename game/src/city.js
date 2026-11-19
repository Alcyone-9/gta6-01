// Coral City Heat — the city itself: a five-by-five road grid on a harbour shore.
// Everything is procedural and seeded: asphalt with painted markings, sidewalks,
// window-lit towers made from canvas textures, palms, lamps, and a marina where the
// land gives up and the water starts. Buildings register AABB colliders; the road
// layout is exported so traffic, pedestrians and the minimap all agree on the map.

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
};

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
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 16) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? '#ffe9a8' : 'rgba(20,30,44,0.85)';
      g.fillRect(x, y, 10, 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Asphalt texture with a dashed centre line, repeated along the road. */
function asphaltTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#33383f';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#3b4048';
  for (let i = 0; i < 90; i++) g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  g.fillStyle = '#e8e4c8';
  g.fillRect(30, 6, 4, 20);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCity(scene, rng) {
  const colliders = [];
  const addCollider = (x, z, w, d) => {
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  };

  // Golden-hour light: warm sun, soft sky fill, haze at the horizon.
  scene.background = new THREE.Color(0xf7c98b);
  scene.fog = new THREE.Fog(0xf7c98b, 190, 460);
  const sun = new THREE.DirectionalLight(0xffdfae, 2.6);
  sun.position.set(-120, 170, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -230;
  sun.shadow.camera.right = 230;
  sun.shadow.camera.top = 230;
  sun.shadow.camera.bottom = -230;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a6f4d, 0.85));

  // Base ground: sun-bleached grass-concrete between the blocks.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshLambertMaterial({ color: 0x77875f }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 60;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- Roads: long asphalt strips in both directions, markings along them.
  const asphalt = asphaltTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: asphalt });
  const roadGeoLong = new THREE.PlaneGeometry(ROAD_HALF * 2, 430);
  for (const r of ROADS) {
    const texV = asphalt.clone();
    texV.needsUpdate = true;
    texV.repeat.set(1, 30);
    const matV = new THREE.MeshLambertMaterial({ map: texV });
    const v = new THREE.Mesh(roadGeoLong, matV);
    v.rotation.x = -Math.PI / 2;
    v.rotation.z = Math.PI / 2;
    v.position.set(r, 0.02, 0);
    v.receiveShadow = true;
    scene.add(v);
    const texH = asphalt.clone();
    texH.needsUpdate = true;
    texH.repeat.set(30, 1);
    const matH = new THREE.MeshLambertMaterial({ map: texH });
    const h = new THREE.Mesh(roadGeoLong, matH);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.021, r);
    h.receiveShadow = true;
    scene.add(h);
  }

  // ---- Blocks: sidewalk slab, then a cluster of towers with setbacks.
  const facades = [
    facadeTexture(rng, '#b08968', 0.4),
    facadeTexture(rng, '#8fa3b8', 0.5),
    facadeTexture(rng, '#c9a86a', 0.35),
    facadeTexture(rng, '#7d8fa3', 0.55),
    facadeTexture(rng, '#a3768f', 0.45),
  ];
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5348 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const slabMat = new THREE.MeshLambertMaterial({ color: 0xb9b3a4 });
  const gaps = [];
  for (let i = 0; i < ROADS.length - 1; i++) gaps.push([ROADS[i] + ROAD_HALF, ROADS[i + 1] - ROAD_HALF]);
  gaps.push([ROADS[ROADS.length - 1] + ROAD_HALF, CITY_EDGE + 12]);
  gaps.unshift([-CITY_EDGE - 12, ROADS[0] - ROAD_HALF]);

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
      slab.receiveShadow = true;
      scene.add(slab);
      // One landmark block stays open: the garage forecourt south-east of centre.
      if (Math.abs(cx - 106) < 30 && Math.abs(cz - 106) < 30) continue;
      const towers = rng() < 0.45 ? 1 : intRange(rng, 2, 4);
      for (let t = 0; t < towers; t++) {
        const bw = range(rng, 14, Math.min(30, w - 8));
        const bd = range(rng, 14, Math.min(30, d - 8));
        const bx = cx + range(rng, -1, 1) * Math.max(0, (w - bw) / 2 - 2);
        const bz = cz + range(rng, -1, 1) * Math.max(0, (d - bd) / 2 - 2);
        const height = range(rng, 14, 58) * (rng() < 0.18 ? 1.5 : 1);
        const mat = new THREE.MeshLambertMaterial({ map: pick(rng, facades) });
        const tower = new THREE.Mesh(boxGeo, [roofMat, roofMat, roofMat, roofMat, mat, mat]);
        tower.scale.set(bw, height, bd);
        tower.position.set(bx, height / 2 + 0.24, bz);
        tower.castShadow = true;
        tower.receiveShadow = true;
        scene.add(tower);
        addCollider(bx, bz, bw + 0.4, bd + 0.4);
        if (rng() < 0.5) {
          const capH = range(rng, 2, 5);
          const cap = new THREE.Mesh(boxGeo, roofMat);
          cap.scale.set(bw * 0.5, capH, bd * 0.5);
          cap.position.set(bx, height + capH / 2 + 0.24, bz);
          cap.castShadow = true;
          scene.add(cap);
        }
      }
    }
  }

  // ---- Landmark buildings: flat colours and a sign band so they read at speed.
  function landmark(x, z, w, d, h, color, band) {
    const mat = new THREE.MeshLambertMaterial({ color });
    const b = new THREE.Mesh(boxGeo, mat);
    b.scale.set(w, h, d);
    b.position.set(x, h / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);
    const stripe = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: band }));
    stripe.scale.set(w + 0.3, 1.6, d + 0.3);
    stripe.position.set(x, h - 2.2, z);
    scene.add(stripe);
    addCollider(x, z, w + 0.4, d + 0.4);
    return b;
  }
  landmark(LANDMARKS.policeStation.x, LANDMARKS.policeStation.z, 30, 22, 16, 0x4d6a8a, 0x2f6fd0); // police HQ, blue band
  landmark(LANDMARKS.hospital.x, LANDMARKS.hospital.z, 30, 22, 20, 0xe8e4da, 0xd23b3b); // hospital, red band
  landmark(LANDMARKS.garage.x - 14, LANDMARKS.garage.z - 14, 24, 18, 8, 0x707880, 0x27c2a5); // garage, teal band

  // ---- Palms and street lamps along the avenues (shared geometry, many meshes).
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.5, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const frondGeo = new THREE.ConeGeometry(2.5, 0.9, 7);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.6, 5);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4248 });
  const bulbGeo = new THREE.SphereGeometry(0.32, 6, 5);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const r of ROADS) {
    for (let s = -CITY_EDGE; s <= CITY_EDGE; s += 26) {
      if (rng() < 0.25) continue;
      for (const side of [-1, 1]) {
        const px = r + side * (ROAD_HALF + 2.2);
        const pz = s + range(rng, -3, 3);
        if (onRoad(px, pz) || pz > SHORE_Z - 4) continue;
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(px, 3.25, pz);
        trunk.rotation.z = range(rng, -0.06, 0.06);
        trunk.castShadow = true;
        scene.add(trunk);
        const frond = new THREE.Mesh(frondGeo, frondMat);
        frond.position.set(px, 6.7, pz);
        frond.rotation.x = Math.PI;
        scene.add(frond);
        const lamp = new THREE.Mesh(poleGeo, poleMat);
        lamp.position.set(s + range(rng, -2, 2), 2.8, r + side * (ROAD_HALF + 1.2));
        scene.add(lamp);
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.copy(lamp.position);
        bulb.position.y = 5.7;
        scene.add(bulb);
      }
    }
  }

  // ---- The shore: sand, a timber dock reaching into animated-looking water.
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(760, 26), new THREE.MeshLambertMaterial({ color: 0xe3cf9e }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, SHORE_Z + 10);
  sand.receiveShadow = true;
  scene.add(sand);
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x1f6f96, transparent: true, opacity: 0.92 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(760, 190), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.25, SHORE_Z + 118);
  scene.add(water);
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
  const dock = new THREE.Mesh(boxGeo, dockMat);
  dock.scale.set(10, 1, 34);
  dock.position.set(LANDMARKS.marinaDock.x, 0.5, SHORE_Z + 14);
  dock.castShadow = true;
  scene.add(dock);
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xa3742f });
  for (let i = 0; i < 7; i++) {
    const crate = new THREE.Mesh(boxGeo, crateMat);
    const s = range(rng, 1.4, 2.6);
    crate.scale.set(s, s, s);
    crate.position.set(range(rng, -34, 30), s / 2, range(rng, 178, 194));
    crate.rotation.y = rng() * Math.PI;
    crate.castShadow = true;
    scene.add(crate);
    addCollider(crate.position.x, crate.position.z, s + 0.3, s + 0.3);
  }

  return { colliders, waterMat };
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
