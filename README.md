# Coral City Heat

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Alcyone-9/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Alcyone-9/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the desktop browser, built for the
[Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01). Every name,
place, character, vehicle, line of story, texture and sound in it is our own —
Coral City is a fictional harbour city of palm avenues, neon marinas and long
debts, and no Rockstar or GTA material is used anywhere.

You are Marco Reyes, a wheelman fresh off the bus with nothing but a phone
number and a reputation to rebuild. Walk the streets or take any car you can
open, run jobs for the people who run this town, and mind the stars: Coral
City police answer theft, violence and plain bad driving with escalating
force — on wheels first, and on foot when you are slow enough to grab.

**Version 2** is a full second pass over the shipped game: a procedural music
loop that heats up with the chase, police who get out of their cars, real
roadblocks, a city dressed with readable shop signs and named districts,
three more jobs (eight in total), a rival courier to run off the road, ten
hidden golden cassettes, and a proper ending — finish the last job and the
city itself tells you what you earned. A v2.1 integration pass then went
module by module and fixed what the second pass left inconsistent: traffic
lights that actually alternate between crossings, a seeded asphalt texture
that keeps the same-seed promise, roadblock guards who can genuinely bust
you, traffic cars that rejoin the grid where you leave them instead of
where you stole them, and a wanted-warning flag that no longer leaks
between runs.

## What is in the game

- **A city you can cross on foot or by car** — a five-by-five grid of asphalt
  avenues with painted markings, sidewalks, procedurally varied towers whose
  canvas window facades double as emissive maps so lit windows glow, palm
  trees of two heights, street lamps, benches, hydrants, traffic lights that
  cycle — alternating phase from one crossing to the next — and a marina
  where the land ends in sand, beach umbrellas, a timber dock and water that
  breathes, all under a gradient golden-hour sky.
- **Four named districts** — Downtown, Palm Heights, Portside and the Marina —
  signposted in the world and named live on the HUD and the minimap as you
  cross into each one.
- **Shops you can read** — canvas-painted signs at street level: LUPE'S DINER,
  MARINA MARKET, SABLE CABS, CORAL AUTO, HOTEL PALM, PORTSIDE PAWN and more,
  plus lettered landmarks (POLICE HQ, CORAL GENERAL, TEAL GARAGE).
- **Driving and traffic** — five body styles (sedans, hatchbacks, yellow
  taxis with roof signs, pickups, box trucks and open convertibles) with
  spinning wheels and brake lights that flare under braking. Parked cars line
  every block and a living traffic fleet cruises the grid, keeps to the
  right-hand lane, turns at crossings, brakes for whatever is in front of it
  and honks when it is stuck. Any car can be entered with one key; driving is
  arcade-tight with a handbrake and a chase camera. Leave a stolen traffic
  car anywhere and it pulls back into the flow from that very street.
- **Stealing has a price** — taking a parked car or stopping traffic raises
  your wanted level, and hit-and-runs, assaults and gunfire raise it faster.
- **A five-star wanted system, completed** — patrol cars spawn and pursue
  with steering that leads its target; higher stars mean more and faster
  units. Get close to a slow or stopped player and the officer **gets out and
  chases on foot** — faster than a walking Marco, slower than a sprinting one.
  At four stars the police park **a real roadblock** across your road: three
  patrol cars with two officers standing in front of them, and those guards
  count for an arrest exactly like a running officer does. Stay close and
  slow — in a car or on foot — and the BUSTED meter fills (and reddens as it
  fills): you wake up outside the police station, fined, with your current
  job kept as a checkpoint. Lose all your health and it is WASTED: Coral
  General patches you up, for a fee, and the job still waits. Break the
  police line of sight long enough and the heat bleeds away at a fair rate.
- **Pedestrians with somewhere to be** — articulated figures with swinging
  arms and legs who stroll the sidewalks, cross at corners, flee from danger
  along a clean line away from it, and sometimes drop the cash in their
  pockets when they go down.
- **Fists first, then iron** — punch with F or a click; a pistol arrives after
  the second job and turns the same input into hitscan gunfire with a
  hitmarker. Marco's walk eases in and out of stride instead of freezing
  mid-step, and with the pistol drawn his gun arm stays half-raised.
- **An eight-job story** — a marina package run, a stolen gold coupe, a timed
  taxi fare for Sable's dispatch, a getaway that must be finished with at
  least two stars still burning, three briefcases against the clock, a
  three-checkpoint race, a rival courier whose package you take by bumping
  his car twice, and a final harbour run under maximum police pressure.
  Phone-style messages from Lupe, Dex, Sable — and Marco himself — carry the
  plot; every job pays cash and drops a banner. Finish the final job and the
  **CITY CLEARED** screen totals your run: jobs, cash, earnings, cassettes,
  time, busts and wasteds. Then keep roaming, or restart the story.
