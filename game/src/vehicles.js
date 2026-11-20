// Coral City Heat v2 — cars: one shared low-poly factory, five body styles,
// three lives. Sedans, hatchbacks, taxis (yellow, roof sign), pickups and box
// trucks and open convertibles all come out of createCarMesh with spinning
// wheels, headlights, and brake lights that flare whenever the car slows.
// The same factory makes parked cars, grid traffic and (in police.js) patrol
// cars. Traffic follows the road grid in the axis/line model: a car travels
// along one road, keeps to the right-hand lane, and at each crossing may
// turn onto the crossing road. Anything solid ahead makes it brake — and
// honk, through the onBump callback — and a clear road lets it cruise.

import * as THREE from 'three';
import { ROADS, ROAD_HALF, CITY_EDGE } from './city.js';
import { pick, range, turnToward, clamp } from './rng.js';

export const CAR_COLORS = [0xd94f3d, 0x3d7bd9, 0xe8b93e, 0x53b06a, 0xe6e6e6, 0x30343c, 0x9b59b6, 0x2fb3a6, 0xd97bb0];
export const CAR_NAMES = ['Vireo Coupe', 'Suntail Sedan', 'Bayside Hatch', 'Corvina Wagon', 'Palmetto Pickup', 'Sirocco Roadster', 'Sable Taxi', 'Porter Box Truck'];
export const CAR_TYPES = ['sedan', 'sedan', 'hatch', 'taxi', 'pickup', 'truck', 'convertible'];

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x17181c });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1d2c3d });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
const blobGeo = new THREE.CircleGeometry(2.6, 18);
const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false });
const matCache = new Map();

function paintMat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** Build one car mesh facing +Z. kind 'cop' adds a light bar and two-tone paint. */
export function createCarMesh(color, kind = 'civilian', type = 'sedan') {
  const group = new THREE.Group();
  const paint = paintMat(color);
  const wheels = [];
  const addWheels = (spread, zF, zR, r = 0.36) => {
    for (const [wx, wz] of [[-spread, zF], [spread, zF], [-spread, zR], [spread, zR]]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.scale.setScalar(r / 0.36);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, r, wz);
      group.add(wheel);
      wheels.push(wheel);
    }
  };

  if (type === 'truck') {
    group.add(box(2.0, 1.15, 1.7, paint, 0, 0.95, 1.55)); // cab
    group.add(box(1.8, 0.5, 0.9, glassMat, 0, 1.32, 1.7)); // windshield band
    group.add(box(2.3, 2.0, 3.1, paintMat(0xe8e4da), 0, 1.5, -0.85)); // cargo box
    addWheels(0.95, 1.55, -1.5, 0.42);
  } else if (type === 'pickup') {
    group.add(box(1.95, 0.62, 4.4, paint, 0, 0.55, 0));
    group.add(box(1.75, 0.6, 1.5, glassMat, 0, 1.12, 0.75));
    group.add(box(1.8, 0.34, 1.7, paintMat(0x22262e), 0, 0.92, -1.25)); // open bed
    addWheels(0.88, 1.4, -1.4, 0.4);
  } else if (type === 'convertible') {
    group.add(box(1.9, 0.58, 4.3, paint, 0, 0.52, 0));
    group.add(box(1.7, 0.3, 1.1, glassMat, 0, 0.9, 0.55)); // low windshield
    group.add(box(1.6, 0.28, 0.8, paintMat(0x8a5a3b), 0, 0.86, -1.1)); // folded top / seats
    addWheels(0.85, 1.35, -1.35);
  } else {
    // sedan / hatch / taxi share the classic two-box silhouette.
    const cabinLen = type === 'hatch' ? 2.5 : 2.1;
    group.add(box(1.9, 0.62, 4.3, paint, 0, 0.55, 0));
    const cabin = box(1.7, 0.55, cabinLen, kind === 'cop' ? paintMat(0xf2f2f2) : glassMat, 0, 1.1, type === 'hatch' ? -0.45 : -0.25);
    group.add(cabin);
    addWheels(0.85, 1.35, -1.35);
    if (type === 'taxi') {
      const sign = box(0.9, 0.24, 0.4, new THREE.MeshBasicMaterial({ color: 0xfff3b0 }), 0, 1.5, -0.25);
      group.add(sign);
    }
  }

  const tails = [];
  for (const side of [-1, 1]) {
    const head = box(0.42, 0.16, 0.06, lightMat, side * 0.6, 0.62, type === 'truck' ? 2.42 : 2.16);
    group.add(head);
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff4b3e });
    const tail = box(0.42, 0.14, 0.06, tailMat, side * 0.6, 0.66, type === 'truck' ? -2.42 : -2.16);
    group.add(tail);
    tails.push(tailMat);
  }
  if (kind === 'cop') {
    const bar = box(1.2, 0.18, 0.5, new THREE.MeshBasicMaterial({ color: 0x2f6fd0 }), 0, 1.48, -0.25);
    group.add(bar);
    group.userData.lightbar = bar;
  }
  // Soft fake shadow: a dark ellipse that grounds the car without shadow maps.
  const blob = new THREE.Mesh(blobGeo, blobMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  blob.scale.set(0.85, 1.05, 1);
  group.add(blob);

  group.userData.wheels = wheels;
  group.userData.tails = tails;
  return group;
}

