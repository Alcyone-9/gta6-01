// Coral City Heat v2 — boot and the living loop. This file owns the player:
// walking with a third-person camera, driving with a chase camera, fists and
// the pistol, entering and stealing cars, the rival courier, the ten hidden
// golden cassettes, getting busted and wasted, the CITY CLEARED screen, the
// save file, and the deterministic ?shot= poses the screenshots are taken
// from. The city, traffic, pedestrians, police, story and sound live in
// their own modules and meet here.

import * as THREE from 'three';
import { mulberry32, clamp, turnToward, angleDelta } from './rng.js';
import { createCity, collideCircle, LANDMARKS, CITY_EDGE, SHORE_Z, districtAt, ROADS } from './city.js';
import { createTraffic, createParked, stepTraffic, spinWheels, createCarMesh } from './vehicles.js';
import { createPeds, stepPeds, knockDown, scarePeds, createFigure } from './peds.js';
import { createPolice, CRIMES } from './police.js';
import { createMissions } from './missions.js';
import { createPlayerMesh } from './player.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = mulberry32(seed * 31337 + 7);

// ---------------------------------------------------------------- renderer
// No shadow maps: every vehicle and figure carries a blob shadow, which
// keeps headless screenshot capture and low-end machines equally smooth.
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('game').appendChild(renderer.domElement);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
const input = createInput(renderer.domElement);
const hud = createHud();
const audio = createAudio();

// ---------------------------------------------------------------- world
const city = createCity(scene, rng);
const colliders = city.colliders;
const traffic = createTraffic(scene, rng, 14);
const parked = createParked(scene, rng, 16);
const peds = createPeds(scene, rng, 26);
const police = createPolice(scene);
const playerMesh = createPlayerMesh();
scene.add(playerMesh.group);

// Two waiting figures make the taxi job's pickup and drop read as places.
for (const spot of [LANDMARKS.taxiPickup, LANDMARKS.taxiDrop]) {
  const figure = createFigure(rng);
  figure.position.set(spot.x + 2.5, 0.24, spot.z + 2.5);
  figure.rotation.y = -0.7;
  scene.add(figure);
}