- **Ten golden cassettes** are hidden at street corners and landmarks across
  all four districts. Each one found pays $150, ticks the HUD counter, and
  glints teal on the minimap until you grab it.
- **A full HUD** — health bar, cash, wanted stars, the district name, the
  cassette counter, a music indicator, a BUSTED meter, the current objective,
  a phone message card, a speedometer while driving, interaction prompts,
  and a live canvas minimap with roads, the shore, traffic blips, flashing
  police and officer blips, roadblocks, the rival courier, collectibles and
  the gold mission marker, which also stands in the world as a pillar of
  light.
- **Synthesised sound and music** — a procedural city-funk loop (syncopated
  bassline, chord pads, hi-hat, and a kick that only exists once the heat is
  on) generated with WebAudio and mixed against your wanted level, so a
  three-star chase literally sounds more urgent than a cruise. Under it: an
  engine note that follows your speed, a two-tone siren that swells as
  patrols close in, horns, footsteps, punches, gunshots, crashes, pickups and
  mission stings. There are no audio files. **M** mutes everything.
- **A save that survives the tab** — cash, health, the pistol, story
  progress, cassette finds and run statistics are written to localStorage;
  the title screen offers Continue whenever a save exists.

## Controls

- **WASD** — walk / drive
- **Mouse** (pointer lock) — look around; the camera follows your car
- **Shift** — sprint on foot
- **E** — enter or exit the nearest car
- **Space** — handbrake
- **F** or **left click** — punch, or fire the pistol once you have it
- **M** — music / sound on or off
- **Esc** — pause (releases the pointer); Resume re-locks it

## Play it

```sh
node serve.ts
```

then open <http://localhost:8080> in a desktop browser. No build step, no
install, no network: the game is plain static files under `game/`, with
three.js vendored beside them.

Deterministic screenshot poses are supported for review:
`http://localhost:8080/?shot=cover&seed=1` (also `drive`, `chase`, `mission`)
sets `window.__shotReady` once the posed frame is stable. The chase pose is
frozen at exactly three stars — heat, spawns and the bust meter are locked
while it holds, so the captured frame can never drift.

## Layout

- `game/index.html` — the page, HUD markup and styles (including the CITY
  CLEARED screen), the import map that points `three` at the vendored build,
  a meta description, and a no-JavaScript fallback message.
- `game/src/main.js` — boot, the game loop, the player on foot and behind the
  wheel, combat, the rival courier, collectibles, the traffic-grid resync
  when you abandon a stolen car, busted/wasted checkpoint flow, the CITY
  CLEARED statistics, the save file and the shot poses.
- `game/src/city.js` — the procedural city: gradient sky and sun, roads with
  seeded asphalt, towers with emissive facades, readable shop signs,
  district boards, alternating traffic lights, palms, props, the marina
  with animated water, colliders and the district lookup.
- `game/src/vehicles.js` — the shared car factory (five body styles,
  spinning wheels, brake lights), grid traffic AI with honking, parked cars,
  and placement that snaps a fresh car's heading to its lane.
- `game/src/peds.js` — pedestrians and the shared articulated figure:
  sidewalk routes, crossings, normalised flee directions, pockets that
  refill after a knockdown, walk-cycle animation.
- `game/src/police.js` — heat and stars, pursuit steering, foot officers who
  leave their cars and chase, multi-car roadblocks whose standing guards
  feed the bust meter, and the frozen mode the screenshot poses use.
- `game/src/missions.js` — the eight-job story state machine, with its
  per-approach warning state kept run-local.
- `game/src/hud.js` — HUD updates (district, cassettes, music state, a
  clamped BUSTED meter that reddens as it fills) and the canvas minimap.
- `game/src/audio.js` — the WebAudio synthesiser: the procedural music loop
  with wanted-driven intensity over one shared noise buffer, engine, siren
  and one-shot effects.
- `game/src/input.js` — keyboard, mouse, pointer lock, focus-loss clearing
  of held and banked keys, and the first-gesture flag the music waits for.
- `game/src/player.js` — Marco's articulated figure, amplitude-smoothed walk
  cycle, eased punch and ready gun arm.
- `game/src/rng.js` — the seeded PRNG (with an empty-list guard on pick)
  and small math helpers.
- `game/vendor/three/` — three.js, vendored (MIT, see its LICENSE).
- `screenshots/` — four JPEG captures of the game running.
- `main.ts` — the hand-in program: validates the entry layout, copies
  `game/` and `screenshots/` to the output directory (clearing stale output
  first) and writes `dossier.json` with the vendored make.fun library.
- `serve.ts` — the tiny local static server used above.
- `shots.json` — the screenshot poses and file names.

## License

MIT — see `LICENSE`. three.js is vendored under its own MIT license in
`game/vendor/three/`.