/** Flare or dim a car's brake lights. */
export function setBrakes(car, on) {
  const tails = car.mesh.userData.tails;
  if (!tails) return;
  for (const t of tails) t.color.setHex(on ? 0xffb0a6 : 0xff4b3e);
}

function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

function laneCross(axis, line, dir) {
  // Right-hand traffic: the lane centre sits 3.2 m to the driver's right.
  return axis === 'x' ? line + dir * 3.2 : line - dir * 3.2;
}

function makeCar(scene, rng, kind) {
  const type = kind === 'cop' ? 'sedan' : pick(rng, CAR_TYPES);
  const color = kind === 'cop' ? 0x22262e : type === 'taxi' ? 0xf2c230 : pick(rng, CAR_COLORS);
  const mesh = createCarMesh(color, kind, type);
  scene.add(mesh);
  return {
    mesh,
    kind,
    type,
    name: type === 'taxi' ? 'Sable Taxi' : type === 'truck' ? 'Porter Box Truck'
      : type === 'pickup' ? 'Palmetto Pickup' : type === 'convertible' ? 'Sirocco Roadster'
        : pick(rng, CAR_NAMES.slice(0, 4)),
    color,
    axis: 'x',
    dir: 1,
    line: 0,
    along: 0,
    speed: 0,
    cruise: range(rng, 8, 12.5),
    heading: 0,
    radius: 2.3,
    parked: false,
    stolen: false,
    occupied: false,
    honkAt: 0,
    get x() { return mesh.position.x; },
    get z() { return mesh.position.z; },
  };
}

function placeOnGrid(car, rng) {
  car.axis = rng() < 0.5 ? 'x' : 'z';
  car.dir = rng() < 0.5 ? 1 : -1;
  car.line = pick(rng, ROADS);
  car.along = range(rng, -CITY_EDGE, CITY_EDGE);
  car.speed = car.cruise * range(rng, 0.6, 1);
  syncTransform(car, 1);
}

function syncTransform(car, dt) {
  const cross = laneCross(car.axis, car.line, car.dir);
  const tx = car.axis === 'x' ? car.along : cross;
  const tz = car.axis === 'x' ? cross : car.along;
  if (dt >= 1) {
    // Placement call: snap position AND heading. The old code snapped the
    // position but only turned the heading by dt*2.6 rad, so a freshly
    // spawned car facing the wrong way spent its first second visibly
    // slewing across its lane while already moving at cruise speed.
    car.mesh.position.x = tx;
    car.mesh.position.z = tz;
    car.heading = headingFor(car.axis, car.dir);
  } else {
    const blend = Math.min(1, dt * 3.2);
    car.mesh.position.x += (tx - car.mesh.position.x) * blend;
    car.mesh.position.z += (tz - car.mesh.position.z) * blend;
    car.heading = turnToward(car.heading, headingFor(car.axis, car.dir), dt * 2.6);
  }
  car.mesh.rotation.y = car.heading;
  spinWheels(car, dt);
}

export function spinWheels(car, dt) {
  const wheels = car.mesh.userData.wheels;
  if (!wheels) return;
  const spin = (car.speed * dt) / 0.36;
  for (const w of wheels) w.rotation.x += spin;
}

