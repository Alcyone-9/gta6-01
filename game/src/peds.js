// peds.js — pedestrians who stroll the sidewalks, panic and scatter when
// frightened, and drop cash pickups that the player can scoop up.

import * as THREE from 'three';
import { ROAD_COORDS } from './city.js';
import { clamp } from './rng.js';

const SHIRTS = [0xe86a5e, 0x5e9ee8, 0xf2d16b, 0x7dd87d, 0xe8e3d9, 0xc86ae8, 0x5ed8c8];
const SKINS = [0xf2c9a0, 0xc68863, 0x8a5a3b, 0xffdbb4];

export function buildPersonMesh(shirtColor, skinColor, pantsColor) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const pants = new THREE.MeshLambertMaterial({ color: pantsColor });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.08;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.68;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6), new THREE.MeshLambertMaterial({ color: 0x2b2118 }));
  hair.position.y = 1.76;
  hair.scale.y = 0.6;
  group.add(hair);

  const limbs = {};
  const mkLimb = (w, len, mat) => {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    mesh.position.y = -len / 2;
    pivot.add(mesh);
    return pivot;
  };
  limbs.armL = mkLimb(0.16, 0.66, shirt);
  limbs.armL.position.set(-0.4, 1.4, 0);
  limbs.armR = mkLimb(0.16, 0.66, shirt);
  limbs.armR.position.set(0.4, 1.4, 0);
  limbs.legL = mkLimb(0.2, 0.74, pants);
  limbs.legL.position.set(-0.16, 0.74, 0);
  limbs.legR = mkLimb(0.2, 0.74, pants);
  limbs.legR.position.set(0.16, 0.74, 0);
  group.add(limbs.armL, limbs.armR, limbs.legL, limbs.legR);
  group.userData.limbs = limbs;
  return group;
}

export function animatePerson(mesh, walkPhase, speedNorm, punching) {
  const l = mesh.userData.limbs;
  if (!l) return;
  const swing = Math.sin(walkPhase) * 0.65 * clamp(speedNorm, 0, 1.4);
  l.legL.rotation.x = swing;
  l.legR.rotation.x = -swing;
  l.armL.rotation.x = -swing * 0.8;
  l.armR.rotation.x = punching > 0 ? -1.9 + Math.sin(punching * 22) * 0.5 : swing * 0.8;
}

export class Ped {
  constructor(scene, rng, city) {
    this.rng = rng;
    this.city = city;
    this.mesh = buildPersonMesh(rng.pick(SHIRTS), rng.pick(SKINS), rng.pick([0x2e3a4a, 0x5a4632, 0x703838, 0xdddddd]));
    // Walk a loop around one block on its sidewalk edge.
    this.blockX = rng.pick([-84, -28, 28, 84]);
    this.blockZ = rng.pick([-84, -28, 28, 84]);
    this.perim = 26;
    this.s = rng.range(0, this.perim * 4);
    this.dirSign = rng.sign();
    this.speed = rng.range(1.1, 1.9);
    this.state = 'walk'; // walk | flee | down
    this.fleeTime = 0;
    this.fleeAngle = 0;
    this.walkPhase = rng.range(0, 6);
    this.hp = 30;
    this.droppedCash = false;
    this.posFromLoop();
    scene.add(this.mesh);
  }

  posFromLoop() {
    const p = this.perim;
    let s = ((this.s % (p * 4)) + p * 4) % (p * 4);
    let x;
    let z;
    if (s < p) { x = this.blockX - p / 2 + s; z = this.blockZ - p / 2; }
    else if (s < p * 2) { x = this.blockX + p / 2; z = this.blockZ - p / 2 + (s - p); }
    else if (s < p * 3) { x = this.blockX + p / 2 - (s - p * 2); z = this.blockZ + p / 2; }
    else { x = this.blockX - p / 2; z = this.blockZ + p / 2 - (s - p * 3); }
    this.x = x;
    this.z = z;
  }

  scare(fromX, fromZ) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.fleeTime = this.rng.range(2.2, 4);
    this.fleeAngle = Math.atan2(this.x - fromX, this.z - fromZ) + this.rng.range(-0.5, 0.5);
  }

  hurt(amount, fromX, fromZ, events) {
    this.hp -= amount;
    if (this.hp <= 0 && this.state !== 'down') {
      this.state = 'down';
      this.mesh.rotation.x = Math.PI / 2;
      this.mesh.position.y = 0.25;
      if (!this.droppedCash) {
        this.droppedCash = true;
        events.push({ type: 'cashDrop', x: this.x, z: this.z, amount: this.rng.int(5, 30) });
      }
      events.push({ type: 'pedDown', x: this.x, z: this.z });
    } else {
      this.scare(fromX, fromZ);
    }
  }

  update(dt, events) {
    if (this.state === 'down') return;
    let speed = this.speed;
    if (this.state === 'flee') {
      speed = 4.6;
      this.fleeTime -= dt;
      this.x += Math.sin(this.fleeAngle) * speed * dt;
      this.z += Math.cos(this.fleeAngle) * speed * dt;
      if (this.fleeTime <= 0) {
        this.state = 'walk';
        if (!this.droppedCash && this.rng.chance(0.55)) {
          this.droppedCash = true;
          events.push({ type: 'cashDrop', x: this.x, z: this.z, amount: this.rng.int(3, 18) });
        }
      }
      this.mesh.rotation.y = this.fleeAngle;
    } else {
      this.s += this.dirSign * speed * dt;
      const oldX = this.x;
      const oldZ = this.z;
      this.posFromLoop();
      this.mesh.rotation.y = Math.atan2(this.x - oldX, this.z - oldZ);
    }
    const [cx, cz] = this.city.collideCircle(this.x, this.z, 0.45);
    this.x = cx;
    this.z = cz;
    this.walkPhase += dt * speed * 3.4;
    this.mesh.position.set(this.x, 0, this.z);
    animatePerson(this.mesh, this.walkPhase, speed / 2, 0);
  }
}

export class CashPickup {
  constructor(scene, x, z, amount) {
    this.x = x;
    this.z = z;
    this.amount = amount;
    this.taken = false;
    this.spin = 0;
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.12, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x7dd87d })
    );
    this.mesh.position.set(x, 0.55, z);
    scene.add(this.mesh);
    this.scene = scene;
  }
  update(dt) {
    this.spin += dt * 3;
    this.mesh.rotation.y = this.spin;
    this.mesh.position.y = 0.55 + Math.sin(this.spin * 1.4) * 0.1;
  }
  dispose() {
    this.scene.remove(this.mesh);
  }
}

export function sidewalkSpawn(rng) {
  const road = rng.pick(ROAD_COORDS);
  const along = rng.range(-125, 125);
  if (rng.chance(0.5)) return { x: road + rng.sign() * 9.4, z: along };
  return { x: along, z: road + rng.sign() * 9.4 };
}
