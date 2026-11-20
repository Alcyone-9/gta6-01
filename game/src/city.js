// city.js — builds Coral City: a 5x5 road grid, four named districts, a
// marina and beach on the east side, canvas-textured buildings and shop
// signs, palms, lamps, benches, hydrants and animated traffic lights.

import * as THREE from 'three';

export const ROAD_COORDS = [-112, -56, 0, 56, 112];
export const BLOCK_CENTERS = [-84, -28, 28, 84];
export const WORLD_EDGE = 138;

export function districtAt(x, z) {
  if (x > 92) return 'Marina';
  if (z > 66 && x >= -20) return 'Portside';
  if (z < -66) return 'Palm Heights';
  return 'Downtown';
}

function makeWindowTexture(rng, baseColor, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 256);
  const cols = 6;
  const rows = 14;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const lit = rng.float() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : '#2b3f52';
      g.fillRect(8 + x * 20, 10 + y * 17, 12, 10);
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(8 + x * 20, 10 + y * 17, 12, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.strokeStyle = fg;
  g.lineWidth = 5;
  g.strokeRect(6, 6, 500, 84);
  g.fillStyle = fg;
  g.font = 'bold 42px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const SHOP_SIGNS = [
  ["LUPE'S PAWNBROKER", '#20303c', '#ffd166'],
  ['MARINA MOTEL', '#7a2040', '#ffe8f0'],
  ['SABLE TAXI CO', '#8a6d00', '#fff3b0'],
  ['CORAL DINER', '#14532d', '#d9f99d'],
  ['PALM PHARMACY', '#134e4a', '#99f6e4'],
  ['PORTSIDE TACKLE', '#1e3a5f', '#bfdbfe'],
  ['GOLD CASSETTE RECORDS', '#3b2f0b', '#fde68a'],
  ['HOTEL SOLSTICE', '#4a1d6b', '#e9d5ff'],
];

class TrafficLight {
  constructor(scene, x, z, index) {
    this.x = x;
    this.z = z;
    this.index = index;
    this.group = new THREE.Group();
    this.group.position.set(x + 9, 0, z + 9);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2f353b });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 5.4, 6), poleMat);
    pole.position.y = 2.7;
    this.group.add(pole);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.9, 0.7), poleMat);
    box.position.y = 5.6;
    this.group.add(box);
    this.lampMats = [];
    const colors = [0xff4444, 0xffcc33, 0x33dd66];
    for (let i = 0; i < 3; i += 1) {
      const m = new THREE.MeshBasicMaterial({ color: 0x222222 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), m);
      lamp.position.set(0, 6.25 - i * 0.62, 0.4);
      this.group.add(lamp);
      this.lampMats.push({ mat: m, on: colors[i], off: 0x222222 });
    }
    scene.add(this.group);
  }
  update(t) {
    const cycle = (t + this.index * 1.7) % 12;
    // NS axis green first half, EW second half; lamp shown is the NS state.
    let active = 2;
    if (cycle < 5) active = 2;
    else if (cycle < 6) active = 1;
    else if (cycle < 11) active = 0;
    else active = 1;
    this.lampMats.forEach((l, i) => {
      l.mat.color.setHex(i === active ? l.on : l.off);
    });
  }
}

