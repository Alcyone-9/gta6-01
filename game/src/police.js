// Coral City Heat v2 — the law, complete. A heat score underlies the five
// stars: crimes add heat, being watched stops it cooling, and breaking the
// police line of sight long enough bleeds it away at a fair, readable rate.
// Patrol cars spawn on the road grid at the edge of sight and steer a pursuit
// that leads its target. New in v2, the chase leaves the car: when a patrol
// gets close to a slow or on-foot player, its OFFICER gets out and runs —
// faster than a walking Marco, slower than a sprinting one — and standing
// officers guard the roadblocks that appear at four stars: three patrol cars
// parked across the road with two officers in front of them. The BUSTED
// meter fills whenever any officer or patrol is close while the player is
// slow or stopped, on foot or behind the wheel; empty health is WASTED and
// is handled by the main loop. A `frozen` flag locks heat, stars and the
// bust meter exactly where they are — the screenshot poses use it so a
// three-star chase frame can never drift.

import { ROADS, CITY_EDGE, collideCircle } from './city.js';
import { makePatrolCar } from './vehicles.js';
import { createFigure, animateFigure } from './peds.js';
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
  bumpRival: 12,
};

const OFFICER_PALETTE = { shirt: 0x2c4a6e, pants: 0x1d2c3d, skin: 0xc68863, hair: 0x1d1710 };