// Mission marker: a pillar of gold light plus a ring on the ground.
const markerGroup = new THREE.Group();
const beam = new THREE.Mesh(
  new THREE.CylinderGeometry(1.6, 1.6, 42, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
);
beam.position.y = 21;
markerGroup.add(beam);
const ring = new THREE.Mesh(
  new THREE.RingGeometry(2.6, 3.4, 28),
  new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.15;
markerGroup.add(ring);
scene.add(markerGroup);

// Cash pickups dropped by fleeing pockets.
const pickups = [];
const pickupGeo = new THREE.BoxGeometry(0.55, 0.18, 0.34);
const pickupMat = new THREE.MeshBasicMaterial({ color: 0x53e06a });
function dropCash(x, z, amount) {
  const mesh = new THREE.Mesh(pickupGeo, pickupMat);
  mesh.position.set(x, 0.5, z);
  scene.add(mesh);
  pickups.push({ mesh, amount, spin: Math.random() * 6 });
}

// ------------------------------------------------------- hidden collectibles
// Ten golden cassettes, tucked at street corners and landmarks across all
// four districts. Each one found is +$150 and a line on the HUD counter.
const COLLECTIBLE_SPOTS = [
  { x: 10, z: -10 }, { x: -74, z: 74 }, { x: 86, z: -86 }, { x: -166, z: 10 },
  { x: 14, z: 186 }, { x: 166, z: -74 }, { x: -14, z: -166 }, { x: 74, z: 166 },
  { x: -148, z: -148 }, { x: 170, z: 170 },
];
const collectibleGeo = new THREE.BoxGeometry(0.72, 0.5, 0.18);
const collectibleMat = new THREE.MeshBasicMaterial({ color: 0xffc93e });
const collectibles = COLLECTIBLE_SPOTS.map((spot, i) => {
  const mesh = new THREE.Mesh(collectibleGeo, collectibleMat);
  mesh.position.set(spot.x, 0.9, spot.z);
  scene.add(mesh);
  return { id: i, x: spot.x, z: spot.z, mesh, found: false };
});
function refreshCollectibleHud() {
  hud.setCollectibles(collectibles.filter((c) => c.found).length, collectibles.length);
}

// ---------------------------------------------------------------- player state
const SAVE_KEY = 'coral-city-heat-save-v2';
const player = {
  x: LANDMARKS.start.x, z: LANDMARKS.start.z, heading: Math.PI,
  hp: 100, money: 120, speed: 0,
  onFoot: true, car: null, hasGun: false,
  lastHurtAt: -99, dead: false,
};
const stats = { earned: 0, jobsDone: 0, playSeconds: 0, bustedCount: 0, wastedCount: 0 };
let camYaw = Math.PI;
let camPitch = 0.24;
let mode = 'title'; // title | play | pause | ended | clear
let time = 0;
let crimeCooldowns = {};
let endKind = null;
let rival = null;
let rivalBumps = 0;
let rivalBumpAt = -99;

function commitCrime(kind, seen = true) {
  const now = time;
  if (crimeCooldowns[kind] && now - crimeCooldowns[kind] < 1.2) return;
  crimeCooldowns[kind] = now;
  police.commit(CRIMES[kind], seen);
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: player.money, hp: player.hp, hasGun: player.hasGun,
      mission: missions.index, x: player.x, z: player.z,
      collectibles: collectibles.filter((c) => c.found).map((c) => c.id),
      stats,
    }));
  } catch { /* private mode: play without a save */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- missions
const missions = createMissions({
  phone: (from, msg) => hud.phone(from, msg),
  banner: (big, sub) => hud.banner(big, sub),
  pay: (amount) => {
    player.money += amount;
    stats.earned += amount;
    hud.setMoney(player.money);
    saveGame();
  },
  sfx: (name) => {
    if (name === 'win') audio.sting(true);
    else if (name === 'pickup') audio.pickup();
    else if (name === 'phone') audio.phoneBuzz();
  },
  setStars: (n) => police.setStars(n),
  markTargetCar: () => {
    // The gold coupe: the parked car farthest into the north-west, repainted.
    let best = null;
    let bestScore = -1;
    for (const car of parked) {
      const score = -car.x - car.z;
      if (score > bestScore && Math.hypot(car.x - player.x, car.z - player.z) > 90) { best = car; bestScore = score; }
    }
    best = best || parked[0];
    best.mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0xd9a441 });
    best.missionTarget = true;
    return best;
  },
  spawnFinalCar: () => {
    const mesh = createCarMesh(0xb03030, 'civilian', 'convertible');
    mesh.position.set(-152, 0, -138);
    mesh.rotation.y = Math.PI / 2;
    scene.add(mesh);
    const car = {
      mesh, kind: 'parked', name: 'Sirocco Roadster', parked: true, stolen: false,
      occupied: false, speed: 0, heading: Math.PI / 2, radius: 2.3, missionTarget: true,
      get x() { return mesh.position.x; }, get z() { return mesh.position.z; },
    };
    parked.push(car);
    return car;
  },
  spawnRivalCar: () => {
    // A purple Suntail that runs the grid like traffic, only faster and
    // with somewhere to be. It lives in its own one-car fleet for stepping.
    const mesh = createCarMesh(0x9b59b6, 'civilian', 'sedan');
    scene.add(mesh);
    rival = {
      mesh, kind: 'rival', name: 'Rival Suntail', type: 'sedan',
      axis: 'x', dir: 1, line: 0, along: clamp(player.x + 70, -CITY_EDGE, CITY_EDGE),
      speed: 10, cruise: 11.5, heading: Math.PI / 2, radius: 2.3,
      parked: false, stolen: false, occupied: false, honkAt: 0,
      get x() { return mesh.position.x; }, get z() { return mesh.position.z; },
    };
    rivalBumps = 0;
    return rival;
  },
  onJobComplete: (jobIndex) => {
    stats.jobsDone = jobIndex + 1;
    if (jobIndex === 6 && rival) {
      scene.remove(rival.mesh);
      rival = null;
    }
    saveGame();
  },
  onStoryComplete: () => {
    saveGame();
    showCityCleared();
  },
});

