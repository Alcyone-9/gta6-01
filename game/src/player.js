// Coral City Heat v2 — Marco himself: an articulated figure with human
// proportions (longer legs, narrower shoulders, a head that sits right),
// swinging arms and legs while he walks, a right arm that snaps out for a
// punch or levels the pistol, a cap, and a soft blob shadow. Colours are the
// story's: sunset shirt, dark jeans, no fear.
// v2.1: the walk swing is now amplitude-smoothed, so stopping mid-stride
// eases the limbs back to a neutral stance instead of freezing Marco in a
// split step; the punch follows a fast-out / slower-back ease curve rather
// than a linear snap that popped on its last frame.

import * as THREE from 'three';

const mat = (color) => new THREE.MeshLambertMaterial({ color });

export function createPlayerMesh() {
  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.7, 0.3), mat(0xff7a59));
  torso.position.y = 1.12;
  group.add(torso);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.1, 0.32), mat(0x3a2a18));
  belt.position.y = 0.76;
  group.add(belt);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 9), mat(0xc68863));
  head.position.y = 1.68;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.25, 0.11, 12), mat(0x22303f));
  cap.position.y = 1.84;
  group.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.24), mat(0x22303f));
  brim.position.set(0, 1.8, 0.3);
  group.add(brim);
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.58, 14),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.27, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  group.add(blob);

  function limb(w, h, d, color, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }
  const legL = limb(0.19, 0.82, 0.23, 0x243447, -0.14, 0.8);
  const legR = limb(0.19, 0.82, 0.23, 0x243447, 0.14, 0.8);
  const armL = limb(0.15, 0.66, 0.19, 0xe8b48c, -0.35, 1.44);
  const armR = limb(0.15, 0.66, 0.19, 0xe8b48c, 0.35, 1.44);
  // Shirt sleeves over the upper arms, so the swing reads at distance.
  for (const arm of [armL, armR]) {
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.24, 0.23), mat(0xff7a59));
    sleeve.position.set(0, -0.12, 0);
    arm.add(sleeve);
  }
  // The pistol appears in the right hand once Job 2 is done.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.34), mat(0x17181c));
  gun.position.set(0, -0.7, 0.14);
  gun.visible = false;
  armR.add(gun);

  const PUNCH_TIME = 0.24;
  let cycle = 0;
  let punchT = 0;
  let stepPhase = 0;
  let swingAmp = 0; // smoothed 0..1 walk-swing amplitude

  return {
    group,
    gun,
    punch() { punchT = PUNCH_TIME; },
    /** True on the frame a foot lands — the main loop plays a step sound. */
    get stepped() {
      const p = Math.floor(cycle / Math.PI);
      if (p !== stepPhase) { stepPhase = p; return true; }
      return false;
    },
    /** Animate: swing with speed, snap the right arm out while a punch is live. */
    update(dt, speed) {
      const targetAmp = Math.min(1, speed / 3);
      swingAmp += (targetAmp - swingAmp) * Math.min(1, dt * 10);
      cycle += dt * (2 + speed * 1.9) * Math.max(0.25, swingAmp);
      const s = Math.sin(cycle) * 0.62 * swingAmp;
      legL.rotation.x = s;
      legR.rotation.x = -s;
      armL.rotation.x = -s * 0.85;
      if (punchT > 0) {
        punchT = Math.max(0, punchT - dt);
        // Ease: out in the first third, hold a beat, then recover.
        const t = 1 - punchT / PUNCH_TIME; // 0 → 1 over the punch
        const reach = t < 0.33 ? t / 0.33 : 1 - Math.max(0, (t - 0.55) / 0.45);
        armR.rotation.x = -1.5 * Math.min(1, Math.max(0, reach));
      } else if (gun.visible) {
        // Armed and idle: keep the pistol arm half-raised, ready.
        armR.rotation.x = s * 0.4 - 0.55;
      } else {
        armR.rotation.x = s * 0.85;
      }
      group.position.y = Math.abs(Math.sin(cycle)) * 0.05 * swingAmp;
    },
  };
}
