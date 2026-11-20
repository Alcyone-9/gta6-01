// main.js — bootstrap and game loop for Coral City Heat.
// Owns the state machine (menu, playing, paused, busted, wasted, cleared),
// the save file, collectibles, vehicle collisions, crime reporting and the
// deterministic ?shot= poses used for the store screenshots.

import * as THREE from 'three';
import { Rng, clamp, dist2d } from './rng.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { City, districtAt } from './city.js';
import { Vehicle, TrafficCar, nearestVehicle } from './vehicles.js';
import { Ped, CashPickup } from './peds.js';
import { Police } from './police.js';
import { MissionManager, JOBS } from './missions.js';
import { Player } from './player.js';
import { Hud } from './hud.js';

const params = new URLSearchParams(window.location.search);
const seed = parseInt(params.get('seed') || '1', 10) || 1;
const shotMode = params.get('shot') || null;
const rng = new Rng(seed);

const canvas = document.getElementById('gameCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
window.addEventListener('resize', resize);

const city = new City(scene, new Rng(seed * 7 + 3));
const input = new Input(canvas);
const audio = new AudioEngine();
const hud = new Hud();
const player = new Player(scene);
const police = new Police(scene, city, new Rng(seed * 13 + 5));
const missions = new MissionManager(scene);

let state = 'menu'; // menu | playing | paused | busted | wasted | cleared
let cash = 120;
let time = 0;
let frameCount = 0;
let lastDistrict = 'Downtown';
let phoneCooldown = 1.2;
let markedCar = null;
let rivalCar = null;
let rivalStopped = false;
let gameStarted = false;

// --- traffic & peds -------------------------------------------------------
const traffic = [];
const trafficRng = new Rng(seed * 29 + 11);
for (let i = 0; i < 10; i += 1) traffic.push(new TrafficCar(scene, trafficRng, city));
const peds = [];
const pedRng = new Rng(seed * 31 + 7);
for (let i = 0; i < 14; i += 1) peds.push(new Ped(scene, pedRng, city));
const pickups = [];

// Parked cars scattered for stealing.
const parked = [];
const parkedSpots = [
  [14, -49, 0.4, 'sedan', 0x3f7fbf], [-40, 7, 1.7, 'convertible', 0xd64541],
  [63, -40, 0.2, 'sedan', 0xe8e3d9], [-104, -63, 1.5, 'truck', 0x59b06a],
  [104, 63, 0.1, 'taxi', 0xf2c41c], [40, 104, 1.6, 'sedan', 0x8e6cc8],
];
for (const [x, z, a, type, color] of parkedSpots) {
  parked.push(new Vehicle(scene, type, color, x, z, a));
}

// --- golden cassettes -------------------------------------------------------
const CASSETTE_SPOTS = [
  [178, 50], [150, -96], [-118, 8], [8, -118], [118, 118],
  [-84, 34], [34, 84], [-118, -118], [146, 96], [56, -8],
];
const cassettes = [];
{
  const geo = new THREE.BoxGeometry(0.7, 0.5, 0.18);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd23e });
  CASSETTE_SPOTS.forEach(([x, z], i) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 1, z);
    scene.add(mesh);
    cassettes.push({ x, z, mesh, taken: false, id: i });
  });
}
let cassettesFound = 0;

// --- smoke particle pool ----------------------------------------------------
const smokePool = [];
{
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(200,200,200,0.75)');
  grad.addColorStop(1, 'rgba(200,200,200,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  for (let i = 0; i < 26; i += 1) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0 }));
    spr.scale.set(1.4, 1.4, 1);
    spr.visible = false;
    scene.add(spr);
    smokePool.push({ spr, life: 0, vx: 0, vy: 0, vz: 0 });
  }
}
let smokeIdx = 0;
function puff(x, y, z, big) {
  const p = smokePool[smokeIdx];
  smokeIdx = (smokeIdx + 1) % smokePool.length;
  p.spr.position.set(x, y, z);
  p.spr.visible = true;
  p.life = big ? 1.4 : 0.8;
  p.vx = (rng.float() - 0.5) * 1.2;
  p.vy = 1.6 + rng.float();
  p.vz = (rng.float() - 0.5) * 1.2;
  p.spr.material.opacity = 0.65;
  const s = big ? 2.6 : 1.4;
  p.spr.scale.set(s, s, 1);
}
function updateSmoke(dt) {
  for (const p of smokePool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.spr.position.x += p.vx * dt;
    p.spr.position.y += p.vy * dt;
    p.spr.position.z += p.vz * dt;
    p.spr.material.opacity = Math.max(0, p.life * 0.5);
    if (p.life <= 0) p.spr.visible = false;
  }
}