// ---------------------------------------------------------------- cars
function nearestEnterableCar() {
  let best = null;
  let bestD = 3.4;
  for (const car of [...parked, ...traffic]) {
    if (car.occupied) continue;
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

function enterCar(car) {
  player.onFoot = false;
  player.car = car;
  car.occupied = true;
  car.parked = false;
  playerMesh.group.visible = false;
  audio.door();
  if (!car.stolen && car.kind !== 'owned') {
    car.stolen = true;
    commitCrime('stealCar');
    scarePeds(peds, car.x, car.z, 9);
  }
  camYaw = car.heading;
}

/** Re-derive a traffic car's grid state from where it actually stopped.
 *  While the player drives a traffic car, its mesh moves freely but its
 *  axis/line/along still describe the road it was stolen from — on exit,
 *  stepTraffic would lerp it back across the map toward that stale line.
 *  Snapping the grid state to the exit position lets it rejoin traffic
 *  from the street it is really on. */
function resyncTrafficCar(car) {
  const alongX = Math.abs(Math.sin(car.heading)) >= Math.abs(Math.cos(car.heading));
  const nearestRoad = (v) => ROADS.reduce((b, r) => (Math.abs(r - v) < Math.abs(b - v) ? r : b), ROADS[0]);
  if (alongX) {
    car.axis = 'x';
    car.line = nearestRoad(car.z);
    car.along = clamp(car.x, -CITY_EDGE, CITY_EDGE);
    car.dir = Math.sin(car.heading) >= 0 ? 1 : -1;
  } else {
    car.axis = 'z';
    car.line = nearestRoad(car.x);
    car.along = clamp(car.z, -CITY_EDGE, CITY_EDGE);
    car.dir = Math.cos(car.heading) >= 0 ? 1 : -1;
  }
  car.speed = 0;
}

function exitCar() {
  const car = player.car;
  if (!car) return;
  player.onFoot = true;
  player.car = null;
  car.occupied = false;
  car.speed = 0;
  if (car.kind === 'traffic') resyncTrafficCar(car);
  const sideX = Math.cos(car.heading);
  const sideZ = -Math.sin(car.heading);
  player.x = car.x + sideX * 2.4;
  player.z = car.z + sideZ * 2.4;
  playerMesh.group.visible = true;
  audio.door();
}

function driveCar(dt) {
  const car = player.car;
  const fwd = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
  const steer = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
  const hand = input.down('Space');
  const maxSpeed = car.missionTarget ? 30 : 26;
  if (fwd > 0) car.speed += dt * 13 * (1 - Math.max(0, car.speed) / (maxSpeed + 6));
  else if (fwd < 0) car.speed -= dt * (car.speed > 0.5 ? 20 : 8);
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), dt * (hand ? 16 : 3.5));
  if (hand) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), dt * 10);
  car.speed = clamp(car.speed, -9, maxSpeed);
  const grip = clamp(Math.abs(car.speed) / 6, 0, 1);
  car.heading += steer * dt * 1.55 * grip * (car.speed < 0 ? -1 : 1) * (hand ? 1.5 : 1);
  const nx = car.mesh.position.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.mesh.position.z + Math.cos(car.heading) * car.speed * dt;
  const fixed = collideCircle(colliders, nx, nz, 1.8);
  if (Math.abs(fixed.x - nx) > 0.02 || Math.abs(fixed.z - nz) > 0.02) {
    if (Math.abs(car.speed) > 8) { hurtPlayer(4); audio.crash(1); }
    car.speed *= 0.35;
  }
  car.mesh.position.x = clamp(fixed.x, -CITY_EDGE - 8, CITY_EDGE + 8);
  car.mesh.position.z = clamp(fixed.z, -CITY_EDGE - 4, SHORE_Z + 20);
  car.mesh.rotation.y = car.heading;
  spinWheels(car, dt);
  player.x = car.mesh.position.x;
  player.z = car.mesh.position.z;
  player.heading = car.heading;
  player.speed = car.speed;

  // Car versus car: a shove, a crunch, and paperwork with the police.
  const others = [...traffic, ...parked, ...police.cops, ...police.roadblock];
  if (rival) others.push(rival);
  for (const other of others) {
    if (other === car || other.occupied) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 16 && d2 > 0.001) {
      const d = Math.sqrt(d2);
      const push = (4 - d) / 2;
      car.mesh.position.x -= (dx / d) * push;
      car.mesh.position.z -= (dz / d) * push;
      if (Math.abs(car.speed) > 5) {
        audio.crash(0.8);
        hurtPlayer(3);
        if (other.kind === 'cop') commitCrime('hitCop');
        else if (other.kind === 'rival') {
          commitCrime('bumpRival');
          if (time - rivalBumpAt > 1.6) {
            rivalBumpAt = time;
            rivalBumps += 1;
            hud.hitmark();
            hud.phone('DEX', rivalBumps >= 2 ? 'He is spinning out — package dropped!' : 'One more hit like that and he drops it!');
          }
        } else commitCrime('hitAndRunCar');
        car.speed *= 0.45;
      } else {
        car.speed *= 0.8;
      }
    }
  }
  // Car versus pedestrian: the crime this city least forgives.
  if (Math.abs(car.speed) > 3) {
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - car.x, ped.z - car.z) < 2.1) {
        knockDown(ped);
        commitCrime('hitPed');
        audio.crash(0.5);
        if (!ped.cashDropped && Math.random() < 0.55) {
          ped.cashDropped = true;
          dropCash(ped.x + 1, ped.z + 1, 10 + Math.floor(Math.random() * 40));
        }
        scarePeds(peds, ped.x, ped.z, 12);
      }
    }
  }
}

