// Coral City Heat v2.1 — the hand-in program for the gta6-01 bounty
// (Node 22, standard library only). The game itself is this directory's
// game/ folder: static files a desktop browser loads offline — an original
// open-world crime game on a vendored three.js, with a procedural music
// loop, foot police and roadblocks, a richer dressed city, eight jobs and
// hidden collectibles. This program copies game/ and screenshots/ from
// beside this file to the output directory and writes dossier.json there —
// the summary the judge reads — using make.fun's vendored library, byte for
// byte as the scorer will recompute it.
//
// Play it first if you like: `node serve.ts`, then http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fail loudly and early when run from the wrong place: without this check a
// missing game/ folder surfaced as a raw cpSync stack trace that looked like
// a scorer problem instead of a wrong-working-directory problem.
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error(`game/index.html not found beside main.ts in ${here} — run this program from the entry directory.`);
}

// The output tree mirrors the entry: game/ as shipped, screenshots/ beside
// it, dossier.json at the root. Nothing is transformed on the way — what the
// judge downloads is exactly what was developed and screenshotted here.
// Stale output is removed before copying, so a file deleted from the entry
// between runs can never linger in the hand-in and silently desync the
// dossier from the repository the judge compares it against.
for (const sub of ['game', 'screenshots']) {
  rmSync(join(out, sub), { recursive: true, force: true });
}
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own (reference/gate.json), passed whole so this
// program refuses anything the scorer would refuse: text_max_bytes is the
// only one that shapes the dossier's bytes; the rest are tripwires — more
// than 4 screenshots or one over 256 KiB, more than 993 entries or 48 MiB
// under game/, or a game path over 1000 bytes. (993, not 1000: /output's own
// cap counts game/ alongside screenshots/ and dossier.json.)
const dossierPath = join(out, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// One line of proof for whoever ran this by hand: the dossier's size on disk.
console.log(`dossier.json written: ${statSync(dossierPath).size} bytes`);