export class City {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = [];
    this.trafficLights = [];
    this.water = null;
    this.waterMat = null;
    this.build();
  }

  addCollider(x, z, w, d) {
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  collideCircle(x, z, r) {
    let px = x;
    let pz = z;
    for (const b of this.colliders) {
      const cx = Math.max(b.minX, Math.min(px, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
      const dx = px - cx;
      const dz = pz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          px = cx + (dx / d) * r;
          pz = cz + (dz / d) * r;
        } else {
          const left = px - b.minX;
          const right = b.maxX - px;
          const top = pz - b.minZ;
          const bot = b.maxZ - pz;
          const m = Math.min(left, right, top, bot);
          if (m === left) px = b.minX - r;
          else if (m === right) px = b.maxX + r;
          else if (m === top) pz = b.minZ - r;
          else pz = b.maxZ + r;
        }
      }
    }
    px = Math.max(-WORLD_EDGE - 30, Math.min(px, 196));
    pz = Math.max(-WORLD_EDGE, Math.min(pz, WORLD_EDGE));
    return [px, pz];
  }

  pointInBuilding(x, z, pad) {
    for (const b of this.colliders) {
      if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return true;
    }
    return false;
  }

  build() {
    const scene = this.scene;
    const rng = this.rng;

    scene.background = new THREE.Color(0xf7b267);
    scene.fog = new THREE.Fog(0xf2a65a, 120, 340);
    scene.add(new THREE.HemisphereLight(0xffe3b3, 0x3d5a73, 0.95));
    const sun = new THREE.DirectionalLight(0xffc37e, 1.9);
    sun.position.set(-90, 110, -55);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9fd8ff, 0.35);
    fill.position.set(70, 60, 90);
    scene.add(fill);

    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 4;
    skyCanvas.height = 256;
    const sg = skyCanvas.getContext('2d');
    const grad = sg.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#3f7fbf');
    grad.addColorStop(0.55, '#e8905a');
    grad.addColorStop(0.8, '#ffd98a');
    grad.addColorStop(1, '#ffe9c4');
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 4, 256);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(420, 18, 12),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
    );
    scene.add(sky);
    const sunBall = new THREE.Mesh(
      new THREE.SphereGeometry(14, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false })
    );
    sunBall.position.set(-260, 120, -160);
    scene.add(sunBall);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 560),
      new THREE.MeshLambertMaterial({ color: 0x77a05c })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    scene.add(ground);

    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 340),
      new THREE.MeshLambertMaterial({ color: 0xeed9a0 })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(163, 0.01, 0);
    scene.add(sand);

    this.waterMat = new THREE.MeshLambertMaterial({ color: 0x2e86ab, transparent: true, opacity: 0.88 });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(150, 340), this.waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(255, 0.12, 0);
    scene.add(this.water);

    const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
    for (const pz of [-70, -10, 50]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(34, 0.7, 5), pierMat);
      pier.position.set(196, 0.45, pz);
      scene.add(pier);
      for (let i = 0; i < 5; i += 1) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.6, 6), pierMat);
        post.position.set(182 + i * 8, 0.1, pz - 2.2);
        scene.add(post);
      }
    }

    this.buildRoads(scene);
    this.buildBlocks(scene, rng);
    this.buildProps(scene, rng);
    let idx = 0;
    for (const x of ROAD_COORDS) {
      for (const z of ROAD_COORDS) {
        this.trafficLights.push(new TrafficLight(scene, x, z, idx));
        idx += 1;
      }
    }
  }

  buildRoads(scene) {
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x33383e });
    const walkMat = new THREE.MeshLambertMaterial({ color: 0xb9b3a4 });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
    const span = 300;
    for (const c of ROAD_COORDS) {
      const roadV = new THREE.Mesh(new THREE.PlaneGeometry(15, span), roadMat);
      roadV.rotation.x = -Math.PI / 2;
      roadV.position.set(c, 0.02, 0);
      scene.add(roadV);
      const roadH = new THREE.Mesh(new THREE.PlaneGeometry(span, 15), roadMat);
      roadH.rotation.x = -Math.PI / 2;
      roadH.position.set(0, 0.021, c);
      scene.add(roadH);
      for (const s of [-9.4, 9.4]) {
        const wv = new THREE.Mesh(new THREE.PlaneGeometry(3.4, span), walkMat);
        wv.rotation.x = -Math.PI / 2;
        wv.position.set(c + s, 0.03, 0);
        scene.add(wv);
        const wh = new THREE.Mesh(new THREE.PlaneGeometry(span, 3.4), walkMat);
        wh.rotation.x = -Math.PI / 2;
        wh.position.set(0, 0.031, c + s);
        scene.add(wh);
      }
      for (let t = -140; t < 145; t += 12) {
        if (ROAD_COORDS.some((r) => Math.abs(t - r) < 11)) continue;
        const dashV = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 5), lineMat);
        dashV.rotation.x = -Math.PI / 2;
        dashV.position.set(c, 0.04, t);
        scene.add(dashV);
        const dashH = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), lineMat);
        dashH.rotation.x = -Math.PI / 2;
        dashH.position.set(t, 0.041, c);
        scene.add(dashH);
      }
    }
  }

  buildBlocks(scene, rng) {
    const palette = ['#e8e3d9', '#d9c8a9', '#b8ccd4', '#e6b8a2', '#cfd8b0', '#e3d0e8', '#f2e3c6', '#a9c6de'];
    const signMats = SHOP_SIGNS.map(([t, bg, fg]) => new THREE.MeshBasicMaterial({ map: makeSignTexture(t, bg, fg) }));
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b5a4a });
    let signIdx = 0;
    for (const bx of BLOCK_CENTERS) {
      for (const bz of BLOCK_CENTERS) {
        const district = districtAt(bx, bz);
        const slots = [[-10, -10], [10, -10], [-10, 10], [10, 10]];
        for (const [ox, oz] of slots) {
          if (rng.float() < 0.14) continue;
          const tall = district === 'Downtown';
          const h = tall ? rng.range(16, 44) : rng.range(7, 22);
          const w = rng.range(13, 17);
          const d = rng.range(13, 17);
          const x = bx + ox;
          const z = bz + oz;
          const tex = makeWindowTexture(rng, rng.pick(palette), h > 18 ? 0.34 : 0.2);
          const wallMat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x2a1c08 });
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [wallMat, wallMat, roofMat, roofMat, wallMat, wallMat]);
          mesh.position.set(x, h / 2, z);
          scene.add(mesh);
          this.addCollider(x, z, w, d);
          // Air-conditioning boxes on a few roofs, very tropical.
          if (rng.float() < 0.5) {
            const ac = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 1.6), new THREE.MeshLambertMaterial({ color: 0xb9c0c4 }));
            ac.position.set(x + rng.range(-4, 4), h + 0.5, z + rng.range(-4, 4));
            scene.add(ac);
          }
          // Ground-floor shop sign facing the nearest road.
          if (h < 20 && rng.float() < 0.55) {
            const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.7), signMats[signIdx % signMats.length]);
            signIdx += 1;
            sign.position.set(x, 3.4, z - d / 2 - 0.06);
            sign.rotation.y = Math.PI;
            scene.add(sign);
          }
        }
      }
    }
  }

  buildProps(scene, rng) {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3e9e4f });
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x394048 });
    const lampGlow = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
    const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xd23b2e });

    const palmSpots = [];
    for (const c of ROAD_COORDS) {
      for (let t = -126; t <= 126; t += 28) {
        palmSpots.push([c + 11.5, t + rng.range(-3, 3)]);
        palmSpots.push([t + rng.range(-3, 3), c - 11.5]);
      }
    }
    for (let i = 0; i < 16; i += 1) palmSpots.push([146 + rng.range(0, 8), rng.range(-130, 130)]);
    for (const [x, z] of palmSpots) {
      if (this.pointInBuilding(x, z, 1)) continue;
      const palm = new THREE.Group();
      const lean = rng.range(0.6, 1.6);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 6.4, 6), trunkMat);
      trunk.position.set(lean / 2, 3.2, 0);
      trunk.rotation.z = -Math.atan2(lean, 6.4);
      palm.add(trunk);
      for (let f = 0; f < 6; f += 1) {
        const frond = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.6, 4), leafMat);
        const a = (f / 6) * Math.PI * 2;
        frond.position.set(lean + Math.cos(a) * 1.1, 6.6, Math.sin(a) * 1.1);
        frond.rotation.set(Math.sin(a) * 1.1, 0, Math.cos(a) * 1.1 + Math.PI);
        palm.add(frond);
      }
      palm.position.set(x, 0, z);
      palm.rotation.y = rng.range(0, Math.PI * 2);
      scene.add(palm);
    }

    for (const x of ROAD_COORDS) {
      for (const z of ROAD_COORDS) {
        for (const [ox, oz] of [[-10.5, -10.5], [10.5, 10.5]]) {
          const lamp = new THREE.Group();
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.6, 6), lampMat);
          pole.position.y = 2.8;
          lamp.add(pole);
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), lampGlow);
          bulb.position.y = 5.7;
          lamp.add(bulb);
          lamp.position.set(x + ox, 0, z + oz);
          scene.add(lamp);
        }
      }
    }

    for (let i = 0; i < 26; i += 1) {
      const road = rng.pick(ROAD_COORDS);
      const along = rng.range(-130, 130);
      const side = rng.sign() * 9.4;
      const horizontal = rng.chance(0.5);
      const x = horizontal ? along : road + side;
      const z = horizontal ? road + side : along;
      if (this.pointInBuilding(x, z, 0.5)) continue;
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.8), benchMat);
      bench.position.set(x, 0.45, z);
      bench.rotation.y = horizontal ? 0 : Math.PI / 2;
      scene.add(bench);
      if (rng.chance(0.6)) {
        const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.9, 8), hydrantMat);
        hyd.position.set(x + 1.8, 0.45, z + 0.6);
        scene.add(hyd);
      }
    }
  }

  update(dt, t) {
    void dt;
    if (this.water) {
      this.water.position.y = 0.12 + Math.sin(t * 0.9) * 0.05;
      this.waterMat.opacity = 0.84 + Math.sin(t * 0.6) * 0.05;
    }
    for (const tl of this.trafficLights) tl.update(t);
  }

  lightPhaseFor(intersectionIndex, axis, t) {
    const cycle = (t + intersectionIndex * 1.7) % 12;
    if (axis === 'z') return cycle < 5 ? 'green' : cycle < 6 ? 'yellow' : 'red';
    return cycle < 6 ? 'red' : cycle < 11 ? 'green' : 'yellow';
  }

  nearestIntersectionIndex(x, z) {
    let best = 0;
    let bestD = Infinity;
    let idx = 0;
    for (let ix = 0; ix < ROAD_COORDS.length; ix += 1) {
      for (let iz = 0; iz < ROAD_COORDS.length; iz += 1) {
        const dx = x - ROAD_COORDS[ix];
        const dz = z - ROAD_COORDS[iz];
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = idx;
        }
        idx += 1;
      }
    }
    return best;
  }
}
