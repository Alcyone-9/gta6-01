// missions.js — the eight-job story chain. Lupe the pawnbroker, Marco the
// driver friend and Sable the taxi dispatcher hand out work by phone: each
// job opens with dialog, shows a gold beam and a minimap marker, pays cash,
// and can be retried from its own checkpoint after a failure.

import * as THREE from 'three';
import { dist2d, fmtTime } from './rng.js';

export const JOBS = [
  {
    id: 'package', giver: 'Lupe', title: 'Marina Drop',
    pay: 220, time: 150,
    dialog: [
      ['Lupe', 'You made it to Coral City. Good. I run the pawn shop on the east side.'],
      ['Lupe', 'Take this package to the marina pier. No questions, no detours.'],
      ['You', 'Consider it delivered.'],
    ],
    steps: [{ type: 'goto', x: 178, z: -10, label: 'Deliver the package to the marina pier' }],
  },
  {
    id: 'coupe', giver: 'Marco', title: 'Borrowed Coupe',
    pay: 350, time: 170,
    dialog: [
      ['Marco', 'Marco here, your old wheelman. There is a red coupe parked in Palm Heights with my name on it.'],
      ['Marco', 'Steal it and bring it back to the Downtown garage. Watch for cops.'],
    ],
    steps: [
      { type: 'steal', x: -84, z: -84, label: 'Steal the marked coupe in Palm Heights' },
      { type: 'goto', x: 6, z: 6, label: 'Deliver the coupe to the Downtown garage', needCar: true },
    ],
  },
  {
    id: 'taxi', giver: 'Sable', title: 'Meter Running',
    pay: 300, time: 160,
    dialog: [
      ['Sable', 'Sable Taxi Co. A fare is waiting near the motel and she is in a hurry.'],
      ['Sable', 'Pick her up in any cab, then get her to Portside before the meter eats your pay.'],
    ],
    steps: [
      { type: 'goto', x: 118, z: 30, label: 'Pick up the fare at the Marina Motel', needTaxi: false },
      { type: 'goto', x: 30, z: 118, label: 'Drop the fare at Portside docks' },
    ],
  },
  {
    id: 'escape', giver: 'Lupe', title: 'Cooling Off',
    pay: 280, time: 200,
    dialog: [
      ['Lupe', 'Heat is up and it is about to get worse. The cops will be watching you.'],
      ['Lupe', 'Lose your two stars. Break their line of sight and stay gone.'],
    ],
    steps: [{ type: 'escape', x: 0, z: 0, label: 'Lose your wanted level' }],
    startWanted: 2,
  },
  {
    id: 'cases', giver: 'Marco', title: 'Three Cases',
    pay: 420, time: 220,
    dialog: [
      ['Marco', 'Three briefcases walked out of a card game last night. They are scattered around town.'],
      ['Marco', 'Grab all three and my cut problems disappear.'],
    ],
    steps: [
      { type: 'goto', x: -118, z: 118, label: 'Collect briefcase 1 of 3 (Portside corner)' },
      { type: 'goto', x: 118, z: -118, label: 'Collect briefcase 2 of 3 (Marina north)' },
      { type: 'goto', x: -118, z: -30, label: 'Collect briefcase 3 of 3 (Palm Heights west)' },
    ],
  },
  {
    id: 'race', giver: 'Sable', title: 'Checkpoint Run',
    pay: 400, time: 130,
    dialog: [
      ['Sable', 'A courier quit mid-route. Four checkpoints, one clock, any wheels you like.'],
      ['Sable', 'Hit them in order and the route bonus is yours.'],
    ],
    steps: [
      { type: 'goto', x: 56, z: -56, label: 'Checkpoint 1 of 4' },
      { type: 'goto', x: 112, z: 56, label: 'Checkpoint 2 of 4' },
      { type: 'goto', x: -56, z: 112, label: 'Checkpoint 3 of 4' },
      { type: 'goto', x: -112, z: -56, label: 'Final checkpoint' },
    ],
  },
  {
    id: 'rival', giver: 'Lupe', title: 'Rival Driver',
    pay: 500, time: 200,
    dialog: [
      ['Lupe', 'A rival crew driver is cruising Downtown showing off my merchandise.'],
      ['Lupe', 'Ram him until his ride gives up. Do not be gentle.'],
    ],
    steps: [{ type: 'chase', x: 28, z: 28, label: 'Ram the rival driver until his car stops' }],
  },
  {
    id: 'finale', giver: 'Marco', title: 'Portside Finale',
    pay: 900, time: 180,
    dialog: [
      ['Marco', 'Last one, partner. A loaded truck at the garage needs to reach the Portside ship before it sails.'],
      ['Marco', 'Get the cargo to the docks in time and Coral City is ours.'],
    ],
    steps: [{ type: 'goto', x: 84, z: 118, label: 'Deliver the cargo to the Portside ship' }],
  },
];

