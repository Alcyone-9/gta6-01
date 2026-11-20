// vehicles.js — procedural car models and arcade driving physics, plus the
// traffic fleet that cruises the road grid, obeys lights and honks.

import * as THREE from 'three';
import { ROAD_COORDS } from './city.js';
import { clamp, angleLerp } from './rng.js';

const CAR_COLORS = [0xd64541, 0x3f7fbf, 0xe8e3d9, 0x59b06a, 0xe0a32e, 0x8e6cc8, 0x35424e, 0xf27d9d];

export function buildCarMesh(type, colorHex) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colorHex });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1d2b38 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x14181c });
  const hub = new THREE.MeshLambertMaterial({ color: 0xb9c0c4 });

  let len = 4.4;
  let wid = 1.9;
  let bodyH = 0.62;
  if (type === 'truck') { len = 6.4; wid = 2.3; bodyH = 0.9; }
  if (type === 'convertible') { len = 4.3; bodyH = 0.5; }
  if (type === 'cop') { len = 4.6; }

  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, bodyH, len), paint);
  body.position.y = 0.55;
  group.add(body);

  if (type === 'truck') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(wid, 1.0, 1.6), paint);
    cab.position.set(0, 1.35, len / 2 - 0.9);
    group.add(cab);
    const boxCargo = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.15, 2.0, len - 2.0), new THREE.MeshLambertMaterial({ color: 0xe8e3d9 }));
    boxCargo.position.set(0, 1.55, -0.7);
    group.add(boxCargo);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.3, 0.6, 0.1), glass);
    shield.position.set(0, 1.5, len / 2 - 0.05);
    group.add(shield);
  } else if (type === 'convertible') {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.3, 0.35, 1.7), new THREE.MeshLambertMaterial({ color: 0x7a3b2e }));
    seat.position.set(0, 0.95, -0.2);
    group.add(seat);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.2, 0.5, 0.1), glass);
    shield.position.set(0, 1.05, 1.15);
    shield.rotation.x = -0.25;
    group.add(shield);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.25, 0.55, len * 0.45), type === 'cop' ? new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }) : glass);
    cabin.position.set(0, 1.12, -0.1);
    group.add(cabin);
    if (type === 'taxi') {
      const signMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.4), signMat);
      sign.position.set(0, 1.55, -0.1);
      group.add(sign);
    }
    if (type === 'cop') {
      const bar = new THREE.Group();
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
      red.position.x = -0.3;
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0x3366ff }));
      blue.position.x = 0.3;
      bar.add(red);
      bar.add(blue);
      bar.position.set(0, 1.52, -0.1);
      group.add(bar);
      group.userData.lightBar = bar;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.02, 0.3, len * 0.7), new THREE.MeshLambertMaterial({ color: 0x1d3a6e }));
      stripe.position.y = 0.6;
      group.add(stripe);
    }
  }

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.3, 8);
  const positions = [
    [-wid / 2, len / 2 - 0.85], [wid / 2, len / 2 - 0.85],
    [-wid / 2, -len / 2 + 0.85], [wid / 2, -len / 2 + 0.85],
  ];
  positions.forEach(([wx, wz], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const tyreMesh = new THREE.Mesh(wheelGeo, tyre);
    tyreMesh.rotation.z = Math.PI / 2;
    const hubMesh = new THREE.Mesh(hubGeo, hub);
    hubMesh.rotation.z = Math.PI / 2;
    pivot.add(tyreMesh);
    pivot.add(hubMesh);
    group.add(pivot);
    wheels.push({ pivot, spin: tyreMesh, front: i < 2 });
  });

  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x551111 });
  const brakeL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.06), brakeMat);
  brakeL.position.set(-wid / 2 + 0.25, 0.62, -len / 2 - 0.02);
  const brakeR = brakeL.clone();
  brakeR.position.x = wid / 2 - 0.25;
  group.add(brakeL);
  group.add(brakeR);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const headL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), headMat);
  headL.position.set(-wid / 2 + 0.25, 0.62, len / 2 + 0.02);
  const headR = headL.clone();
  headR.position.x = wid / 2 - 0.25;
  group.add(headL);
  group.add(headR);

  group.userData.wheels = wheels;
  group.userData.brakeMat = brakeMat;
  group.userData.len = len;
  return group;
}

