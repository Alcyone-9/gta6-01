// Coral City Heat v2 — pedestrians. They stroll the sidewalks, cross at
// corners, and run screaming from gunfire, punches and cars bearing down on
// them. Figures now have proper proportions — head, torso, swinging arms on
// shoulder pivots and legs on hip pivots, a little bob as they walk, and a
// soft blob shadow — so crowds read as people, not blocks. A ped who is
// knocked down may drop the cash in their pockets; the main loop turns that
// into a pickup and a wanted problem for whoever was driving.

import * as THREE from 'three';
import { ROADS, ROAD_HALF, CITY_EDGE, SHORE_Z } from './city.js';
import { pick, range, clamp } from './rng.js';

const SKIN = [0xe8b48c, 0xc68863, 0x8a5a3b, 0xf0c8a0, 0x6e4530];
const SHIRT = [0xd94f3d, 0x3d7bd9, 0xe8e4da, 0x53b06a, 0xe8b93e, 0x9b59b6, 0x2fb3a6, 0x30343c, 0xff7a59, 0x27c2a5];
const PANTS = [0x2c3440, 0x5a4632, 0x707880, 0x243447, 0x8a8f96, 0x3d2f23];
const HAIR = [0x1d1710, 0x3a2a18, 0x6e5136, 0xb08968, 0xd9d9d9];

const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}
const blobGeo = new THREE.CircleGeometry(0.55, 12);
const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });

/** A standing figure with articulated arms and legs; reused for officers. */
export function createFigure(rng, palette = null) {
  const shirt = palette ? palette.shirt : pick(rng, SHIRT);
  const pants = palette ? palette.pants : pick(rng, PANTS);
  const skin = palette ? palette.skin : pick(rng, SKIN);
  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.68, 0.28), mat(shirt));
  torso.position.y = 1.1;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(skin));
  head.position.y = 1.66;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 6, 0, Math.PI * 2, 0, 1.25), mat(palette ? palette.hair : pick(rng, HAIR)));
  hair.position.y = 1.69;
  group.add(hair);

  const limbs = { legs: [], arms: [] };
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.13, 0.78, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.78, 0.21), mat(pants));
    leg.position.y = -0.39;
    hip.add(leg);
    group.add(hip);
    limbs.legs.push(hip);
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.33, 1.4, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.62, 0.18), mat(shirt));
    arm.position.y = -0.31;
    shoulder.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), mat(skin));
    hand.position.y = -0.64;
    shoulder.add(hand);
    group.add(shoulder);
    limbs.arms.push(shoulder);
  }
  const blob = new THREE.Mesh(blobGeo, blobMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = -0.21;
  group.add(blob);
  group.userData.legs = limbs.legs;
  group.userData.arms = limbs.arms;
  return group;
}

export function createPedMesh(rng) {
  return createFigure(rng);
}

export function createPeds(scene, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const mesh = createPedMesh(rng);
    scene.add(mesh);
    const ped = {
      mesh,
      axis: rng() < 0.5 ? 'x' : 'z',
      line: pick(rng, ROADS),
      side: rng() < 0.5 ? -1 : 1,
      dir: rng() < 0.5 ? 1 : -1,
      along: range(rng, -CITY_EDGE + 10, CITY_EDGE - 10),
      speed: range(rng, 1.2, 2.0),
      state: 'walk', // walk | cross | flee | down
      stateT: 0,
      cycle: range(rng, 0, 6),
      cashDropped: false,
      get x() { return mesh.position.x; },
      get z() { return mesh.position.z; },
    };
    placePed(ped);
    peds.push(ped);
  }
  return peds;
}

function sidewalkPos(ped) {
  const off = ped.side * (ROAD_HALF + 2.6);
  if (ped.axis === 'x') return { x: ped.along, z: ped.line + off };
  return { x: ped.line + off, z: ped.along };
}

function placePed(ped) {
  const p = sidewalkPos(ped);
  ped.mesh.position.set(p.x, 0.24, p.z);
  ped.mesh.rotation.y = ped.axis === 'x' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI);
}

export function knockDown(ped) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.stateT = 7;
  ped.mesh.rotation.x = -Math.PI / 2;
  ped.mesh.position.y = 0.35;
}

/** Scare every ped within radius of a point: they flee directly away from it.
 *  The flee direction is stored NORMALISED (with a random direction when a
 *  ped is standing exactly on the scare point), so stepPeds never has to
 *  re-derive — or mis-derive — it from a near-zero vector. */
export function scarePeds(peds, x, z, radius) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - x;
    const dz = ped.z - z;
    if (dx * dx + dz * dz < radius * radius) {
      ped.state = 'flee';
      ped.stateT = range(Math.random, 1.6, 3.2);
      const len = Math.hypot(dx, dz);
      if (len > 0.01) {
        ped.fleeX = dx / len;
        ped.fleeZ = dz / len;
      } else {
        const a = Math.random() * Math.PI * 2;
        ped.fleeX = Math.sin(a);
        ped.fleeZ = Math.cos(a);
      }
    }
  }
}