export class MissionManager {
  constructor(scene) {
    this.scene = scene;
    this.jobIndex = 0; // next job to offer
    this.active = null; // {job, stepIndex, timeLeft}
    this.state = 'idle'; // idle | dialog | active | done | failed | cleared
    this.dialogLines = [];
    this.dialogIndex = 0;
    this.onEvent = null;

    const beamGeo = new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffd23e, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false,
    });
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.beam.visible = false;
    scene.add(this.beam);
    const ringGeo = new THREE.RingGeometry(3.4, 4.2, 28);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
    this.pulse = 0;
  }

  emit(type, data) {
    if (this.onEvent) this.onEvent(type, data || {});
  }

  get currentStep() {
    if (!this.active) return null;
    return this.active.job.steps[this.active.stepIndex] || null;
  }

  get objectiveText() {
    if (this.state === 'cleared') return 'City cleared — free roam';
    if (!this.active) {
      if (this.jobIndex >= JOBS.length) return 'All jobs done — free roam';
      return 'Wait for a call from ' + JOBS[this.jobIndex].giver + ' (press T to answer)';
    }
    const step = this.currentStep;
    let text = this.active.job.title + ': ' + (step ? step.label : '');
    if (this.active.timeLeft !== null && this.active.timeLeft !== undefined) {
      text += ' — ' + fmtTime(this.active.timeLeft);
    }
    return text;
  }

  offerNext() {
    if (this.jobIndex >= JOBS.length) {
      this.state = 'cleared';
      return false;
    }
    const job = JOBS[this.jobIndex];
    this.dialogLines = job.dialog.slice();
    this.dialogIndex = 0;
    this.state = 'dialog';
    this.pendingJob = job;
    this.emit('dialog', { speaker: job.dialog[0][0], line: job.dialog[0][1], job });
    return true;
  }

  advanceDialog() {
    if (this.state !== 'dialog') return null;
    this.dialogIndex += 1;
    if (this.dialogIndex >= this.dialogLines.length) {
      this.startJob(this.pendingJob);
      return null;
    }
    const [speaker, line] = this.dialogLines[this.dialogIndex];
    this.emit('dialog', { speaker, line, job: this.pendingJob });
    return { speaker, line };
  }

  startJob(job) {
    this.active = { job, stepIndex: 0, timeLeft: job.time || null };
    this.state = 'active';
    this.emit('jobStart', { job });
    if (job.startWanted) this.emit('setWanted', { stars: job.startWanted });
    if (job.steps[0].type === 'steal') this.emit('spawnStealCar', { step: job.steps[0] });
    if (job.steps[0].type === 'chase') this.emit('spawnRival', { step: job.steps[0] });
    this.placeMarker();
  }

  retryJob() {
    if (!this.active) return;
    const job = this.active.job;
    this.emit('jobRetryCleanup', { job });
    this.startJob(job);
  }

  failJob(reason) {
    this.state = 'failed';
    this.beam.visible = false;
    this.ring.visible = false;
    this.emit('jobFailed', { job: this.active ? this.active.job : null, reason });
  }

  placeMarker() {
    const step = this.currentStep;
    if (!step || step.type === 'escape') {
      this.beam.visible = false;
      this.ring.visible = false;
      return;
    }
    this.beam.position.set(step.x, 30, step.z);
    this.ring.position.set(step.x, 0.15, step.z);
    this.beam.visible = true;
    this.ring.visible = true;
  }

  completeStep() {
    if (!this.active) return;
    this.active.stepIndex += 1;
    if (this.active.stepIndex >= this.active.job.steps.length) {
      const job = this.active.job;
      const pay = job.pay;
      this.active = null;
      this.jobIndex += 1;
      this.beam.visible = false;
      this.ring.visible = false;
      if (this.jobIndex >= JOBS.length) this.state = 'cleared';
      else this.state = 'idle';
      this.emit('jobComplete', { job, pay });
    } else {
      const step = this.currentStep;
      if (step.type === 'steal') this.emit('spawnStealCar', { step });
      if (step.type === 'chase') this.emit('spawnRival', { step });
      this.placeMarker();
      this.emit('stepComplete', { step });
    }
  }

  update(dt, ctx) {
    this.pulse += dt;
    if (this.ring.visible) {
      const s = 1 + Math.sin(this.pulse * 4) * 0.08;
      this.ring.scale.set(s, s, 1);
    }
    if (this.state !== 'active' || !this.active) return;
    if (this.active.timeLeft !== null && this.active.timeLeft !== undefined) {
      this.active.timeLeft -= dt;
      if (this.active.timeLeft <= 0) {
        this.failJob('Out of time');
        return;
      }
    }
    const step = this.currentStep;
    if (!step) return;
    if (step.type === 'escape') {
      if (ctx.wanted === 0) this.completeStep();
      return;
    }
    if (step.type === 'chase') {
      if (ctx.rivalStopped) this.completeStep();
      return;
    }
    const d = dist2d(ctx.x, ctx.z, step.x, step.z);
    if (step.type === 'steal') {
      if (ctx.inMarkedCar) this.completeStep();
      return;
    }
    if (d < 6.5) {
      if (step.needCar && !ctx.inVehicle) return;
      this.completeStep();
    }
  }

  markerPos() {
    const step = this.currentStep;
    if (!step || this.state !== 'active') return null;
    if (step.type === 'escape') return null;
    return { x: step.x, z: step.z };
  }
}
