// input.js — keyboard and mouse state with edge-press detection.
// One shared Input instance is created in main.js and passed around; modules
// ask it questions instead of touching window listeners themselves.

export class Input {
  constructor(domElement) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.clicked = false;
    this.locked = false;
    this.el = domElement || document.body;

    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (!this.mouseDown) this.clicked = true;
        this.mouseDown = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
  }

  reset() {
    this.keys.clear();
    this.pressed.clear();
    this.mouseDown = false;
    this.clicked = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  down(code) {
    return this.keys.has(code);
  }

  hit(code) {
    return this.pressed.has(code);
  }

  anyDown(codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  forward() {
    return this.down('KeyW') || this.down('ArrowUp');
  }
  back() {
    return this.down('KeyS') || this.down('ArrowDown');
  }
  left() {
    return this.down('KeyA') || this.down('ArrowLeft');
  }
  right() {
    return this.down('KeyD') || this.down('ArrowRight');
  }

  requestLock() {
    if (!this.locked && this.el.requestPointerLock) {
      try {
        this.el.requestPointerLock();
      } catch (err) {
        /* headless or denied: follow camera still works */
      }
    }
  }

  releaseLock() {
    if (this.locked && document.exitPointerLock) document.exitPointerLock();
  }

  // Called once at the end of every frame by the main loop.
  endFrame() {
    this.pressed.clear();
    this.clicked = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