// ---------------------------------------------------------------- on foot
function walkPlayer(dt) {
  const look = input.takeLook();
  camYaw -= look.dx * 0.0026;
  camPitch = clamp(camPitch + look.dy * 0.0022, -0.15, 0.9);
  const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = sprint ? 7.4 : 4.3;
  let mx = 0;
  let mz = 0;
  if (input.down('KeyW')) mz += 1;
  if (input.down('KeyS')) mz -= 1;
  if (input.down('KeyA')) mx -= 1;
  if (input.down('KeyD')) mx += 1;
  const len = Math.hypot(mx, mz) || 1;
  const sin = Math.sin(camYaw);
  const cos = Math.cos(camYaw);
  const vx = (sin * mz + cos * mx) / len;
  const vz = (cos * mz - sin * mx) / len;
  const moving = mx !== 0 || mz !== 0;
  if (moving) {
    player.x += vx * speed * dt;
    player.z += vz * speed * dt;
    player.heading = turnToward(player.heading, Math.atan2(vx, vz), dt * 12);
  }
  player.speed = moving ? speed : 0;
  const fixed = collideCircle(colliders, player.x, player.z, 0.55);
  player.x = clamp(fixed.x, -CITY_EDGE - 8, CITY_EDGE + 8);
  player.z = clamp(fixed.z, -CITY_EDGE - 8, SHORE_Z + 22);
  for (const car of [...traffic, ...parked, ...police.cops]) {
    const dx = player.x - car.x;
    const dz = player.z - car.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 5.2 && d2 > 0.001) {
      const d = Math.sqrt(d2);
      player.x = car.x + (dx / d) * 2.3;
      player.z = car.z + (dz / d) * 2.3;
      const carSpeed = Math.abs(car.speed || 0);
      if (carSpeed > 6 && time - player.lastHurtAt > 0.8) {
        hurtPlayer(9);
        knockPlayerBack(dx / d, dz / d);
      }
    }
  }
  playerMesh.group.position.set(player.x, 0.24, player.z);
  playerMesh.group.rotation.y = player.heading;
  playerMesh.update(dt, moving ? speed : 0);
  if (moving && playerMesh.stepped) audio.step();
}

function knockPlayerBack(dx, dz) {
  player.x += dx * 2.2;
  player.z += dz * 2.2;
  audio.crash(0.5);
}

function hurtPlayer(amount) {
  if (amount <= 0 || player.dead) return;
  player.hp -= amount;
  player.lastHurtAt = time;
  audio.hurt();
  if (player.hp <= 0) {
    player.hp = 0;
    endRun('wasted');
  }
}

// ---------------------------------------------------------------- combat
let punchCooldown = 0;
function combat(dt) {
  punchCooldown -= dt;
  const wantHit = input.down('KeyF') || input.takeClick();
  if (!wantHit || punchCooldown > 0 || !player.onFoot) return;
  punchCooldown = 0.38;
  const fwdX = Math.sin(player.heading);
  const fwdZ = Math.cos(player.heading);
  if (player.hasGun) {
    audio.shot();
    commitCrime('shoot');
    scarePeds(peds, player.x, player.z, 15);
    let best = null;
    let bestD = 46;
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      const dx = ped.x - player.x;
      const dz = ped.z - player.z;
      const ahead = dx * fwdX + dz * fwdZ;
      const side = Math.abs(dx * fwdZ - dz * fwdX);
      if (ahead > 0 && ahead < bestD && side < 1.1) { best = ped; bestD = ahead; }
    }
    if (best) {
      knockDown(best);
      hud.hitmark();
      if (!best.cashDropped && Math.random() < 0.5) {
        best.cashDropped = true;
        dropCash(best.x + 0.8, best.z, 10 + Math.floor(Math.random() * 45));
      }
    } else {
      for (const car of [...traffic, ...parked]) {
        const dx = car.x - player.x;
        const dz = car.z - player.z;
        const ahead = dx * fwdX + dz * fwdZ;
        const side = Math.abs(dx * fwdZ - dz * fwdX);
        if (ahead > 0 && ahead < bestD && side < 2.2) { commitCrime('property'); hud.hitmark(); break; }
      }
    }
    return;
  }
  // Fists.
  playerMesh.punch();
  audio.punch();
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - player.x;
    const dz = ped.z - player.z;
    if (Math.hypot(dx, dz) < 1.9 && dx * fwdX + dz * fwdZ > 0) {
      knockDown(ped);
      commitCrime('attack');
      hud.hitmark();
      scarePeds(peds, ped.x, ped.z, 11);
      if (!ped.cashDropped && Math.random() < 0.45) {
        ped.cashDropped = true;
        dropCash(ped.x + 0.8, ped.z + 0.5, 5 + Math.floor(Math.random() * 30));
      }
      break;
    }
  }
}

