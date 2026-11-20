// police.js — the wanted system and Coral City PD: patrol cars that pursue
// with steering, roadblocks at four stars, and officers who get out and
// chase on foot, filling the BUSTED meter when they are close to a slow
// or stopped player.

import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { buildPersonMesh, animatePerson } from './peds.js';
import { clamp, dist2d } from './rng.js';

export const CRIME_HEAT = {
  stealCar: 1,
  hitPed: 1,
  shoot: 1,
  hitCopCar: 1,
  hitCar: 0.34,
  missionCrime: 1,
};

class FootOfficer {
  constructor(scene, x, z) {
    this.mesh = buildPersonMesh(0x1d3a6e, 0xf2c9a0, 0x1d2b38);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.26, 0.12, 10),
      new THREE.MeshLambertMaterial({ color: 0x14263f })
    );
    cap.position.y = 1.86;
    this.mesh.add(cap);
    this.x = x;
    this.z = z;
    this.speed = 5.4;
    this.walkPhase = 0;
    this.active = true;
    scene.add(this.mesh);
    this.scene = scene;
  }
  update(dt, tx, tz, city) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.6) {
      const step = Math.min(d, this.speed * dt);
      this.x += (dx / d) * step;
      this.z += (dz / d) * step;
      this.mesh.rotation.y = Math.atan2(dx, dz);
    }
    const [cx, cz] = city.collideCircle(this.x, this.z, 0.45);
    this.x = cx;
    this.z = cz;
    this.walkPhase += dt * 9;
    this.mesh.position.set(this.x, 0, this.z);
    animatePerson(this.mesh, this.walkPhase, 1, 0);
    return d;
  }
  dispose() {
    this.scene.remove(this.mesh);
  }
}

