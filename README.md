# Coral City Heat

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Alcyone-9/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Alcyone-9/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the desktop browser, built for the
[Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01). Every name, place,
character, vehicle, line of story, texture and sound in it is our own — Coral City is a
fictional harbour city of palm avenues, neon marinas and long debts.

You are Marco Reyes, a wheelman fresh off the bus with nothing but a phone number and a
reputation to rebuild. Walk the streets or take any car you can open, run jobs for the
people who run this town, and mind the stars: Coral City police answer theft, violence
and plain bad driving with escalating force.

## What is in the game

- A living city on foot and by car: a road grid with traffic that drives, stops and
  swerves, pedestrians with places to be, parked cars on every block.
- Any unlocked car can be taken; a taken car is reported, and the wanted level climbs.
- A five-star wanted system: patrol cars give chase, roadblocks and heavier units join
  as the stars rise, and lying low lets the heat cool.
- A short story in five jobs — deliveries, a stolen-car run, a getaway, a harbour
  pickup and one last score — with cash, a garage of owned cars and free roam after.
- Fists and a pistol, health and armour pickups, a minimap, a phone-style mission
  feed, and a save that survives a closed tab (localStorage).

## Play it

```sh
node serve.ts
```

then open http://localhost:8080 in desktop Chrome. Or open `game/index.html` from any
static server. The game loads nothing over the network.

Controls: WASD move / drive, mouse look, Shift sprint, E enter or leave a car,
F punch or fire, Space handbrake, M map legend, Esc pause. Progress saves itself.

## Layout

- `main.ts` — the entry program (Node 22): copies `game/` and `screenshots/` to the
  output and writes `dossier.json` with the vendored library.
- `game/` — the playable game as static files (three.js vendored under `game/vendor/`).
- `screenshots/` — real renders of the game, taken from its own code.
- `vendor/makefun-game.ts` — the kit library, unchanged.

MIT licensed — see LICENSE.
