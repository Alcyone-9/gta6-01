[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Alcyone-9/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Alcyone-9/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Coral City Heat

An original open-world crime game set in the fictional tropical city of Coral
City, built with three.js. You arrive with nothing but a pawnbroker's phone
number. Work an eight-job story chain for Lupe the pawnbroker, Marco the
wheelman and Sable the taxi dispatcher: deliver packages to the marina, steal
a marked coupe, run timed taxi fares and checkpoint races, shake a two-star
wanted level, recover three briefcases, ram a rival driver off the road, and
haul cargo to the Portside ship before it sails in the finale.

## The city

- A 5×5 road grid across four named districts — Downtown, Marina, Palm
  Heights and Portside — with a beach, animated water and marina piers on the
  east shore.
- Canvas-textured buildings with lit windows, air-conditioning boxes and shop
  signs (Lupe's Pawnbroker, Marina Motel, Sable Taxi Co and more), plus palm
  trees, street lamps, benches, hydrants and working traffic lights whose
  phases differ per intersection.
- Golden-hour sky, soft fog and a procedural WebAudio soundtrack: a 96 BPM
  funk loop (bassline, chord pads, hi-hats) that pushes harder when the cops
  are on you, plus synthesized sirens, horns, crashes, gunfire and footsteps.

## Systems

- **On foot and driving:** WASD movement with a follow / pointer-lock camera,
  procedural walk animation, punches and a pistol; procedural sedans, taxis,
  box trucks and convertibles with spinning wheels, steering front wheels and
  brake lights. Steal any car — if anyone sees it, the heat rises.
- **Traffic and pedestrians:** AI cars cruise the grid, stop at red lights and
  honk when blocked; pedestrians stroll the sidewalks, panic, scatter and drop
  cash when frightened.
- **Wanted and police:** one to five stars for stealing cars, hitting
  pedestrians, shooting and ramming patrol cars. Police pursue with steering
  AI, set up three-car roadblocks at four stars, and officers get out to chase
  you on foot — stay close to a slow player and the BUSTED meter fills. Lose
  line of sight long enough and the stars decay. Busted means a fine and a
  respawn at the station; wasted means the hospital.
- **Economy and collectibles:** every job pays cash, frightened pedestrians
  drop more, and ten golden cassettes are hidden around the city worth $150
  each.
- **HUD:** cash, health bar, wanted stars, a live 2D minimap (roads, police,
  objective, cassettes), objective banner, phone dialog, speedometer, BUSTED
  meter and contextual control hints.
- **Screens and save:** start screen with story and controls, pause, BUSTED,
  WASTED, job-failed retry, and a CITY CLEARED finale with your stats.
  Progress (cash, jobs, cassettes, position) saves to localStorage, with a
  Continue button when a save exists.

## Controls

- WASD / arrow keys — move and drive
- Mouse — camera (pointer lock on click), Shift — run, Space — handbrake
- E — enter / exit vehicle, F or click — punch, click / Q — shoot (once armed)
- T — answer the phone / advance dialog, P — pause, M — mute

## Running locally

Serve the game folder with any static file server, for example:

    node serve.ts

then open http://localhost:8080 — or serve `game/` directly. The game is
fully offline: three.js is vendored under `game/vendor/three/` and every
texture and sound is generated in code.

Deterministic screenshot poses are available with `?seed=1` and
`?shot=cover|drive|chase|mission`; after about fifty rendered frames the page
sets `window.__shotReady = true`.

## Hand-in

`node main.ts` copies `game/` and `screenshots/` to the output directory
(`MAKEFUN_OUTPUT_DIR`, or `/output` by default) and writes `dossier.json`
with the vendored make.fun library.
