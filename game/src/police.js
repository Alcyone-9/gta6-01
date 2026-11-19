// Coral City Heat — the law. A heat score underlies the five stars: crimes add
// heat, being watched stops it cooling, and hiding long enough bleeds it away.
// Patrol cars spawn on the road grid at the edge of sight and steer a simple
// pursuit — aim at the player's near future, faster and more numerous as the
// stars climb, with a parked roadblock joining at four stars. If a patrol gets
// close while the player is slow or on foot, the bust meter fills instead.

import * as THREE from 'three';
import { ROADS, CITY_EDGE, collideCircle } from './city.js';
import { makePatrolCar } from './vehicles.js';
import { clamp, turnToward, pick } from './rng.js';

const STAR_THRESHOLDS = [40, 110, 200, 320, 470];
export const CRIMES = {
  stealCar: 55,
  hitPed: 90,
  hitCop: 130,
  attack: 45,
  shoot: 35,
  hitAndRunCar: 30,
  property: 18,
};

export function createPolice(scene) {
  const cops = [];
  const wanted = {
    heat: 0,
    stars: 0,
    lastSeenAt: -99,
    lastCrimeAt: -99,
    bust: 0,
  };
  let time = 0;
  let roadblock = null;
  let roadblockCooldown = 0;

  function commit(points, seen = true) {
    wanted.heat = Math.min(560, wanted.heat + points);
    wanted.lastCrimeAt = time;
    if (seen) wanted.lastSeenAt = time;
    wanted.stars = STAR_THRESHOLDS.filter((t) => wanted.heat >= t).length;
  }

  function clear() {
    wanted.heat = 0;
    wanted.stars = 0;
    wanted.bust = 0;
  }

  function setStars(n) {
    wanted.heat = n <= 0 ? 0 : STAR_THRESHOLDS[n - 1] + 5;
    wanted.stars = n;
    wanted.lastSeenAt = time;
  }

  function desiredCops() {
    return [0, 1, 2, 3, 4, 6][wanted.stars] || 0;
  }

  function spawnCop(player) {
    const car = makePatrolCar(scene);
    // Spawn on a road, 65–95 m away, biased ahead of the player's travel.
    const vertical = Math.random() < 0.5;
    const line = pick(Math.random, ROADS);
    const dist = 65 + Math.random() * 30;
    const sign = Math.random() < 0.5 ? -1 : 1;
    if (vertical) {
      car.mesh.position.set(line, 0, clamp(player.z + sign * dist, -CITY_EDGE, CITY_EDGE));
    } else {
      car.mesh.position.set(clamp(player.x + sign * dist, -CITY_EDGE, CITY_EDGE), 0, line);
    }
    car.heading = Math.random() * Math.PI * 2;
    car.speed = 0;
    cops.push(car);
    return car;
  }

  function removeCop(index) {
    const [car] = cops.splice(index, 1);
    scene.remove(car.mesh);
  }

  function placeRoadblock(player) {
    // Two patrol cars parked nose-to-nose across the road the player is heading down.
    roadblock = [];
    const ahead = 55;
    const tx = clamp(player.x + Math.sin(player.heading || 0) * ahead, -CITY_EDGE, CITY_EDGE);
    const tz = clamp(player.z + Math.cos(player.heading || 0) * ahead, -CITY_EDGE, CITY_EDGE);
    const lineX = ROADS.reduce((b, r) => (Math.abs(r - tx) < Math.abs(b - tx) ? r : b), ROADS[0]);
    for (const off of [-2.6, 2.6]) {
      const car = makePatrolCar(scene);
      car.mesh.position.set(lineX + off, 0, tz);
      car.mesh.rotation.y = Math.PI / 2;
      car.parked = true;
      scene.add(car.mesh);
      roadblock.push(car);
    }
    roadblockCooldown = 26;
  }

  function clearRoadblock() {
    if (!roadblock) return;
    for (const car of roadblock) scene.remove(car.mesh);
    roadblock = null;
  }

  /**
   * Advance the whole system. player: {x, z, speed, onFoot, heading, inCar}.
   * Returns { nearestCop, seen } for the HUD, audio and bust logic.
   */
  function update(dt, player, colliders) {
    time += dt;
    roadblockCooldown = Math.max(0, roadblockCooldown - dt);

    // Seeing the player keeps the heat on; hiding lets it bleed off.
    let nearestCop = Infinity;
    let seen = false;
    for (const cop of cops) {
      const d = Math.hypot(cop.x - player.x, cop.z - player.z);
      if (d < nearestCop) nearestCop = d;
      if (d < 60) seen = true;
    }
    if (seen) wanted.lastSeenAt = time;
    if (time - wanted.lastSeenAt > 6 && time - wanted.lastCrimeAt > 4) {
      wanted.heat = Math.max(0, wanted.heat - dt * 7);
      wanted.stars = STAR_THRESHOLDS.filter((t) => wanted.heat >= t).length;
    }

    // Fleet size follows the stars.
    const want = desiredCops();
    while (cops.length < want) spawnCop(player);
    for (let i = cops.length - 1; i >= 0; i--) {
      const d = Math.hypot(cops[i].x - player.x, cops[i].z - player.z);
      if (cops.length > want && d > 90) removeCop(i);
      else if (wanted.stars === 0 && d > 110) removeCop(i);
    }

    // Roadblocks only under real pressure, and only while driving.
    if (wanted.stars >= 4 && !roadblock && roadblockCooldown <= 0 && !player.onFoot) placeRoadblock(player);
    if (roadblock && (wanted.stars < 3 || Math.hypot(roadblock[0].x - player.x, roadblock[0].z - player.z) > 130)) clearRoadblock();

    // Pursuit steering: aim at where the player will be in about a second.
    const topSpeed = 15.5 + wanted.stars * 1.6;
    for (const cop of cops) {
      const lead = clamp(player.speed, 0, 18) * 0.55;
      const tx = player.x + Math.sin(player.heading || 0) * lead * (player.onFoot ? 0 : 1);
      const tz = player.z + Math.cos(player.heading || 0) * lead * (player.onFoot ? 0 : 1);
      const dx = tx - cop.x;
      const dz = tz - cop.z;
      const dist = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(dx, dz);
      cop.heading = turnToward(cop.heading, targetHeading, dt * 1.9);
      const facing = Math.cos(Math.atan2(Math.sin(targetHeading - cop.heading), Math.cos(targetHeading - cop.heading)));
      const desired = dist > 4 ? topSpeed * clamp(facing, 0.25, 1) : 0;
      cop.speed += clamp(desired - cop.speed, -dt * 16, dt * 7);
      cop.mesh.position.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.mesh.position.z += Math.cos(cop.heading) * cop.speed * dt;
      const fixed = collideCircle(colliders, cop.mesh.position.x, cop.mesh.position.z, 1.7);
      if (Math.abs(fixed.x - cop.mesh.position.x) > 0.01 || Math.abs(fixed.z - cop.mesh.position.z) > 0.01) {
        cop.speed *= 0.4; // scraped a building: lose momentum, keep chasing
      }
      cop.mesh.position.x = fixed.x;
      cop.mesh.position.z = fixed.z;
      cop.mesh.rotation.y = cop.heading;
      const bar = cop.mesh.userData.lightbar;
      if (bar) bar.material.color.setHex(Math.floor(time * 3) % 2 === 0 ? 0x2f6fd0 : 0xff4b3e);
    }
    if (roadblock) {
      for (const car of roadblock) {
        const bar = car.mesh.userData.lightbar;
        if (bar) bar.material.color.setHex(Math.floor(time * 3) % 2 === 0 ? 0xff4b3e : 0x2f6fd0);
      }
    }

    // The bust meter: a close patrol + a slow or walking player is an arrest.
    const vulnerable = player.onFoot || Math.abs(player.speed) < 2.2;
    if (nearestCop < 8.5 && vulnerable && wanted.stars > 0) {
      wanted.bust = Math.min(1, wanted.bust + dt / 2.6);
    } else {
      wanted.bust = Math.max(0, wanted.bust - dt / 1.6);
    }

    return { nearestCop: nearestCop === Infinity ? null : nearestCop, seen, roadblock: roadblock || [] };
  }

  return { cops, wanted, commit, clear, setStars, update, get roadblock() { return roadblock || []; } };
}
