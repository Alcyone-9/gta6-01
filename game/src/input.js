// Coral City Heat — keyboard and mouse state, plus pointer lock for looking around.
// One object owns every key so the rest of the game just reads flags; edge-triggered
// actions (interact, pause) go through consume() so a held key fires exactly once.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const look = { dx: 0, dy: 0 };
  let locked = false;
  let clicked = false;

  window.addEventListener('keydown', (ev) => {
    if (!ev.repeat) pressed.add(ev.code);
    keys.add(ev.code);
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(ev.code)) ev.preventDefault();
  });
  window.addEventListener('keyup', (ev) => keys.delete(ev.code));
  window.addEventListener('blur', () => keys.clear());

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (ev) => {
    if (!locked) return;
    look.dx += ev.movementX || 0;
    look.dy += ev.movementY || 0;
  });
  canvas.addEventListener('mousedown', (ev) => {
    if (locked && ev.button === 0) clicked = true;
  });

  return {
    get locked() { return locked; },
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
    flush() { pressed.clear(); clicked = false; },
  };
}
