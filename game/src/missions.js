// Coral City Heat — the five-job story. A small state machine walks Marco from
// errand boy to the harbour run: each job is a short list of steps checked against
// a per-frame snapshot of the world (where the player is, what they are driving,
// how hot the police are). Jobs talk back through callbacks the main loop owns —
// phone messages, banners, cash, the wanted level and one very special coupe.

import { LANDMARKS } from './city.js';

const CASE_SPOTS = [
  { x: -152, z: 10 },
  { x: 90, z: -152 },
  { x: 152, z: -70 },
];

export function createMissions(api) {
  let index = 0; // 0..4 while the story runs, 5 = story done, free roam
  let step = 0;
  let gapTimer = 0;
  let caseTimer = 0;
  let casesLeft = [];
  let targetCar = null;
  let started = false;

  const JOBS = [
    {
      title: 'Job 1 — First Errand',
      intro: ['LUPE', 'Marco? Lupe. There is a package waiting at the marina, south shore. Pick it up, bring it to the blue door on West 3rd. No questions, easy money.'],
      steps: [
        { text: 'Pick up the package at the marina', at: LANDMARKS.marinaPickup },
        { text: 'Deliver the package to the blue door', at: LANDMARKS.dropOff },
      ],
      pay: 250,
      done: ['LUPE', 'Clean work. The city pays people who deliver. More soon.'],
    },
    {
      title: 'Job 2 — Borrowed Wheels',
      intro: ['LUPE', 'A gold Vireo Coupe is parked across town, and its owner owes us. Take it — quietly if you can — and bring it to the teal garage.'],
      steps: [
        { text: 'Steal the marked gold coupe', car: true },
        { text: 'Deliver the coupe to the teal garage', at: LANDMARKS.garage, needCar: true },
      ],
      pay: 400,
      done: ['LUPE', 'The garage boys left you a pistol in the glovebox of your life now. Check your hand — F or click to use it.'],
    },
    {
      title: 'Job 3 — Heat Check',
      intro: ['DEX', 'Dex here. Anyone can drive fast. I need to know you can drive HOT. The whole force knows your face in five minutes — reach the garage with at least two stars still burning.'],
      steps: [
        { text: 'Reach the teal garage with at least ★★ wanted', at: LANDMARKS.garage, needStars: 2 },
      ],
      pay: 600,
      done: ['DEX', 'Ha! Ice in the veins. You are hired for the real work.'],
    },
    {
      title: 'Job 4 — Three Cases',
      intro: ['LUPE', 'Three briefcases walked away from a card game last night. They are sitting all over the city and the owners want them back before anyone counts. Clock is running.'],
      steps: [
        { text: 'Collect the briefcases', cases: true },
      ],
      pay: 800,
      done: ['LUPE', 'All three, and barely a scratch on them. One last run, Marco. The big one.'],
    },
    {
      title: 'Final Job — Harbour Run',
      intro: ['DEX', 'A Sirocco Roadster with a very full boot is waiting by Police HQ — irony is free in this town. Take it to the marina dock. Every cop in Coral City will want a word. Do not stop for any of them.'],
      steps: [
        { text: 'Take the marked roadster near Police HQ', finalCar: true },
        { text: 'Deliver the roadster to the marina dock', at: LANDMARKS.marinaDock, needCar: true },
      ],
      pay: 1500,
      done: ['DEX', 'That, my friend, is a reputation. Coral City is yours now — the jobs are done, the streets are not.'],
    },
  ];

  function currentJob() {
    return index < JOBS.length ? JOBS[index] : null;
  }

  function startJob() {
    const job = currentJob();
    if (!job) return;
    step = 0;
    started = true;
    api.phone(job.intro[0], job.intro[1]);
    api.sfx('phone');
    if (index === 1) {
      targetCar = api.markTargetCar();
    }
    if (index === 2) {
      api.setStars(2);
    }
    if (index === 3) {
      casesLeft = CASE_SPOTS.map((s) => ({ ...s }));
      caseTimer = 240;
    }
    if (index === 4) {
      targetCar = api.spawnFinalCar();
    }
  }

  function finishJob() {
    const job = currentJob();
    api.pay(job.pay);
    api.banner('JOB COMPLETE', `${job.title} — $${job.pay.toLocaleString()}`);
    api.sfx('win');
    api.phone(job.done[0], job.done[1]);
    index += 1;
    step = 0;
    started = false;
    gapTimer = 5;
    targetCar = null;
    if (index >= JOBS.length) {
      api.banner('STORY COMPLETE', 'Coral City Heat — free roam unlocked');
      api.onStoryComplete();
    }
  }

  function failStep(message) {
    api.phone('LUPE', message);
    api.sfx('phone');
  }

  /** The world marker the current step points at, or null. */
  function marker() {
    const job = currentJob();
    if (!job || !started) return null;
    const s = job.steps[step];
    if (!s) return null;
    if (s.cases) return casesLeft[0] || null;
    if (s.car || s.finalCar) return targetCar ? { x: targetCar.x, z: targetCar.z } : null;
    return s.at || null;
  }

  function objective() {
    const job = currentJob();
    if (!job) return { title: 'Free roam', text: 'The city is yours. Earn, cruise, or cause trouble.' };
    if (!started) return { title: 'Coral City', text: 'A call is coming…' };
    const s = job.steps[step];
    let text = s ? s.text : '';
    if (s && s.cases) text = `Collect the briefcases — ${casesLeft.length} left, ${Math.max(0, Math.ceil(caseTimer))}s`;
    if (s && s.needStars) text += ' (arrive with the heat on)';
    return { title: job.title, text };
  }

  /** Advance the story. snap: {x, z, inCar, car, stars}. */
  function update(dt, snap) {
    if (index >= JOBS.length) return;
    if (!started) {
      gapTimer -= dt;
      if (gapTimer <= 0) startJob();
      return;
    }
    const job = currentJob();
    const s = job.steps[step];
    if (!s) { finishJob(); return; }

    if (s.cases) {
      caseTimer -= dt;
      if (caseTimer <= 0) {
        casesLeft = CASE_SPOTS.map((c) => ({ ...c }));
        caseTimer = 240;
        failStep('Too slow — the cases moved. The clock restarted, do not waste it twice.');
      }
      const spot = casesLeft[0];
      if (spot && Math.hypot(snap.x - spot.x, snap.z - spot.z) < 4.5) {
        casesLeft.shift();
        api.sfx('pickup');
        api.phone('LUPE', casesLeft.length ? `Case secured. ${casesLeft.length} to go.` : 'That is all three. Come home.');
        if (casesLeft.length === 0) finishJob();
      }
      return;
    }

    if (s.car || s.finalCar) {
      if (snap.inCar && snap.car === targetCar) {
        if (s.finalCar) api.setStars(3);
        step += 1;
        api.sfx('pickup');
      }
      return;
    }

    if (s.at) {
      const d = Math.hypot(snap.x - s.at.x, snap.z - s.at.z);
      if (d < 5.5) {
        if (s.needCar && !(snap.inCar && snap.car === targetCar)) {
          // Standing at the drop without the car does nothing; the marker waits.
          return;
        }
        if (s.needStars && snap.stars < s.needStars) {
          if (!s.warned) {
            s.warned = true;
            failStep('Too cold, Marco. The deal is OFF unless you arrive with at least two stars burning. Make some noise and come back.');
          }
          return;
        }
        step += 1;
        api.sfx('pickup');
        if (step >= job.steps.length) finishJob();
      } else if (s.needStars) {
        s.warned = false;
      }
    }
  }

  return {
    update,
    marker,
    objective,
    startAt(i) { index = i; step = 0; started = false; gapTimer = i === 0 ? 1.2 : 2.5; },
    get index() { return index; },
    get done() { return index >= JOBS.length; },
    get targetCar() { return targetCar; },
  };
}