export class Vehicle {
  constructor(scene, type, colorHex, x, z, angle) {
    this.type = type;
    this.mesh = buildCarMesh(type, colorHex);
    this.x = x;
    this.z = z;
    this.angle = angle || 0;
    this.speed = 0;
    this.steer = 0;
    this.hp = 100;
    this.brakeLight = false;
    this.wheelSpin = 0;
    this.smokeAcc = 0;
    this.dead = false;
    scene.add(this.mesh);
    this.syncMesh();
  }

  get pos() {
    return { x: this.x, z: this.z };
  }

  forwardX() { return Math.sin(this.angle); }
  forwardZ() { return Math.cos(this.angle); }

  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.angle;
    const wheels = this.mesh.userData.wheels;
    for (const w of wheels) {
      w.spin.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = this.steer * 0.55;
    }
    this.mesh.userData.brakeMat.color.setHex(this.brakeLight ? 0xff2222 : 0x551111);
    if (this.mesh.userData.lightBar) {
      this.mesh.userData.lightBar.visible = Math.floor(performance.now() / 220) % 2 === 0;
    }
    // visual damage: nose dips and body tilts when wrecked
    if (this.hp < 35) {
      this.mesh.rotation.z = 0.03;
      this.mesh.position.y = -0.04;
    }
  }

  // Arcade step. throttle -1..1, steer -1..1, handbrake bool.
  drive(dt, throttle, steer, handbrake) {
    const maxSpeed = this.type === 'truck' ? 17 : 26;
    const accel = this.type === 'truck' ? 9 : 13;
    if (this.dead) throttle = 0;
    if (throttle > 0) this.speed += accel * throttle * dt;
    else if (throttle < 0) this.speed += (this.speed > 0.5 ? -22 : accel * throttle) * dt;
    else this.speed -= this.speed * 0.6 * dt;
    if (handbrake) this.speed -= this.speed * 2.4 * dt;
    const drag = 0.25 + Math.abs(this.speed) * 0.012;
    this.speed -= this.speed * drag * dt * 0.4;
    this.speed = clamp(this.speed, -8, maxSpeed);
    this.steer = steer;
    const steerAuthority = clamp(Math.abs(this.speed) / 6, 0, 1);
    const drift = handbrake ? 1.5 : 1.0;
    this.angle += steer * steerAuthority * dt * 1.65 * drift * (this.speed >= 0 ? 1 : -1);
    this.x += this.forwardX() * this.speed * dt;
    this.z += this.forwardZ() * this.speed * dt;
    this.wheelSpin += (this.speed * dt) / 0.36;
    this.brakeLight = throttle < 0 || handbrake || Math.abs(this.speed) < 0.2;
    this.syncMesh();
  }

  // Simple pursuit / waypoint steering used by AI drivers.
  steerToward(dt, tx, tz, cruise, city) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const targetAngle = Math.atan2(dx, dz);
    let diff = targetAngle - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = clamp(diff * 1.6, -1, 1);
    let throttle = 0.8;
    if (Math.abs(diff) > 1.2) throttle = 0.25;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 4) throttle = 0;
    const desired = cruise * throttle;
    if (this.speed < desired) this.speed = Math.min(desired, this.speed + 10 * dt);
    else this.speed = Math.max(desired, this.speed - 16 * dt);
    this.steer = steer;
    this.angle += steer * clamp(Math.abs(this.speed) / 5, 0, 1) * dt * 1.7 * (this.speed >= 0 ? 1 : -1);
    this.x += this.forwardX() * this.speed * dt;
    this.z += this.forwardZ() * this.speed * dt;
    this.wheelSpin += (this.speed * dt) / 0.36;
    this.brakeLight = this.speed < desired - 0.5;
    if (city) {
      const [cx, cz] = city.collideCircle(this.x, this.z, 1.6);
      if (cx !== this.x || cz !== this.z) {
        this.x = cx;
        this.z = cz;
        this.speed *= 0.6;
      }
    }
    this.syncMesh();
    return dist;
  }

  damage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }
}

