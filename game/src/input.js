// Coral City Heat v2 — keyboard and mouse state, plus pointer lock for looking
// around. One object owns every key so the rest of the game just reads flags;
// edge-triggered actions (interact, pause, mute) go through consume() so a held
// key fires exactly once. The first real key or click also counts as the user
// gesture that unlocks WebAudio, which the music system waits for.
// v2.1: losing window focus now clears the edge-press set and any accumulated
// look delta as well as the held keys — previously a press banked just before
// an Alt-Tab could fire, stale, on the first frame back in the game.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const look = { dx: 0, dy: 0 };
  let locked = false;
  let clicked = false;
  let gestured = false;

  window.addEventListener('keydown', (ev) => {
    gestured = true;
    if (!ev.repeat) pressed.add(ev.code);
    keys.add(ev.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.code)) ev.preventDefault();
  });
  window.addEventListener('keyup', (ev) => keys.delete(ev.code));
  window.addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
    look.dx = 0;
    look.dy = 0;
    clicked = false;
  });

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (ev) => {
    if (!locked) return;
    look.dx += ev.movementX || 0;
    look.dy += ev.movementY || 0;
  });
  canvas.addEventListener('mousedown', (ev) => {
    gestured = true;
    if (locked && ev.button === 0) clicked = true;
  });
  canvas.addEventListener('pointerdown', () => { gestured = true; });
  canvas.addEventListener('touchstart', () => { gestured = true; }, { passive: true });

  return {
    get locked() { return locked; },
    /** True after the first key/click — the moment audio may legally start. */
    get gestured() { return gestured; },
    down(code) { return keys.has(code); },
    /** True once per physical press of the given code. */
    consume(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    /** Mouse movement since the last read; reading clears it. */
    takeLook() {
      const out = { dx: look.dx, dy: look.dy };
      look.dx = 0;
      look.dy = 0;
      return out;
    },
    /** True once per left click while the pointer is locked. */
    takeClick() {
      const was = clicked;
      clicked = false;
      return was;
    },
    lock() { canvas.requestPointerLock(); },
    unlock() { document.exitPointerLock(); },
    /** Drop stale edge presses (used when overlays open and close). */
    flush() { pressed.clear(); clicked = false; look.dx = 0; look.dy = 0; },
  };
}
