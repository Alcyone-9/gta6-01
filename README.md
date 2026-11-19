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
force.

## What is in the game

- **A city you can cross on foot or by car** — a five-by-five grid of asphalt
  avenues with painted markings, sidewalks, procedurally varied towers with
  canvas-painted window facades, palm trees, street lamps, and a marina where
  the land ends in sand, a timber dock and open water, all under golden-hour
  light.
- **Driving and traffic** — parked cars on every block and a living traffic
  fleet that cruises the grid, keeps to the right-hand lane, turns at
  crossings and brakes for whatever is in front of it. Any car can be entered
  with one key; driving is arcade-tight with a handbrake and a chase camera.
- **Stealing has a price** — taking a parked car or stopping traffic raises
  your wanted level, and hit-and-runs, assaults and gunfire raise it faster.
- **A five-star wanted system** — patrol cars spawn and pursue with steering
  that leads its target; higher stars mean more and faster units and, at four
  stars, a parked roadblock across your road. Stay close and slow and the
  BUSTED meter fills: you wake up outside the police station, fined. Lose all
  your health and it is WASTED: Coral General patches you up, for a fee. Break
  the police line of sight long enough and the heat bleeds away.
- **Pedestrians with somewhere to be** — they stroll the sidewalks, cross at
  corners, flee screaming from danger, and sometimes drop the cash in their
  pockets when they go down.
- **Fists first, then iron** — punch with F or a click; a pistol arrives after
  the second job and turns the same input into hitscan gunfire with a
  hitmarker.
- **A five-job story** — a marina package run, a stolen gold coupe, a getaway
  that must be finished with at least two stars still burning, three
  briefcases against the clock, and a final harbour run under maximum police
  pressure. Phone-style messages from Lupe and Dex carry the plot; every job
  pays cash and drops a banner. Finish the story and the city stays open in
  free roam.
- **A full HUD** — health bar, cash, wanted stars, a BUSTED meter, the current
  objective, a phone message card, a speedometer while driving, interaction
  prompts, and a live canvas minimap with roads, the shore, traffic blips,
  flashing police blips, roadblocks and the gold mission marker, which also
  stands in the world as a pillar of light.
- **Synthesised sound** — engine note that follows your speed, a two-tone
  siren that swells as patrols close in, punches, gunshots, crashes, pickups
  and mission stings, all generated with WebAudio. There are no audio files.
- **A save that survives the tab** — cash, health, the pistol, story progress
  and your position are written to localStorage; the title screen offers
  Continue whenever a save exists.

## Controls

- **WASD** — walk / drive
- **Mouse** (pointer lock) — look around; the camera follows your car
- **Shift** — sprint on foot
- **E** — enter or exit the nearest car
- **Space** — handbrake
- **F** or **left click** — punch, or fire the pistol once you have it
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
sets `window.__shotReady` once the posed frame is stable.

## Layout

- `game/index.html` — the page, HUD markup and styles, and the import map
  that points `three` at the vendored build.
- `game/src/main.js` — boot, the game loop, the player on foot and behind the
  wheel, combat, busted/wasted flow, the save file and the shot poses.
- `game/src/city.js` — the procedural city: roads, towers, palms, lamps, the
  marina, colliders and the shared landmarks.
- `game/src/vehicles.js` — the shared car build, grid traffic AI and parked
  cars.
- `game/src/peds.js` — pedestrians: sidewalk routes, crossings, fleeing and
  being knocked down.
- `game/src/police.js` — heat and stars, pursuit steering, roadblocks and the
  bust meter.
- `game/src/missions.js` — the five-job story state machine.
- `game/src/hud.js` — HUD updates and the canvas minimap.
- `game/src/audio.js` — the WebAudio synthesiser (engine, siren, one-shots).
- `game/src/input.js` — keyboard, mouse and pointer lock.
- `game/src/player.js` — Marco's articulated figure and punch animation.
- `game/src/rng.js` — the seeded PRNG and small math helpers.
- `game/vendor/three/` — three.js, vendored (MIT, see its LICENSE).
- `screenshots/` — four JPEG captures of the game running.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` with the vendored make.fun
  library.
- `serve.ts` — the tiny local static server used above.
- `shots.json` — the screenshot poses and file names.

## License

MIT — see `LICENSE`. three.js is vendored under its own MIT license in
`game/vendor/three/`.