export function createPolice(scene) {
  const cops = [];
  const officers = []; // foot officers: {mesh, car, state, cycle, x, z}
  const wanted = {
    heat: 0,
    stars: 0,
    lastSeenAt: -99,
    lastCrimeAt: -99,
    bust: 0,
    frozen: false,
  };
  let time = 0;
  let roadblock = null;
  let roadblockGuards = [];
  let roadblockCooldown = 0;

  function commit(points, seen = true) {
    if (wanted.frozen) return;
    wanted.heat = Math.min(560, wanted.heat + points);
    wanted.lastCrimeAt = time;
    if (seen) wanted.lastSeenAt = time;
    wanted.stars = STAR_THRESHOLDS.filter((t) => wanted.heat >= t).length;
  }

  function clear() {
    wanted.heat = 0;
    wanted.stars = 0;
    wanted.bust = 0;
    wanted.frozen = false;
    for (const o of officers) scene.remove(o.mesh);
    officers.length = 0;
    for (const c of cops) c.officerOut = false;
    clearRoadblock();
  }

  /** Set an exact star level (used by jobs and by the screenshot poses). */
  function setStars(n) {
    wanted.heat = n <= 0 ? 0 : STAR_THRESHOLDS[n - 1] + 5;
    wanted.stars = n;
    wanted.lastSeenAt = time;
  }

  /** Freeze or release heat, stars and bust exactly as they stand. */
  function setFrozen(on) {
    wanted.frozen = !!on;
    if (on) wanted.bust = 0;
  }

  function desiredCops() {
    return [0, 1, 2, 3, 4, 6][wanted.stars] || 0;
  }

  function spawnCop(player) {
    const car = makePatrolCar(scene);
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
    car.officerOut = false;
    cops.push(car);
    return car;
  }

  function removeCop(index) {
    const [car] = cops.splice(index, 1);
    const oi = officers.findIndex((o) => o.car === car);
    if (oi >= 0) { scene.remove(officers[oi].mesh); officers.splice(oi, 1); }
    scene.remove(car.mesh);
  }

  function deployOfficer(car) {
    const mesh = createFigure(Math.random, OFFICER_PALETTE);
    mesh.position.set(car.x + Math.cos(car.heading) * 2.2, 0.24, car.z - Math.sin(car.heading) * 2.2);
    scene.add(mesh);
    const officer = {
      mesh, car, state: 'chase', cycle: Math.random() * 6,
      get x() { return mesh.position.x; },
      get z() { return mesh.position.z; },
    };
    officers.push(officer);
    car.officerOut = true;
    return officer;
  }

  function recallOfficer(officer) {
    const i = officers.indexOf(officer);
    if (i >= 0) { scene.remove(officer.mesh); officers.splice(i, 1); }
    if (officer.car) officer.car.officerOut = false;
  }

  /** Park a real roadblock: three cars across the road plus standing guards. */
  function placeRoadblockAt(tx, tz, acrossX = true) {
    clearRoadblock();
    roadblock = [];
    const offsets = [-4.6, 0, 4.6];
    for (const off of offsets) {
      const car = makePatrolCar(scene);
      car.mesh.position.set(acrossX ? tx + off : tx, 0, acrossX ? tz : tz + off);
      car.mesh.rotation.y = acrossX ? Math.PI / 2 : 0;
      car.heading = car.mesh.rotation.y;
      car.parked = true;
      car.speed = 0;
      roadblock.push(car);
    }
    roadblockGuards = [];
    for (const off of [-2.4, 2.4]) {
      const mesh = createFigure(Math.random, OFFICER_PALETTE);
      mesh.position.set(acrossX ? tx + off : tx - 3.4, 0.24, acrossX ? tz - 3.4 : tz + off);
      mesh.rotation.y = acrossX ? Math.PI : -Math.PI / 2;
      scene.add(mesh);
      roadblockGuards.push({ mesh, get x() { return mesh.position.x; }, get z() { return mesh.position.z; } });
    }
    roadblockCooldown = 26;
    return roadblock;
  }

  function placeRoadblock(player) {
    const ahead = 58;
    const tx = clamp(player.x + Math.sin(player.heading || 0) * ahead, -CITY_EDGE, CITY_EDGE);
    const tz = clamp(player.z + Math.cos(player.heading || 0) * ahead, -CITY_EDGE, CITY_EDGE);
    const alongX = Math.abs(Math.sin(player.heading || 0)) > 0.6;
    const line = ROADS.reduce((b, r) => (Math.abs(r - (alongX ? tz : tx)) < Math.abs(b - (alongX ? tz : tx)) ? r : b), ROADS[0]);
    return placeRoadblockAt(alongX ? tx : line, alongX ? line : tz, !alongX);
  }

  function clearRoadblock() {
    if (roadblock) for (const car of roadblock) scene.remove(car.mesh);
    for (const g of roadblockGuards) scene.remove(g.mesh);
    roadblock = null;
    roadblockGuards = [];
  }

  /**
   * Advance the whole system. player: {x, z, speed, onFoot, heading, inCar}.
   * Returns { nearestCop, nearestThreat, seen } for HUD, audio and bust logic.
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
    for (const o of officers) {
      if (Math.hypot(o.x - player.x, o.z - player.z) < 40) seen = true;
    }
    if (seen) wanted.lastSeenAt = time;
    if (!wanted.frozen && time - wanted.lastSeenAt > 6 && time - wanted.lastCrimeAt > 4) {
      wanted.heat = Math.max(0, wanted.heat - dt * 7);
      wanted.stars = STAR_THRESHOLDS.filter((t) => wanted.heat >= t).length;
    }

    // Fleet size follows the stars (frozen poses place their own cars).
    const want = desiredCops();
    if (!wanted.frozen) {
      while (cops.length < want) spawnCop(player);
      for (let i = cops.length - 1; i >= 0; i--) {
        const d = Math.hypot(cops[i].x - player.x, cops[i].z - player.z);
        if (cops.length > want && d > 90) removeCop(i);
        else if (wanted.stars === 0 && d > 110) removeCop(i);
      }
    }

    // Roadblocks only under real pressure, and only while driving.
    if (!wanted.frozen && wanted.stars >= 4 && !roadblock && roadblockCooldown <= 0 && !player.onFoot) placeRoadblock(player);
    if (roadblock && (wanted.stars < 3 || Math.hypot(roadblock[0].x - player.x, roadblock[0].z - player.z) > 140)) clearRoadblock();

    // Pursuit steering: aim at where the player will be in about a second.
    // A car whose officer is out stays parked with the officer.
    const topSpeed = 15.5 + wanted.stars * 1.6;
    for (const cop of cops) {
      const dPlayer = Math.hypot(cop.x - player.x, cop.z - player.z);
      const playerSlow = player.onFoot || Math.abs(player.speed) < 2.4;
      if (!wanted.frozen && !cop.officerOut && dPlayer < 13 && playerSlow && wanted.stars > 0) {
        deployOfficer(cop);
      }
      if (cop.officerOut) {
        cop.speed = Math.max(0, cop.speed - dt * 16);
        cop.mesh.rotation.y = cop.heading;
        continue;
      }
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
        cop.speed *= 0.4;
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

    // ---- Foot officers: run the player down, or get back in the car.
    let nearestThreat = nearestCop;
    for (let i = officers.length - 1; i >= 0; i--) {
      const o = officers[i];
      const dx = player.x - o.x;
      const dz = player.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < nearestThreat) nearestThreat = d;
      // The chase is over if the player drives off or the heat dies.
      if (d > 30 || wanted.stars === 0) { recallOfficer(o); continue; }
      const runSpeed = player.onFoot && Math.abs(player.speed) > 6 ? 7.9 : 5.6;
      if (d > 1.4) {
        const heading = Math.atan2(dx, dz);
        o.mesh.rotation.y = heading;
        o.mesh.position.x += Math.sin(heading) * runSpeed * dt;
        o.mesh.position.z += Math.cos(heading) * runSpeed * dt;
        const fixed = collideCircle(colliders, o.mesh.position.x, o.mesh.position.z, 0.5);
        o.mesh.position.x = fixed.x;
        o.mesh.position.z = fixed.z;
        o.cycle += dt * runSpeed * 2.4;
        animateFigure(o.mesh, o.cycle, 1.6);
      }
    }
    for (const g of roadblockGuards) {
      const d = Math.hypot(g.x - player.x, g.z - player.z);
      if (d < nearestThreat) nearestThreat = d;
    }

    // The bust meter: a close threat + a slow or stopped player is an arrest,
    // whether the threat is a patrol car, a running officer or a roadblock.
    if (!wanted.frozen) {
      const vulnerable = player.onFoot || Math.abs(player.speed) < 2.2;
      const closeOfficer = officers.some((o) => Math.hypot(o.x - player.x, o.z - player.z) < 3.2);
      // Roadblock guards count too: the header promises that standing next
      // to a roadblock while slow is an arrest, but the guards were never
      // actually wired into the meter — only into nearestThreat.
      const closeGuard = roadblockGuards.some((g) => Math.hypot(g.x - player.x, g.z - player.z) < 3.4);
      const closeHands = closeOfficer || closeGuard;
      if (wanted.stars > 0 && vulnerable && (nearestCop < 8.5 || closeHands)) {
        wanted.bust = Math.min(1, wanted.bust + dt / (closeHands ? 1.9 : 2.6));
      } else {
        wanted.bust = Math.max(0, wanted.bust - dt / 1.6);
      }
    }

    return {
      nearestCop: nearestCop === Infinity ? null : nearestCop,
      nearestThreat: nearestThreat === Infinity ? null : nearestThreat,
      seen,
      roadblock: roadblock || [],
    };
  }

  return {
    cops, officers, wanted, commit, clear, setStars, setFrozen, update,
    placeRoadblockAt, deployOfficer,
    get roadblock() { return roadblock || []; },
    get roadblockGuards() { return roadblockGuards; },
  };
}
