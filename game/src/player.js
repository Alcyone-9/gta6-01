// player.js — the on-foot character: WASD movement with a smooth follow or
// pointer-lock camera, procedural limb-swing walking, punches and a pistol.

import * as THREE from 'three';
import { buildPersonMesh, animatePerson } from './peds.js';
import { clamp } from './rng.js';

export class Player {
  constructor(scene) {
    this.mesh = buildPersonMesh(0xe8433c, 0xf2c9a0, 0x24303e);
    // Coral shirt gets a gold chain for the cover shot.
    const chain = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.035, 6, 14),
      new THREE.MeshBasicMaterial({ color: 0xffd23e })
    );
    chain.position.set(0, 1.32, 0.16);
    chain.rotation.x = 0.5;
    this.mesh.add(chain);
    this.x = 8;
    this.z = 14;
    this.y = 0;
    this.angle = Math.PI;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.hp = 100;
    this.maxHp = 100;
    this.speedAbs = 0;
    this.walkPhase = 0;
    this.punchTime = 0;
    this.hasGun = false;
    this.inVehicle = null;
    this.dead = false;
    scene.add(this.mesh);
    this.syncMesh();
  }

  get pos() {
    return { x: this.x, z: this.z };
  }

  syncMesh() {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.angle;
    this.mesh.visible = !this.inVehicle;
  }

  hurt(amount) {
    if (this.dead) return;
    this.hp = clamp(this.hp - amount, 0, this.maxHp);
    if (this.hp <= 0) this.dead = true;
  }

  healFull() {
    this.hp = this.maxHp;
    this.dead = false;
  }

  update(dt, input, city, events) {
    if (this.inVehicle) {
      this.x = this.inVehicle.x;
      this.z = this.inVehicle.z;
      this.angle = this.inVehicle.angle;
      this.speedAbs = Math.abs(this.inVehicle.speed);
      this.syncMesh();
      return;
    }
    // Camera yaw from mouse when pointer-locked, otherwise it eases behind.
    if (input.locked) {
      this.camYaw -= input.mouseDX * 0.0032;
      this.camPitch = clamp(this.camPitch + input.mouseDY * 0.0026, 0.05, 1.1);
    }
    let mx = 0;
    let mz = 0;
    if (input.forward()) mz += 1;
    if (input.back()) mz -= 1;
    if (input.left()) mx -= 1;
    if (input.right()) mx += 1;
    const moving = mx !== 0 || mz !== 0;
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = running ? 8.2 : 4.4;
    if (moving) {
      const len = Math.sqrt(mx * mx + mz * mz);
      mx /= len;
      mz /= len;
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      const wx = mx * cos - mz * sin;
      const wz = -mx * sin - mz * cos;
      const oldX = this.x;
      const oldZ = this.z;
      this.x += wx * speed * dt * -1;
      this.z += wz * speed * dt * -1;
      void oldX; void oldZ;
      this.angle = Math.atan2(-wx * -1, -wz * -1);
      if (!input.locked) {
        // Follow camera: ease yaw toward the movement direction.
        let target = this.angle + Math.PI;
        let diff = target - this.camYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.camYaw += diff * Math.min(1, dt * 4);
      }
      this.walkPhase += dt * speed * 2.1;
      this.speedAbs = speed;
      events.push({ type: 'step', dist: speed * dt, running });
    } else {
      this.speedAbs = 0;
    }
    const [cx, cz] = city.collideCircle(this.x, this.z, 0.55);
    this.x = cx;
    this.z = cz;

    if (this.punchTime > 0) this.punchTime -= dt;
    if (input.hit('KeyF') || input.clicked) {
      if (this.hasGun && input.clicked) {
        events.push({ type: 'shoot', x: this.x, z: this.z, angle: this.angle });
      } else if (this.punchTime <= 0) {
        this.punchTime = 0.32;
        events.push({ type: 'punch', x: this.x, z: this.z, angle: this.angle });
      }
    }
    if (input.hit('KeyQ') && this.hasGun) {
      events.push({ type: 'shoot', x: this.x, z: this.z, angle: this.angle });
    }
    this.syncMesh();
    animatePerson(this.mesh, this.walkPhase, this.speedAbs / 5, Math.max(0, this.punchTime));
  }

  cameraPose() {
    // Third-person camera behind the player using camYaw / camPitch.
    const dist = 8.5;
    const cx = this.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = this.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cy = 2 + Math.sin(this.camPitch) * dist;
    return {
      pos: { x: cx, y: cy, z: cz },
      look: { x: this.x, y: 1.4, z: this.z },
    };
  }
}