/** Spawn the ambient traffic fleet. */
export function createTraffic(scene, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const car = makeCar(scene, rng, 'traffic');
    placeOnGrid(car, rng);
    cars.push(car);
  }
  return cars;
}

/** Spawn parked cars along the kerbs; some are the named cars missions point at. */
export function createParked(scene, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const car = makeCar(scene, rng, 'parked');
    car.parked = true;
    const vertical = rng() < 0.5;
    const line = pick(rng, ROADS);
    const side = rng() < 0.5 ? -1 : 1;
    const along = range(rng, -CITY_EDGE + 14, CITY_EDGE - 14);
    if (vertical) {
      car.mesh.position.set(line + side * (ROAD_HALF + 1.6), 0, along);
      car.heading = side > 0 ? Math.PI : 0;
    } else {
      car.mesh.position.set(along, 0, line + side * (ROAD_HALF + 1.6));
      car.heading = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    car.mesh.rotation.y = car.heading;
    cars.push(car);
  }
  return cars;
}

/**
 * Advance traffic one step. `blockers` is a list of {x, z, r} the cars must
 * not hit; each car brakes (brake lights on) for whatever is close ahead in
 * its lane, honks through onBump when stuck, and cruises when clear.
 */
export function stepTraffic(cars, dt, rng, blockers, onBump, time = 0) {
  for (const car of cars) {
    if (car.parked || car.occupied) continue;
    const fwdX = Math.sin(car.heading);
    const fwdZ = Math.cos(car.heading);
    let nearest = Infinity;
    for (const other of cars) {
      if (other === car || other.parked) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const ahead = dx * fwdX + dz * fwdZ;
      const side = Math.abs(dx * fwdZ - dz * fwdX);
      if (ahead > 0 && ahead < nearest && side < 2.4) nearest = ahead;
    }
    for (const b of blockers) {
      const dx = b.x - car.x;
      const dz = b.z - car.z;
      const ahead = dx * fwdX + dz * fwdZ;
      const side = Math.abs(dx * fwdZ - dz * fwdX);
      if (ahead > 0 && ahead < nearest && side < 2.4 + b.r) nearest = ahead;
    }
    const gap = nearest - 4.6;
    const braking = gap < 7;
    setBrakes(car, braking && car.speed > 0.5);
    if (braking) {
      car.speed = Math.max(0, car.speed - dt * 14);
      if (gap < 1.2 && onBump && time - (car.honkAt || 0) > 4 && rng() < 0.5) {
        car.honkAt = time;
        onBump(car);
      }
    } else {
      car.speed = Math.min(car.cruise, car.speed + dt * 5);
    }
    car.along += car.dir * car.speed * dt;

    // At a crossing, sometimes turn; at the map edge, always turn back into town.
    const crossRoad = ROADS.reduce((best, r) => (Math.abs(r - car.along) < Math.abs(best - car.along) ? r : best), ROADS[0]);
    if (Math.abs(crossRoad - car.along) < 0.9 && car.speed > 0.5) {
      const mustTurn = Math.abs(car.line) === CITY_EDGE - 30 || Math.abs(crossRoad) >= 160;
      if (mustTurn || rng() < 0.012 + (Math.abs(car.along) > CITY_EDGE - 6 ? 0.5 : 0)) {
        const crossPos = car.axis === 'x' ? car.mesh.position.z : car.mesh.position.x;
        car.axis = car.axis === 'x' ? 'z' : 'x';
        car.line = crossRoad;
        car.along = crossPos;
        car.dir = rng() < 0.5 ? 1 : -1;
        if (Math.abs(car.along) > CITY_EDGE - 8) car.dir = car.along > 0 ? -1 : 1;
      }
    }
    if (car.along > CITY_EDGE + 16) { car.along = CITY_EDGE + 16; car.dir = -1; }
    if (car.along < -CITY_EDGE - 16) { car.along = -CITY_EDGE - 16; car.dir = 1; }
    syncTransform(car, dt);
  }
}

/** A fresh patrol car object (mesh + pursuit state), steered by police.js. */
export function makePatrolCar(scene) {
  const car = makeCar(scene, Math.random, 'cop');
  car.kind = 'cop';
  car.cruise = 17;
  return car;
}

export { clamp };
