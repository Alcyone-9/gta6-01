// Coral City Heat — Marco himself: a simple articulated figure (hips that swing,
// a punch arm that snaps out) built from the same cheap boxes as the pedestrians,
// but in the colours the story gives him: sunset shirt, dark jeans, no fear.

import * as THREE from 'three';

const mat = (color) => new THREE.MeshLambertMaterial({ color });

export function createPlayerMesh() {
  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.74, 0.32), mat(0xff7a59));
  torso.position.y = 1.13;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(0xc68863));
  head.position.y = 1.74;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.12, 10), mat(0x22303f));
  cap.position.y = 1.9;
  group.add(cap);

  function limb(w, h, d, color, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    mesh.position.y = -h / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }
  const legL = limb(0.2, 0.8, 0.24, 0x243447, -0.15, 0.8);
  const legR = limb(0.2, 0.8, 0.24, 0x243447, 0.15, 0.8);
  const armL = limb(0.16, 0.68, 0.2, 0xe8b48c, -0.37, 1.46);
  const armR = limb(0.16, 0.68, 0.2, 0xe8b48c, 0.37, 1.46);
  // The pistol appears in the right hand once Job 2 is done.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.34), mat(0x17181c));
  gun.position.set(0, -0.72, 0.14);
  gun.visible = false;
  armR.children[0].add(gun);

  let cycle = 0;
  let punchT = 0;

  return {
    group,
    gun,
    punch() { punchT = 0.22; },
    /** Animate: swing with speed, snap the right arm out while a punch is live. */
    update(dt, speed) {
      cycle += dt * (2 + speed * 1.9);
      const swing = Math.min(1, speed / 3) * 0.6;
      const s = Math.sin(cycle) * swing;
      legL.rotation.x = s;
      legR.rotation.x = -s;
      armL.rotation.x = -s * 0.8;
      if (punchT > 0) {
        punchT -= dt;
        armR.rotation.x = -1.5 * Math.min(1, punchT / 0.1);
      } else {
        armR.rotation.x = s * 0.8;
      }
      group.position.y = Math.abs(Math.sin(cycle)) * 0.05 * Math.min(1, speed / 3);
    },
  };
}