// --- screens ------------------------------------------------------------------
const screens = {
  start: document.getElementById('startScreen'),
  pause: document.getElementById('pauseScreen'),
  busted: document.getElementById('bustedScreen'),
  wasted: document.getElementById('wastedScreen'),
  cleared: document.getElementById('clearedScreen'),
  fail: document.getElementById('failScreen'),
  continueBtn: document.getElementById('continueBtn'),
  clearedStats: document.getElementById('clearedStats'),
  failText: document.getElementById('failText'),
};
function showScreen(name) {
  for (const key of Object.keys(screens)) {
    const el = screens[key];
    if (el && el.style && (key === 'start' || key === 'pause' || key === 'busted' || key === 'wasted' || key === 'cleared' || key === 'fail')) {
      el.style.display = key === name ? 'flex' : 'none';
    }
  }
  if (!name) {
    for (const key of ['start', 'pause', 'busted', 'wasted', 'cleared', 'fail']) {
      if (screens[key]) screens[key].style.display = 'none';
    }
  }
}

// --- save / load ---------------------------------------------------------------
const SAVE_KEY = 'coralCityHeatSaveV2';
function saveGame() {
  try {
    const data = {
      cash,
      jobIndex: missions.jobIndex,
      cassettes: cassettes.filter((k) => k.taken).map((k) => k.id),
      x: player.x,
      z: player.z,
      hasGun: player.hasGun,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (err) { /* storage unavailable */ }
}
function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}
const existingSave = loadSave();
if (existingSave && screens.continueBtn) screens.continueBtn.style.display = 'inline-block';

function applySave(data) {
  cash = data.cash || 0;
  missions.jobIndex = clamp(data.jobIndex || 0, 0, JOBS.length);
  if (missions.jobIndex >= JOBS.length) missions.state = 'cleared';
  for (const id of data.cassettes || []) {
    const k = cassettes[id];
    if (k && !k.taken) {
      k.taken = true;
      k.mesh.visible = false;
      cassettesFound += 1;
    }
  }
  if (typeof data.x === 'number') {
    player.x = data.x;
    player.z = data.z;
    player.syncMesh();
  }
  player.hasGun = !!data.hasGun;
}

// --- mission events -------------------------------------------------------------
missions.onEvent = (type, data) => {
  if (type === 'dialog') {
    hud.showDialog(data.speaker, data.line);
    audio.dialogBlip();
  } else if (type === 'jobStart') {
    hud.hideDialog();
    hud.toast('JOB: ' + data.job.title + ' — pay ' + '$' + data.job.pay, 4);
    audio.success();
  } else if (type === 'setWanted') {
    police.setWanted(data.stars);
  } else if (type === 'spawnStealCar') {
    if (markedCar) scene.remove(markedCar.mesh);
    markedCar = new Vehicle(scene, 'convertible', 0xd64541, data.step.x, data.step.z, 0.6);
    markedCar.isMarked = true;
  } else if (type === 'spawnRival') {
    if (rivalCar) scene.remove(rivalCar.mesh);
    rivalCar = new Vehicle(scene, 'sedan', 0x8e1f1f, data.step.x, data.step.z, 0);
    rivalCar.speed = 8;
    rivalStopped = false;
  } else if (type === 'jobRetryCleanup') {
    if (markedCar) { scene.remove(markedCar.mesh); markedCar = null; }
    if (rivalCar) { scene.remove(rivalCar.mesh); rivalCar = null; }
    rivalStopped = false;
  } else if (type === 'stepComplete') {
    audio.cash();
    hud.toast('Objective done', 2);
  } else if (type === 'jobComplete') {
    cash += data.pay;
    audio.cash();
    hud.toast('JOB COMPLETE  +' + '$' + data.pay, 4);
    if (data.job.id === 'coupe') {
      player.hasGun = true;
      hud.toast('Marco left you a pistol — click or Q to shoot', 5);
    }
    if (missions.state === 'cleared') {
      state = 'cleared';
      if (screens.clearedStats) {
        screens.clearedStats.textContent =
          'Cash earned: $' + cash + ' · Cassettes: ' + cassettesFound + ' / 10 · Jobs: 8 / 8';
      }
      showScreen('cleared');
    }
    saveGame();
  } else if (type === 'jobFailed') {
    audio.fail();
    if (screens.failText) screens.failText.textContent = (data.reason || 'Failed') + ' — retry the job from its checkpoint?';
    showScreen('fail');
    state = 'failed';
  }
};

// --- crime helpers ------------------------------------------------------------------
function anyoneSees(x, z, range) {
  if (police.anyCopSees(x, z, range)) return true;
  for (const p of peds) if (p.state !== 'down' && dist2d(p.x, p.z, x, z) < range * 0.7) return true;
  return false;
}
function scareArea(x, z, range) {
  for (const p of peds) if (dist2d(p.x, p.z, x, z) < range) p.scare(x, z);
}

// --- vehicle interactions --------------------------------------------------------------
function allVehicles() {
  const list = [];
  for (const t of traffic) list.push(t.car);
  for (const p of parked) list.push(p);
  for (const c of police.cars) list.push(c);
  for (const c of police.roadblock) list.push(c);
  if (markedCar) list.push(markedCar);
  if (rivalCar) list.push(rivalCar);
  return list;
}

function enterExitVehicle() {
  if (player.inVehicle) {
    const car = player.inVehicle;
    player.inVehicle = null;
    player.x = car.x + Math.cos(car.angle) * 2.2;
    player.z = car.z - Math.sin(car.angle) * 2.2;
    const [cx, cz] = city.collideCircle(player.x, player.z, 0.55);
    player.x = cx;
    player.z = cz;
    player.syncMesh();
    return;
  }
  const near = nearestVehicle(allVehicles(), player.x, player.z, 4.2);
  if (near) {
    // Pull a traffic driver out: the car becomes the player's.
    for (const t of traffic) {
      if (t.car === near) {
        traffic.splice(traffic.indexOf(t), 1);
        parked.push(near);
      }
    }
    player.inVehicle = near;
    near.driver = 'player';
    if (anyoneSees(player.x, player.z, 34)) {
      police.reportCrime('stealCar', true);
      scareArea(player.x, player.z, 9);
    }
    hud.toast(near.type === 'taxi' ? 'Taxi taken' : 'Vehicle taken — WASD to drive', 2.5);
  }
}

function collideVehicles(dt) {
  const mine = player.inVehicle;
  if (!mine) return;
  for (const other of allVehicles()) {
    if (other === mine) continue;
    const d = dist2d(mine.x, mine.z, other.x, other.z);
    if (d < 3.1 && d > 0.001) {
      const relSpeed = Math.abs(mine.speed - other.speed) + Math.abs(mine.speed) * 0.4;
      const nx = (mine.x - other.x) / d;
      const nz = (mine.z - other.z) / d;
      mine.x += nx * (3.1 - d) * 0.6;
      mine.z += nz * (3.1 - d) * 0.6;
      other.x -= nx * (3.1 - d) * 0.4;
      other.z -= nz * (3.1 - d) * 0.4;
      if (Math.abs(mine.speed) > 3) {
        mine.damage(relSpeed * 1.4);
        other.damage(relSpeed * 1.8);
        mine.speed *= -0.25;
        audio.crash(relSpeed > 8);
        puff(mine.x, 1, mine.z, relSpeed > 8);
        if (other.type === 'cop') police.reportCrime('hitCopCar', true);
        else police.reportCrime('hitCar', anyoneSees(mine.x, mine.z, 30));
        if (rivalCar && other === rivalCar) {
          if (rivalCar.hp <= 12) {
            rivalCar.dead = true;
            rivalStopped = true;
            hud.toast('Rival stopped!', 3);
          }
        }
        if (mine.hp <= 0 && missions.state === 'active') {
          // wrecked while on a job that needs the car: fail it
          if (missions.currentStep && missions.currentStep.needCar) missions.failJob('Vehicle wrecked');
        }
      } else {
        mine.speed *= 0.6;
      }
      other.syncMesh();
    }
  }
  // Running over peds while driving.
  const evts = [];
  for (const p of peds) {
    if (p.state === 'down') continue;
    if (dist2d(mine.x, mine.z, p.x, p.z) < 2 && Math.abs(mine.speed) > 2) {
      p.hurt(40, mine.x, mine.z, evts);
      police.reportCrime('hitPed', anyoneSees(mine.x, mine.z, 32));
      audio.crash(false);
    }
  }
  handlePedEvents(evts);
}

function handlePedEvents(evts) {
  for (const e of evts) {
    if (e.type === 'cashDrop') pickups.push(new CashPickup(scene, e.x, e.z, e.amount));
    if (e.type === 'pedDown') scareArea(e.x, e.z, 12);
  }
}

// --- respawns ---------------------------------------------------------------------
function doBusted() {
  state = 'busted';
  const fine = Math.min(cash, Math.max(25, Math.floor(cash * 0.15)));
  cash -= fine;
  hud.toast('Busted — fined $' + fine, 3);
  showScreen('busted');
  input.releaseLock();
}
function doWasted() {
  state = 'wasted';
  const bill = Math.min(cash, 40);
  cash -= bill;
  showScreen('wasted');
  input.releaseLock();
}
function respawn(kind) {
  police.clearWanted();
  player.healFull();
  player.inVehicle = null;
  if (kind === 'busted') {
    player.x = -104;
    player.z = 104;
  } else {
    player.x = 104;
    player.z = -104;
  }
  player.camYaw = player.angle + Math.PI;
  player.syncMesh();
  showScreen(null);
  state = 'playing';
  saveGame();
}

// --- start / buttons ------------------------------------------------------------------
function startGame(fresh) {
  audio.start();
  if (!fresh && existingSave) applySave(existingSave);
  gameStarted = true;
  state = 'playing';
  showScreen(null);
  hud.show();
  input.requestLock();
}
document.getElementById('startBtn').addEventListener('click', () => startGame(true));
if (screens.continueBtn) screens.continueBtn.addEventListener('click', () => startGame(false));
document.getElementById('resumeBtn').addEventListener('click', () => {
  showScreen(null);
  state = 'playing';
});
document.getElementById('bustedBtn').addEventListener('click', () => respawn('busted'));
document.getElementById('wastedBtn').addEventListener('click', () => respawn('wasted'));
document.getElementById('againBtn').addEventListener('click', () => {
  showScreen(null);
  state = 'playing';
});
document.getElementById('retryBtn').addEventListener('click', () => {
  showScreen(null);
  state = 'playing';
  missions.retryJob();
});
document.getElementById('skipJobBtn').addEventListener('click', () => {
  showScreen(null);
  state = 'playing';
  if (missions.active) {
    missions.active = null;
    missions.jobIndex += 1;
    missions.state = missions.jobIndex >= JOBS.length ? 'cleared' : 'idle';
  }
});

// --- shot poses -------------------------------------------------------------------------
function setupShotPose(kind) {
  gameStarted = true;
  state = 'playing';
  showScreen(null);
  hud.show();
  if (kind === 'cover') {
    player.x = 8;
    player.z = 14;
    player.angle = 2.6;
    player.camYaw = 2.6 + Math.PI;
    player.syncMesh();
    missions.offerNext(); // Lupe's first dialog on the HUD
  } else if (kind === 'drive') {
    const car = parked[0];
    car.x = -24;
    car.z = 3.6;
    car.angle = Math.PI / 2;
    car.speed = 11;
    player.inVehicle = car;
    player.x = car.x;
    player.z = car.z;
    player.angle = car.angle;
    car.syncMesh();
  } else if (kind === 'chase') {
    const car = parked[0];
    car.x = 0;
    car.z = 3.6;
    car.angle = Math.PI / 2;
    car.speed = 14;
    player.inVehicle = car;
    player.x = car.x;
    player.z = car.z;
    player.angle = Math.PI / 2;
    player.speedAbs = 14;
    car.syncMesh();
    police.setWanted(3);
    police.heat = 3;
    const cop1 = new Vehicle(scene, 'cop', 0x22262b, -6.5, 0.6, Math.PI / 2);
    const cop2 = new Vehicle(scene, 'cop', 0x22262b, -7.5, 7.2, Math.PI / 2);
    cop1.copState = 'chase';
    cop2.copState = 'chase';
    police.cars.push(cop1, cop2);
    // Roadblock across the road ahead.
    for (let i = -1; i <= 1; i += 1) {
      const block = new Vehicle(scene, 'cop', 0x22262b, 34, 3.6 + i * 5.2, 0);
      block.copState = 'block';
      police.roadblock.push(block);
    }
    police.bustedMeter = 0.35;
  } else if (kind === 'mission') {
    player.x = 164;
    player.z = -12;
    player.angle = Math.PI / 2;
    player.camYaw = Math.PI / 2 + Math.PI;
    player.syncMesh();
    missions.offerNext();
    missions.advanceDialog();
    missions.advanceDialog();
    missions.advanceDialog(); // through the dialog -> job active, beam up
    // Keep Lupe's briefing on screen next to the live objective beam.
    hud.showDialog('Lupe', 'Take this package to the marina pier. No questions, no detours.');
  }
  // One HUD snapshot so the frozen frame carries stars, minimap and objective.
  hud.update(0, {
    cash,
    hp: player.hp,
    wanted: police.wanted,
    cassettes: cassettesFound,
    objective: missions.objectiveText,
    district: districtAt(player.x, player.z),
    driving: !!player.inVehicle,
    speed: player.inVehicle ? player.inVehicle.speed : 0,
    busted: police.bustedMeter,
    hint: '',
    phoneText: '',
    playerX: player.x,
    playerZ: player.z,
    playerAngle: player.angle,
    cops: [...police.cars, ...police.roadblock].map((c) => ({ x: c.x, z: c.z })),
    marker: missions.markerPos(),
    cassettePts: cassettes.filter((k) => !k.taken),
  });
}
if (shotMode) setupShotPose(shotMode);

// --- per-frame update -----------------------------------------------------------------------
function update(dt) {
  time += dt;
  city.update(dt, time);
  updateSmoke(dt);
  for (const k of cassettes) {
    if (!k.taken) k.mesh.rotation.y += dt * 2.4;
  }

  if (state !== 'playing') return;

  // Phone / dialog flow.
  if (missions.state === 'dialog') {
    if (input.hit('KeyT') || input.hit('Enter') || input.clicked) {
      const next = missions.advanceDialog();
      if (next) {
        hud.showDialog(next.speaker, next.line);
        audio.dialogBlip();
      }
    }
  } else if (missions.state === 'idle' && missions.jobIndex < JOBS.length) {
    phoneCooldown -= dt;
    if (input.hit('KeyT') || phoneCooldown <= -14) {
      phoneCooldown = 1.2;
      missions.offerNext();
    }
  }

  // Player events (punch / shoot / footsteps).
  const playerEvents = [];
  const wasOnFoot = !player.inVehicle;
  player.update(dt, input, city, playerEvents);
  for (const e of playerEvents) {
    if (e.type === 'step') audio.footsteps(e.dist, dt, e.running);
    if (e.type === 'punch') {
      audio.punch();
      const evts = [];
      for (const p of peds) {
        const fx = player.x + Math.sin(player.angle) * 1.3;
        const fz = player.z + Math.cos(player.angle) * 1.3;
        if (dist2d(p.x, p.z, fx, fz) < 1.4 && p.state !== 'down') {
          p.hurt(16, player.x, player.z, evts);
          police.reportCrime('hitPed', anyoneSees(player.x, player.z, 26));
        }
      }
      handlePedEvents(evts);
    }
    if (e.type === 'shoot') {
      audio.shot();
      scareArea(player.x, player.z, 16);
      police.reportCrime('shoot', anyoneSees(player.x, player.z, 40));
      puff(player.x + Math.sin(player.angle) * 1.2, 1.3, player.z + Math.cos(player.angle) * 1.2, false);
    }
  }

  // Driving.
  if (player.inVehicle) {
    const car = player.inVehicle;
    const throttle = (input.forward() ? 1 : 0) + (input.back() ? -1 : 0);
    const steer = (input.left() ? 1 : 0) + (input.right() ? -1 : 0);
    car.drive(dt, throttle, steer, input.down('Space'));
    const [cx, cz] = city.collideCircle(car.x, car.z, 1.7);
    if (cx !== car.x || cz !== car.z) {
      if (Math.abs(car.speed) > 6) {
        audio.crash(true);
        car.damage(8);
      }
      car.x = cx;
      car.z = cz;
      car.speed *= -0.2;
      car.syncMesh();
    }
    if (car.hp < 35 && rng.chance(0.3)) puff(car.x, 1.2, car.z, false);
    collideVehicles(dt);
    player.x = car.x;
    player.z = car.z;
    player.speedAbs = Math.abs(car.speed);
  }
  if (input.hit('KeyE')) enterExitVehicle();

  // World actors.
  const pedEvents = [];
  for (const p of peds) p.update(dt, pedEvents);
  handlePedEvents(pedEvents);
  for (const t of traffic) t.update(dt, time, traffic, audio, player.inVehicle ? null : player.pos);
  for (let i = pickups.length - 1; i >= 0; i -= 1) {
    const pk = pickups[i];
    pk.update(dt);
    if (dist2d(pk.x, pk.z, player.x, player.z) < 1.8) {
      cash += pk.amount;
      audio.cash();
      hud.toast('Picked up $' + pk.amount, 1.6);
      pk.dispose();
      pickups.splice(i, 1);
    }
  }
  // Cassettes.
  for (const k of cassettes) {
    if (!k.taken && dist2d(k.x, k.z, player.x, player.z) < 2.2) {
      k.taken = true;
      k.mesh.visible = false;
      cassettesFound += 1;
      cash += 150;
      audio.cassette();
      hud.toast('Golden cassette ' + cassettesFound + ' / 10  +$150', 3);
      saveGame();
    }
  }

  // Rival flee AI.
  if (rivalCar && !rivalStopped) {
    const awayX = rivalCar.x + (rivalCar.x - player.x) * 2;
    const awayZ = rivalCar.z + (rivalCar.z - player.z) * 2;
    rivalCar.steerToward(dt, clamp(awayX, -125, 125), clamp(awayZ, -125, 125), 13, city);
  }

  // Police.
  const copEvents = police.update(dt, { x: player.x, z: player.z, angle: player.angle, speedAbs: player.speedAbs }, audio);
  for (const e of copEvents) {
    if (e.type === 'busted') {
      doBusted();
      return;
    }
    if (e.type === 'copRam') {
      if (player.inVehicle) player.inVehicle.damage(e.damage * 0.4);
      else player.hurt(e.damage * 0.5);
    }
    if (e.type === 'escaped') hud.toast('You lost the cops', 3);
  }
  audio.setIntensity(police.wanted >= 2 ? (police.anyCopSees(player.x, player.z, 40) ? 1 : 0.55) : 0.12);

  // Missions.
  missions.update(dt, {
    x: player.x,
    z: player.z,
    wanted: police.wanted,
    inVehicle: !!player.inVehicle,
    inMarkedCar: !!markedCar && player.inVehicle === markedCar,
    rivalStopped,
  });
  if (state !== 'playing') return; // a fail screen may have opened

  // Death.
  if (player.hp <= 0) {
    doWasted();
    return;
  }

  // Pause & mute.
  if (input.hit('KeyP')) {
    state = 'paused';
    showScreen('pause');
    input.releaseLock();
  }
  if (input.hit('KeyM')) audio.setMuted(!audio.muted);

  // District + HUD.
  const district = districtAt(player.x, player.z);
  lastDistrict = district;
  let hint = '';
  if (player.inVehicle) hint = 'WASD drive · Space handbrake · E exit';
  else if (nearestVehicle(allVehicles(), player.x, player.z, 4.2)) hint = 'E — take vehicle';
  else if (missions.state === 'dialog') hint = 'T / click — next line';
  else hint = 'WASD move · Shift run · F punch · E vehicle · T phone · P pause';
  const step = missions.currentStep;
  hud.update(dt, {
    cash,
    hp: player.hp,
    wanted: police.wanted,
    cassettes: cassettesFound,
    objective: missions.objectiveText,
    district,
    driving: !!player.inVehicle,
    speed: player.inVehicle ? player.inVehicle.speed : 0,
    busted: police.bustedMeter,
    hint,
    phoneText: missions.state === 'idle' && missions.jobIndex < JOBS.length ? '📞 ' + JOBS[missions.jobIndex].giver + ' is calling — press T' : '',
    playerX: player.x,
    playerZ: player.z,
    playerAngle: player.angle,
    cops: [...police.cars, ...police.roadblock].map((c) => ({ x: c.x, z: c.z })),
    marker: missions.markerPos(),
    cassettePts: cassettes.filter((k) => !k.taken),
  });
  void step;
  void wasOnFoot;
}

// --- camera ----------------------------------------------------------------------------------
function updateCamera(dt) {
  if (player.inVehicle) {
    const car = player.inVehicle;
    const back = 10.5;
    const tx = car.x - Math.sin(car.angle) * back;
    const tz = car.z - Math.cos(car.angle) * back;
    camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 5);
    camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 5);
    camera.position.y += (4.6 - camera.position.y) * Math.min(1, dt * 5);
    camera.lookAt(car.x, 1.2, car.z);
  } else {
    const pose = player.cameraPose();
    if (shotMode === 'cover') {
      camera.position.set(player.x + 4.5, 2.1, player.z + 6.5);
      camera.lookAt(player.x, 1.3, player.z);
    } else if (shotMode === 'mission') {
      camera.position.set(148, 4.2, -3);
      camera.lookAt(178, 1, -10);
    } else {
      camera.position.x += (pose.pos.x - camera.position.x) * Math.min(1, dt * 7);
      camera.position.y += (pose.pos.y - camera.position.y) * Math.min(1, dt * 7);
      camera.position.z += (pose.pos.z - camera.position.z) * Math.min(1, dt * 7);
      camera.lookAt(pose.look.x, pose.look.y, pose.look.z);
    }
  }
  if (shotMode === 'drive' || shotMode === 'chase') {
    const car = player.inVehicle;
    camera.position.set(car.x - Math.sin(car.angle) * 11, 4.8, car.z - Math.cos(car.angle) * 11);
    camera.lookAt(car.x + Math.sin(car.angle) * 8, 1, car.z + Math.cos(car.angle) * 8);
  }
}

// --- loop --------------------------------------------------------------------------------------
resize();
camera.position.set(player.x + 6, 4, player.z + 10);
let lastTs = performance.now();
function animate(ts) {
  requestAnimationFrame(animate);
  let dt = (ts - lastTs) / 1000;
  lastTs = ts;
  if (!(dt > 0)) dt = 0.016;
  dt = Math.min(dt, 0.05);
  if (shotMode) {
    // Frozen deterministic scene: advance the city shimmer only.
    time += dt;
    city.update(dt, time);
    updateSmoke(dt);
    updateCamera(1);
  } else {
    update(dt);
    updateCamera(dt);
  }
  renderer.render(scene, camera);
  frameCount += 1;
  if (shotMode && frameCount >= 50 && !window.__shotReady) {
    window.__shotReady = true;
  }
  input.endFrame();
}
requestAnimationFrame(animate);
showScreen('start');
if (shotMode) showScreen(null);