export class Police {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.wanted = 0; // integer stars 0..5
    this.heat = 0; // fractional heat that rounds up into stars
    this.hiddenTime = 0;
    this.cars = [];
    this.officers = [];
    this.roadblock = [];
    this.roadblockForStar = 0;
    this.bustedMeter = 0;
    this.spawnCooldown = 0;
    this.events = [];
  }

  reportCrime(kind, seen) {
    if (!seen) return;
    this.heat = clamp(this.heat + (CRIME_HEAT[kind] || 0.5), 0, 5);
    this.wanted = clamp(Math.ceil(this.heat - 0.001), 0, 5);
    if (this.heat > 0 && this.wanted === 0) this.wanted = 1;
    this.hiddenTime = 0;
  }

  setWanted(stars) {
    this.wanted = clamp(stars, 0, 5);
    this.heat = this.wanted;
    this.hiddenTime = 0;
  }

  clearWanted() {
    this.wanted = 0;
    this.heat = 0;
    this.bustedMeter = 0;
    for (const c of this.cars) this.scene.remove(c.mesh);
    for (const o of this.officers) o.dispose();
    for (const c of this.roadblock) this.scene.remove(c.mesh);
    this.cars = [];
    this.officers = [];
    this.roadblock = [];
    this.roadblockForStar = 0;
  }

  anyCopSees(x, z, range) {
    for (const c of this.cars) if (dist2d(c.x, c.z, x, z) < range) return true;
    for (const o of this.officers) if (dist2d(o.x, o.z, x, z) < range) return true;
    return false;
  }

  spawnCar(player) {
    const a = this.rng.range(0, Math.PI * 2);
    const d = 55;
    let x = clamp(player.x + Math.sin(a) * d, -130, 130);
    let z = clamp(player.z + Math.cos(a) * d, -130, 130);
    if (this.city.pointInBuilding(x, z, 2)) {
      x = player.x + 40;
      z = player.z;
    }
    const car = new Vehicle(this.scene, 'cop', 0x22262b, x, z, Math.atan2(player.x - x, player.z - z));
    car.copState = 'chase';
    this.cars.push(car);
    return car;
  }

  buildRoadblock(player) {
    // Three patrol cars parked sideways across the road ahead of the player.
    const fx = Math.sin(player.angle || 0);
    const fz = Math.cos(player.angle || 0);
    const cx = player.x + fx * 42;
    const cz = player.z + fz * 42;
    const perp = (player.angle || 0) + Math.PI / 2;
    for (let i = -1; i <= 1; i += 1) {
      const x = cx + Math.sin(perp) * i * 5.2;
      const z = cz + Math.cos(perp) * i * 5.2;
      const car = new Vehicle(this.scene, 'cop', 0x22262b, x, z, perp + Math.PI / 2);
      car.copState = 'block';
      car.speed = 0;
      this.roadblock.push(car);
    }
    for (let i = 0; i < 2; i += 1) {
      const off = new FootOfficer(this.scene, cx + (i === 0 ? -6 : 6), cz + 2);
      this.officers.push(off);
    }
    this.roadblockForStar = this.wanted;
  }

  clearRoadblock() {
    for (const c of this.roadblock) this.scene.remove(c.mesh);
    this.roadblock = [];
    this.roadblockForStar = 0;
  }

  update(dt, player, audio) {
    this.events = [];
    this.spawnCooldown -= dt;
    const px = player.x;
    const pz = player.z;
    const playerSpeed = player.speedAbs || 0;
    const seen = this.anyCopSees(px, pz, 46) || this.wanted === 0;

    if (this.wanted > 0) {
      if (seen) this.hiddenTime = 0;
      else {
        this.hiddenTime += dt;
        if (this.hiddenTime > 9) {
          this.heat = Math.max(0, this.heat - dt * 0.09);
          this.wanted = clamp(Math.ceil(this.heat - 0.001), 0, 5);
          if (this.wanted === 0) {
            this.clearWanted();
            this.events.push({ type: 'escaped' });
            return this.events;
          }
        }
      }
      // Keep the fleet sized to the star level.
      const desired = Math.min(2 + this.wanted, 6);
      if (this.cars.length < desired && this.spawnCooldown <= 0) {
        this.spawnCar(player);
        this.spawnCooldown = 2.5;
      }
      if (this.wanted >= 4 && this.roadblockForStar !== this.wanted) {
        this.clearRoadblock();
        this.buildRoadblock(player);
      }
      if (this.wanted < 4 && this.roadblock.length) this.clearRoadblock();
    }

    // Pursuit steering for chase cars.
    for (const car of this.cars) {
      if (car.copState === 'block') continue;
      const d = dist2d(car.x, car.z, px, pz);
      // Aim at a point slightly behind the player to ram, not orbit.
      const tx = px - Math.sin(player.angle || 0) * 2;
      const tz = pz - Math.cos(player.angle || 0) * 2;
      car.steerToward(dt, tx, tz, d > 26 ? 25 : 15, this.city);
      if (d < 3.4) {
        this.events.push({ type: 'copRam', car, damage: 26 * dt + 2 });
      }
      // Officer bails out when close and the player is slow.
      if (d < 9 && playerSpeed < 3.2 && this.officers.length < 3 && !car.officerOut) {
        car.officerOut = true;
        const off = new FootOfficer(this.scene, car.x + 1.4, car.z);
        this.officers.push(off);
        car.copState = 'parked';
        car.speed = 0;
      }
    }
    for (const car of this.roadblock) car.syncMesh();

    // Foot officers close in; together they fill the BUSTED meter.
    let bustPressure = 0;
    const keepOfficers = [];
    for (const off of this.officers) {
      const d = off.update(dt, px, pz, this.city);
      if (d < 2.6) bustPressure += 1;
      if (d > 90) off.dispose();
      else keepOfficers.push(off);
    }
    this.officers = keepOfficers;
    // A slow or stopped player with an officer on top of them gets busted.
    const carPressure = this.cars.some((c) => dist2d(c.x, c.z, px, pz) < 5) && playerSpeed < 1.2 ? 0.5 : 0;
    if ((bustPressure > 0 || carPressure > 0) && playerSpeed < 3.4 && this.wanted > 0) {
      this.bustedMeter = clamp(this.bustedMeter + dt * (0.34 * bustPressure + carPressure * 0.3), 0, 1);
    } else {
      this.bustedMeter = clamp(this.bustedMeter - dt * 0.5, 0, 1);
    }
    if (this.bustedMeter >= 1) {
      this.events.push({ type: 'busted' });
      this.bustedMeter = 0;
    }
    if (audio) audio.setSiren(this.wanted > 0 && this.cars.length > 0);
    return this.events;
  }
}