// ---------------------------------------------------------------- run state
function startRun(fromSave) {
  const save = fromSave ? loadSave() : null;
  if (save) {
    player.money = save.money ?? 120;
    player.hp = save.hp ?? 100;
    player.hasGun = !!save.hasGun;
    player.x = save.x ?? LANDMARKS.start.x;
    player.z = save.z ?? LANDMARKS.start.z;
    Object.assign(stats, save.stats || {});
    for (const c of collectibles) {
      c.found = (save.collectibles || []).includes(c.id);
      c.mesh.visible = !c.found;
    }
    missions.startAt(save.mission ?? 0);
  } else {
    player.money = 120;
    player.hp = 100;
    player.hasGun = false;
    player.x = LANDMARKS.start.x;
    player.z = LANDMARKS.start.z;
    Object.assign(stats, { earned: 0, jobsDone: 0, playSeconds: 0, bustedCount: 0, wastedCount: 0 });
    for (const c of collectibles) { c.found = false; c.mesh.visible = true; }
    missions.startAt(0);
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }
  player.onFoot = true;
  player.car = null;
  player.dead = false;
  player.heading = Math.PI;
  camYaw = Math.PI;
  crimeCooldowns = {}; // a fresh run must not inherit the last run's crime throttle
  police.clear();
  if (rival) { scene.remove(rival.mesh); rival = null; }
  playerMesh.gun.visible = player.hasGun;
  playerMesh.group.visible = true;
  playerMesh.group.position.set(player.x, 0.24, player.z);
  hud.setMoney(player.money);
  refreshCollectibleHud();
  hud.setMusic(audio.muted);
  hud.show();
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('end-screen').classList.add('hidden');
  document.getElementById('clear-screen').classList.add('hidden');
  mode = 'play';
  audio.unlock();
  audio.startMusic(); // the Start button click is the unlocking gesture
  if (!shotName) input.lock();
}

function endRun(kind) {
  if (mode === 'ended') return;
  mode = 'ended';
  endKind = kind;
  player.dead = kind === 'wasted';
  if (kind === 'busted') stats.bustedCount += 1;
  else stats.wastedCount += 1;
  input.unlock();
  const title = document.getElementById('end-title');
  const text = document.getElementById('end-text');
  if (kind === 'busted') {
    const fine = Math.min(player.money, 100 + police.wanted.stars * 60);
    player.money -= fine;
    title.textContent = 'BUSTED';
    text.textContent = `Coral City PD walks you out of the station $${fine} lighter. Your current job is still waiting — pick it up from the checkpoint.`;
    audio.sting(false);
  } else {
    const bill = Math.min(player.money, 150);
    player.money -= bill;
    title.textContent = 'WASTED';
    text.textContent = `You wake up at Coral General with a $${bill} bill and a new respect for traffic. Your current job is still waiting.`;
    audio.sting(false);
  }
  hud.setMoney(player.money);
  saveGame();
  document.getElementById('end-screen').classList.remove('hidden');
}

/** BUSTED/WASTED restart: back in the world at the station or hospital,
 *  heat cleared, health restored, current job kept as the checkpoint. */
function respawn() {
  if (player.car) exitCar();
  if (endKind === 'busted') {
    player.x = LANDMARKS.policeStation.x + 20;
    player.z = LANDMARKS.policeStation.z + 18;
  } else {
    player.x = LANDMARKS.hospital.x - 20;
    player.z = LANDMARKS.hospital.z + 18;
  }
  player.hp = 100;
  player.dead = false;
  police.clear();
  document.getElementById('end-screen').classList.add('hidden');
  mode = 'play';
  saveGame();
  if (!shotName) input.lock();
}

function showCityCleared() {
  if (mode !== 'play') return;
  mode = 'clear';
  input.unlock();
  audio.fanfare();
  const mins = Math.floor(stats.playSeconds / 60);
  const secs = Math.floor(stats.playSeconds % 60);
  document.getElementById('clear-stats').innerHTML =
    `Jobs completed: <b>8 / 8</b> · Cash on hand: <b>$${player.money.toLocaleString()}</b> · ` +
    `Total earned: <b>$${stats.earned.toLocaleString()}</b><br>` +
    `Golden cassettes: <b>${collectibles.filter((c) => c.found).length} / 10</b> · ` +
    `Time in the city: <b>${mins}m ${secs}s</b> · Busted ${stats.bustedCount}× · Wasted ${stats.wastedCount}×`;
  document.getElementById('clear-screen').classList.remove('hidden');
}

