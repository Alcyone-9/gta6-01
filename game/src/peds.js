// Coral City Heat — pedestrians. They stroll the sidewalks, cross at corners,
// and run screaming from gunfire, punches and cars bearing down on them. A ped
// who is knocked down may drop the cash in their pockets; the main loop turns
// that into a pickup and a wanted problem for whoever was driving.

import * as THREE from 'three';
import { ROADS, ROAD_HALF, CITY_EDGE, SHORE_Z } from './city.js';
import { pick, range, clamp } from './rng.js';

const SKIN = [0xe8b48c, 0xc68863, 0x8a5a3b, 0xf0c8a0, 0x6e4530];
const SHIRT = [0xd94f3d, 0x3d7bd9, 0xe8e4da, 0x53b06a, 0xe8b93e, 0x9b59b6, 0x2fb3a6, 0x30343c];
const PANTS = [0x2c3440, 0x5a4632, 0x707880, 0x243447, 0x8a8f96];

const torsoGeo = new THREE.BoxGeometry(0.52, 0.72, 0.3);
const headGeo = new THREE.SphereGeometry(0.21, 8, 6);
const legGeo = new THREE.BoxGeometry(0.19, 0.78, 0.22);
const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

export function createPedMesh(rng) {
  const group = new THREE.Group();
  const torso = new THREE.Mesh(torsoGeo, mat(pick(rng, SHIRT)));
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(headGeo, mat(pick(rng, SKIN)));
  head.position.y = 1.72;
  group.add(head);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, mat(pick(rng, PANTS)));
    leg.geometry = legGeo;
    leg.position.set(side * 0.14, 0.39, 0);
    // Pivot at the hip: wrap in a group so the swing rotates from the top.
    const hip = new THREE.Group();
    hip.position.set(side * 0.14, 0.78, 0);
    leg.position.set(0, -0.39, 0);
    hip.add(leg);
    group.add(hip);
    legs.push(hip);
  }
  group.userData.legs = legs;
  return group;
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

/** Scare every ped within radius of a point: they flee directly away from it. */
export function scarePeds(peds, x, z, radius) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - x;
    const dz = ped.z - z;
    if (dx * dx + dz * dz < radius * radius) {
      ped.state = 'flee';
      ped.stateT = range(Math.random, 1.6, 3.2);
      ped.fleeX = dx;
      ped.fleeZ = dz;
    }
  }
}

export function stepPeds(peds, dt, rng, collidersHit) {
  for (const ped of peds) {
    if (ped.state === 'down') {
      ped.stateT -= dt;
      if (ped.stateT <= 0) {
        ped.state = 'walk';
        ped.mesh.rotation.x = 0;
        placePed(ped);
      }
      continue;
    }
    let speed = ped.speed;
    if (ped.state === 'flee') {
      speed = 4.6;
      ped.stateT -= dt;
      const len = Math.hypot(ped.fleeX || 1, ped.fleeZ || 0) || 1;
      ped.mesh.position.x += ((ped.fleeX || 1) / len) * speed * dt;
      ped.mesh.position.z += ((ped.fleeZ || 0) / len) * speed * dt;
      ped.mesh.rotation.y = Math.atan2(ped.fleeX || 1, ped.fleeZ || 0);
      if (ped.stateT <= 0) {
        ped.state = 'walk';
        // Rejoin the nearest sidewalk so fleeing peds settle back into the city.
        ped.line = ROADS.reduce((b, r) => (Math.abs(r - ped.z) < Math.abs(b - ped.z) ? r : b), ROADS[0]);
        ped.axis = 'x';
        ped.along = clamp(ped.x, -CITY_EDGE, CITY_EDGE);
        ped.side = ped.z >= ped.line ? 1 : -1;
      }
    } else if (ped.state === 'cross') {
      // Walking straight across the road to the opposite sidewalk.
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
      // Near a crossing: sometimes cross the street, sometimes turn the corner.
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
    // Keep peds out of buildings they may have fled into.
    if (collidersHit) {
      const fixed = collidersHit(ped.mesh.position.x, ped.mesh.position.z, 0.4);
      ped.mesh.position.x = fixed.x;
      ped.mesh.position.z = fixed.z;
    }
    // Walk cycle: legs swing while moving.
    ped.cycle += dt * speed * 3.4;
    const swing = Math.sin(ped.cycle) * 0.55;
    const legs = ped.mesh.userData.legs;
    if (legs) {
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
    }
  }
}