/** Swing a figure's arms and legs for a walk cycle at the given speed. */
export function animateFigure(mesh, cycle, speedRatio) {
  const swing = Math.sin(cycle) * 0.55 * Math.min(1, speedRatio + 0.15);
  const legs = mesh.userData.legs;
  const arms = mesh.userData.arms;
  if (legs) { legs[0].rotation.x = swing; legs[1].rotation.x = -swing; }
  if (arms) { arms[0].rotation.x = -swing * 0.85; arms[1].rotation.x = swing * 0.85; }
}

export function stepPeds(peds, dt, rng, collidersHit) {
  for (const ped of peds) {
    if (ped.state === 'down') {
      ped.stateT -= dt;
      if (ped.stateT <= 0) {
        ped.state = 'walk';
        ped.mesh.rotation.x = 0;
        // Fresh pockets on the next encounter: without this reset a ped who
        // once dropped cash could never drop again for the whole session.
        ped.cashDropped = false;
        placePed(ped);
      }
      continue;
    }
    let speed = ped.speed;
    let moving = true;
    if (ped.state === 'flee') {
      speed = 4.6;
      ped.stateT -= dt;
      const fx = ped.fleeX ?? 1;
      const fz = ped.fleeZ ?? 0;
      ped.mesh.position.x += fx * speed * dt;
      ped.mesh.position.z += fz * speed * dt;
      ped.mesh.rotation.y = Math.atan2(fx, fz);
      if (ped.stateT <= 0) {
        ped.state = 'walk';
        ped.line = ROADS.reduce((b, r) => (Math.abs(r - ped.z) < Math.abs(b - ped.z) ? r : b), ROADS[0]);
        ped.axis = 'x';
        ped.along = clamp(ped.x, -CITY_EDGE, CITY_EDGE);
        ped.side = ped.z >= ped.line ? 1 : -1;
      }
    } else if (ped.state === 'cross') {
      speed = 2.4;
      const target = ped.crossTarget;
      const dx = target.x - ped.x;
      const dz = target.z - ped.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) {
        ped.state = 'walk';
        ped.side = -ped.side;
      } else {
        ped.mesh.position.x += (dx / d) * speed * dt;
        ped.mesh.position.z += (dz / d) * speed * dt;
        ped.mesh.rotation.y = Math.atan2(dx, dz);
      }
    } else {
      ped.along += ped.dir * speed * dt;
      if (ped.along > CITY_EDGE - 6) { ped.along = CITY_EDGE - 6; ped.dir = -1; }
      if (ped.along < -CITY_EDGE + 6) { ped.along = -CITY_EDGE + 6; ped.dir = 1; }
      const crossRoad = ROADS.reduce((b, r) => (Math.abs(r - ped.along) < Math.abs(b - ped.along) ? r : b), ROADS[0]);
      if (Math.abs(crossRoad - ped.along) < 0.6 && rng() < 0.006) {
        const at = sidewalkPos(ped);
        ped.state = 'cross';
        ped.crossTarget = ped.axis === 'x'
          ? { x: at.x, z: ped.line - ped.side * (ROAD_HALF + 2.6) }
          : { x: ped.line - ped.side * (ROAD_HALF + 2.6), z: at.z };
      } else if (Math.abs(crossRoad - ped.along) < 0.6 && rng() < 0.004) {
        const at = sidewalkPos(ped);
        ped.axis = ped.axis === 'x' ? 'z' : 'x';
        ped.line = crossRoad;
        ped.along = ped.axis === 'x' ? at.x : at.z;
        ped.side = rng() < 0.5 ? -1 : 1;
        ped.dir = rng() < 0.5 ? 1 : -1;
      }
      const p = sidewalkPos(ped);
      ped.mesh.position.x = p.x;
      ped.mesh.position.z = p.z;
      ped.mesh.position.y = 0.24;
      ped.mesh.rotation.y = ped.axis === 'x' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI);
      if (ped.mesh.position.z > SHORE_Z - 2) ped.dir = -1;
    }
    if (collidersHit) {
      const fixed = collidersHit(ped.mesh.position.x, ped.mesh.position.z, 0.4);
      ped.mesh.position.x = fixed.x;
      ped.mesh.position.z = fixed.z;
    }
    if (moving) {
      ped.cycle += dt * speed * 3.4;
      animateFigure(ped.mesh, ped.cycle, speed / 2);
      ped.mesh.position.y = 0.24 + Math.abs(Math.sin(ped.cycle)) * 0.04;
    }
  }
}