// ---------------------------------------------------------------- UI wiring
const saveAtStart = loadSave();
if (saveAtStart) document.getElementById('btn-continue').classList.remove('hidden');
document.getElementById('btn-start').addEventListener('click', () => startRun(false));
document.getElementById('btn-continue').addEventListener('click', () => startRun(true));
document.getElementById('btn-respawn').addEventListener('click', respawn);
document.getElementById('btn-freeroam').addEventListener('click', () => {
  document.getElementById('clear-screen').classList.add('hidden');
  mode = 'play';
  hud.banner('FREE ROAM', 'Coral City is yours — the streets are not done with you');
  if (!shotName) input.lock();
});
document.getElementById('btn-restart').addEventListener('click', () => startRun(false));
document.getElementById('btn-resume').addEventListener('click', () => {
  document.getElementById('pause-screen').classList.add('hidden');
  mode = 'play';
  if (!shotName) input.lock();
});
document.getElementById('btn-quit').addEventListener('click', () => {
  saveGame();
  document.getElementById('pause-screen').classList.add('hidden');
  document.getElementById('start-screen').classList.remove('hidden');
  if (loadSave()) document.getElementById('btn-continue').classList.remove('hidden');
  mode = 'title';
});
document.addEventListener('pointerlockchange', () => {
  if (mode === 'play' && !input.locked && !shotName) {
    mode = 'pause';
    document.getElementById('pause-stats').textContent =
      `Cash $${player.money.toLocaleString()} · Cassettes ${collectibles.filter((c) => c.found).length}/10 · ${missions.done ? 'Story complete — free roam' : missions.objective().title}`;
    document.getElementById('pause-screen').classList.remove('hidden');
  }
});

// ---------------------------------------------------------------- shot poses
let shotFrames = 0;
function poseShot() {
  startRun(false);
  hud.show();
  if (shotName === 'cover') {
    // Hero vista: Marco on a Downtown street, towers and signs behind him,
    // the marina road running south. Lupe's first call is on the phone.
    player.x = 26; player.z = 10.5; player.heading = -1.25;
    playerMesh.group.position.set(player.x, 0.24, player.z);
    playerMesh.group.rotation.y = player.heading;
    camYaw = -1.25; camPitch = 0.3;
    hud.phone('LUPE', 'Marco? Lupe. There is a package waiting at the marina, south shore. Easy money.', 120000);
    hud.setMoney(player.money);
  } else if (shotName === 'drive') {
    const car = parked.find((c) => Math.abs(c.z - 3.2) < 30) || parked[0];
    car.mesh.position.set(-30, 0, 3.2);
    car.heading = Math.PI / 2;
    car.mesh.rotation.y = car.heading;
    enterCar(car);
    car.speed = 11;
    police.clear();
    // Dress the street: three traffic cars ahead and alongside, mid-flow.
    const dress = [[-12, -3.2, Math.PI / 2], [4, 3.2, Math.PI / 2], [-46, -3.2, Math.PI / 2]];
    traffic.slice(0, 3).forEach((t, i) => {
      t.axis = 'x'; t.line = 0; t.dir = 1;
      t.along = dress[i][0];
      t.mesh.position.set(dress[i][0], 0, dress[i][1]);
      t.heading = dress[i][2];
      t.mesh.rotation.y = t.heading;
      t.speed = 9;
    });
    hud.phone('LUPE', 'Wheels suit you, Marco. Keep them clean — the garage is watching.', 120000);
  } else if (shotName === 'chase') {
    // Deterministic three-star chase, frozen: heat, stars and bust cannot
    // drift while the pose holds. Two patrols tight behind, a roadblock
    // of three cars and two officers across the road ahead.
    const car = parked[1];
    car.mesh.position.set(6, 0, -3.2);
    car.heading = -Math.PI / 2;
    car.mesh.rotation.y = car.heading;
    enterCar(car);
    car.stolen = true;
    car.speed = 13;
    police.setStars(3);
    police.update(0.016, { x: player.x, z: player.z, speed: 13, onFoot: false, heading: car.heading }, colliders);
    police.cops.forEach((cop, i) => {
      const behind = [[20, -3.4], [27, 2.8], [38, -4.5]][i] || [24 + i * 6, -3];
      cop.mesh.position.set(behind[0], 0, behind[1]);
      cop.heading = -Math.PI / 2;
      cop.mesh.rotation.y = cop.heading;
      cop.speed = 13;
    });
    police.placeRoadblockAt(player.x - 42, 0, false);
    police.setFrozen(true);
    hud.phone('DEX', 'Three stars, Marco. Do NOT stop for the roadblock — thread it or go around!', 120000);
  } else if (shotName === 'mission') {
    player.x = LANDMARKS.marinaPickup.x + 6;
    player.z = LANDMARKS.marinaPickup.z + 6;
    player.heading = 2.6;
    playerMesh.group.position.set(player.x, 0.24, player.z);
    playerMesh.group.rotation.y = player.heading;
    camYaw = 2.6; camPitch = 0.3;
    hud.phone('LUPE', 'Pick it up at the marina and bring it to the blue door on West 3rd. No questions.', 120000);
    hud.banner('JOB 1 — FIRST ERRAND', 'Pick up the package at the marina', 120000);
  }
}

