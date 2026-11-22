// Laguna Azul — keyboard and mouse input. One job: turn raw DOM events into a
// clean, edge-triggered action state the game loop can read every frame.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseDown = false;
    this.mouseJustPressed = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pointerLocked = false;
    this.canvas = canvas;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      this.justPressed.add(event.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        this.mouseDown = true;
        this.mouseJustPressed = true;
      }
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouseDown = false;
    });
    document.addEventListener('mousemove', (event) => {
      this.mouseDX += event.movementX || 0;
      this.mouseDY += event.movementY || 0;
    });
    canvas.addEventListener('click', () => {
      if (!this.pointerLocked && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
  }

  isDown(code) {
    return this.keys.has(code);
  }

  pressed(code) {
    return this.justPressed.has(code);
  }

  consumeMousePress() {
    const was = this.mouseJustPressed;
    this.mouseJustPressed = false;
    return was;
  }

  takeMouseDelta() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  // Steering / throttle as -1..1 values, so driving and walking share one shape.
  steerAxis() {
    let s = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) s -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) s += 1;
    return s;
  }

  throttleAxis() {
    let t = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) t += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) t -= 1;
    return t;
  }

  get sprint() {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }

  get handbrake() {
    return this.isDown('Space');
  }

  get interact() {
    return this.pressed('KeyE');
  }

  get shootHeld() {
    return this.mouseDown;
  }

  get reload() {
    return this.pressed('KeyR');
  }

  get pause() {
    return this.pressed('KeyP') || this.pressed('Escape');
  }

  get mute() {
    return this.pressed('KeyM');
  }

  get horn() {
    return this.pressed('KeyH');
  }

  endFrame() {
    this.justPressed.clear();
  }
}