export class TrafficCar {
  constructor(scene, rng, city) {
    const type = rng.pick(['sedan', 'sedan', 'taxi', 'convertible', 'truck']);
    const color = type === 'taxi' ? 0xf2c41c : rng.pick(CAR_COLORS);
    // Start on a random road, driving along it.
    this.axis = rng.chance(0.5) ? 'x' : 'z';
    this.road = rng.pick(ROAD_COORDS);
    this.along = rng.range(-125, 125);
    this.dir = rng.sign();
    this.lane = 3.6;
    const x = this.axis === 'x' ? this.along : this.road + this.dir * this.lane;
    const z = this.axis === 'x' ? this.road + this.dir * this.lane : this.along;
    const angle = this.axis === 'x' ? (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (this.dir > 0 ? 0 : Math.PI);
    this.car = new Vehicle(scene, type === 'taxi' ? 'taxi' : type, color, x, z, angle);
    this.car.speed = rng.range(7, 11);
    this.rng = rng;
    this.city = city;
    this.honkCooldown = 0;
    this.stuckTime = 0;
  }

  update(dt, t, others, audio, playerPos) {
    const car = this.car;
    this.honkCooldown -= dt;
    // Find the intersection ahead.
    const fx = car.forwardX();
    const fz = car.forwardZ();
    let stopForLight = false;
    let nearestIdx = 0;
    let bestAlong = Infinity;
    ROAD_COORDS.forEach((rc, i) => {
      const ix = this.axis === 'x' ? rc : this.road;
      const iz = this.axis === 'x' ? this.road : rc;
      const dx = ix - car.x;
      const dz = iz - car.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 2 && ahead < 16 && side < 6 && ahead < bestAlong) {
        bestAlong = ahead;
        nearestIdx = i * 5 + ROAD_COORDS.indexOf(this.road);
        const phase = this.city.lightPhaseFor(nearestIdx, this.axis, t);
        if (phase !== 'green') stopForLight = true;
      }
    });

    // Obstacle ahead: another car or the player on foot.
    let blocked = false;
    const check = (ox, oz) => {
      const dx = ox - car.x;
      const dz = oz - car.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 1 && ahead < 8 && side < 2.2) blocked = true;
    };
    for (const o of others) if (o !== this) check(o.car.x, o.car.z);
    if (playerPos) check(playerPos.x, playerPos.z);

    let target = 9.5;
    if (stopForLight || blocked) target = 0;
    if (car.speed < target) car.speed = Math.min(target, car.speed + 8 * dt);
    else car.speed = Math.max(target, car.speed - 20 * dt);
    car.brakeLight = target === 0;
    if (blocked && car.speed < 1) {
      this.stuckTime += dt;
      if (this.stuckTime > 1.6 && this.honkCooldown <= 0 && audio) {
        audio.horn();
        this.honkCooldown = this.rng.range(2.5, 5);
        this.stuckTime = 0;
      }
    } else {
      this.stuckTime = 0;
    }

    car.x += fx * car.speed * dt;
    car.z += fz * car.speed * dt;
    car.wheelSpin += (car.speed * dt) / 0.36;
    car.steer = 0;

    // At an intersection, sometimes turn onto the crossing road.
    const nearRoad = ROAD_COORDS.find((rc) => Math.abs((this.axis === 'x' ? car.x : car.z) - rc) < 1.2);
    if (nearRoad !== undefined && this.rng.chance(0.35 * dt * 8)) {
      const cross = this.axis === 'x' ? car.z : car.x;
      const roadCoord = ROAD_COORDS.reduce((a, b) => (Math.abs(b - cross) < Math.abs(a - cross) ? b : a), ROAD_COORDS[0]);
      this.axis = this.axis === 'x' ? 'z' : 'x';
      this.road = roadCoord;
      this.dir = this.rng.sign();
      if (this.axis === 'x') {
        car.z = this.road + this.dir * this.lane;
        car.angle = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.x = this.road + this.dir * this.lane;
        car.angle = this.dir > 0 ? 0 : Math.PI;
      }
    }
    // Wrap around the world edge.
    if (car.x > 150) car.x = -150;
    if (car.x < -150) car.x = 150;
    if (car.z > 150) car.z = -150;
    if (car.z < -150) car.z = 150;
    car.syncMesh();
  }
}

export function nearestVehicle(list, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const v of list) {
    const dx = v.x - x;
    const dz = v.z - z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

export { CAR_COLORS };