// ---------------------------------------------------------------- the loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  // Clamped both ways: a first-frame timestamp behind `last` must never run
  // the simulation backwards (negative decay once inflated heat and bust).
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (mode === 'title') {
    // Slow orbital backdrop behind the start screen.
    const t = now / 1000;
    city.update(t);
    camera.position.set(Math.sin(t * 0.05) * 120, 46, Math.cos(t * 0.05) * 120);
    camera.lookAt(0, 0, 20);
    stepTraffic(traffic, dt, rng, [], null, time);
    stepPeds(peds, dt, rng, (x, z, r) => collideCircle(colliders, x, z, r));
    renderer.render(scene, camera);
    return;
  }
  if (mode !== 'play') {
    renderer.render(scene, camera);
    return;
  }
  time += dt;
  stats.playSeconds += dt;
  city.update(time);

  // Music starts on the first genuine gesture if the run began from a pose.
  if (input.gestured && !audio.musicStarted) audio.startMusic();
  if (input.consume('KeyM')) hud.setMusic(audio.toggleMute());

  // --- simulate the world around the player
  const blockers = [{ x: player.x, z: player.z, r: player.onFoot ? 0.6 : 2 }];
  for (const cop of police.cops) blockers.push({ x: cop.x, z: cop.z, r: 2 });
  stepTraffic(traffic, dt, rng, blockers, (car) => {
    audio.horn(Math.hypot(car.x - player.x, car.z - player.z));
  }, time);
  if (rival) stepTraffic([rival], dt, rng, blockers, null, time);
  stepPeds(peds, dt, rng, (x, z, r) => collideCircle(colliders, x, z, r));

  if (player.onFoot) walkPlayer(dt);
  else driveCar(dt);
  combat(dt);

  // --- interact prompt / entering cars
  let prompt = '';
  if (player.onFoot) {
    const car = nearestEnterableCar();
    if (car) prompt = `<b>E</b> — Enter ${car.name}${car.parked ? '' : ' (moving)'}`;
    if (car && input.consume('KeyE')) enterCar(car);
  } else {
    prompt = '<b>E</b> — Exit car';
    if (input.consume('KeyE')) exitCar();
  }
  hud.setPrompt(prompt);

  // --- pickups
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.mesh.rotation.y += dt * 3;
    p.mesh.position.y = 0.5 + Math.sin(time * 3 + p.spin) * 0.12;
    if (Math.hypot(p.mesh.position.x - player.x, p.mesh.position.z - player.z) < (player.onFoot ? 1.4 : 2.6)) {
      player.money += p.amount;
      hud.setMoney(player.money);
      audio.cash();
      scene.remove(p.mesh);
      pickups.splice(i, 1);
    }
  }

  // --- collectibles
  for (const c of collectibles) {
    if (c.found) continue;
    c.mesh.rotation.y += dt * 2.2;
    c.mesh.position.y = 0.9 + Math.sin(time * 2.4 + c.id) * 0.15;
    if (Math.hypot(c.x - player.x, c.z - player.z) < (player.onFoot ? 1.6 : 2.8)) {
      c.found = true;
      c.mesh.visible = false;
      player.money += 150;
      hud.setMoney(player.money);
      refreshCollectibleHud();
      audio.pickup();
      hud.banner('GOLDEN CASSETTE', `${collectibles.filter((k) => k.found).length} of 10 — +$150`);
      saveGame();
    }
  }

  // --- police, bust and wasted
  const policeView = police.update(dt, {
    x: player.x, z: player.z, speed: player.speed, onFoot: player.onFoot, heading: player.heading,
  }, colliders);
  if (police.wanted.bust >= 1) endRun('busted');
  if (player.hp < 100 && time - player.lastHurtAt > 9) player.hp = Math.min(100, player.hp + dt * 2.2);

  // --- missions and marker
  missions.update(dt, {
    x: player.x, z: player.z, inCar: !player.onFoot, car: player.car,
    stars: police.wanted.stars, rivalBumps,
  });
  if (player.hasGun === false && missions.index >= 2) {
    player.hasGun = true;
    playerMesh.gun.visible = true;
  }
  const mark = missions.marker();
  markerGroup.visible = !!mark;
  if (mark) {
    markerGroup.position.set(mark.x, 0, mark.z);
    ring.scale.setScalar(1 + Math.sin(time * 4) * 0.08);
  }

  // --- camera
  if (shotName) {
    poseCameraForShot();
  } else if (player.onFoot) {
    const dist = 6.4;
    const cx = player.x - Math.sin(camYaw) * dist * Math.cos(camPitch);
    const cz = player.z - Math.cos(camYaw) * dist * Math.cos(camPitch);
    const cy = 1.7 + Math.sin(camPitch) * dist;
    camera.position.lerp(new THREE.Vector3(cx, cy, cz), 1 - Math.pow(0.0001, dt));
    camera.lookAt(player.x, 1.6, player.z);
  } else {
    const look = input.takeLook();
    camYaw -= look.dx * 0.003;
    if (Math.abs(angleDelta(camYaw, player.car.heading)) > 0.02 && Math.abs(player.car.speed) > 2) {
      camYaw = turnToward(camYaw, player.car.heading, dt * 1.4);
    }
    const dist = 9.2;
    const cx = player.x - Math.sin(camYaw) * dist;
    const cz = player.z - Math.cos(camYaw) * dist;
    camera.position.lerp(new THREE.Vector3(cx, 3.6, cz), 1 - Math.pow(0.001, dt));
    camera.lookAt(player.x + Math.sin(player.heading) * 6, 1.4, player.z + Math.cos(player.heading) * 6);
  }

  // --- HUD
  hud.setHealth(player.hp / 100);
  hud.setStars(police.wanted.stars);
  hud.setBust(police.wanted.bust);
  const obj = missions.objective();
  hud.setObjective(obj.title, obj.text);
  hud.setSpeed(player.onFoot ? 0 : player.speed * 3.6, !player.onFoot);
  const district = districtAt(player.x, player.z);
  hud.setDistrict(district);
  hud.drawMinimap({
    player: { x: player.x, z: player.z, heading: player.onFoot ? camYaw : player.heading },
    marker: mark,
    cops: police.cops,
    officers: police.officers,
    roadblock: police.roadblock,
    traffic: traffic.filter((c) => !c.parked),
    rival,
    collectibles: collectibles.filter((c) => !c.found),
    district,
  });
  const heat = Math.max(
    police.wanted.stars / 5,
    policeView.nearestThreat !== null && policeView.nearestThreat < 22 ? 0.75 : 0,
  );
  audio.update(dt, !player.onFoot, Math.abs(player.speed) / 26, policeView.nearestCop, heat);

  renderer.render(scene, camera);

  if (shotName) {
    // Hold the posed driving speed: with no keyboard, the arcade physics
    // would coast to a stop before the shutter fires.
    if ((shotName === 'drive' || shotName === 'chase') && player.car) player.car.speed = 12;
    if (shotName === 'chase') {
      // The freeze should make this a no-op; assert it anyway so the frame
      // that gets captured can never show anything but exactly ★★★.
      if (police.wanted.stars !== 3) police.setStars(3);
      police.wanted.bust = 0;
    }
    shotFrames += 1;
    if (shotFrames === 42 && shotName === 'mission') {
      hud.phone('LUPE', 'Pick it up at the marina and bring it to the blue door on West 3rd. No questions.', 120000);
      hud.banner('JOB 1 — FIRST ERRAND', 'Pick up the package at the marina', 120000);
    }
    if (shotFrames === 42 && shotName === 'cover') {
      hud.phone('LUPE', 'Marco? Lupe. There is a package waiting at the marina, south shore. Easy money.', 120000);
    }
    const missionSettled = shotName !== 'mission' || !!missions.marker();
    if (shotFrames > 50 && missionSettled) window.__shotReady = true;
  }
}

function poseCameraForShot() {
  if (shotName === 'drive' || shotName === 'chase') {
    const car = player.car;
    if (car) {
      const back = 10.5;
      camera.position.set(
        car.x - Math.sin(car.heading) * back,
        3.8,
        car.z - Math.cos(car.heading) * back,
      );
      camera.lookAt(car.x + Math.sin(car.heading) * 8, 1.2, car.z + Math.cos(car.heading) * 8);
    }
    return;
  }
  const dist = 7;
  camera.position.set(
    player.x - Math.sin(camYaw) * dist,
    3,
    player.z - Math.cos(camYaw) * dist,
  );
  camera.lookAt(player.x, 1.5, player.z);
}

if (shotName) poseShot();
requestAnimationFrame(frame);
