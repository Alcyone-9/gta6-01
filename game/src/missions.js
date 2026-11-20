// Coral City Heat v2 — the eight-job story. A small state machine walks
// Marco from errand boy to the harbour run: each job is a short list of steps
// checked against a per-frame snapshot of the world (where the player is,
// what they are driving, how hot the police are, whether the rival courier
// has been bumped). Three voices carry the plot — LUPE, who runs the marina
// end of town; DEX, who tests drivers; and SABLE, the cab dispatcher new in
// v2, whose fares always pay well and never once go somewhere simple. Jobs
// talk back through callbacks the main loop owns: phone messages, banners,
// cash, the wanted level, one gold coupe, one roadster, one rival courier.

import { LANDMARKS } from './city.js';

const CASE_SPOTS = [
  { x: -152, z: 10 },
  { x: 90, z: -152 },
  { x: 152, z: -70 },
];

export function createMissions(api) {
  let index = 0; // 0..7 while the story runs, 8 = story done, free roam
  let step = 0;
  let gapTimer = 0;
  let caseTimer = 0;
  let casesLeft = [];
  let checkTimer = 0;
  let checksLeft = [];
  let stepTimer = 0;
  let rivalBumpsSeen = 0;
  let targetCar = null;
  let rivalCar = null;
  let started = false;
  // The "arrive hot" warning fires once per approach. It used to live on the
  // shared step definition object (s.warned), so it leaked across restarts
  // and even across jobs; it is run-local state and lives here now.
  let heatWarned = false;

  const JOBS = [
    {
      title: 'Job 1 — First Errand',
      intro: ['LUPE', 'Marco? Lupe. There is a package waiting at the marina, south shore. Pick it up, bring it to the blue door on West 3rd. No questions, easy money.'],
      steps: [
        { text: 'Pick up the package at the marina', at: LANDMARKS.marinaPickup },
        { text: 'Deliver the package to the blue door', at: LANDMARKS.dropOff },
      ],
      pay: 250,
      done: ['MARCO', 'Package delivered, hands clean. Coral City might suit me after all.'],
    },
    {
      title: 'Job 2 — Borrowed Wheels',
      intro: ['LUPE', 'A gold Vireo Coupe is parked across town, and its owner owes us. Take it — quietly if you can — and bring it to the teal garage in the Garage Quarter.'],
      steps: [
        { text: 'Steal the marked gold coupe', car: true },
        { text: 'Deliver the coupe to the teal garage', at: LANDMARKS.garage, needCar: true },
      ],
      pay: 400,
      done: ['LUPE', 'The garage boys left you a pistol in the glovebox of your life now. Check your hand — F or click to use it.'],
    },
    {
      title: 'Job 3 — Taxi Hustle',
      intro: ['SABLE', 'Sable, Sable Cabs. One of my fares is stranded in Palm Heights and very, very late. Pick her up, get her to Portside, and the meter is the least of your worries — the clock is.'],
      steps: [
        { text: 'Pick up Sable\'s passenger in Palm Heights', at: LANDMARKS.taxiPickup },
        { text: 'Drop the passenger in Portside — beat the clock!', at: LANDMARKS.taxiDrop, needCar: true, timer: 110 },
      ],
      pay: 500,
      done: ['SABLE', 'On time, no dents, and she tipped in cash. You ever want honest work, wheelman, my dispatch is your dispatch.'],
    },
    {
      title: 'Job 4 — Heat Check',
      intro: ['DEX', 'Dex here. Anyone can drive fast. I need to know you can drive HOT. Reach the teal garage with at least two stars still burning and the real work is yours.'],
      steps: [
        { text: 'Reach the teal garage with at least ★★ wanted', at: LANDMARKS.garage, needStars: 2 },
      ],
      pay: 600,
      done: ['DEX', 'Ha! Ice in the veins. You are hired for the real work.'],
    },
    {
      title: 'Job 5 — Three Cases',
      intro: ['LUPE', 'Three briefcases walked away from a card game last night. They are sitting all over the city and the owners want them back before anyone counts. Clock is running.'],
      steps: [
        { text: 'Collect the briefcases', cases: true },
      ],
      pay: 800,
      done: ['MARCO', 'Three cases, three corners of the city, one very tired driver. Lupe owes me a dinner.'],
    },
    {
      title: 'Job 6 — Checkpoint Rush',
      intro: ['SABLE', 'New game in town, Marco: three checkpoints, one clock, my whole fleet watching. Hit every gold ring in order and Sable Cabs puts your name on the wall.'],
      steps: [
        { text: 'Hit the checkpoints in order', checkpoints: true },
      ],
      pay: 900,
      done: ['SABLE', 'Fastest name on my wall. The fleet is talking about you, wheelman.'],
    },
    {
      title: 'Job 7 — Rival Package',
      intro: ['DEX', 'A rival courier is running OUR package around the grid in a purple Suntail. Catch him, introduce his car to yours — twice — and he will drop it. Then bring the package to the teal garage.'],
      steps: [
        { text: 'Catch the rival courier and bump his car twice', rival: true },
        { text: 'Bring the package to the teal garage', at: LANDMARKS.garage },
      ],
      pay: 1100,
      done: ['LUPE', 'The rival boys just learned what this town already knew. One last run, Marco. The big one.'],
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

  function armStep() {
    const s = currentJob()?.steps[step];
    stepTimer = s && s.timer ? s.timer : 0;
    heatWarned = false;
  }

  function startJob() {
    const job = currentJob();
    if (!job) return;
    step = 0;
    started = true;
    api.phone(job.intro[0], job.intro[1]);
    api.sfx('phone');
    if (index === 1) targetCar = api.markTargetCar();
    if (index === 3) api.setStars(2);
    if (index === 4) {
      casesLeft = CASE_SPOTS.map((s) => ({ ...s }));
      caseTimer = 240;
    }
    if (index === 5) {
      checksLeft = LANDMARKS.raceChecks.map((s) => ({ ...s }));
      checkTimer = 130;
    }
    if (index === 6) {
      rivalCar = api.spawnRivalCar();
      rivalBumpsSeen = 0;
    }
    if (index === 7) targetCar = api.spawnFinalCar();
    armStep();
  }

  function finishJob() {
    const job = currentJob();
    api.pay(job.pay);
    api.banner('JOB COMPLETE', `${job.title} — $${job.pay.toLocaleString()}`);
    api.sfx('win');
    api.phone(job.done[0], job.done[1]);
    api.onJobComplete(index);
    index += 1;
    step = 0;
    started = false;
    gapTimer = 5;
    targetCar = null;
    rivalCar = null;
    if (index >= JOBS.length) api.onStoryComplete();
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
    if (s.checkpoints) return checksLeft[0] || null;
    if (s.rival) return rivalCar ? { x: rivalCar.x, z: rivalCar.z } : null;
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
    if (s && s.checkpoints) text = `Hit the checkpoints — ${checksLeft.length} left, ${Math.max(0, Math.ceil(checkTimer))}s`;
    if (s && s.rival) text = `Catch the rival courier — bumps: ${rivalBumpsSeen}/2`;
    if (s && s.timer) text += ` — ${Math.max(0, Math.ceil(stepTimer))}s`;
    if (s && s.needStars) text += ' (arrive with the heat on)';
    return { title: job.title, text };
  }

  /** Advance the story. snap: {x, z, inCar, car, stars, rivalBumps}. */
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

    // Generic per-step clock (the taxi drop).
    if (s.timer) {
      stepTimer -= dt;
      if (stepTimer <= 0) {
        stepTimer = s.timer;
        failStep('Too slow — the fare walked and Sable is not pleased. The clock restarted; move.');
      }
    }

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

    if (s.checkpoints) {
      checkTimer -= dt;
      if (checkTimer <= 0) {
        checksLeft = LANDMARKS.raceChecks.map((c) => ({ ...c }));
        checkTimer = 130;
        failStep('Out of time — the checkpoints reset. Sable is timing you again from the top.');
      }
      const spot = checksLeft[0];
      if (spot && Math.hypot(snap.x - spot.x, snap.z - spot.z) < 7) {
        checksLeft.shift();
        api.sfx('pickup');
        api.phone('SABLE', checksLeft.length ? `Ring ${3 - checksLeft.length} of 3! Keep it pinned.` : 'That is the set!');
        if (checksLeft.length === 0) finishJob();
      }
      return;
    }

    if (s.rival) {
      rivalBumpsSeen = snap.rivalBumps || 0;
      if (rivalBumpsSeen >= 2) {
        step += 1;
        armStep();
        api.sfx('pickup');
        api.phone('DEX', 'He dropped it! Package is yours — garage, now, before he grows a spine.');
      }
      return;
    }

    if (s.car || s.finalCar) {
      if (snap.inCar && snap.car === targetCar) {
        if (s.finalCar) api.setStars(4);
        step += 1;
        armStep();
        api.sfx('pickup');
      }
      return;
    }

    if (s.at) {
      const d = Math.hypot(snap.x - s.at.x, snap.z - s.at.z);
      if (d < 5.5) {
        if (s.needCar && !(targetCar ? (snap.inCar && snap.car === targetCar) : snap.inCar)) {
          // Standing at the drop without the right car does nothing; the marker waits.
          return;
        }
        if (s.needStars && snap.stars < s.needStars) {
          if (!heatWarned) {
            heatWarned = true;
            failStep('Too cold, Marco. The deal is OFF unless you arrive with at least two stars burning. Make some noise and come back.');
          }
          return;
        }
        step += 1;
        armStep();
        api.sfx('pickup');
        if (step >= job.steps.length) finishJob();
      } else if (s.needStars) {
        heatWarned = false;
      }
    }
  }

  return {
    update,
    marker,
    objective,
    startAt(i) { index = i; step = 0; started = false; gapTimer = i === 0 ? 1.2 : 2.5; },
    get index() { return index; },
    get total() { return JOBS.length; },
    get done() { return index >= JOBS.length; },
    get targetCar() { return targetCar; },
    get rivalCar() { return rivalCar; },
  };
}
